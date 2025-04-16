// backend/routes/tagRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js'; // Protegeremos las rutas de tags
// Importaremos los controladores de tags (que crearemos a continuación)
import { createTag, listTags } from '../controllers/tagController.js';

const router = express.Router();

// Ruta para listar todas las etiquetas existentes
// GET /api/tags/
router.get('/', protect, listTags);

// Ruta para crear una nueva etiqueta
// POST /api/tags/
// Por ahora, permitimos que cualquier usuario logueado cree tags.
// Podríamos añadir aquí el middleware 'admin' o 'docenteOrAdmin' si quisiéramos restringirlo.
router.post('/', protect, createTag);

// Aquí podrían ir rutas para actualizar o eliminar tags en el futuro

export default router;