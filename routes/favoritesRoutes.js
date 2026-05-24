import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listMyFavorites,
  toggleFavorite,
  getMyFavoriteIds,
} from "../controllers/favoritesController.js";

const router = express.Router();

router.get("/", protect, listMyFavorites);
router.get("/ids", protect, getMyFavoriteIds);
router.post("/:id/toggle", protect, toggleFavorite);

export default router;
