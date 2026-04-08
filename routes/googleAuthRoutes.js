import express from "express";
import {
  getGoogleAuthUrl,
  handleGoogleAuthCallback,
} from "../controllers/googleAuthController.js";

const router = express.Router();

router.get("/auth/url", getGoogleAuthUrl);
router.get("/auth/callback", handleGoogleAuthCallback);

export default router;
