// backend/routes/tagRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js'; // Protegeremos las rutas de tags
// Importaremos los controladores de tags (que crearemos a continuación)
import { createTag, listTags, updateTag, deleteTag } from '../controllers/tagController.js';

const router = express.Router();

// Ruta para listar todas las etiquetas existentes
// GET /api/tags/
router.get('/', protect, listTags);

// Ruta para crear una nueva etiqueta
// POST /api/tags/
// Por ahora, permitimos que cualquier usuario logueado cree tags.
// Podríamos añadir aquí el middleware 'admin' o 'docenteOrAdmin' si quisiéramos restringirlo.
router.post('/', protect, createTag);

// Actualizar una etiqueta existente
// PUT /api/tags/:id
// Permitiremos actualizar a admin o al creador de la tag
router.put('/:id', protect, updateTag);

// Eliminar una etiqueta existente
// DELETE /api/tags/:id
// Permitiremos eliminar a admin o al creador de la tag
router.delete('/:id', protect, deleteTag);

export default router;