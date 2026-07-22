// backend/middleware/rateLimiters.js
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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

// Solicitud de enlace de acceso (magic link): 5 cada 15 min por IP+email.
// Se incluye el email en la llave para que varios usuarios detrás de la misma
// IP institucional (hospital) no se bloqueen entre sí.
const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}|${String(req.body?.email || "")
      .toLowerCase()
      .trim()}`,
  handler: buildHandler(
    429,
    "Demasiadas solicitudes de enlace de acceso. Espera unos minutos e inténtalo nuevamente.",
    "RATE_LIMITED_MAGIC_LINK"
  ),
});

// Canje del enlace de acceso: 15 intentos cada 15 min por IP (solo cuenta fallos).
const magicLinkVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: buildHandler(
    429,
    "Demasiados intentos con enlaces de acceso. Espera 15 minutos antes de reintentar.",
    "RATE_LIMITED_MAGIC_LINK_VERIFY"
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
  magicLinkLimiter,
  magicLinkVerifyLimiter,
};
