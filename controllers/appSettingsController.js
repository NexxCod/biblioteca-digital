import {
  getAppSettings,
  updateAppSettings,
} from "../utils/appSettingsService.js";
import { logAudit } from "../utils/auditLog.js";

const fetchAppSettings = async (_req, res) => {
  try {
    const settings = await getAppSettings({ force: true });
    res.status(200).json(settings);
  } catch (error) {
    console.error("Error obteniendo configuración:", error);
    res.status(500).json({ message: "Error al obtener la configuración." });
  }
};

const fetchPublicAppSettings = async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.status(200).json({
      maxFileSizeMb: settings.maxFileSizeMb,
      directUploadThresholdMb: settings.directUploadThresholdMb,
      approvedExtensions: settings.approvedExtensions,
      blockedExtensions: settings.blockedExtensions,
      notifyDefaultEnabled: settings.notifyDefaultEnabled,
    });
  } catch (error) {
    console.error("Error obteniendo configuración pública:", error);
    res.status(500).json({ message: "Error al obtener la configuración." });
  }
};

const saveAppSettings = async (req, res) => {
  try {
    const updated = await updateAppSettings(req.body || {});
    await logAudit({
      req,
      action: "update_settings",
      targetType: "settings",
      targetName: "global",
      metadata: {
        maxFileSizeMb: updated.maxFileSizeMb,
        directUploadThresholdMb: updated.directUploadThresholdMb,
        approvedExtensions: updated.approvedExtensions,
        blockedExtensions: updated.blockedExtensions,
        notifyDefaultEnabled: updated.notifyDefaultEnabled,
      },
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error actualizando configuración:", error);
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || "Error al actualizar la configuración." });
  }
};

export { fetchAppSettings, fetchPublicAppSettings, saveAppSettings };
