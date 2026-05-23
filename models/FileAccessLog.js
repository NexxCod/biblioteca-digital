import mongoose from "mongoose";

const ACCESS_ACTIONS = ["view", "preview", "download", "open_link"];

const fileAccessLogSchema = new mongoose.Schema(
  {
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ACCESS_ACTIONS,
      required: true,
    },
  },
  { timestamps: true }
);

fileAccessLogSchema.index({ createdAt: -1 });
fileAccessLogSchema.index({ file: 1, user: 1, action: 1, createdAt: -1 });

const FileAccessLog = mongoose.model("FileAccessLog", fileAccessLogSchema);

export { ACCESS_ACTIONS };
export default FileAccessLog;
