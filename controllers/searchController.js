import mongoose from "mongoose";
import File from "../models/File.js";
import Folder from "../models/Folder.js";
import Tag from "../models/Tag.js";

const getUserGroupIds = (req) =>
  req.userGroupIds ||
  (req.user?.groups || []).map((group) =>
    typeof group === "string" ? group : (group?._id || group)?.toString()
  );

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildFileFilter = (req) => {
  const user = req.user;
  if (!user) return null;
  if (user.role === "admin") {
    return { status: { $nin: ["pending", "rejected"] } };
  }
  const userGroupIds = getUserGroupIds(req).filter(Boolean);
  const statusFilter = {
    $or: [
      { status: { $nin: ["pending", "rejected"] } },
      { uploadedBy: user._id },
    ],
  };
  let roleFilter;
  if (user.role === "residente") {
    roleFilter = {
      $or: [{ assignedGroup: null }, { assignedGroup: { $in: userGroupIds } }],
    };
  } else if (user.role === "docente") {
    roleFilter = {
      $or: [{ uploadedBy: user._id }, { assignedGroup: { $in: userGroupIds } }],
    };
  } else {
    return null;
  }
  return { $and: [statusFilter, roleFilter] };
};

const buildFolderFilter = (req) => {
  const user = req.user;
  if (!user) return null;
  if (user.role === "admin") return {};
  const userGroupIds = getUserGroupIds(req).filter(Boolean);
  if (user.role === "residente") {
    return {
      $or: [{ assignedGroup: null }, { assignedGroup: { $in: userGroupIds } }],
    };
  }
  if (user.role === "docente") {
    return {
      $or: [
        { createdBy: user._id },
        { assignedGroup: { $in: userGroupIds } },
      ],
    };
  }
  return null;
};

// GET /api/search?q=texto&limit=10
const globalSearch = async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 20);

  if (!q) {
    return res.status(200).json({ files: [], folders: [], tags: [] });
  }

  try {
    const regex = new RegExp(escapeRegex(q), "i");
    const fileFilter = buildFileFilter(req);
    const folderFilter = buildFolderFilter(req);

    if (fileFilter === null || folderFilter === null) {
      return res.status(403).json({ message: "Rol no autorizado." });
    }

    const [files, folders, tags] = await Promise.all([
      File.find({
        ...fileFilter,
        $or: [{ filename: regex }, { description: regex }],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("filename description fileType folder secureUrl driveFileId viewCount")
        .populate("folder", "name")
        .lean(),
      Folder.find({
        ...folderFilter,
        name: regex,
      })
        .sort({ name: 1 })
        .limit(limit)
        .select("name parentFolder assignedGroup")
        .lean(),
      Tag.find({ name: regex })
        .sort({ name: 1 })
        .limit(limit)
        .select("name")
        .lean(),
    ]);

    res.status(200).json({ files, folders, tags });
  } catch (error) {
    console.error("Error en búsqueda global:", error);
    res.status(500).json({ message: "Error en la búsqueda." });
  }
};

export { globalSearch };
