import express from "express";
import { admin, protect } from "../middleware/authMiddleware.js";
import {
  fetchAppSettings,
  fetchPublicAppSettings,
  saveAppSettings,
} from "../controllers/appSettingsController.js";
import { listAuditLogs } from "../controllers/auditLogController.js";

const router = express.Router();

router.get("/settings", protect, admin, fetchAppSettings);
router.get("/settings/public", protect, fetchPublicAppSettings);
router.patch("/settings", protect, admin, saveAppSettings);
router.get("/audit-logs", protect, admin, listAuditLogs);

export default router;
