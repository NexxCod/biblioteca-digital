import path from "path";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import {
  getActiveGoogleDriveClient,
  getGoogleDriveAccessToken,
  googleDriveFolderId,
} from "../config/googleDriveConfig.js";
import File from "../models/File.js";
import Folder from "../models/Folder.js";
import Tag from "../models/Tag.js";
import Group from "../models/Group.js";
import { userCanWriteFolder } from "../utils/folderPermissions.js";
import {
  classifyUploadByExtension,
  getAppSettings,
} from "../utils/appSettingsService.js";
import { logAudit } from "../utils/auditLog.js";
import { queueFileNotification } from "../utils/fileNotificationService.js";

const UPLOAD_TOKEN_TTL_SECONDS = 60 * 60; // 1h
const UPLOAD_TOKEN_PURPOSE = "drive-upload";

const sanitizeFilename = (filename) => {
  const invalidCharsRegex = /[/\\?%*:|"<>]/g;
  const multiSpaceRegex = /\s+/g;
  const extension = path.extname(filename || "");
  const baseName = (filename || "")
    .replace(invalidCharsRegex, "_")
    .replace(multiSpaceRegex, " ")
    .trim();

  if (!baseName) {
    return `uploaded_file${extension}`;
  }

  if (path.extname(baseName) !== extension) {
    return `${baseName}${extension}`;
  }

  return baseName;
};

const detectFileType = (filename = "") => {
  const extension = path.extname(filename).toLowerCase().substring(1);

  if (extension === "pdf") return "pdf";
  if (["doc", "docx"].includes(extension)) return "word";
  if (["xls", "xlsx"].includes(extension)) return "excel";
  if (["ppt", "pptx"].includes(extension)) return "pptx";
  if (["jpg", "jpeg", "png", "gif"].includes(extension)) return "image";
  if (["mp4"].includes(extension)) return "video";
  if (
    ["mp3", "aac", "wav", "flac", "aiff", "alac", "ogg"].includes(extension)
  ) {
    return "audio";
  }
  if (["zip", "rar", "7z", "tar", "gz", "tgz"].includes(extension)) {
    return "archive";
  }

  return "other";
};

const resolveAssignedGroup = async (assignedGroupId) => {
  if (!assignedGroupId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
    const error = new Error("El assignedGroupId proporcionado no es válido.");
    error.statusCode = 400;
    throw error;
  }

  const groupExists = await Group.findById(assignedGroupId).lean();

  if (!groupExists) {
    const error = new Error("El grupo asignado no existe.");
    error.statusCode = 404;
    throw error;
  }

  return assignedGroupId;
};

const resolveFolder = async (folderId) => {
  if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
    const error = new Error("Se requiere un folderId válido.");
    error.statusCode = 400;
    throw error;
  }

  const folder = await Folder.findById(folderId).lean();

  if (!folder) {
    const error = new Error("La carpeta especificada no existe.");
    error.statusCode = 404;
    throw error;
  }

  return folder;
};

const resolveTagIds = async (tags, userId) => {
  if (!tags || typeof tags !== "string") {
    return [];
  }

  const tagNames = tags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return Promise.all(
    tagNames.map(async (name) => {
      const tag = await Tag.findOneAndUpdate(
        { name },
        { $setOnInsert: { name, createdBy: userId } },
        { upsert: true, new: true, runValidators: true }
      );
      return tag._id;
    })
  );
};

const signUploadToken = ({
  userId,
  folderId,
  assignedGroupId,
  initialStatus,
  notifyOnReady,
}) =>
  jwt.sign(
    {
      purpose: UPLOAD_TOKEN_PURPOSE,
      userId: String(userId),
      folderId: String(folderId),
      assignedGroupId: assignedGroupId ? String(assignedGroupId) : null,
      initialStatus: initialStatus || "approved",
      notifyOnReady: Boolean(notifyOnReady),
    },
    process.env.JWT_SECRET,
    { expiresIn: UPLOAD_TOKEN_TTL_SECONDS }
  );

const verifyUploadToken = (token, userId) => {
  if (!token || typeof token !== "string") {
    const error = new Error(
      "Falta el token de subida. Inicia una nueva sesión de subida."
    );
    error.statusCode = 400;
    throw error;
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (verifyError) {
    const error = new Error(
      verifyError?.name === "TokenExpiredError"
        ? "La sesión de subida expiró. Inicia una nueva."
        : "El token de subida es inválido."
    );
    error.statusCode = 401;
    throw error;
  }

  if (payload?.purpose !== UPLOAD_TOKEN_PURPOSE) {
    const error = new Error("El token de subida no es válido para esta acción.");
    error.statusCode = 401;
    throw error;
  }

  if (payload.userId !== String(userId)) {
    const error = new Error("El token de subida pertenece a otro usuario.");
    error.statusCode = 403;
    throw error;
  }

  return payload;
};

const createDriveUploadSession = async (req, res) => {
  const {
    filename,
    mimeType,
    size,
    description,
    folderId,
    assignedGroupId,
    notifyOnReady,
  } = req.body;

  try {
    if (!filename || !mimeType || !size) {
      return res.status(400).json({
        message: "Se requiere filename, mimeType y size para iniciar la subida.",
      });
    }

    const folder = await resolveFolder(folderId);

    if (!userCanWriteFolder(req, folder)) {
      return res.status(403).json({
        message: "No tienes permiso para subir contenido a esta carpeta.",
      });
    }

    const validatedGroupId = await resolveAssignedGroup(assignedGroupId);

    // Validación contra AppSettings: tamaño + extensión
    const settings = await getAppSettings();
    const maxBytes = (settings.maxFileSizeMb || 1024) * 1024 * 1024;
    if (Number(size) > maxBytes) {
      return res.status(413).json({
        message: `El archivo supera el límite permitido de ${settings.maxFileSizeMb} MB.`,
        code: "FILE_TOO_LARGE",
        maxSizeMb: settings.maxFileSizeMb,
      });
    }
    const { decision } = classifyUploadByExtension(filename, settings);
    if (decision === "blocked") {
      return res.status(415).json({
        message: "Extensión bloqueada por política de seguridad.",
        code: "EXTENSION_BLOCKED",
      });
    }
    const initialStatus = req.user.role === "admin" ? "approved" : decision;

    const accessToken = await getGoogleDriveAccessToken();

    if (!accessToken) {
      return res.status(500).json({
        message: "No se pudo obtener un access token válido para Google Drive.",
      });
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const driveMetadata = {
      name: sanitizedFilename,
      parents: [googleDriveFolderId],
      description: description || "",
    };

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webContentLink,webViewLink,size,mimeType,description",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify(driveMetadata),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error creando sesión resumable de Drive:", errorText);
      return res.status(response.status).json({
        message: "No se pudo crear la sesión de subida en Google Drive.",
        details: errorText,
      });
    }

    const uploadUrl = response.headers.get("location");

    if (!uploadUrl) {
      return res.status(500).json({
        message: "Google Drive no devolvió la URL de subida resumable.",
      });
    }

    const uploadToken = signUploadToken({
      userId: req.user._id,
      folderId,
      assignedGroupId: validatedGroupId,
      initialStatus,
      notifyOnReady: Boolean(notifyOnReady),
    });

    res.status(200).json({
      uploadUrl,
      driveMetadata,
      uploadToken,
      uploadTokenExpiresInSeconds: UPLOAD_TOKEN_TTL_SECONDS,
      initialStatus,
    });
  } catch (error) {
    console.error("Error iniciando sesión de subida a Drive:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "Error interno del servidor al iniciar la subida.",
    });
  }
};

const finalizeDriveUpload = async (req, res) => {
  const { driveFile, tags, description, uploadToken } = req.body;

  try {
    const tokenPayload = verifyUploadToken(uploadToken, req.user._id);

    // El folder, grupo y estado vienen del token firmado.
    const folderId = tokenPayload.folderId;
    const validatedGroupId = tokenPayload.assignedGroupId || null;
    const initialStatus = tokenPayload.initialStatus || "approved";
    const notifyOnReady = Boolean(tokenPayload.notifyOnReady);

    if (!driveFile?.id || typeof driveFile.id !== "string") {
      return res.status(400).json({
        message: "No se recibió metadata válida del archivo subido a Drive.",
      });
    }

    // Verificar contra Drive que el archivo realmente existe en NUESTRA
    // carpeta de aplicación (no es el archivo de otra cuenta).
    const driveClient = await getActiveGoogleDriveClient();
    let remoteFile;
    try {
      const remoteResponse = await driveClient.files.get({
        fileId: driveFile.id,
        fields:
          "id,name,parents,webContentLink,webViewLink,size,mimeType,description",
      });
      remoteFile = remoteResponse.data;
    } catch (driveError) {
      console.error("Error consultando archivo en Drive:", driveError);
      return res.status(404).json({
        message:
          "No se encontró el archivo en Drive con el id indicado, o el servidor no tiene acceso.",
      });
    }

    if (
      !Array.isArray(remoteFile.parents) ||
      !remoteFile.parents.includes(googleDriveFolderId)
    ) {
      return res.status(400).json({
        message:
          "El archivo no pertenece a la carpeta de Drive de la aplicación.",
      });
    }

    let sharedLink =
      remoteFile.webContentLink || remoteFile.webViewLink || null;

    try {
      await driveClient.permissions.create({
        fileId: remoteFile.id,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        fields: "id, role, type",
      });

      const refreshedFile = await driveClient.files.get({
        fileId: remoteFile.id,
        fields:
          "id,name,webContentLink,webViewLink,size,mimeType,description",
      });

      sharedLink =
        refreshedFile.data.webContentLink ||
        refreshedFile.data.webViewLink ||
        sharedLink;
    } catch (permissionError) {
      console.error("Error creando permiso público en Drive:", permissionError);
    }

    const tagIds = await resolveTagIds(tags, req.user._id);
    const persistedDescription =
      remoteFile.description || description || "";

    const newFile = await File.create({
      filename: remoteFile.name,
      description: persistedDescription,
      fileType: detectFileType(remoteFile.name),
      driveFileId: remoteFile.id,
      secureUrl: sharedLink,
      size: Number(remoteFile.size || 0),
      folder: folderId,
      tags: tagIds,
      uploadedBy: req.user._id,
      assignedGroup: validatedGroupId,
      status: initialStatus,
      notifyOnReady,
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
        directUpload: true,
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
    console.error("Error finalizando archivo subido a Drive:", error);
    res.status(error.statusCode || 500).json({
      message:
        error.message || "Error interno del servidor al finalizar la subida.",
    });
  }
};

export { createDriveUploadSession, finalizeDriveUpload };
