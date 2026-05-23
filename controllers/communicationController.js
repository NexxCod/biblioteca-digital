import mongoose from "mongoose";
import Communication, {
  COMMUNICATION_AUDIENCES,
} from "../models/Communication.js";
import User from "../models/User.js";
import {
  sanitizeBody,
  sanitizeSignature,
  resolveRecipients,
  composeFinalHtml,
  sendInBatches,
} from "../utils/communicationService.js";
import { logAudit } from "../utils/auditLog.js";

const previewRecipients = async (req, res) => {
  try {
    const { audience, roles, groupIds, userIds } = req.body || {};
    if (!COMMUNICATION_AUDIENCES.includes(audience)) {
      return res.status(400).json({ message: "Audiencia inválida." });
    }
    const recipients = await resolveRecipients({
      audience,
      roles,
      groupIds,
      userIds,
    });
    res.status(200).json({
      total: recipients.length,
      sample: recipients.slice(0, 5).map((r) => r.email),
    });
  } catch (error) {
    console.error("Error previewing recipients:", error);
    res.status(500).json({ message: "Error calculando destinatarios." });
  }
};

const sendCommunication = async (req, res) => {
  try {
    const {
      subject,
      bodyHtml,
      audience,
      roles,
      groupIds,
      userIds,
      sendTestToSelf,
    } = req.body || {};

    if (!subject || !subject.trim()) {
      return res.status(400).json({ message: "El asunto es obligatorio." });
    }
    if (!bodyHtml || !bodyHtml.trim()) {
      return res.status(400).json({ message: "El cuerpo es obligatorio." });
    }
    if (!COMMUNICATION_AUDIENCES.includes(audience)) {
      return res.status(400).json({ message: "Audiencia inválida." });
    }

    const cleanBody = sanitizeBody(bodyHtml);
    const sender = await User.findById(req.user._id).select(
      "username email signature"
    );
    if (!sender) {
      return res.status(404).json({ message: "Sender no encontrado." });
    }

    const html = composeFinalHtml({
      bodyHtml: cleanBody,
      signatureHtml: sender.signature || "",
      senderName: sender.username,
    });

    if (sendTestToSelf) {
      await sendInBatches([{ email: sender.email }], `[Prueba] ${subject}`, html);
      return res.status(200).json({ message: "Correo de prueba enviado.", testMode: true });
    }

    const recipients = await resolveRecipients({
      audience,
      roles,
      groupIds,
      userIds,
    });
    if (!recipients.length) {
      return res.status(400).json({
        message: "No hay destinatarios válidos para la audiencia indicada.",
      });
    }

    const errors = await sendInBatches(recipients, subject, html);

    const record = await Communication.create({
      sender: sender._id,
      senderName: sender.username,
      senderEmail: sender.email,
      subject: subject.trim(),
      bodyHtml: cleanBody,
      audience,
      roles: audience === "roles" ? roles || [] : [],
      groupIds: audience === "groups" ? groupIds || [] : [],
      userIds: audience === "users" ? userIds || [] : [],
      recipientCount: recipients.length,
      errorCount: errors.length,
      errorSample: errors.slice(0, 5),
      sentAt: new Date(),
    });

    await logAudit({
      req,
      action: "update_settings",
      targetType: "settings",
      targetName: `Comunicación: ${subject.trim().slice(0, 80)}`,
      metadata: {
        communicationId: String(record._id),
        audience,
        recipientCount: recipients.length,
        errorCount: errors.length,
      },
    });

    res.status(201).json({
      _id: record._id,
      recipientCount: recipients.length,
      errorCount: errors.length,
      errorSample: errors.slice(0, 5),
    });
  } catch (error) {
    console.error("Error enviando comunicación:", error);
    res.status(500).json({ message: "Error enviando la comunicación." });
  }
};

const listCommunications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      Communication.find({})
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "username email")
        .populate("groupIds", "name")
        .populate("userIds", "username email")
        .lean(),
      Communication.countDocuments({}),
    ]);

    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    res.status(200).json({
      items,
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
    console.error("Error listando comunicaciones:", error);
    res.status(500).json({ message: "Error obteniendo historial." });
  }
};

const getCommunication = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido." });
  }
  try {
    const item = await Communication.findById(id)
      .populate("sender", "username email")
      .populate("groupIds", "name")
      .populate("userIds", "username email")
      .lean();
    if (!item) return res.status(404).json({ message: "Comunicación no encontrada." });
    res.status(200).json(item);
  } catch (error) {
    console.error("Error obteniendo comunicación:", error);
    res.status(500).json({ message: "Error obteniendo comunicación." });
  }
};

const updateMySignature = async (req, res) => {
  try {
    const { signature } = req.body || {};
    const clean = sanitizeSignature(signature || "");
    if (clean.length > 4000) {
      return res
        .status(400)
        .json({ message: "La firma es demasiado larga (máx. 4000 chars)." });
    }
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { signature: clean },
      { new: true, runValidators: true }
    ).select("signature");
    res.status(200).json({ signature: updated.signature });
  } catch (error) {
    console.error("Error actualizando firma:", error);
    res.status(500).json({ message: "Error actualizando firma." });
  }
};

const getMySignature = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("signature");
    res.status(200).json({ signature: user?.signature || "" });
  } catch (error) {
    console.error("Error obteniendo firma:", error);
    res.status(500).json({ message: "Error obteniendo firma." });
  }
};

export {
  previewRecipients,
  sendCommunication,
  listCommunications,
  getCommunication,
  updateMySignature,
  getMySignature,
};
