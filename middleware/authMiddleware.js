// backend/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import 'dotenv/config';

// --- Middleware de Autenticación (Verifica Token) ---
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
          // Agregamos un return aquí para asegurar que no continúe si el usuario no se encuentra
          return res.status(401).json({ message: 'No autorizado, usuario no encontrado.' });
      }

      next();

    } catch (error) {
      console.error('Error de autenticación:', error);
      // Añadimos return aquí también
      return res.status(401).json({ message: 'No autorizado, token inválido.' });
    }
  }

  if (!token) {
    // Y aquí
    return res.status(401).json({ message: 'No autorizado, no se proporcionó token.' });
  }
};


// --- Middleware de Autorización por Rol (Verifica si es Admin) ---
// Este middleware DEBE usarse DESPUÉS del middleware 'protect',
// ya que depende de que 'req.user' haya sido establecido por 'protect'.
const admin = (req, res, next) => {
  // Primero verifica si el usuario está adjunto a la request (por 'protect')
  // y si tiene el rol 'admin'
  if (req.user && req.user.role === 'admin') {
    // Si es admin, permite continuar
    next();
  } else {
    // Si no es admin, deniega el acceso con estado 403 Forbidden
    res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
  }
};

// --- Middleware de Autorización por Rol (Verifica si es Docente o Admin) ---
// Ejemplo adicional: permitir acceso a docentes Y administradores
const docenteOrAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'docente')) {
      next();
    } else {
      res.status(403).json({ message: 'Acceso denegado. Se requiere rol de Docente o Administrador.' });
    }
  };


// --- Exportar los middlewares ---
export { protect, admin, docenteOrAdmin }; // Ahora exportamos todos