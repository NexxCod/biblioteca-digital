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
        enum: ['pdf', 'word', 'image', 'excel', 'pptx', 'video_link', 'generic_link', 'other']
    },
    driveFileId: { // CAMBIADO/AÑADIDO
        type: String,
        required: function() { return this.fileType !== 'video_link' && this.fileType !== 'generic_link'; }
    },
    secureUrl: { 
        type: String,
        required: function() { return this.fileType === 'video_link' || this.fileType === 'generic_link'; }
    },
    size: { // Tamaño en bytes
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
        default: null // null significa que es público (o visible según rol)
    }

}, {
    timestamps: true
});

fileSchema.index({ folder: 1, filename: 1 });
fileSchema.index({ tags: 1 });
fileSchema.index({ filename: 'text', description: 'text' });

const File = mongoose.model('File', fileSchema);


export default File; // Exportación por defecto para ESM