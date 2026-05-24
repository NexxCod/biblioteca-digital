import mongoose from "mongoose";

const COMMUNICATION_AUDIENCES = ["all", "roles", "groups", "users"];

const communicationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderName: { type: String, default: "" },
    senderEmail: { type: String, default: "" },
    subject: { type: String, required: true, trim: true, maxlength: 250 },
    bodyHtml: { type: String, required: true, maxlength: 100000 },
    audience: {
      type: String,
      enum: COMMUNICATION_AUDIENCES,
      required: true,
    },
    roles: [{ type: String, enum: ["admin", "docente", "residente"] }],
    groupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    recipientCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    errorSample: [{ type: String }],
    sentAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ["scheduled", "sent", "failed", "cancelled"],
      default: "sent",
      index: true,
    },
  },
  { timestamps: true }
);

communicationSchema.index({ sentAt: -1 });

const Communication = mongoose.model("Communication", communicationSchema);

export { COMMUNICATION_AUDIENCES };
export default Communication;
