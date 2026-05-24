import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listFileComments,
  createComment,
  deleteComment,
} from "../controllers/commentController.js";

const router = express.Router();

router.get("/file/:fileId", protect, listFileComments);
router.post("/file/:fileId", protect, createComment);
router.delete("/:id", protect, deleteComment);

export default router;
