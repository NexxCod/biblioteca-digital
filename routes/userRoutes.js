// backend/routes/userRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { registerUser, loginUser, getUserProfile } from '../controllers/userController.js'; 

const router = express.Router();

// Ruta para registrar un nuevo usuario
router.post('/register', registerUser);

// Ruta para iniciar sesión
router.post('/login', loginUser);

// NUEVA RUTA para obtener datos del usuario logueado
router.get('/me', protect, getUserProfile);



export default router;