import sanitizeHtml from "sanitize-html";
import mongoose from "mongoose";
import User from "../models/User.js";
import Group from "../models/Group.js";
import Communication from "../models/Communication.js";
import sendEmail from "./emailService.js";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "a",
  "h2",
  "h3",
  "blockquote",
  "code",
  "hr",
];

const ALLOWED_ATTRS = {
  a: ["href", "title", "target", "rel"],
};

const sanitizeBody = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });

const sanitizeSignature = (html) =>
  sanitizeHtml(html || "", {
    allowedTags: [...ALLOWED_TAGS, "span"],
    allowedAttributes: { ...ALLOWED_ATTRS, span: ["style"] },
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i],
      },
    },
  });

const buildRecipientQuery = ({ audience, roles, groupIds, userIds }) => {
  if (audience === "all") {
    return {};
  }
  if (audience === "roles") {
    const rolesArr = Array.isArray(roles) ? roles : [];
    if (!rolesArr.length) return null;
    return { role: { $in: rolesArr } };
  }
  if (audience === "groups") {
    const groups = (Array.isArray(groupIds) ? groupIds : []).filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (!groups.length) return null;
    return { groups: { $in: groups } };
  }
  if (audience === "users") {
    const users = (Array.isArray(userIds) ? userIds : []).filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (!users.length) return null;
    return { _id: { $in: users } };
  }
  return null;
};

const resolveRecipients = async ({ audience, roles, groupIds, userIds }) => {
  const baseQuery = buildRecipientQuery({ audience, roles, groupIds, userIds });
  if (!baseQuery) return [];

  const users = await User.find({
    ...baseQuery,
    isEmailVerified: true,
    email: { $ne: null },
  })
    .select("email username")
    .lean();

  const seen = new Set();
  const out = [];
  for (const u of users) {
    const email = (u.email || "").toLowerCase().trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, username: u.username });
  }
  return out;
};

const composeFinalHtml = ({ bodyHtml, signatureHtml, senderName }) => {
  const sig = signatureHtml
    ? `<hr style="margin: 24px 0; border: 0; border-top: 1px solid #ddd;" /><div>${signatureHtml}</div>`
    : senderName
    ? `<hr style="margin: 24px 0; border: 0; border-top: 1px solid #ddd;" /><p>${senderName}</p>`
    : "";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.55; color: #1c1c1c;">
      ${bodyHtml}
      ${sig}
    </div>
  `.trim();
};

// Envío en lotes para respetar el límite de Resend (50 por request)
const sendInBatches = async (recipients, subject, html, batchSize = 45) => {
  const errors = [];
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    try {
      await sendEmail(batch.map((r) => r.email), subject, html);
    } catch (error) {
      console.error("Error enviando lote de comunicación:", error);
      errors.push(error?.message || "Error desconocido");
    }
  }
  return errors;
};

export {
  sanitizeBody,
  sanitizeSignature,
  resolveRecipients,
  composeFinalHtml,
  sendInBatches,
};
