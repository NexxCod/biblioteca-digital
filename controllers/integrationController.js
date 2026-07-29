// backend/controllers/integrationController.js
// Endpoints servicio-a-servicio para la integración con preinforme-analytics
// (PA). PA es la referencia de identidad: liga/crea usuarios por email, emite
// JWT de acceso (SSO) y sube/borra archivos en rutas de carpetas lógicas.
// Todas las rutas van protegidas por integrationAuth (llave compartida).
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import { unlink } from "fs/promises";
import "dotenv/config";
import User from "../models/User.js";
import Folder from "../models/Folder.js";
import File from "../models/File.js";
import FileVersion from "../models/FileVersion.js";
import {
  getActiveGoogleDriveClient,
  googleDriveFolderId,
} from "../config/googleDriveConfig.js";
import {
  detectFileType,
  sanitizeFilename,
  deleteDriveFileSafely,
} from "./fileController.js";
import {
  classifyUploadByExtension,
  getAppSettings,
} from "../utils/appSettingsService.js";
import { logAudit } from "../utils/auditLog.js";

// Roles que la integración puede asignar. "usuario" queda fuera a propósito:
// es el estado "cuenta bloqueada" y PA solo activa cuentas.
const INTEGRATION_ASSIGNABLE_ROLES = ["admin", "docente", "residente"];
const DEFAULT_INTEGRATION_ROLE = "residente";

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const sanitizeRole = (role) =>
  typeof role === "string" && INTEGRATION_ASSIGNABLE_ROLES.includes(role.trim())
    ? role.trim()
    : null;

const deriveUsernameBase = (name, email) => {
  const fromName =
    typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (fromName) return fromName;
  const localPart = String(email).split("@")[0].trim();
  return localPart || "usuario";
};

const findAvailableUsername = async (base) => {
  let candidate = base;
  let suffix = 1;
  // Colisiones: sufijo numérico incremental (base, base2, base3, ...).
  while (await User.exists({ username: candidate })) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
};

const toPublicUser = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
});

// Helper interno reutilizable: liga (o crea) el usuario referido por PA.
// - Si existe y su role es "usuario" (cuenta bloqueada) y PA manda un role
//   válido, se activa con ese role. Nunca se degrada/cambia un role
//   admin/docente/residente existente.
// - Si no existe, se crea con role validado (default "residente"), username
//   único derivado del nombre (o parte local del email), password aleatoria
//   e isEmailVerified=true (PA ya verificó la identidad).
const ensureIntegrationUser = async ({ email, name, role } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw httpError(400, "El campo \"email\" es obligatorio y debe ser válido.");
  }

  const requestedRole = sanitizeRole(role);

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    if (existing.role === "usuario" && requestedRole) {
      existing.role = requestedRole;
      await existing.save();
    }
    return { user: existing, created: false };
  }

  const base = deriveUsernameBase(name, normalizedEmail);
  let username = await findAvailableUsername(base);

  // Reintentos acotados por carreras E11000 (username o email duplicado
  // creado por una petición concurrente entre el findOne y el create).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const user = await User.create({
        username,
        email: normalizedEmail,
        password: crypto.randomBytes(24).toString("hex"),
        role: requestedRole || DEFAULT_INTEGRATION_ROLE,
        isEmailVerified: true,
      });
      return { user, created: true };
    } catch (error) {
      if (error?.code === 11000) {
        const dupKeys = Object.keys(error.keyPattern || error.keyValue || {});
        if (dupKeys.includes("email")) {
          const raced = await User.findOne({ email: normalizedEmail });
          if (raced) return { user: raced, created: false };
        }
        if (dupKeys.includes("username") || dupKeys.length === 0) {
          username = await findAvailableUsername(base);
          continue;
        }
      }
      throw error;
    }
  }

  throw httpError(
    500,
    "No se pudo crear el usuario de integración (conflictos repetidos)."
  );
};

const respondWithError = (res, error, fallbackMessage) => {
  const status = error?.statusCode || 500;
  if (status >= 500) {
    console.error(fallbackMessage, error);
  }
  return res.status(status).json({
    message: status >= 500 ? fallbackMessage : error.message,
  });
};

// POST /api/integration/users/ensure — body {email, name?, role?}
const ensureUser = async (req, res) => {
  try {
    const { email, name, role } = req.body || {};
    const { user, created } = await ensureIntegrationUser({ email, name, role });
    return res.status(200).json({ user: toPublicUser(user), created });
  } catch (error) {
    return respondWithError(res, error, "Error asegurando el usuario.");
  }
};

// POST /api/integration/sso — body {email, name?, role?}
// Devuelve un JWT idéntico al de login (payload {id}, 30d) para abrir la
// biblioteca sin segundo login.
const ssoToken = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res
        .status(503)
        .json({ message: "JWT_SECRET no configurado en el servidor." });
    }
    const { email, name, role } = req.body || {};
    const { user, created } = await ensureIntegrationUser({ email, name, role });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    return res
      .status(200)
      .json({ token, user: toPublicUser(user), created });
  } catch (error) {
    return respondWithError(res, error, "Error generando el token SSO.");
  }
};

// --- Resolución de rutas de carpetas lógicas ---

// Normalización para matching NON case-sensitive y sin tildes.
const normalizeFolderName = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

// Acepta JSON array ('["Seminarios","Cuerpo"]'), array ya parseado, o
// string "a/b". Devuelve array de segmentos no vacíos o null si es inválido.
const parseFolderPath = (raw) => {
  let segments = null;

  if (Array.isArray(raw)) {
    segments = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) return null;
        segments = parsed;
      } catch {
        return null;
      }
    } else {
      segments = trimmed.split("/");
    }
  }

  if (!segments) return null;

  const clean = segments
    .filter((segment) => typeof segment === "string")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return clean.length > 0 ? clean : null;
};

const findOrCreateChildFolder = async (parentFolderId, segment, userId) => {
  const target = normalizeFolderName(segment);

  const matchAmongSiblings = async () => {
    const siblings = await Folder.find({ parentFolder: parentFolderId })
      .select("name")
      .lean();
    return (
      siblings.find((f) => normalizeFolderName(f.name) === target) || null
    );
  };

  const existing = await matchAmongSiblings();
  if (existing) return existing;

  try {
    const created = await Folder.create({
      name: segment, // se guarda tal como llegó (el schema hace trim)
      parentFolder: parentFolderId,
      createdBy: userId,
      assignedGroup: null,
    });
    return { _id: created._id, name: created.name };
  } catch (error) {
    // Carrera con el índice unique {parentFolder, name}: otra petición la
    // creó entre la consulta y el create — re-consultamos.
    if (error?.code === 11000) {
      const raced = await matchAmongSiblings();
      if (raced) return raced;
    }
    throw error;
  }
};

const resolveFolderPath = async (segments, userId) => {
  let parentFolderId = null;
  const folderPathIds = [];
  const folderPathNames = [];

  for (const segment of segments) {
    const folder = await findOrCreateChildFolder(
      parentFolderId,
      segment,
      userId
    );
    parentFolderId = folder._id;
    folderPathIds.push(String(folder._id));
    folderPathNames.push(folder.name);
  }

  return { folderId: parentFolderId, folderPathIds, folderPathNames };
};

const cleanupTempFile = async (filePath) => {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Error eliminando archivo temporal (integración):", error);
    }
  }
};

// POST /api/integration/files — multipart (campo "file") + body:
// email (usuario actuante), folderPath, description?, role?, name?
const uploadIntegrationFile = async (req, res) => {
  const tempFilePath = req.file?.path;

  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No se proporcionó ningún archivo (campo \"file\")." });
    }

    const { email, name, role, description, folderPath } = req.body || {};

    const segments = parseFolderPath(folderPath);
    if (!segments) {
      return res.status(400).json({
        message:
          "folderPath inválido. Envía un JSON array de nombres ('[\"Seminarios\",\"Cuerpo\"]') o una ruta \"a/b\".",
      });
    }

    // Whitelist dinámica: extensiones bloqueadas → 415 (defensa adicional al
    // fileFilter de multer, que ya rechaza en el parseo del multipart).
    const settings = await getAppSettings();
    const { decision } = classifyUploadByExtension(
      req.file.originalname || "",
      settings
    );
    if (decision === "blocked") {
      return res
        .status(415)
        .json({ message: "Extensión bloqueada por política de seguridad." });
    }

    const { user } = await ensureIntegrationUser({ email, name, role });
    req.user = user; // actor para logAudit

    const { folderId, folderPathIds, folderPathNames } =
      await resolveFolderPath(segments, user._id);

    // Subida a Drive: mismo patrón que uploadFile de fileController.
    const sanitizedOriginalName = sanitizeFilename(
      req.file.originalname || ""
    );
    const googleDriveClient = await getActiveGoogleDriveClient();

    const driveResponse = await googleDriveClient.files.create({
      requestBody: {
        name: sanitizedOriginalName,
        parents: [googleDriveFolderId],
        description: description || "",
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(tempFilePath),
      },
      fields: "id, name, webContentLink, size, mimeType, description",
    });

    const driveFile = driveResponse.data;

    try {
      await googleDriveClient.permissions.create({
        fileId: driveFile.id,
        requestBody: { role: "reader", type: "anyone" },
        fields: "id, role, type",
      });
    } catch (permError) {
      console.error(
        "Error creando permiso público en Drive (integración):",
        permError
      );
    }

    const newFile = await File.create({
      filename: driveFile.name,
      description: driveFile.description || description || "",
      fileType: detectFileType(driveFile.name),
      driveFileId: driveFile.id,
      secureUrl: driveFile.webContentLink || driveFile.webViewLink || null,
      size: driveFile.size || 0,
      mimeType: driveFile.mimeType || req.file.mimetype || "",
      folder: folderId,
      uploadedBy: user._id,
      assignedGroup: null,
      status: "approved",
    });

    await logAudit({
      req,
      action: "upload",
      targetType: "file",
      targetId: newFile._id,
      targetName: newFile.filename,
      metadata: {
        integration: true,
        folderId: String(folderId),
        folderPath: folderPathNames,
        size: newFile.size,
        fileType: newFile.fileType,
      },
    });

    return res.status(201).json({
      file: {
        _id: newFile._id,
        filename: newFile.filename,
        secureUrl: newFile.secureUrl,
        driveFileId: newFile.driveFileId,
        folderId: String(folderId),
        folderPathIds,
        folderPathNames,
      },
    });
  } catch (error) {
    if (error?.code === "GOOGLE_DRIVE_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    return respondWithError(
      res,
      error,
      "Error interno al subir el archivo de integración."
    );
  } finally {
    await cleanupTempFile(tempFilePath);
  }
};

// DELETE /api/integration/files/:id — body {email}
// La llave compartida es la frontera de confianza: QUIÉN puede borrar cada
// adjunto lo decide preinforme-analytics con sus propias reglas (dueño del
// caso, gestor del seminario). Aquí solo se registra el actor y, si no es el
// uploader original, queda anotado en la auditoría — sin bloquear el borrado
// (un staff puede quitar material que subió el expositor por enlace).
const deleteIntegrationFile = async (req, res) => {
  try {
    const { id: fileId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: "ID de archivo inválido." });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: "Archivo no encontrado." });
    }

    const { email, name, role } = req.body || {};
    const { user } = await ensureIntegrationUser({ email, name, role });
    req.user = user; // actor para logAudit
    const actorIsUploader = String(file.uploadedBy) === String(user._id);

    // Borrado en Drive: solo se ignora el 404 (ya no existe); cualquier otro
    // error de Drive se reporta, no se silencia.
    if (
      file.fileType !== "video_link" &&
      file.fileType !== "generic_link" &&
      file.driveFileId
    ) {
      try {
        const googleDriveClient = await getActiveGoogleDriveClient();
        await googleDriveClient.files.delete({ fileId: file.driveFileId });
      } catch (driveError) {
        const status =
          Number(driveError?.code) || Number(driveError?.response?.status);
        if (status !== 404) {
          console.error(
            "Error eliminando archivo de Drive (integración):",
            driveError?.message || driveError
          );
          return res.status(502).json({
            message: "No se pudo eliminar el archivo en Google Drive.",
          });
        }
      }
    }

    // Versiones asociadas: best-effort en Drive + borrado de los documentos.
    const versions = await FileVersion.find({ file: file._id })
      .select("driveFileId")
      .lean();
    for (const version of versions) {
      if (version.driveFileId && version.driveFileId !== file.driveFileId) {
        await deleteDriveFileSafely(version.driveFileId);
      }
    }
    await FileVersion.deleteMany({ file: file._id });

    await File.findByIdAndDelete(file._id);

    await logAudit({
      req,
      action: "delete_file",
      targetType: "file",
      targetId: file._id,
      targetName: file.filename,
      metadata: {
        integration: true,
        folderId: String(file.folder),
        fileType: file.fileType,
        actorIsUploader,
        uploadedBy: String(file.uploadedBy),
      },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return respondWithError(
      res,
      error,
      "Error interno al eliminar el archivo de integración."
    );
  }
};

export {
  ensureIntegrationUser,
  ensureUser,
  ssoToken,
  uploadIntegrationFile,
  deleteIntegrationFile,
};
