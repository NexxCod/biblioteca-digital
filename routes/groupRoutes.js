// backend/routes/groupRoutes.js
import express from 'express';
// Importamos protect y el middleware de admin que definimos antes
import { protect, admin } from '../middleware/authMiddleware.js';
// Importamos los controladores de grupos (que crearemos a continuación)
import {
    createGroup,
    listGroups,
    addMemberToGroup,
    removeMemberFromGroup,
    updateGroup, // <-- Importar el controlador de actualizar
    deleteGroup // <-- Importar el controlador de eliminar
} from '../controllers/groupController.js';

const router = express.Router();

// Ruta para listar todos los grupos existentes
// GET /api/groups/
// Solo los admins pueden listar todos los grupos
router.get('/', protect, listGroups);

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

// --- RUTAS PARA GESTIÓN DE GRUPO INDIVIDUAL POR ID (Admin Only) ---

// Ruta para obtener detalles de un grupo por ID (Opcional, si necesitas una vista de detalle)
// GET /api/groups/:id
// router.get('/:id', protect, admin, getGroupDetails); // Asumiendo que tengas o crees este controlador

// Ruta para actualizar un grupo existente (Admin Only)
// PUT /api/groups/:id
router.put('/:id', protect, admin, updateGroup); // <-- NUEVA RUTA PUT

// Ruta para eliminar un grupo existente (Admin Only)
// DELETE /api/groups/:id
router.delete('/:id', protect, admin, deleteGroup); // <-- NUEVA RUTA DELETE

export default router;