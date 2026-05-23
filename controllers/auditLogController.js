import mongoose from "mongoose";
import AuditLog, { AUDIT_ACTIONS } from "../models/AuditLog.js";

const listAuditLogs = async (req, res) => {
  try {
    const {
      actorId,
      action,
      targetType,
      dateFrom,
      dateTo,
      page,
      limit,
    } = req.query;

    const filter = {};

    if (actorId && mongoose.Types.ObjectId.isValid(actorId)) {
      filter.actor = actorId;
    }
    if (action && AUDIT_ACTIONS.includes(action)) {
      filter.action = action;
    }
    if (targetType && ["file", "folder", "settings"].includes(targetType)) {
      filter.targetType = targetType;
    }

    const dateFilter = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCHours(0, 0, 0, 0);
        dateFilter.$gte = d;
      }
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCHours(23, 59, 59, 999);
        dateFilter.$lte = d;
      }
    }
    if (Object.keys(dateFilter).length) {
      filter.createdAt = dateFilter;
    }

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
    const skip = (parsedPage - 1) * parsedLimit;

    const [items, totalItems] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("actor", "username email role")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(totalItems / parsedLimit), 1);

    res.status(200).json({
      items,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalItems,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
      },
    });
  } catch (error) {
    console.error("Error listando audit logs:", error);
    res.status(500).json({ message: "Error obteniendo el registro de actividad." });
  }
};

export { listAuditLogs };
