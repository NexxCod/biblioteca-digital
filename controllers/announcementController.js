import mongoose from "mongoose";
import sanitizeHtml from "sanitize-html";
import Announcement from "../models/Announcement.js";
import User from "../models/User.js";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "a", "h2", "h3",
];
const ALLOWED_ATTRS = { a: ["href", "title", "target", "rel"] };

const cleanBody = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });

const listActiveAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    const user = await User.findById(req.user._id)
      .select("dismissedAnnouncements")
      .lean();
    const dismissed = (user?.dismissedAnnouncements || []).map(String);

    const items = await Announcement.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    const filtered = items.filter((a) => !dismissed.includes(String(a._id)));
    res.status(200).json(filtered);
  } catch (error) {
    console.error("Error listando anuncios activos:", error);
    res.status(500).json({ message: "Error." });
  }
};

const listAllAnnouncements = async (_req, res) => {
  try {
    const items = await Announcement.find({})
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email")
      .lean();
    res.status(200).json(items);
  } catch (error) {
    console.error("Error listando anuncios:", error);
    res.status(500).json({ message: "Error." });
  }
};

const createAnnouncement = async (req, res) => {
  try {
    const { title, body, variant, startsAt, endsAt, isActive } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "El título es obligatorio." });
    }
    const item = await Announcement.create({
      title: title.trim(),
      body: cleanBody(body),
      variant: ["info", "warning", "success"].includes(variant)
        ? variant
        : "info",
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      isActive: isActive !== false,
      createdBy: req.user._id,
    });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creando anuncio:", error);
    res.status(500).json({ message: "Error." });
  }
};

const updateAnnouncement = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const item = await Announcement.findById(id);
    if (!item) return res.status(404).json({ message: "No encontrado." });
    const { title, body, variant, startsAt, endsAt, isActive } = req.body || {};
    if (title !== undefined) item.title = String(title).trim();
    if (body !== undefined) item.body = cleanBody(body);
    if (variant && ["info", "warning", "success"].includes(variant))
      item.variant = variant;
    if (startsAt !== undefined) item.startsAt = startsAt ? new Date(startsAt) : null;
    if (endsAt !== undefined) item.endsAt = endsAt ? new Date(endsAt) : null;
    if (typeof isActive === "boolean") item.isActive = isActive;
    await item.save();
    res.status(200).json(item);
  } catch (error) {
    console.error("Error actualizando anuncio:", error);
    res.status(500).json({ message: "Error." });
  }
};

const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    await Announcement.findByIdAndDelete(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error eliminando anuncio:", error);
    res.status(500).json({ message: "Error." });
  }
};

const dismissAnnouncement = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { dismissedAnnouncements: id },
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error descartando anuncio:", error);
    res.status(500).json({ message: "Error." });
  }
};

export {
  listActiveAnnouncements,
  listAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  dismissAnnouncement,
};
