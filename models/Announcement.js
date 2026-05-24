import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 4000 }, // HTML sanitizado
    isActive: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    variant: {
      type: String,
      enum: ["info", "warning", "success"],
      default: "info",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

announcementSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

const Announcement = mongoose.model("Announcement", announcementSchema);

export default Announcement;
