import mongoose from "mongoose";

const fileVersionSchema = new mongoose.Schema(
  {
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    driveFileId: { type: String, required: true },
    secureUrl: { type: String, default: "" },
    filename: { type: String, required: true },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: "" },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

fileVersionSchema.index({ file: 1, version: -1 });

const FileVersion = mongoose.model("FileVersion", fileVersionSchema);

export default FileVersion;
