// backend/routes/fileRoutes.js
import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware.js"; // Middleware de autenticación
import {
  uploadFile,
  getFilesByFolder,
  addVideoLink,
  updateFile,
  deleteFile,
} from "../controllers/fileController.js"; // Controlador (lo crearemos a continuación)

// --- Configuración de Multer ---
// Usamos almacenamiento en memoria (el archivo estará en req.file.buffer)
const storage = multer.memoryStorage();

// Filtro opcional para tipos de archivo (ejemplo: permitir PDF, Word, JPG, PNG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|jpe?g|png|gif/i;
  const extension = file.originalname.split('.').pop().toLowerCase();
  const validExtension = allowedTypes.test(extension);
  const validMimeType = allowedTypes.test(file.mimetype);

  if (validExtension) {
    return cb(null, true);
  }
  cb(
    new Error(
      "Error: Tipo de archivo no soportado. Permitidos: PDF, Word, Excel, PowerPoint, JPG, PNG, GIF."
    ),
    false
  );
};

// Inicializamos multer con el almacenamiento y el filtro
const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // Límite de tamaño (ej: 500MB)
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

// Añadir un enlace de video
// POST /api/files/add-link
router.post("/add-link", protect, addVideoLink);

// Actualizar un archivo/enlace existente
// PUT /api/files/:id
router.put('/:id', protect, updateFile);

// Eliminar un archivo/enlace existente
// DELETE /api/files/:id
router.delete('/:id', protect, deleteFile);

export default router;
