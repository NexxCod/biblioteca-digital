// backend/routes/fileRoutes.js
import express from "express";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import { admin, protect } from "../middleware/authMiddleware.js"; // Middleware de autenticación
import {
  uploadFile,
  getFilesByFolder,
  addLink,
  updateFile,
  deleteFile,
  handleStorageRequest,
} from "../controllers/fileController.js"; // Controlador (lo crearemos a continuación)

// --- Configuración de Multer ---
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

// Inicializamos multer con el almacenamiento y el filtro
const upload = multer({
  storage: storage,
  limits: {
    fileSize:
      (Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 50) || 50) * 1024 * 1024,
  },
  fileFilter: fileFilter,
});

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
router.post("/upload", protect, upload.single("file"), uploadFile);

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

router.get("/drive/storage", protect, admin, handleStorageRequest);

export default router;
