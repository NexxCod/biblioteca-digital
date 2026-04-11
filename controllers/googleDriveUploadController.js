import path from "path";
import mongoose from "mongoose";
import {
  activeGoogleDriveClient as googleDriveClient,
  getGoogleDriveAccessToken,
  googleDriveFolderId,
} from "../config/googleDriveConfig.js";
import File from "../models/File.js";
import Folder from "../models/Folder.js";
import Tag from "../models/Tag.js";
import Group from "../models/Group.js";

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

const createDriveUploadSession = async (req, res) => {
  const { filename, mimeType, size, description, folderId, assignedGroupId } =
    req.body;

  try {
    if (!filename || !mimeType || !size) {
      return res.status(400).json({
        message: "Se requiere filename, mimeType y size para iniciar la subida.",
      });
    }

    await resolveFolder(folderId);
    await resolveAssignedGroup(assignedGroupId);

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

    res.status(200).json({
      uploadUrl,
      driveMetadata,
    });
  } catch (error) {
    console.error("Error iniciando sesión de subida a Drive:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "Error interno del servidor al iniciar la subida.",
    });
  }
};

const finalizeDriveUpload = async (req, res) => {
  const { driveFile, folderId, tags, assignedGroupId, description } = req.body;

  try {
    await resolveFolder(folderId);
    const validatedGroupId = await resolveAssignedGroup(assignedGroupId);

    if (!driveFile?.id) {
      return res.status(400).json({
        message: "No se recibió metadata válida del archivo subido a Drive.",
      });
    }

    let sharedLink = driveFile.webContentLink || driveFile.webViewLink || null;

    try {
      await googleDriveClient.permissions.create({
        fileId: driveFile.id,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        fields: "id, role, type",
      });

      const refreshedFile = await googleDriveClient.files.get({
        fileId: driveFile.id,
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
      driveFile.description || description || "";

    const newFile = await File.create({
      filename: driveFile.name,
      description: persistedDescription,
      fileType: detectFileType(driveFile.name),
      driveFileId: driveFile.id,
      secureUrl: sharedLink,
      size: Number(driveFile.size || 0),
      folder: folderId,
      tags: tagIds,
      uploadedBy: req.user._id,
      assignedGroup: validatedGroupId,
    });

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
