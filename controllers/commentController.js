import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import File from "../models/File.js";
import { createNotification } from "../utils/notificationService.js";

const getUserGroupIds = (req) =>
  req.userGroupIds ||
  (req.user?.groups || []).map((group) =>
    typeof group === "string" ? group : (group?._id || group)?.toString()
  );

const userCanAccessFile = (req, file) => {
  if (!req?.user || !file) return false;
  if (req.user.role === "admin") return true;
  const uploaderId =
    file.uploadedBy?._id?.toString() || file.uploadedBy?.toString();
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

const listFileComments = async (req, res) => {
  const { fileId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const file = await File.findById(fileId).lean();
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });
    if (!userCanAccessFile(req, file)) {
      return res.status(403).json({ message: "Sin permiso." });
    }
    const items = await Comment.find({ file: fileId, deletedAt: null })
      .sort({ createdAt: 1 })
      .populate("author", "username email role")
      .lean();
    res.status(200).json(items);
  } catch (error) {
    console.error("Error listando comentarios:", error);
    res.status(500).json({ message: "Error." });
  }
};

const createComment = async (req, res) => {
  const { fileId } = req.params;
  const { content } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ message: "El comentario no puede estar vacío." });
  }
  try {
    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: "Archivo no encontrado." });
    if (!userCanAccessFile(req, file)) {
      return res.status(403).json({ message: "Sin permiso." });
    }
    const comment = await Comment.create({
      file: fileId,
      author: req.user._id,
      content: content.trim(),
    });

    // Notificar al uploader si no es el autor del comentario
    const uploaderId = String(file.uploadedBy);
    if (uploaderId !== String(req.user._id)) {
      createNotification({
        userId: uploaderId,
        type: "comment_new",
        title: `Nuevo comentario en "${file.filename}"`,
        body: content.trim().slice(0, 200),
        link: `/folder/${file.folder}?file=${file._id}`,
        relatedFile: file._id,
      });
    }

    const populated = await Comment.findById(comment._id).populate(
      "author",
      "username email role"
    );
    res.status(201).json(populated);
  } catch (error) {
    console.error("Error creando comentario:", error);
    res.status(500).json({ message: "Error." });
  }
};

const deleteComment = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const comment = await Comment.findById(id);
    if (!comment || comment.deletedAt) {
      return res.status(404).json({ message: "Comentario no encontrado." });
    }
    const isAdmin = req.user.role === "admin";
    const isAuthor = String(comment.author) === String(req.user._id);
    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ message: "Sin permiso." });
    }
    comment.deletedAt = new Date();
    comment.deletedBy = req.user._id;
    await comment.save();
    res.status(204).send();
  } catch (error) {
    console.error("Error eliminando comentario:", error);
    res.status(500).json({ message: "Error." });
  }
};

export { listFileComments, createComment, deleteComment };
