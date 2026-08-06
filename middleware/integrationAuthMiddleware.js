// backend/middleware/integrationAuthMiddleware.js
// Autenticación servicio-a-servicio para la integración con
// preinforme-analytics (PA). Se valida una llave compartida enviada en el
// header `x-integration-key` (o como `Authorization: Bearer <llave>`).
import crypto from "crypto";

const sha256Digest = (value) =>
  crypto.createHash("sha256").update(String(value), "utf8").digest();

const extractProvidedKey = (req) => {
  const headerKey = req.headers["x-integration-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }

  return null;
};

// Fail-closed: sin INTEGRATION_API_KEY configurada la integración queda
// deshabilitada por completo (503), nunca abierta.
const integrationAuth = (req, res, next) => {
  const configuredKey = process.env.INTEGRATION_API_KEY;

  if (!configuredKey) {
    return res.status(503).json({ message: "Integración no configurada." });
  }

  const providedKey = extractProvidedKey(req);
  if (!providedKey) {
    return res
      .status(401)
      .json({ message: "Llave de integración requerida." });
  }

  // Comparación en tiempo constante sobre digests sha256 (mismo largo
  // garantizado, sin filtrar información por timing).
  const matches = crypto.timingSafeEqual(
    sha256Digest(providedKey),
    sha256Digest(configuredKey)
  );

  if (!matches) {
    return res.status(401).json({ message: "Llave de integración inválida." });
  }

  req.integration = true;
  next();
};

export { integrationAuth };
