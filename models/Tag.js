// backend/models/Tag.js
import mongoose from 'mongoose';

const tagSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'El nombre de la etiqueta es obligatorio.'],
        unique: true, // No permitir etiquetas duplicadas
        trim: true,
        lowercase: true // Guardar en minúsculas para evitar duplicados por capitalización
    },
    createdBy: { // Quién creó la etiqueta (opcional, pero útil para auditoría)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

const Tag = mongoose.model('Tag', tagSchema); // <-- Registra el modelo

export default Tag; // <-- Exporta el modelo