// backend/routes/userRoutes.js
import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
    registerUser,
    loginUser,
    getUserProfile,
    getUsers, // Importar nuevo controlador
    getUserById, // Importar nuevo controlador
    updateUser, // Importar nuevo controlador
    deleteUser, // Importar nuevo controlador
    verifyEmail,           // NUEVO
    forgotPassword,        // NUEVO
    resetPassword,         // NUEVO
    changePassword,        // NUEVO
    resendVerificationEmail // NUEVO
} from '../controllers/userController.js';

const router = express.Router();

// Ruta para registrar un nuevo usuario
router.post('/register', registerUser);

// Ruta para iniciar sesión
router.post('/login', loginUser);

// NUEVA RUTA para obtener datos del usuario logueado
router.get('/me', protect, getUserProfile);

router.get('/verify-email/:token', verifyEmail); // Para verificar el email
router.post('/forgot-password', forgotPassword);    // Para solicitar restablecimiento
router.post('/reset-password/:token', resetPassword); // Para restablecer con el token
router.put('/change-password', protect, changePassword); // Para cambiar contraseña (logueado)
router.post('/resend-verification', resendVerificationEmail); // Para reenviar email de verificación

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