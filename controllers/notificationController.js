import mongoose from "mongoose";
import Notification from "../models/Notification.js";

const listMyNotifications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const skip = (page - 1) * limit;
    const onlyUnread = req.query.onlyUnread === "true";

    const filter = { user: req.user._id };
    if (onlyUnread) filter.readAt = null;

    const [items, totalItems, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("relatedFile", "filename folder")
        .populate("relatedFolder", "name")
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user._id, readAt: null }),
    ]);

    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    res.status(200).json({
      items,
      unreadCount,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error listando notificaciones:", error);
    res.status(500).json({ message: "Error obteniendo notificaciones." });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      readAt: null,
    });
    res.status(200).json({ unreadCount: count });
  } catch (error) {
    console.error("Error obteniendo conteo de no leídas:", error);
    res.status(500).json({ message: "Error." });
  }
};

const markAsRead = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const result = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!result)
      return res.status(404).json({ message: "Notificación no encontrada." });
    res.status(200).json(result);
  } catch (error) {
    console.error("Error marcando leída:", error);
    res.status(500).json({ message: "Error." });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.status(204).send();
  } catch (error) {
    console.error("Error marcando todas leídas:", error);
    res.status(500).json({ message: "Error." });
  }
};

const getMyPreferences = async (req, res) => {
  const User = (await import("../models/User.js")).default;
  try {
    const user = await User.findById(req.user._id).select(
      "notificationPreferences"
    );
    res.status(200).json(user?.notificationPreferences || {});
  } catch (error) {
    console.error("Error obteniendo preferencias:", error);
    res.status(500).json({ message: "Error." });
  }
};

const updateMyPreferences = async (req, res) => {
  const User = (await import("../models/User.js")).default;
  try {
    const { weeklyDigest, inApp } = req.body || {};
    const update = {};
    if (typeof weeklyDigest === "boolean")
      update["notificationPreferences.weeklyDigest"] = weeklyDigest;
    if (typeof inApp === "boolean")
      update["notificationPreferences.inApp"] = inApp;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    ).select("notificationPreferences");
    res.status(200).json(user.notificationPreferences);
  } catch (error) {
    console.error("Error actualizando preferencias:", error);
    res.status(500).json({ message: "Error." });
  }
};

export {
  listMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getMyPreferences,
  updateMyPreferences,
};
