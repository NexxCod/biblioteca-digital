import mongoose from "mongoose";

const AUDIT_ACTIONS = [
  "upload",
  "add_link",
  "approve",
  "reject",
  "delete_file",
  "delete_folder",
  "move_file",
  "move_folder",
  "update_file",
  "update_folder",
  "create_folder",
  "update_settings",
];

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorEmail: { type: String, default: "" },
    actorUsername: { type: String, default: "" },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["file", "folder", "settings"],
      required: true,
    },
    targetId: { type: String, default: null },
    targetName: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export { AUDIT_ACTIONS };
export default AuditLog;
