// backend/controllers/fileController.js
import {
  getActiveGoogleDriveClient,
  googleDriveFolderId,
} from "../config/googleDriveConfig.js";
import File from "../models/File.js";
import Folder from "../models/Folder.js";
import Tag from "../models/Tag.js";
import Group from "../models/Group.js";
import mongoose from "mongoose";
import fs from "fs";
import { unlink } from "fs/promises";
import path from "path";
import { getGoogleDriveStorageQuota } from "../utils/getDriveStorage.js";
import { userCanWriteFolder } from "../utils/folderPermissions.js";
import {
  classifyUploadByExtension,
  getAppSettings,
} from "../utils/appSettingsService.js";
import { logAudit } from "../utils/auditLog.js";
import { queueFileNotification } from "../utils/fileNotificationService.js";

const sanitizeFilename = (filename) => {
  const fixes = {
    "Ã¡": "á",
    "Ã©": "é",
    "Ã­": "í",
    "Ã³": "ó",
    Ãº: "ú",
    "Ã±": "ñ",
    "Ã‘": "Ñ",
  };
  let corrected = filename;
  for (const [bad, good] of Object.entries(fixes)) {
    corrected = corrected.replace(new RegExp(bad, "g"), good);
  }
  const invalidCharsRegex = /[/\\?%*:|"<>]/g;
  const multiSpaceRegex = /\s+/g;
  let sanitized = corrected
    .replace(invalidCharsRegex, "_")
    .replace(multiSpaceRegex, " ")
    .trim();
  if (!sanitized) {
    sanitized = "downloaded_file" + path.extname(filename);
  } else if (path.extname(sanitized) !== path.extname(filename)) {
    sanitized += path.extname(filename);
  }
  return sanitized;
};

const getUserGroupIds = (req) =>
  req.userGroupIds ||
  (req.user?.groups || []).map((group) =>
    typeof group === "string" ? group : (group?._id || group)?.toString()
  );

const cleanupUploadedTempFile = async (filePath) => {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Error eliminando archivo temporal:", error);
    }
  }
};

const isGoogleInvalidGrantError = (error) =>
  error?.response?.status === 400 &&
  error?.response?.data?.error === "invalid_grant" &&
  error?.config?.url?.includes("oauth2.googleapis.com/token");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const detectFileType = (filename = "") => {
  const ext = path.extname(filename).toLowerCase().substring(1);
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "pptx";
  if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
  if (["mp4"].includes(ext)) return "video";
  if (["mp3", "aac", "wav", "flac", "aiff", "alac", "ogg"].includes(ext))
    return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "tgz"].includes(ext)) return "archive";
  return "other";
};

// Filtro de visibilidad — excluye pending/rejected salvo admin o uploader.
const buildFilePermissionFilter = (req) => {
  const user = req.user;
  if (!user) return null;

  // El admin ve todo
  if (user.role === "admin") return {};

  const userGroupIds = getUserGroupIds(req).filter(Boolean);

  // Visibilidad por estado: el uploader ve sus propios pendings/rejected,
  // los demás solo ven archivos sin estado o aprobados. Los archivos
  // pre-existentes no tienen el campo `status`, por eso usamos $nin para
  // excluir explícitamente pending/rejected en lugar de exigir "approved".
  const statusFilter = {
    $or: [
      { status: { $nin: ["pending", "rejected"] } },
      { uploadedBy: user._id },
    ],
  };

  let roleFilter;
  if (user.role === "residente") {
    roleFilter = {
      $or: [{ assignedGroup: null }, { assignedGroup: { $in: userGroupIds } }],
    };
  } else if (user.role === "docente") {
    roleFilter = {
      $or: [{ uploadedBy: user._id }, { assignedGroup: { $in: userGroupIds } }],
    };
  } else {
    return null;
  }

  return { $and: [statusFilter, roleFilter] };
};

const buildFileCriteriaFilter = ({
  folderId = null,
  fileType,
  tags,
  startDate,
  endDate,
  search,
}) => {
  const criteriaFilter = {};
  if (folderId) criteriaFilter.folder = folderId;
  if (fileType) {
    const validTypes = File.schema.path("fileType").enumValues;
    if (validTypes.includes(fileType)) {
      criteriaFilter.fileType = fileType;
    }
  }
  if (tags) {
    const tagIdArray = tags
      .split(",")
      .map((id) => id.trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (tagIdArray.length > 0) criteriaFilter.tags = { $in: tagIdArray };
  }
  const dateFilter = {};
  if (startDate) {
    const date = new Date(startDate);
    if (!isNaN(date)) {
      date.setUTCHours(0, 0, 0, 0);
      dateFilter.$gte = date;
    }
  }
  if (endDate) {
    const date = new Date(endDate);
    if (!isNaN(date)) {
      date.setUTCHours(23, 59, 59, 999);
      dateFilter.$lte = date;
    }
  }
  if (Object.keys(dateFilter).length > 0) {
    criteriaFilter.createdAt = dateFilter;
  }
  if (search) {
    const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
    criteriaFilter.$or = [
      { filename: searchRegex },
      { description: searchRegex },
    ];
  }
  return criteriaFilter;
};

const respondWithFileList = async ({
  res,
  criteriaFilter,
  permissionFilter,
  isAdmin,
  sortBy,
  sortOrder,
  page,
  limit,
}) => {
  // Admin: por defecto excluye pending/rejected del listado general
  // (los ve en su panel dedicado). Usamos $nin para incluir archivos
  // preexistentes que no tienen el campo `status` definido.
  const adminBaseFilter = isAdmin
    ? { status: { $nin: ["pending", "rejected"] } }
    : {};
  const finalFilter = isAdmin
    ? { $and: [criteriaFilter, adminBaseFilter] }
    : { $and: [criteriaFilter, permissionFilter] };

  const sortOptions = {};
  const validSortBy = ["createdAt", "filename"];
  const validSortOrder = ["asc", "desc"];
  const sBy = validSortBy.includes(sortBy) ? sortBy : "createdAt";
  const sOrder = validSortOrder.includes(sortOrder) ? sortOrder : "desc";
  sortOptions[sBy] = sOrder === "asc" ? 1 : -1;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 100);
  const skip = (parsedPage - 1) * parsedLimit;
  const usePagination = Boolean(page || limit);

  const query = File.find(finalFilter)
    .sort(sortOptions)
    .select(
      "filename description fileType driveFileId secureUrl size folder tags uploadedBy assignedGroup status rejectionReason createdAt updatedAt"
    )
    .populate("folder", "name")
    .populate("uploadedBy", "username email")
    .populate("tags", "name")
    .populate("assignedGroup", "name")
    .lean();

  if (usePagination) query.skip(skip).limit(parsedLimit);

  const [files, totalItems] = await Promise.all([
    query,
    usePagination ? File.countDocuments(finalFilter) : Promise.resolve(null),
  ]);

  if (!usePagination) return res.status(200).json(files);

  const totalPages = Math.max(Math.ceil(totalItems / parsedLimit), 1);

  return res.status(200).json({
    items: files,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalItems,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
  });
};

// --- Subir archivo ---
const uploadFile = async (req, res) => {
  const tempFilePath = req.file?.path;

  if (!req.file) {
    return res.status(400).json({ message: "No se proporcionó ningún archivo." });
  }

  const { description, folderId, tags, assignedGroupId, notifyOnReady } =
    req.body;

  if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
    await cleanupUploadedTempFile(tempFilePath);
    return res
      .status(400)
      .json({ message: "Se requiere especificar la carpeta (folderId)." });
  }

  const targetFolder = await Folder.findById(folderId).lean();
  if (!targetFolder) {
    await cleanupUploadedTempFile(tempFilePath);
    return res
      .status(404)
      .json({ message: "La carpeta especificada no existe." });
  }
  if (!userCanWriteFolder(req, targetFolder)) {
    await cleanupUploadedTempFile(tempFilePath);
    return res
      .status(403)
      .json({ message: "No tienes permiso para subir contenido a esta carpeta." });
  }

  let validatedGroupId = null;
  if (assignedGroupId) {
    if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
      await cleanupUploadedTempFile(tempFilePath);
      return res
        .status(400)
        .json({ message: "El assignedGroupId proporcionado no es válido." });
    }
    const groupExists = await Group.findById(assignedGroupId);
    if (!groupExists) {
      await cleanupUploadedTempFile(tempFilePath);
      return res.status(404).json({ message: "El grupo asignado no existe." });
    }
    validatedGroupId = assignedGroupId;
  }

  // Clasificación según whitelist dinámica
  const settings = await getAppSettings();
  const { decision } = classifyUploadByExtension(
    req.file.originalname || "",
    settings
  );

  if (decision === "blocked") {
    await cleanupUploadedTempFile(tempFilePath);
    return res
      .status(415)
      .json({ message: "Extensión bloqueada por política de seguridad." });
  }

  // admin sube siempre como approved
  const initialStatus = req.user.role === "admin" ? "approved" : decision;

  try {
    const sanitizedOriginalName = sanitizeFilename(req.file?.originalname || "");
    const uploadStream = fs.createReadStream(tempFilePath);

    const googleDriveClient = await getActiveGoogleDriveClient();

    const driveResponse = await googleDriveClient.files.create({
      requestBody: {
        name: sanitizedOriginalName,
        parents: [googleDriveFolderId],
        description: description || "",
      },
      media: {
        mimeType: req.file.mimetype,
        body: uploadStream,
      },
      fields: "id, name, webContentLink, size, mimeType, parents, description",
    });

    const driveFile = driveResponse.data;

    let sharedLink = driveFile.webContentLink;
    try {
      await googleDriveClient.permissions.create({
        fileId: driveFile.id,
        requestBody: { role: "reader", type: "anyone" },
        fields: "id, role, type",
      });
    } catch (permError) {
      console.error("Error creando permiso público en Drive:", permError);
    }

    let tagIds = [];
    if (tags && typeof tags === "string") {
      const tagNames = tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      tagIds = await Promise.all(
        tagNames.map(async (name) => {
          const tag = await Tag.findOneAndUpdate(
            { name },
            { $setOnInsert: { name, createdBy: req.user._id } },
            { upsert: true, new: true, runValidators: true }
          );
          return tag._id;
        })
      );
    }

    const newFile = await File.create({
      filename: driveFile.name,
      description: driveFile.description || description || "",
      fileType: detectFileType(driveFile.name),
      driveFileId: driveFile.id,
      secureUrl: sharedLink || driveFile.webContentLink || driveFile.webViewLink || null,
      size: driveFile.size || 0,
      folder: folderId,
      tags: tagIds,
      uploadedBy: req.user._id,
      assignedGroup: validatedGroupId,
      status: initialStatus,
      notifyOnReady: notifyOnReady === "true" || notifyOnReady === true,
    });

    await logAudit({
      req,
      action: "upload",
      targetType: "file",
      targetId: newFile._id,
      targetName: newFile.filename,
      metadata: {
        folderId,
        size: newFile.size,
        status: newFile.status,
        fileType: newFile.fileType,
      },
    });

    if (newFile.status === "approved" && newFile.notifyOnReady) {
      queueFileNotification(newFile);
    }

    const populatedFile = await File.findById(newFile._id)
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(201).json(populatedFile || newFile);
  } catch (error) {
    console.error("Error en uploadFile:", error);
    if (isGoogleInvalidGrantError(error)) {
      return res.status(502).json({
        message:
          "No se pudo conectar con Google Drive porque la autorización expiró o fue revocada.",
        code: "GOOGLE_DRIVE_AUTH_INVALID_GRANT",
      });
    }
    return res.status(500).json({
      message: "Error interno del servidor al procesar el archivo.",
      errorRef: "UPLOAD_FAIL",
    });
  } finally {
    await cleanupUploadedTempFile(tempFilePath);
  }
};

// --- Listar archivos ---
const getFilesByFolder = async (req, res) => {
  const {
    folderId,
    fileType,
    tags,
    startDate,
    endDate,
    search,
    sortBy,
    sortOrder,
    page,
    limit,
  } = req.query;
  const user = req.user;
  const normalizedFolderId =
    typeof folderId === "string" && folderId.trim() ? folderId.trim() : null;

  if (!user) {
    return res.status(401).json({ message: "Usuario no autenticado." });
  }

  try {
    const permissionFilter = buildFilePermissionFilter(req);
    if (permissionFilter === null) {
      return res.status(403).json({ message: "Rol no autorizado." });
    }

    if (!normalizedFolderId) {
      const criteriaFilter = buildFileCriteriaFilter({
        fileType,
        tags,
        startDate,
        endDate,
        search,
      });
      return await respondWithFileList({
        res,
        criteriaFilter,
        permissionFilter,
        isAdmin: user.role === "admin",
        sortBy,
        sortOrder,
        page,
        limit,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedFolderId)) {
      return res.status(400).json({ message: "Se requiere un folderId válido." });
    }

    const criteriaFilter = buildFileCriteriaFilter({
      folderId: normalizedFolderId,
      fileType,
      tags,
      startDate,
      endDate,
      search,
    });

    return await respondWithFileList({
      res,
      criteriaFilter,
      permissionFilter,
      isAdmin: user.role === "admin",
      sortBy,
      sortOrder,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error obteniendo archivos:", error);
    return res
      .status(500)
      .json({ message: "Error interno del servidor al obtener archivos." });
  }
};

// --- Añadir enlace ---
const addLink = async (req, res) => {
  const { url, title, description, folderId, tags, assignedGroupId } = req.body;

  if (!url || !title || !folderId) {
    return res.status(400).json({ message: "Se requiere URL, título y folderId." });
  }
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ message: "La URL proporcionada no es válida." });
  }

  let validatedGroupId = null;
  if (assignedGroupId) {
    if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
      return res
        .status(400)
        .json({ message: "El assignedGroupId proporcionado no es válido." });
    }
    const groupExists = await Group.findById(assignedGroupId);
    if (!groupExists) {
      return res.status(404).json({ message: "El grupo asignado no existe." });
    }
    validatedGroupId = assignedGroupId;
  }

  if (!mongoose.Types.ObjectId.isValid(folderId)) {
    return res.status(400).json({ message: "FolderId inválido." });
  }
  const folderExists = await Folder.findById(folderId).lean();
  if (!folderExists) {
    return res.status(404).json({ message: "La carpeta especificada no existe." });
  }
  if (!userCanWriteFolder(req, folderExists)) {
    return res
      .status(403)
      .json({ message: "No tienes permiso para añadir enlaces a esta carpeta." });
  }

  try {
    let linkFileType = "generic_link";
    const youtubeRegex = /^(https?:\/\/)?(www\.youtube\.com|youtu\.be)\/.+$/;
    if (youtubeRegex.test(url)) linkFileType = "video_link";

    let tagIds = [];
    if (tags && typeof tags === "string") {
      const tagNames = tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      tagIds = await Promise.all(
        tagNames.map(async (name) => {
          const tag = await Tag.findOneAndUpdate(
            { name },
            { $setOnInsert: { name, createdBy: req.user._id } },
            { upsert: true, new: true, runValidators: true }
          );
          return tag._id;
        })
      );
    }

    const newLinkFile = await File.create({
      filename: title,
      description: description || "",
      fileType: linkFileType,
      driveFileId: null,
      secureUrl: url.trim(),
      size: 0,
      folder: folderId,
      tags: tagIds,
      uploadedBy: req.user._id,
      assignedGroup: validatedGroupId,
      status: "approved", // los enlaces no pasan por aprobación
    });

    await logAudit({
      req,
      action: "add_link",
      targetType: "file",
      targetId: newLinkFile._id,
      targetName: newLinkFile.filename,
      metadata: { folderId, fileType: linkFileType },
    });

    const populatedFile = await File.findById(newLinkFile._id)
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(201).json(populatedFile || newLinkFile);
  } catch (error) {
    console.error("Error al añadir enlace:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al añadir el enlace." });
  }
};

// --- Actualizar archivo ---
const updateFile = async (req, res) => {
  const { id: fileId } = req.params;
  const { filename, description, tags, folderId, assignedGroupId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID de archivo inválido." });
  }

  try {
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: "Archivo o enlace no encontrado." });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = file.uploadedBy.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res
        .status(403)
        .json({ message: "No autorizado para modificar este recurso." });
    }

    let previousFolderId = null;
    if (folderId) {
      if (!mongoose.Types.ObjectId.isValid(folderId))
        return res
          .status(400)
          .json({ message: "El folderId proporcionado no es válido." });
      const folderExists = await Folder.findById(folderId).lean();
      if (!folderExists)
        return res
          .status(404)
          .json({ message: "La nueva carpeta especificada no existe." });
      if (!userCanWriteFolder(req, folderExists)) {
        return res
          .status(403)
          .json({ message: "No tienes permiso para mover el archivo a esa carpeta." });
      }
      if (file.folder.toString() !== folderId) {
        previousFolderId = file.folder.toString();
      }
      file.folder = folderId;
    }

    if (assignedGroupId !== undefined) {
      if (
        assignedGroupId !== null &&
        !mongoose.Types.ObjectId.isValid(assignedGroupId)
      ) {
        return res
          .status(400)
          .json({ message: "El assignedGroupId proporcionado no es válido." });
      }
      if (assignedGroupId) {
        const groupExists = await Group.findById(assignedGroupId);
        if (!groupExists)
          return res.status(404).json({ message: "El grupo asignado no existe." });
      }
      file.assignedGroup = assignedGroupId;
    }

    if (filename) file.filename = filename;
    if (description !== undefined) file.description = description;

    if (tags !== undefined) {
      let tagIds = [];
      if (tags && typeof tags === "string") {
        const tagNames = tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
        tagIds = await Promise.all(
          tagNames.map(async (name) => {
            const tag = await Tag.findOneAndUpdate(
              { name },
              { $setOnInsert: { name, createdBy: req.user._id } },
              { upsert: true, new: true, runValidators: true }
            );
            return tag._id;
          })
        );
      }
      file.tags = tagIds;
    }

    const updatedFile = await file.save();

    await logAudit({
      req,
      action: previousFolderId ? "move_file" : "update_file",
      targetType: "file",
      targetId: updatedFile._id,
      targetName: updatedFile.filename,
      metadata: previousFolderId
        ? { fromFolder: previousFolderId, toFolder: folderId }
        : { fields: Object.keys(req.body || {}) },
    });

    const populatedFile = await File.findById(updatedFile._id)
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(200).json(populatedFile);
  } catch (error) {
    console.error("Error al actualizar archivo/enlace:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al actualizar." });
  }
};

const deleteDriveFileSafely = async (driveFileId) => {
  if (!driveFileId) return;
  try {
    const driveClient = await getActiveGoogleDriveClient();
    await driveClient.files.delete({ fileId: driveFileId });
  } catch (error) {
    console.error("Error eliminando archivo de Drive:", error?.message || error);
  }
};

// --- Eliminar archivo ---
const deleteFile = async (req, res) => {
  const { id: fileId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID de archivo inválido." });
  }

  try {
    const file = await File.findById(fileId);
    if (!file) return res.status(204).send();

    const isAdmin = req.user.role === "admin";
    const isOwner = file.uploadedBy.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res
        .status(403)
        .json({ message: "No autorizado para eliminar este recurso." });
    }

    if (
      file.fileType !== "video_link" &&
      file.fileType !== "generic_link" &&
      file.driveFileId
    ) {
      await deleteDriveFileSafely(file.driveFileId);
    }

    await File.findByIdAndDelete(fileId);

    await logAudit({
      req,
      action: "delete_file",
      targetType: "file",
      targetId: fileId,
      targetName: file.filename,
      metadata: { folderId: String(file.folder), fileType: file.fileType },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar archivo/enlace:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al eliminar." });
  }
};

async function handleStorageRequest(_req, res) {
  try {
    const storageInfo = await getGoogleDriveStorageQuota();
    res.json({ storageQuota: storageInfo });
  } catch (error) {
    console.error("Error al procesar la solicitud de almacenamiento:", error);
    res
      .status(500)
      .json({ error: "No se pudo obtener la información del almacenamiento." });
  }
}

// --- Pendientes y aprobación ---
const listPendingFiles = async (_req, res) => {
  try {
    const items = await File.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .populate("folder", "name")
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name")
      .lean();
    res.status(200).json({ items });
  } catch (error) {
    console.error("Error listando pendientes:", error);
    res.status(500).json({ message: "Error obteniendo pendientes." });
  }
};

const listMyPendingFiles = async (req, res) => {
  try {
    const items = await File.find({
      uploadedBy: req.user._id,
      status: { $in: ["pending", "rejected"] },
    })
      .sort({ createdAt: -1 })
      .populate("folder", "name")
      .populate("tags", "name")
      .populate("assignedGroup", "name")
      .lean();
    res.status(200).json({ items });
  } catch (error) {
    console.error("Error listando mis pendientes:", error);
    res.status(500).json({ message: "Error obteniendo tus pendientes." });
  }
};

const approveFile = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const file = await File.findById(id);
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });
    if (file.status !== "pending") {
      return res.status(409).json({
        message: `El archivo no está en estado pendiente (estado actual: ${file.status}).`,
      });
    }
    file.status = "approved";
    file.reviewedBy = req.user._id;
    file.reviewedAt = new Date();
    file.rejectionReason = "";
    await file.save();

    await logAudit({
      req,
      action: "approve",
      targetType: "file",
      targetId: file._id,
      targetName: file.filename,
      metadata: { folderId: String(file.folder) },
    });

    if (file.notifyOnReady && !file.notificationSent) {
      queueFileNotification(file);
    }

    const populated = await File.findById(file._id)
      .populate("uploadedBy", "username email")
      .populate("folder", "name")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(200).json(populated);
  } catch (error) {
    console.error("Error aprobando archivo:", error);
    res.status(500).json({ message: "Error aprobando archivo." });
  }
};

const rejectFile = async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const file = await File.findById(id);
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });
    if (file.status !== "pending") {
      return res.status(409).json({
        message: `El archivo no está en estado pendiente (estado actual: ${file.status}).`,
      });
    }

    if (
      file.fileType !== "video_link" &&
      file.fileType !== "generic_link" &&
      file.driveFileId
    ) {
      await deleteDriveFileSafely(file.driveFileId);
    }

    file.status = "rejected";
    file.rejectionReason = String(rejectionReason || "Rechazado por el administrador.");
    file.reviewedBy = req.user._id;
    file.reviewedAt = new Date();
    await file.save();

    await logAudit({
      req,
      action: "reject",
      targetType: "file",
      targetId: file._id,
      targetName: file.filename,
      metadata: { rejectionReason: file.rejectionReason },
    });

    res.status(200).json({
      _id: file._id,
      status: file.status,
      rejectionReason: file.rejectionReason,
    });
  } catch (error) {
    console.error("Error rechazando archivo:", error);
    res.status(500).json({ message: "Error rechazando archivo." });
  }
};

// --- Mover archivos ---
const moveFile = async (req, res) => {
  const { id } = req.params;
  const { targetFolderId } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(targetFolderId)) {
    return res.status(400).json({ message: "IDs inválidos." });
  }

  try {
    const file = await File.findById(id);
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });

    const isAdmin = req.user.role === "admin";
    const isOwner = file.uploadedBy.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: "No autorizado para mover este archivo." });
    }

    const targetFolder = await Folder.findById(targetFolderId).lean();
    if (!targetFolder) {
      return res.status(404).json({ message: "Carpeta destino no encontrada." });
    }
    if (!userCanWriteFolder(req, targetFolder)) {
      return res
        .status(403)
        .json({ message: "No tienes permiso de escritura en la carpeta destino." });
    }

    const previousFolderId = file.folder.toString();
    if (previousFolderId === targetFolderId) {
      return res.status(200).json({ moved: false, fileId: id });
    }

    file.folder = targetFolderId;
    await file.save();

    await logAudit({
      req,
      action: "move_file",
      targetType: "file",
      targetId: file._id,
      targetName: file.filename,
      metadata: { fromFolder: previousFolderId, toFolder: targetFolderId },
    });

    res.status(200).json({ moved: true, fileId: id, targetFolderId });
  } catch (error) {
    console.error("Error moviendo archivo:", error);
    res.status(500).json({ message: "Error moviendo archivo." });
  }
};

const moveFilesBatch = async (req, res) => {
  const { fileIds, targetFolderId } = req.body || {};
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ message: "fileIds es requerido." });
  }
  if (!mongoose.Types.ObjectId.isValid(targetFolderId)) {
    return res.status(400).json({ message: "targetFolderId inválido." });
  }
  const targetFolder = await Folder.findById(targetFolderId).lean();
  if (!targetFolder) {
    return res.status(404).json({ message: "Carpeta destino no encontrada." });
  }
  if (!userCanWriteFolder(req, targetFolder)) {
    return res
      .status(403)
      .json({ message: "No tienes permiso de escritura en la carpeta destino." });
  }

  const moved = [];
  const failed = [];
  const isAdmin = req.user.role === "admin";

  for (const id of fileIds) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        failed.push({ id, reason: "id_invalido" });
        continue;
      }
      const file = await File.findById(id);
      if (!file) {
        failed.push({ id, reason: "no_encontrado" });
        continue;
      }
      const isOwner = file.uploadedBy.toString() === req.user._id.toString();
      if (!isAdmin && !isOwner) {
        failed.push({ id, reason: "no_autorizado" });
        continue;
      }
      const fromFolder = file.folder.toString();
      if (fromFolder === targetFolderId) {
        continue;
      }
      file.folder = targetFolderId;
      await file.save();
      await logAudit({
        req,
        action: "move_file",
        targetType: "file",
        targetId: file._id,
        targetName: file.filename,
        metadata: { fromFolder, toFolder: targetFolderId, batch: true },
      });
      moved.push(id);
    } catch (error) {
      console.error("Error moviendo archivo batch:", error);
      failed.push({ id, reason: "error" });
    }
  }

  res.status(200).json({ moved, failed, targetFolderId });
};

export {
  uploadFile,
  getFilesByFolder,
  addLink,
  updateFile,
  deleteFile,
  handleStorageRequest,
  listPendingFiles,
  listMyPendingFiles,
  approveFile,
  rejectFile,
  moveFile,
  moveFilesBatch,
  detectFileType,
};
