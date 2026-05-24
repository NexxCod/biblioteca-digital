import mongoose from "mongoose";
import User from "../models/User.js";
import File from "../models/File.js";

const listMyFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: "favoriteFiles",
        select:
          "filename description fileType driveFileId secureUrl size folder tags uploadedBy assignedGroup status viewCount downloadCount createdAt updatedAt",
        populate: [
          { path: "folder", select: "name" },
          { path: "uploadedBy", select: "username email" },
          { path: "tags", select: "name" },
          { path: "assignedGroup", select: "name" },
        ],
      })
      .select("favoriteFiles");
    res.status(200).json(user?.favoriteFiles || []);
  } catch (error) {
    console.error("Error listando favoritos:", error);
    res.status(500).json({ message: "Error." });
  }
};

const toggleFavorite = async (req, res) => {
  const { id: fileId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const file = await File.findById(fileId).lean();
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });

    const user = await User.findById(req.user._id).select("favoriteFiles");
    const idx = user.favoriteFiles.findIndex(
      (f) => String(f) === String(fileId)
    );
    let favorite;
    if (idx >= 0) {
      user.favoriteFiles.splice(idx, 1);
      favorite = false;
    } else {
      user.favoriteFiles.push(fileId);
      favorite = true;
    }
    await user.save();
    res.status(200).json({ favorite });
  } catch (error) {
    console.error("Error toggling favorite:", error);
    res.status(500).json({ message: "Error." });
  }
};

const getMyFavoriteIds = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("favoriteFiles");
    res.status(200).json({
      ids: (user?.favoriteFiles || []).map((id) => String(id)),
    });
  } catch (error) {
    console.error("Error obteniendo favoritos ids:", error);
    res.status(500).json({ message: "Error." });
  }
};

export { listMyFavorites, toggleFavorite, getMyFavoriteIds };
