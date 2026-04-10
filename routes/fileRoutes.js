// backend/routes/fileRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import { protect } from "../middleware/authMiddleware.js"; // Middleware de autenticación
import {
  uploadFile,
  getFilesByFolder,
  addLink,
  updateFile,
  deleteFile,
  handleStorageRequest,
} from "../controllers/fileController.js"; // Controlador (lo crearemos a continuación)

// --- Configuración de Multer ---
const uploadTmpDir = process.env.UPLOAD_TMP_DIR || "/tmp";
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadTmpDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || "")}`;
    cb(null, safeName);
  },
});

// Filtro opcional para tipos de archivo (ejemplo: permitir PDF, Word, JPG, PNG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|jpe?g|png|gif|mp4|mp3|aac|wav|flac|aiff|alac|ogg/i;
  const extension = file.originalname.split('.').pop().toLowerCase();
  const validExtension = allowedTypes.test(extension);

  if (validExtension) {
    return cb(null, true);
  }
  cb(
    new Error(
      "Error: Tipo de archivo no soportado. Permitidos: PDF, MP4, Word, Excel, PowerPoint, JPG, PNG, GIF."
    ),
    false
  );
};

const maxUploadBytes = Number(
  process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024
);

// Inicializamos multer con el almacenamiento y el filtro
const upload = multer({
  storage: storage,
  limits: { fileSize: maxUploadBytes },
  fileFilter: fileFilter,
});

const formatMaxSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;

const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: `Archivo demasiado grande. Tamaño máximo permitido: ${formatMaxSize(maxUploadBytes)}.`,
        code: "FILE_TOO_LARGE",
      });
    }

    if (error) {
      return res.status(400).json({
        message: error.message || "No se pudo procesar el archivo enviado.",
        code: "UPLOAD_VALIDATION_ERROR",
      });
    }

    return next();
  });
};

// --- Definición de Rutas ---
const router = express.Router();

// Ruta para subir un archivo
// POST /api/files/upload
// 1. 'protect': Asegura que el usuario esté logueado (tendremos req.user)
// 2. 'upload.single('file')': Middleware de Multer.
//    - Espera un campo llamado 'file' en el form-data.
//    - Procesa el archivo y lo añade a req.file.
//    - Procesa otros campos de texto y los añade a req.body.
// 3. 'uploadFile': Nuestro controlador que maneja la lógica final.
router.post("/upload", protect, uploadSingleFile, uploadFile);

// Listar archivos por carpeta
// GET /api/files?folderId=...
router.get("/", protect, getFilesByFolder);

// Añadir un enlace
// POST /api/files/add-link
router.post("/add-link", protect, addLink);

// Actualizar un archivo/enlace existente
// PUT /api/files/:id
router.put('/:id', protect, updateFile);

// Eliminar un archivo/enlace existente
// DELETE /api/files/:id
router.delete('/:id', protect, deleteFile);

router.get('/drive/storage', protect, handleStorageRequest);

export default router;
