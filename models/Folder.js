// backend/models/Folder.js
import mongoose from 'mongoose';

const folderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'El nombre de la carpeta es obligatorio.'],
        trim: true
    },
    parentFolder: { // Referencia a la carpeta padre (opcional)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder', // Se refiere al mismo modelo 'Folder'
        default: null // null indica que es una carpeta raíz
    },
    createdBy: { // Quién creó la carpeta
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Referencia al modelo 'User'
        required: true
    },
    assignedGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null // null significa que es pública (o visible según rol)
    }
}, {
    timestamps: true
});

// Índice para buscar carpetas por padre y nombre eficientemente y asegurar unicidad
folderSchema.index({ parentFolder: 1, name: 1 /* , createdBy: 1 */ }, { unique: true });
// Podrías añadir createdBy al índice si la unicidad de nombre debe ser por usuario dentro de la misma carpeta padre

const Folder = mongoose.model('Folder', folderSchema);

export default Folder; // Exportación por defecto para ESM