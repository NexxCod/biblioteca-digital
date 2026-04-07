import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getGoogleAuthUrl,
  handleGoogleAuthCallback,
} from "../controllers/googleAuthController.js";
import {
  createDriveUploadSession,
  finalizeDriveUpload,
} from "../controllers/googleDriveUploadController.js";

const router = express.Router();

router.get("/auth/url", getGoogleAuthUrl);
router.get("/auth/callback", handleGoogleAuthCallback);
router.post("/drive/upload-session", protect, createDriveUploadSession);
router.post("/drive/finalize", protect, finalizeDriveUpload);

export default router;
