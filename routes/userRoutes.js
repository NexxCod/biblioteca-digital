// backend/routes/userRoutes.js
import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
    loginLimiter,
    registerLimiter,
    passwordResetLimiter,
    verifyEmailLimiter,
    magicLinkLimiter,
    magicLinkVerifyLimiter,
} from '../middleware/rateLimiters.js';
import {
    registerUser,
    loginUser,
    getUserProfile,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    verifyEmail,
    forgotPassword,
    resetPassword,
    changePassword,
    resendVerificationEmail,
    bulkUpdateUsers,
    requestLoginLink,
    verifyLoginLink,
} from '../controllers/userController.js';

const router = express.Router();

// Ruta para registrar un nuevo usuario
router.post('/register', registerLimiter, registerUser);

// Ruta para iniciar sesión
router.post('/login', loginLimiter, loginUser);

// Acceso sin contraseña: solicitar enlace por correo y canjearlo por una sesión
router.post('/magic-link', magicLinkLimiter, requestLoginLink);
router.post('/magic-link/verify', magicLinkVerifyLimiter, verifyLoginLink);

// NUEVA RUTA para obtener datos del usuario logueado
router.get('/me', protect, getUserProfile);

router.get('/verify-email/:token', verifyEmailLimiter, verifyEmail);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, resetPassword);
router.put('/change-password', protect, changePassword);
router.post('/resend-verification', verifyEmailLimiter, resendVerificationEmail);

// Bulk update (asignar grupo, cambiar rol, etc.) - admin only
router.post('/bulk-update', protect, admin, bulkUpdateUsers);

// Ruta para listar todos los usuarios
// GET /api/users/
router.get('/', protect, admin, getUsers);

// Ruta para obtener detalles de un usuario por ID
// GET /api/users/:id
router.get('/:id', protect, admin, getUserById);

// Ruta para actualizar un usuario (rol, grupos, etc.)
// PUT /api/users/:id
router.put('/:id', protect, admin, updateUser);

// Ruta para eliminar un usuario
// DELETE /api/users/:id
router.delete('/:id', protect, admin, deleteUser);

export default router;