import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";
import {
  getGoogleDriveStatus,
  startGoogleAuthFlow,
  saveManualRefreshToken,
  handleGoogleAuthCallback,
  clearGoogleCredential,
} from "../controllers/googleAuthController.js";
import {
  createDriveUploadSession,
  finalizeDriveUpload,
} from "../controllers/googleDriveUploadController.js";

const router = express.Router();

// Callback de Google: público (lo invoca Google), valida state internamente
router.get("/auth/callback", handleGoogleAuthCallback);

// Endpoints para el panel admin
router.get("/admin/drive/status", protect, admin, getGoogleDriveStatus);
router.post("/admin/drive/auth-url", protect, admin, startGoogleAuthFlow);
router.post(
  "/admin/drive/refresh-token",
  protect,
  admin,
  saveManualRefreshToken
);
router.delete("/admin/drive/credential", protect, admin, clearGoogleCredential);

// Endpoints para el flujo de subida directa a Drive (usuarios autenticados)
router.post("/drive/upload-session", protect, createDriveUploadSession);
router.post("/drive/finalize", protect, finalizeDriveUpload);

export default router;
