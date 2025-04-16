// backend/models/File.js
import mongoose from 'mongoose';

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
        enum: ['pdf', 'word', 'image', 'video_link', 'other']
    },
    cloudinaryId: {
        type: String,
        required: function() { return this.fileType !== 'video_link'; }
    },
    secureUrl: { // URL (Cloudinary o YouTube)
        type: String,
        required: true
    },
    size: { // Tamaño en bytes
        type: Number,
        required: function() { return this.fileType !== 'video_link'; }
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
}, {
    timestamps: true
});

fileSchema.index({ folder: 1, filename: 1 });
fileSchema.index({ tags: 1 });

const File = mongoose.model('File', fileSchema);

export default File; // Exportación por defecto para ESM