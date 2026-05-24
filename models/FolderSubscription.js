import mongoose from "mongoose";

const folderSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      required: true,
      index: true,
    },
    includeSubfolders: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

folderSubscriptionSchema.index({ user: 1, folder: 1 }, { unique: true });

const FolderSubscription = mongoose.model(
  "FolderSubscription",
  folderSubscriptionSchema
);

export default FolderSubscription;
