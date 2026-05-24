import mongoose from "mongoose";
import File from "../models/File.js";
import FileAccessLog, { ACCESS_ACTIONS } from "../models/FileAccessLog.js";
import User from "../models/User.js";
import Folder from "../models/Folder.js";

const getUserGroupIds = (req) =>
  req.userGroupIds ||
  (req.user?.groups || []).map((group) =>
    typeof group === "string" ? group : (group?._id || group)?.toString()
  );

// Reglas equivalentes a buildFilePermissionFilter en fileController
const userCanAccessFile = (req, file) => {
  if (!req?.user || !file) return false;
  if (req.user.role === "admin") return true;

  const uploaderId = file.uploadedBy?._id?.toString() || file.uploadedBy?.toString();
  if (uploaderId === req.user._id.toString()) return true;

  if (file.status && file.status !== "approved") return false;

  const assignedGroupId =
    file.assignedGroup?._id?.toString() ||
    file.assignedGroup?.toString() ||
    null;
  const userGroupIds = getUserGroupIds(req).filter(Boolean);

  if (req.user.role === "residente") {
    if (!assignedGroupId) return true;
    return userGroupIds.includes(assignedGroupId);
  }
  if (req.user.role === "docente") {
    if (assignedGroupId && userGroupIds.includes(assignedGroupId)) return true;
    return false;
  }
  return false;
};

const DEDUP_WINDOW_MS = 60 * 60 * 1000;

// POST /api/files/:id/access  body: { action }
const trackFileAccess = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  if (!ACCESS_ACTIONS.includes(action)) {
    return res.status(400).json({ message: "Acción inválida." });
  }

  try {
    const file = await File.findById(id).lean();
    if (!file) {
      return res.status(404).json({ message: "Archivo no encontrado." });
    }
    if (!userCanAccessFile(req, file)) {
      return res
        .status(403)
        .json({ message: "Sin permiso para acceder a este archivo." });
    }

    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const existing = await FileAccessLog.findOne({
      file: id,
      user: req.user._id,
      action,
      createdAt: { $gte: since },
    }).lean();

    const updates = { lastAccessedAt: new Date() };
    const isDownload = action === "download";
    const isView = action === "view" || action === "preview" || action === "open_link";

    if (!existing) {
      await FileAccessLog.create({ file: id, user: req.user._id, action });
      if (isView) updates.$inc = { ...(updates.$inc || {}), viewCount: 1 };
      if (isDownload)
        updates.$inc = { ...(updates.$inc || {}), downloadCount: 1 };
    }

    // separamos lastAccessedAt para que siempre se actualice
    const { $inc, ...rest } = updates;
    const setFilter = { $set: rest };
    if ($inc) setFilter.$inc = $inc;
    await File.updateOne({ _id: id }, setFilter);

    res.status(204).send();
  } catch (error) {
    console.error("Error registrando acceso:", error);
    res.status(500).json({ message: "Error registrando acceso." });
  }
};

// GET /api/admin/files/access-log
const listAccessLog = async (req, res) => {
  try {
    const {
      userId,
      fileId,
      action,
      dateFrom,
      dateTo,
      page,
      limit,
    } = req.query;

    const filter = {};
    if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.user = userId;
    if (fileId && mongoose.Types.ObjectId.isValid(fileId)) filter.file = fileId;
    if (action && ACCESS_ACTIONS.includes(action)) filter.action = action;

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
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);
    const skip = (parsedPage - 1) * parsedLimit;

    const [items, totalItems] = await Promise.all([
      FileAccessLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("user", "username email role")
        .populate("file", "filename fileType folder")
        .lean(),
      FileAccessLog.countDocuments(filter),
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
    console.error("Error listando accesos:", error);
    res.status(500).json({ message: "Error obteniendo accesos." });
  }
};

// GET /api/admin/stats/overview
const getStatsOverview = async (_req, res) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const [
      totalFiles,
      totalFolders,
      totalUsers,
      filesByType,
      filesByStatus,
      uploadsByMonth,
      topUploaders,
      topFiles,
      recentAccessCount,
    ] = await Promise.all([
      File.countDocuments({}),
      Folder.countDocuments({}),
      User.countDocuments({ isEmailVerified: true }),
      File.aggregate([
        { $group: { _id: "$fileType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      File.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      File.aggregate([
        { $match: { createdAt: { $gte: twelveMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      File.aggregate([
        { $group: { _id: "$uploadedBy", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: "$_id",
            count: 1,
            username: "$user.username",
            email: "$user.email",
            _id: 0,
          },
        },
      ]),
      File.find({ viewCount: { $gt: 0 } })
        .sort({ viewCount: -1 })
        .limit(10)
        .select("filename viewCount downloadCount fileType")
        .lean(),
      FileAccessLog.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    const monthBuckets = [];
    const cursor = new Date(twelveMonthsAgo);
    while (cursor <= now) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const found = uploadsByMonth.find(
        (x) => x._id.year === y && x._id.month === m
      );
      monthBuckets.push({
        label: `${y}-${String(m).padStart(2, "0")}`,
        count: found ? found.count : 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    res.status(200).json({
      totals: {
        files: totalFiles,
        folders: totalFolders,
        usersVerified: totalUsers,
        accessLast30d: recentAccessCount,
      },
      filesByType: filesByType.map((f) => ({ type: f._id, count: f.count })),
      filesByStatus: filesByStatus.map((f) => ({
        status: f._id || "approved",
        count: f.count,
      })),
      uploadsByMonth: monthBuckets,
      topUploaders,
      topFiles,
    });
  } catch (error) {
    console.error("Error generando stats:", error);
    res.status(500).json({ message: "Error generando estadísticas." });
  }
};

export { trackFileAccess, listAccessLog, getStatsOverview };
