// backend/models/File.js
import mongoose from 'mongoose';

const FILE_STATUSES = ['approved', 'pending', 'rejected'];

const fileSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: [true, 'El nombre del archivo es obligatorio.'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    fileType: {
        type: String,
        required: true,
        enum: ['pdf', 'video', 'audio', 'word', 'image', 'excel', 'pptx', 'archive', 'video_link', 'generic_link', 'other']
    },
    driveFileId: {
        type: String,
        required: function() { return this.fileType !== 'video_link' && this.fileType !== 'generic_link'; }
    },
    secureUrl: {
        type: String,
        required: function() { return this.fileType === 'video_link' || this.fileType === 'generic_link'; }
    },
    size: {
        type: Number,
        required: function() { return this.fileType !== 'video_link' && this.fileType !== 'generic_link'; }
    },
    folder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder',
        required: true
    },
    tags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag'
    }],
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null
    },
    status: {
        type: String,
        enum: FILE_STATUSES,
        default: 'approved',
        index: true,
    },
    rejectionReason: {
        type: String,
        default: '',
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewedAt: {
        type: Date,
        default: null,
    },
    notifyOnReady: {
        type: Boolean,
        default: false,
    },
    notificationSent: {
        type: Boolean,
        default: false,
    },
    viewCount: {
        type: Number,
        default: 0,
    },
    downloadCount: {
        type: Number,
        default: 0,
    },
    lastAccessedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true
});

fileSchema.index({ folder: 1, filename: 1 });
fileSchema.index({ tags: 1 });
fileSchema.index({ filename: 'text', description: 'text' });
fileSchema.index({ status: 1, createdAt: -1 });

const File = mongoose.model('File', fileSchema);

export { FILE_STATUSES };
export default File;
