import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getMyPreferences,
  updateMyPreferences,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", protect, listMyNotifications);
router.get("/unread-count", protect, getUnreadCount);
router.patch("/read-all", protect, markAllAsRead);
router.patch("/:id/read", protect, markAsRead);

router.get("/preferences/me", protect, getMyPreferences);
router.patch("/preferences/me", protect, updateMyPreferences);

export default router;
