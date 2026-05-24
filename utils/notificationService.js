import Notification from "../models/Notification.js";

const createNotification = async ({
  userId,
  type,
  title,
  body = "",
  link = "",
  relatedFile = null,
  relatedFolder = null,
}) => {
  if (!userId || !type || !title) return null;
  try {
    return await Notification.create({
      user: userId,
      type,
      title,
      body,
      link,
      relatedFile,
      relatedFolder,
    });
  } catch (error) {
    console.error("Error creando notificación:", error);
    return null;
  }
};

const createManyNotifications = async (userIds, payload) => {
  if (!Array.isArray(userIds) || !userIds.length) return [];
  const docs = userIds.map((userId) => ({
    user: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body || "",
    link: payload.link || "",
    relatedFile: payload.relatedFile || null,
    relatedFolder: payload.relatedFolder || null,
  }));
  try {
    return await Notification.insertMany(docs, { ordered: false });
  } catch (error) {
    console.error("Error creando notificaciones múltiples:", error);
    return [];
  }
};

export { createNotification, createManyNotifications };
