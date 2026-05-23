import AppSettings, {
  DEFAULT_APPROVED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  normalizeExtensionList,
} from "../models/AppSettings.js";

const CACHE_TTL_MS = 30 * 1000;
let cached = null;
let cachedAt = 0;

const invalidateAppSettingsCache = () => {
  cached = null;
  cachedAt = 0;
};

const getAppSettings = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  let settings = await AppSettings.findOne({ singletonKey: "global" }).lean();
  if (!settings) {
    const created = await AppSettings.create({ singletonKey: "global" });
    settings = created.toObject();
  }

  cached = settings;
  cachedAt = now;
  return settings;
};

const updateAppSettings = async (updates) => {
  const allowed = [
    "maxFileSizeMb",
    "directUploadThresholdMb",
    "approvedExtensions",
    "blockedExtensions",
    "notifyDefaultEnabled",
  ];

  const payload = {};
  for (const key of allowed) {
    if (updates[key] === undefined) continue;
    if (key === "approvedExtensions" || key === "blockedExtensions") {
      payload[key] = normalizeExtensionList(updates[key]);
    } else if (key === "notifyDefaultEnabled") {
      payload[key] = Boolean(updates[key]);
    } else {
      const value = Number(updates[key]);
      if (!Number.isFinite(value) || value <= 0) {
        const error = new Error(`Valor inválido para ${key}.`);
        error.statusCode = 400;
        throw error;
      }
      payload[key] = value;
    }
  }

  const doc = await AppSettings.findOneAndUpdate(
    { singletonKey: "global" },
    { $set: payload },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  invalidateAppSettingsCache();
  cached = doc;
  cachedAt = Date.now();
  return doc;
};

const classifyUploadByExtension = (filename, settings) => {
  const ext = String(filename || "")
    .toLowerCase()
    .split(".")
    .pop();
  const approved = (settings?.approvedExtensions || []).map((e) =>
    e.toLowerCase()
  );
  const blocked = (settings?.blockedExtensions || []).map((e) =>
    e.toLowerCase()
  );

  if (!ext) {
    return { decision: "pending", extension: "" };
  }

  if (blocked.includes(ext)) {
    return { decision: "blocked", extension: ext };
  }

  if (approved.includes(ext)) {
    return { decision: "approved", extension: ext };
  }

  return { decision: "pending", extension: ext };
};

export {
  getAppSettings,
  updateAppSettings,
  invalidateAppSettingsCache,
  classifyUploadByExtension,
  DEFAULT_APPROVED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
};
