import mongoose from "mongoose";
import FolderSubscription from "../models/FolderSubscription.js";
import Folder from "../models/Folder.js";

const listMySubscriptions = async (req, res) => {
  try {
    const items = await FolderSubscription.find({ user: req.user._id })
      .populate("folder", "name parentFolder")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(items);
  } catch (error) {
    console.error("Error listando suscripciones:", error);
    res.status(500).json({ message: "Error." });
  }
};

const subscribeFolder = async (req, res) => {
  const { id } = req.params;
  const { includeSubfolders } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const folder = await Folder.findById(id).lean();
    if (!folder) return res.status(404).json({ message: "Carpeta no encontrada." });
    const sub = await FolderSubscription.findOneAndUpdate(
      { user: req.user._id, folder: id },
      {
        $set: { includeSubfolders: Boolean(includeSubfolders) },
        $setOnInsert: { user: req.user._id, folder: id },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(200).json(sub);
  } catch (error) {
    console.error("Error suscribiendo a carpeta:", error);
    res.status(500).json({ message: "Error." });
  }
};

const unsubscribeFolder = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    await FolderSubscription.deleteOne({ user: req.user._id, folder: id });
    res.status(204).send();
  } catch (error) {
    console.error("Error desuscribiendo:", error);
    res.status(500).json({ message: "Error." });
  }
};

const checkSubscription = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const sub = await FolderSubscription.findOne({
      user: req.user._id,
      folder: id,
    }).lean();
    res.status(200).json({
      subscribed: Boolean(sub),
      includeSubfolders: sub?.includeSubfolders || false,
    });
  } catch (error) {
    console.error("Error verificando suscripción:", error);
    res.status(500).json({ message: "Error." });
  }
};

export {
  listMySubscriptions,
  subscribeFolder,
  unsubscribeFolder,
  checkSubscription,
};
