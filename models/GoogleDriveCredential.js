import mongoose from "mongoose";

const SINGLETON_KEY = "default";

const googleDriveCredentialSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: SINGLETON_KEY,
      unique: true,
      index: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    scopes: {
      type: [String],
      default: [],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    lastVerifiedOk: {
      type: Boolean,
      default: null,
    },
    lastVerifiedError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

googleDriveCredentialSchema.statics.SINGLETON_KEY = SINGLETON_KEY;

googleDriveCredentialSchema.statics.getSingleton = function getSingleton() {
  return this.findOne({ key: SINGLETON_KEY });
};

const GoogleDriveCredential = mongoose.model(
  "GoogleDriveCredential",
  googleDriveCredentialSchema
);

export default GoogleDriveCredential;
