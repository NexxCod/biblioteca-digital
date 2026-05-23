// Calcula destinatarios respetando las mismas reglas de visibilidad de archivos
// y dispara el correo en background.
import User from "../models/User.js";
import Folder from "../models/Folder.js";
import File from "../models/File.js";
import sendEmail from "./emailService.js";

const collectAncestorAssignedGroups = async (folderId) => {
  const groups = new Set();
  let current = folderId;
  const guard = new Set();

  while (current) {
    const id = String(current);
    if (guard.has(id)) break;
    guard.add(id);

    const folder = await Folder.findById(id)
      .select("assignedGroup parentFolder")
      .lean();
    if (!folder) break;

    if (folder.assignedGroup) {
      groups.add(String(folder.assignedGroup));
    }
    current = folder.parentFolder ? String(folder.parentFolder) : null;
  }

  return [...groups];
};

const folderIsPublic = async (folderId) => {
  const ancestors = await collectAncestorAssignedGroups(folderId);
  return ancestors.length === 0;
};

// Devuelve la lista de usuarios (email + username) que deberían recibir
// notificación, según el archivo, su grupo y la cadena de carpetas.
const resolveNotificationRecipients = async (file) => {
  if (!file?.folder) return [];

  const fileAssignedGroupId = file.assignedGroup
    ? String(file.assignedGroup._id || file.assignedGroup)
    : null;
  const uploaderId = file.uploadedBy
    ? String(file.uploadedBy._id || file.uploadedBy)
    : null;

  const ancestorGroups = await collectAncestorAssignedGroups(
    file.folder._id || file.folder
  );
  const groupChainIsPublic = ancestorGroups.length === 0;

  // Caso 1: archivo con grupo asignado → usuarios de ese grupo
  // (siempre y cuando la cadena de carpetas no los excluya). Si la carpeta
  // tiene su propia restricción de grupo, el usuario debe estar en ALGUNO
  // de los grupos restrictivos para verla. Conservador: requerimos que el
  // grupo del archivo esté en la cadena, o que la cadena sea pública.
  // Si no, igual notificamos a los del grupo del archivo (regla de
  // negocio: el grupo del archivo prima sobre la jerarquía de carpetas).
  let candidateFilter;
  if (fileAssignedGroupId) {
    candidateFilter = { groups: fileAssignedGroupId };
  } else if (groupChainIsPublic) {
    candidateFilter = {};
  } else {
    candidateFilter = { groups: { $in: ancestorGroups } };
  }

  const baseUsers = await User.find({
    ...candidateFilter,
    isEmailVerified: true,
    email: { $ne: null },
  })
    .select("email username role groups")
    .lean();

  // Filtro fino aplicando reglas por rol contra la cadena de carpetas
  const filtered = baseUsers.filter((u) => {
    if (uploaderId && String(u._id) === uploaderId) return false;
    if (u.role === "admin") return true;

    const userGroups = (u.groups || []).map((g) => String(g));

    if (u.role === "docente") {
      // El docente puede ver si: el archivo tiene grupo y él está en él,
      // o si alguna carpeta ancestro está restringida a un grupo suyo,
      // o si todo es público.
      if (fileAssignedGroupId && userGroups.includes(fileAssignedGroupId)) {
        return true;
      }
      if (groupChainIsPublic && !fileAssignedGroupId) {
        return true;
      }
      return ancestorGroups.some((g) => userGroups.includes(g));
    }

    if (u.role === "residente") {
      // El residente ve si el archivo es público (sin grupo) y la cadena
      // de carpetas es pública o intersecta sus grupos, o si está en el
      // grupo asignado al archivo.
      if (fileAssignedGroupId) {
        return userGroups.includes(fileAssignedGroupId);
      }
      if (groupChainIsPublic) return true;
      return ancestorGroups.some((g) => userGroups.includes(g));
    }

    return false;
  });

  // De-duplica por email
  const seen = new Set();
  const recipients = [];
  for (const u of filtered) {
    const email = (u.email || "").toLowerCase().trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, username: u.username });
  }
  return recipients;
};

const buildEmailContent = ({ file, uploaderName, folderName }) => {
  const frontendUrl = process.env.FRONTEND_URL || "";
  const linkBlock = frontendUrl
    ? `<p><a href="${frontendUrl}/folder/${file.folder._id || file.folder}">Abrir la carpeta en la biblioteca</a></p>`
    : "";

  const subject = `Nuevo recurso disponible: ${file.filename}`;
  const htmlContent = `
    <p>Hola,</p>
    <p>Se ha publicado un nuevo recurso al que tienes acceso en la biblioteca digital.</p>
    <ul>
      <li><strong>Nombre:</strong> ${file.filename}</li>
      <li><strong>Carpeta:</strong> ${folderName || "Sin nombre"}</li>
      <li><strong>Subido por:</strong> ${uploaderName || "Equipo"}</li>
      ${file.description ? `<li><strong>Descripción:</strong> ${file.description}</li>` : ""}
    </ul>
    ${linkBlock}
    <p>Si crees que recibiste este correo por error, contacta al administrador.</p>
  `;
  return { subject, htmlContent };
};

const dispatchFileNotification = async (fileDoc) => {
  if (!fileDoc || fileDoc.notificationSent) return;
  if (!fileDoc.notifyOnReady) return;
  if (fileDoc.status && fileDoc.status !== "approved") return;

  try {
    const populated = fileDoc.folder?.name
      ? fileDoc
      : await File.findById(fileDoc._id)
          .populate("folder", "name assignedGroup parentFolder")
          .populate("uploadedBy", "username email")
          .populate("assignedGroup", "_id");

    if (!populated) return;

    const recipients = await resolveNotificationRecipients(populated);
    if (recipients.length === 0) {
      console.log(`[notify] Sin destinatarios para archivo ${populated._id}`);
    } else {
      const { subject, htmlContent } = buildEmailContent({
        file: populated,
        uploaderName: populated.uploadedBy?.username,
        folderName: populated.folder?.name,
      });

      await sendEmail(
        recipients.map((r) => r.email),
        subject,
        htmlContent
      );
    }

    await File.findByIdAndUpdate(populated._id, { notificationSent: true });
  } catch (error) {
    console.error("Error enviando notificaciones de archivo:", error);
  }
};

// Wrapper no-await — fire and forget para no bloquear la request.
const queueFileNotification = (fileDoc) => {
  setImmediate(() => {
    dispatchFileNotification(fileDoc).catch((err) =>
      console.error("queueFileNotification falló:", err)
    );
  });
};

export {
  resolveNotificationRecipients,
  dispatchFileNotification,
  queueFileNotification,
};
