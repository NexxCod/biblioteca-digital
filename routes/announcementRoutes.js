import express from "express";
import { admin, protect } from "../middleware/authMiddleware.js";
import {
  listActiveAnnouncements,
  listAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  dismissAnnouncement,
} from "../controllers/announcementController.js";

const router = express.Router();

router.get("/active", protect, listActiveAnnouncements);
router.post("/:id/dismiss", protect, dismissAnnouncement);

router.get("/", protect, admin, listAllAnnouncements);
router.post("/", protect, admin, createAnnouncement);
router.patch("/:id", protect, admin, updateAnnouncement);
router.delete("/:id", protect, admin, deleteAnnouncement);

export default router;
