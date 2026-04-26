// backend/middleware/rateLimiters.js
import rateLimit from "express-rate-limit";

const buildHandler = (statusCode, message, code) => (_req, res) => {
  res.status(statusCode).json({ message, code });
};

// Login: 10 intentos cada 15 min por IP. Se cuenta solo fallos (skipSuccessfulRequests).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: buildHandler(
    429,
    "Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.",
    "RATE_LIMITED_LOGIN"
  ),
});

// Registro: 5 cada hora por IP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildHandler(
    429,
    "Demasiados registros desde esta dirección. Intenta nuevamente en una hora.",
    "RATE_LIMITED_REGISTER"
  ),
});

// Recuperación / verificación de correo: 3 cada 30 min por IP.
const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildHandler(
    429,
    "Demasiadas solicitudes de restablecimiento. Espera 30 minutos antes de reintentar.",
    "RATE_LIMITED_PASSWORD_RESET"
  ),
});

const verifyEmailLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildHandler(
    429,
    "Demasiadas solicitudes de verificación. Espera 30 minutos antes de reintentar.",
    "RATE_LIMITED_VERIFY"
  ),
});

export {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  verifyEmailLimiter,
};
