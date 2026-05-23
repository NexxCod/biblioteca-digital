import express from "express";
import { admin, protect } from "../middleware/authMiddleware.js";
import {
  fetchAppSettings,
  fetchPublicAppSettings,
  saveAppSettings,
} from "../controllers/appSettingsController.js";
import { listAuditLogs } from "../controllers/auditLogController.js";
import {
  previewRecipients,
  sendCommunication,
  listCommunications,
  getCommunication,
  updateMySignature,
  getMySignature,
} from "../controllers/communicationController.js";

const router = express.Router();

router.get("/settings", protect, admin, fetchAppSettings);
router.get("/settings/public", protect, fetchPublicAppSettings);
router.patch("/settings", protect, admin, saveAppSettings);
router.get("/audit-logs", protect, admin, listAuditLogs);

// Comunicaciones por correo (solo admin)
router.post("/communications/preview", protect, admin, previewRecipients);
router.post("/communications", protect, admin, sendCommunication);
router.get("/communications", protect, admin, listCommunications);
router.get("/communications/:id", protect, admin, getCommunication);

// Firma del usuario (cualquier admin puede setear la propia)
router.get("/me/signature", protect, admin, getMySignature);
router.put("/me/signature", protect, admin, updateMySignature);

export default router;
