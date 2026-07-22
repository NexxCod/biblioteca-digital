import FileAccessLog from "../models/FileAccessLog.js";
import File from "../models/File.js";
import { buildFilePermissionFilter } from "./fileController.js";

const listRecentForMe = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    // Buscar últimos accesos únicos por archivo
    const aggregation = await FileAccessLog.aggregate([
      { $match: { user: req.user._id } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$file",
          lastAccessedAt: { $first: "$createdAt" },
          lastAction: { $first: "$action" },
        },
      },
      { $sort: { lastAccessedAt: -1 } },
      { $limit: limit },
    ]);

    const fileIds = aggregation.map((a) => a._id);
    if (!fileIds.length) return res.status(200).json([]);

    const files = await File.find({ _id: { $in: fileIds } })
      .select(
        "filename description fileType driveFileId secureUrl size folder tags uploadedBy assignedGroup status viewCount downloadCount createdAt updatedAt"
      )
      .populate("folder", "name")
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name")
      .lean();

    // Mantener el orden cronológico de accesos
    const byId = new Map(files.map((f) => [String(f._id), f]));
    const ordered = aggregation
      .map((a) => {
        const f = byId.get(String(a._id));
        if (!f) return null;
        return { ...f, lastAccessedAt: a.lastAccessedAt, lastAction: a.lastAction };
      })
      .filter(Boolean);

    res.status(200).json(ordered);
  } catch (error) {
    console.error("Error obteniendo recientes:", error);
    res.status(500).json({ message: "Error." });
  }
};

// Últimos archivos SUBIDOS a la biblioteca que el usuario puede ver según su
// rol y grupos (a diferencia de listRecentForMe, que son sus propios accesos).
const listRecentUploads = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 180);

    const permissionFilter = buildFilePermissionFilter(req);
    if (permissionFilter === null) {
      return res
        .status(403)
        .json({ message: "Tu rol no tiene acceso a los archivos de la biblioteca." });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const conditions = [
      { createdAt: { $gte: since } },
      // Para el admin el filtro de permisos es vacío y vería pendientes y
      // rechazados; este panel muestra solo material ya disponible.
      { status: { $nin: ["pending", "rejected"] } },
    ];
    if (Object.keys(permissionFilter).length) {
      conditions.push(permissionFilter);
    }

    const files = await File.find({ $and: conditions })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        "filename description fileType driveFileId secureUrl size folder tags uploadedBy assignedGroup status viewCount downloadCount mimeType createdAt updatedAt"
      )
      .populate("folder", "name")
      .populate("uploadedBy", "username")
      .populate("tags", "name")
      .populate("assignedGroup", "name")
      .lean();

    res.status(200).json(files);
  } catch (error) {
    console.error("Error obteniendo subidas recientes:", error);
    res.status(500).json({ message: "Error." });
  }
};

export { listRecentForMe, listRecentUploads };
