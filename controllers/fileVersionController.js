import mongoose from "mongoose";
import fs from "fs";
import { unlink } from "fs/promises";
import path from "path";
import {
  getActiveGoogleDriveClient,
  googleDriveFolderId,
} from "../config/googleDriveConfig.js";
import File from "../models/File.js";
import FileVersion from "../models/FileVersion.js";
import { logAudit } from "../utils/auditLog.js";

const cleanupTemp = async (filePath) => {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Error eliminando temporal:", error);
    }
  }
};

const sanitizeFilename = (filename) => {
  const invalid = /[/\\?%*:|"<>]/g;
  let s = (filename || "").replace(invalid, "_").replace(/\s+/g, " ").trim();
  if (!s) s = "uploaded_file" + path.extname(filename || "");
  return s;
};

const listFileVersions = async (req, res) => {
  const { id: fileId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const file = await File.findById(fileId).lean();
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });

    const isAdmin = req.user.role === "admin";
    const isOwner = String(file.uploadedBy) === String(req.user._id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: "Sin permiso." });
    }

    const items = await FileVersion.find({ file: fileId })
      .sort({ version: -1 })
      .populate("uploadedBy", "username email")
      .lean();

    res.status(200).json({
      currentVersion: file.currentVersion || 1,
      items,
    });
  } catch (error) {
    console.error("Error listando versiones:", error);
    res.status(500).json({ message: "Error." });
  }
};

// POST /api/files/:id/versions (multipart con `file` + opcional `note`)
const replaceFileWithNewVersion = async (req, res) => {
  const { id: fileId } = req.params;
  const tempFilePath = req.file?.path;

  if (!req.file) {
    return res.status(400).json({ message: "No se proporcionó archivo." });
  }
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    await cleanupTemp(tempFilePath);
    return res.status(400).json({ message: "ID inválido." });
  }

  try {
    const file = await File.findById(fileId);
    if (!file) {
      await cleanupTemp(tempFilePath);
      return res.status(404).json({ message: "Archivo no encontrado." });
    }
    const isAdmin = req.user.role === "admin";
    const isOwner = String(file.uploadedBy) === String(req.user._id);
    if (!isAdmin && !isOwner) {
      await cleanupTemp(tempFilePath);
      return res.status(403).json({ message: "Sin permiso." });
    }
    if (file.fileType === "video_link" || file.fileType === "generic_link") {
      await cleanupTemp(tempFilePath);
      return res
        .status(400)
        .json({ message: "Los enlaces no soportan versiones." });
    }

    // Archivar la versión actual antes de subir la nueva
    const currentVersion = file.currentVersion || 1;
    await FileVersion.create({
      file: file._id,
      version: currentVersion,
      driveFileId: file.driveFileId,
      secureUrl: file.secureUrl,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType || "",
      uploadedBy: file.uploadedBy,
      note: req.body?.note || "",
    });

    // Subir nueva versión a Drive
    const sanitizedName = sanitizeFilename(req.file.originalname || file.filename);
    const driveClient = await getActiveGoogleDriveClient();
    const driveResponse = await driveClient.files.create({
      requestBody: {
        name: sanitizedName,
        parents: [googleDriveFolderId],
        description: file.description || "",
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(tempFilePath),
      },
      fields: "id, name, webContentLink, size, mimeType",
    });

    const driveFile = driveResponse.data;
    let sharedLink = driveFile.webContentLink;
    try {
      await driveClient.permissions.create({
        fileId: driveFile.id,
        requestBody: { role: "reader", type: "anyone" },
        fields: "id, role, type",
      });
    } catch (permError) {
      console.error("Error creando permiso público:", permError);
    }

    // Actualizar el File principal con la nueva versión
    file.driveFileId = driveFile.id;
    file.secureUrl = sharedLink || driveFile.webContentLink || null;
    file.filename = driveFile.name;
    file.size = driveFile.size || 0;
    file.currentVersion = currentVersion + 1;
    await file.save();

    await logAudit({
      req,
      action: "update_file",
      targetType: "file",
      targetId: file._id,
      targetName: file.filename,
      metadata: {
        newVersion: file.currentVersion,
        previousVersion: currentVersion,
      },
    });

    const populated = await File.findById(file._id)
      .populate("uploadedBy", "username email")
      .populate("folder", "name")
      .populate("tags", "name")
      .populate("assignedGroup", "name");

    res.status(200).json(populated);
  } catch (error) {
    console.error("Error reemplazando archivo:", error);
    res.status(500).json({ message: "Error reemplazando archivo." });
  } finally {
    await cleanupTemp(tempFilePath);
  }
};

export { listFileVersions, replaceFileWithNewVersion };
