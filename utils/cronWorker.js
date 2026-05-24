// Worker simple basado en setInterval. No requiere infra extra (Redis, etc.).
// Maneja:
//   - Envío de comunicaciones programadas (cada 2 min).
//   - Digest semanal de novedades (lunes 9:00 UTC).

import Communication from "../models/Communication.js";
import User from "../models/User.js";
import File from "../models/File.js";
import FolderSubscription from "../models/FolderSubscription.js";
import sendEmail from "./emailService.js";
import {
  resolveRecipients,
  composeFinalHtml,
  sendInBatches,
} from "./communicationService.js";
import { getAncestorFolderIds } from "./folderPath.js";

const SCHEDULED_TICK_MS = 2 * 60 * 1000; // 2 min
const DIGEST_TICK_MS = 60 * 60 * 1000; // 1 h check
let lastDigestRunDate = null; // marcador para evitar duplicados

const dispatchScheduledOnce = async () => {
  try {
    const now = new Date();
    const dueList = await Communication.find({
      status: "scheduled",
      scheduledFor: { $lte: now },
    }).limit(20);

    for (const doc of dueList) {
      try {
        const sender = await User.findById(doc.sender).select(
          "username email signature"
        );
        if (!sender) {
          doc.status = "failed";
          doc.errorSample = ["Sender ya no existe."];
          await doc.save();
          continue;
        }
        const html = composeFinalHtml({
          bodyHtml: doc.bodyHtml,
          signatureHtml: sender.signature || "",
          senderName: sender.username,
        });
        const recipients = await resolveRecipients({
          audience: doc.audience,
          roles: doc.roles,
          groupIds: doc.groupIds,
          userIds: doc.userIds,
        });
        if (!recipients.length) {
          doc.status = "failed";
          doc.errorSample = ["Sin destinatarios al disparar el envío."];
          doc.sentAt = new Date();
          await doc.save();
          continue;
        }
        const errors = await sendInBatches(recipients, doc.subject, html);
        doc.recipientCount = recipients.length;
        doc.errorCount = errors.length;
        doc.errorSample = errors.slice(0, 5);
        doc.sentAt = new Date();
        doc.status = errors.length ? "failed" : "sent";
        await doc.save();
        console.log(
          `[cron] Comunicación ${doc._id} enviada a ${recipients.length} destinatarios.`
        );
      } catch (error) {
        console.error("Error procesando comunicación programada:", error);
        try {
          doc.status = "failed";
          doc.errorSample = [error?.message || "Error desconocido."];
          await doc.save();
        } catch {
          /* noop */
        }
      }
    }
  } catch (error) {
    console.error("Error en tick de programadas:", error);
  }
};

// Lunes 9:00 UTC: armar digest por usuario suscrito y mandar 1 correo por usuario
const shouldRunDigestNow = (now) => {
  // Lunes UTC = day 1; hora UTC 9
  if (now.getUTCDay() !== 1) return false;
  if (now.getUTCHours() !== 9) return false;
  // Evitar correr más de una vez en la misma hora-día
  const key = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  if (lastDigestRunDate === key) return false;
  lastDigestRunDate = key;
  return true;
};

const runWeeklyDigestOnce = async () => {
  try {
    const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const subs = await FolderSubscription.find({})
      .populate("folder", "name parentFolder")
      .lean();
    if (!subs.length) return;

    // Agrupar por usuario
    const byUser = new Map();
    for (const s of subs) {
      if (!s.folder) continue;
      const uid = String(s.user);
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(s);
    }

    for (const [userId, list] of byUser.entries()) {
      try {
        const user = await User.findById(userId)
          .select("email username notificationPreferences isEmailVerified")
          .lean();
        if (!user) continue;
        if (!user.isEmailVerified) continue;
        if (user.notificationPreferences?.weeklyDigest === false) continue;

        // Recolectar archivos nuevos por carpeta
        const folderEntries = [];
        for (const s of list) {
          const folderIds = [String(s.folder._id)];
          if (s.includeSubfolders) {
            // expandir descendientes (simple: query directa)
            const desc = await (await import("../models/Folder.js")).default
              .find({})
              .select("_id parentFolder")
              .lean();
            // construir mapa parent → children
            const childrenMap = new Map();
            for (const f of desc) {
              const key = String(f.parentFolder || "root");
              if (!childrenMap.has(key)) childrenMap.set(key, []);
              childrenMap.get(key).push(String(f._id));
            }
            const stack = [String(s.folder._id)];
            const seen = new Set();
            while (stack.length) {
              const cur = stack.pop();
              if (seen.has(cur)) continue;
              seen.add(cur);
              const children = childrenMap.get(cur) || [];
              for (const c of children) {
                folderIds.push(c);
                stack.push(c);
              }
            }
          }
          const newFiles = await File.find({
            folder: { $in: folderIds },
            status: { $nin: ["pending", "rejected"] },
            createdAt: { $gte: sinceDate },
            uploadedBy: { $ne: userId },
          })
            .sort({ createdAt: -1 })
            .limit(10)
            .select("filename folder createdAt")
            .lean();
          if (newFiles.length) {
            folderEntries.push({ folderName: s.folder.name, newFiles });
          }
        }

        if (!folderEntries.length) continue;

        const frontendUrl = process.env.FRONTEND_URL || "";
        const sections = folderEntries
          .map((entry) => {
            const items = entry.newFiles
              .map(
                (f) =>
                  `<li><a href="${frontendUrl}/folder/${f.folder}?file=${f._id}">${f.filename}</a></li>`
              )
              .join("");
            return `<h3>${entry.folderName}</h3><ul>${items}</ul>`;
          })
          .join("");

        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.55; color: #1c1c1c;">
            <p>Hola ${user.username || ""},</p>
            <p>Estas son las novedades de la semana en tus carpetas suscritas:</p>
            ${sections}
            <p style="color:#666;margin-top:24px;font-size:12px;">
              Puedes desactivar este resumen desde tu perfil.
            </p>
          </div>
        `;

        try {
          await sendEmail(user.email, "Resumen semanal de la biblioteca", html);
          console.log(`[cron] Digest enviado a ${user.email}`);
        } catch (mailErr) {
          console.error("Error enviando digest a", user.email, mailErr?.message);
        }
      } catch (err) {
        console.error("Error procesando digest para usuario", userId, err);
      }
    }
  } catch (error) {
    console.error("Error en digest semanal:", error);
  }
};

let scheduledTimer = null;
let digestTimer = null;

const startCronWorker = () => {
  // Disparar inmediatamente al arranque
  dispatchScheduledOnce();

  scheduledTimer = setInterval(() => {
    dispatchScheduledOnce();
  }, SCHEDULED_TICK_MS);

  digestTimer = setInterval(() => {
    const now = new Date();
    if (shouldRunDigestNow(now)) runWeeklyDigestOnce();
  }, DIGEST_TICK_MS);

  console.log("[cron] Worker iniciado (scheduled cada 2 min, digest semanal lunes 9 UTC).");
};

const stopCronWorker = () => {
  if (scheduledTimer) clearInterval(scheduledTimer);
  if (digestTimer) clearInterval(digestTimer);
  scheduledTimer = null;
  digestTimer = null;
};

export { startCronWorker, stopCronWorker };
