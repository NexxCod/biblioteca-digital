// backend/routes/folderRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js'; // Necesitamos proteger la creación
import { createFolder, listFolders, updateFolder, deleteFolder, getFolderDetails } from '../controllers/folderController.js'; // Importa el controlador (lo crearemos ahora)

const router = express.Router();

// Crear una nueva carpeta
// POST /api/folders/
// Se aplica 'protect' para asegurar que solo usuarios logueados puedan crear carpetas
router.post('/', protect, createFolder);

// Listar carpetas
// GET /api/folders -> Lista carpetas raíz (parentFolder=null)
// GET /api/folders?parentFolder=... -> Lista subcarpetas de la carpeta padre dada
router.get('/', protect, listFolders);

//  Actualizar una carpeta existente
// PUT /api/folders/:id
router.put('/:id', protect, updateFolder);

// Eliminar una carpeta existente
// DELETE /api/folders/:id
router.delete('/:id', protect, deleteFolder);

// GET /api/folders/:id
router.get('/:id', protect, getFolderDetails);

export default router;