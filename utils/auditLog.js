import AuditLog from "../models/AuditLog.js";

const logAudit = async ({
  req,
  action,
  targetType,
  targetId = null,
  targetName = "",
  metadata = {},
}) => {
  try {
    const actor = req?.user;
    if (!actor?._id) {
      return null;
    }

    return await AuditLog.create({
      actor: actor._id,
      actorEmail: actor.email || "",
      actorUsername: actor.username || "",
      action,
      targetType,
      targetId: targetId ? String(targetId) : null,
      targetName: targetName || "",
      metadata: metadata || {},
    });
  } catch (error) {
    console.error("No se pudo registrar evento de auditoría:", error);
    return null;
  }
};

export { logAudit };
