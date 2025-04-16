// backend/routes/groupRoutes.js
import express from 'express';
// Importamos protect y el middleware de admin que definimos antes
import { protect, admin } from '../middleware/authMiddleware.js';
// Importamos los controladores de grupos (que crearemos a continuación)
import {
    createGroup,
    listGroups,
    addMemberToGroup,
    removeMemberFromGroup
} from '../controllers/groupController.js';

const router = express.Router();

// Ruta para listar todos los grupos existentes
// GET /api/groups/
// Solo los admins pueden listar todos los grupos
router.get('/', protect, admin, listGroups);

// Ruta para crear un nuevo grupo
// POST /api/groups/
// Solo los admins pueden crear grupos
router.post('/', protect, admin, createGroup);

// Añadir un miembro a un grupo (Admin Only)
// POST /api/groups/:groupId/members
// Espera { "userId": "..." } en el body
router.post('/:groupId/members', protect, admin, addMemberToGroup);

// Quitar un miembro de un grupo (Admin Only)
// DELETE /api/groups/:groupId/members/:userId
router.delete('/:groupId/members/:userId', protect, admin, removeMemberFromGroup);

// Aquí irán rutas para ver detalles de un grupo, actualizarlo,
// añadir/quitar miembros, y eliminar grupos.

export default router;