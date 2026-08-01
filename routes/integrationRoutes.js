// backend/routes/integrationRoutes.js
// API servicio-a-servicio para preinforme-analytics (PA). Todas las rutas
// exigen la llave compartida (INTEGRATION_API_KEY) vía integrationAuth.
import express from "express";
import { integrationAuth } from "../middleware/integrationAuthMiddleware.js";
import { uploadSingleFile } from "./fileRoutes.js";
import {
  ensureUser,
  ssoToken,
  uploadIntegrationFile,
  deleteIntegrationFile,
} from "../controllers/integrationController.js";

const router = express.Router();

router.use(integrationAuth);

// Liga/crea usuario por email (PA es la referencia de identidad).
router.get("/config", integrationConfig);

router.post("/users/ensure", ensureUser);

// JWT de acceso único (SSO) para abrir la biblioteca sin segundo login.
router.post("/sso", ssoToken);

// Subida a rutas de carpetas lógicas (multipart, campo "file"). Reutiliza el
// mismo multer dinámico de fileRoutes (tmpdir + límite AppSettings).
router.post("/files", uploadSingleFile, uploadIntegrationFile);

// Borrado por el uploader (body {email}).
router.delete("/files/:id", deleteIntegrationFile);

export default router;
