// backend/routes/fileRoutes.js
import express from "express";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import { admin, protect } from "../middleware/authMiddleware.js";
import {
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
} from "../controllers/fileController.js";
import { getAppSettings } from "../utils/appSettingsService.js";
import { trackFileAccess } from "../controllers/fileAccessController.js";

const uploadTempDir = path.join(os.tmpdir(), "biblioteca-digital-uploads");
fs.mkdirSync(uploadTempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadTempDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "");
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

// Filtro dinámico: bloquea solo extensiones explícitamente bloqueadas.
// Aprobado/pending lo decide el controller usando AppSettings.
const fileFilter = async (_req, file, cb) => {
  try {
    const settings = await getAppSettings();
    const blocked = (settings.blockedExtensions || []).map((e) =>
      String(e).toLowerCase()
    );
    const ext = (file.originalname || "")
      .split(".")
      .pop()
      .toLowerCase();
    if (blocked.includes(ext)) {
      const err = new Error(
        `Tipo de archivo no permitido por política de seguridad (.${ext}).`
      );
      err.code = "EXTENSION_BLOCKED";
      return cb(err, false);
    }
    cb(null, true);
  } catch (error) {
    console.error("Error en fileFilter:", error);
    cb(null, true);
  }
};

const buildMulterInstance = async () => {
  const settings = await getAppSettings();
  const maxSizeBytes = (settings.maxFileSizeMb || 1024) * 1024 * 1024;
  return {
    upload: multer({
      storage,
      limits: { fileSize: maxSizeBytes },
      fileFilter,
    }),
    maxSizeMb: settings.maxFileSizeMb || 1024,
  };
};

const uploadSingleFile = async (req, res, next) => {
  let multerInstance;
  try {
    multerInstance = await buildMulterInstance();
  } catch (error) {
    console.error("Error inicializando multer:", error);
    return res
      .status(500)
      .json({ message: "Error inicializando la subida." });
  }

  multerInstance.upload.single("file")(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message: `El archivo supera el límite permitido de ${multerInstance.maxSizeMb} MB.`,
          code: "FILE_TOO_LARGE",
          maxSizeMb: multerInstance.maxSizeMb,
        });
      }

      return res.status(400).json({
        message: "Error al procesar la subida del archivo.",
        code: error.code || "UPLOAD_ERROR",
      });
    }

    if (error.code === "EXTENSION_BLOCKED") {
      return res.status(415).json({
        message: error.message,
        code: "EXTENSION_BLOCKED",
      });
    }

    return res.status(400).json({
      message: error.message || "No se pudo procesar el archivo.",
      code: "UPLOAD_REJECTED",
    });
  });
};

const router = express.Router();

// Pendientes: deben definirse ANTES de "/:id" para evitar colisiones
router.get("/pending", protect, admin, listPendingFiles);
router.get("/my-pending", protect, listMyPendingFiles);

router.post("/upload", protect, uploadSingleFile, uploadFile);
router.get("/", protect, getFilesByFolder);
router.post("/add-link", protect, addLink);

router.post("/:id/access", protect, trackFileAccess);

router.patch("/:id/approve", protect, admin, approveFile);
router.patch("/:id/reject", protect, admin, rejectFile);
router.patch("/:id/move", protect, moveFile);
router.post("/move-batch", protect, moveFilesBatch);

router.put("/:id", protect, updateFile);
router.delete("/:id", protect, deleteFile);

router.get("/drive/storage", protect, admin, handleStorageRequest);

export default router;
