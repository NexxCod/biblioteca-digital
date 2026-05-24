import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listMySubscriptions,
  subscribeFolder,
  unsubscribeFolder,
  checkSubscription,
} from "../controllers/subscriptionController.js";

const router = express.Router();

router.get("/me", protect, listMySubscriptions);
router.get("/folder/:id", protect, checkSubscription);
router.post("/folder/:id", protect, subscribeFolder);
router.delete("/folder/:id", protect, unsubscribeFolder);

export default router;
