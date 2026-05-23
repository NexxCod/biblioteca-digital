import mongoose from "mongoose";

const DEFAULT_APPROVED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "mp4",
  "mp3",
  "aac",
  "wav",
  "flac",
  "aiff",
  "alac",
  "ogg",
];

const DEFAULT_BLOCKED_EXTENSIONS = [
  "exe",
  "msi",
  "bat",
  "cmd",
  "scr",
  "com",
  "vbs",
  "js",
  "jse",
  "ws",
  "wsf",
  "ps1",
];

const appSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: "global",
      unique: true,
      index: true,
    },
    maxFileSizeMb: {
      type: Number,
      default: 1024,
      min: 1,
      max: 10240,
    },
    directUploadThresholdMb: {
      type: Number,
      default: 50,
      min: 1,
      max: 10240,
    },
    approvedExtensions: {
      type: [String],
      default: DEFAULT_APPROVED_EXTENSIONS,
    },
    blockedExtensions: {
      type: [String],
      default: DEFAULT_BLOCKED_EXTENSIONS,
    },
    notifyDefaultEnabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const normalizeExtensionList = (list) =>
  Array.isArray(list)
    ? [
        ...new Set(
          list
            .map((ext) => String(ext || "").trim().toLowerCase().replace(/^\./, ""))
            .filter(Boolean)
        ),
      ]
    : [];

appSettingsSchema.pre("save", function normalizeOnSave(next) {
  this.approvedExtensions = normalizeExtensionList(this.approvedExtensions);
  this.blockedExtensions = normalizeExtensionList(this.blockedExtensions);
  next();
});

const AppSettings = mongoose.model("AppSettings", appSettingsSchema);

export {
  DEFAULT_APPROVED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  normalizeExtensionList,
};
export default AppSettings;
