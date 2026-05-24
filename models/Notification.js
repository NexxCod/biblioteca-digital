import mongoose from "mongoose";

const NOTIFICATION_TYPES = [
  "file_approved",
  "file_rejected",
  "comment_new",
  "subscribed_folder_new_file",
  "announcement",
];

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: { type: String, required: true, maxlength: 250 },
    body: { type: String, default: "", maxlength: 600 },
    link: { type: String, default: "" }, // ruta interna del frontend
    relatedFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      default: null,
    },
    relatedFolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export { NOTIFICATION_TYPES };
export default Notification;
