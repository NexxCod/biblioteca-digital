// backend/models/Group.js
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'El nombre del grupo es obligatorio.'],
        unique: true, // Asumimos nombres de grupo únicos globalmente
        trim: true
    },
    description: { // Descripción opcional
        type: String,
        trim: true
    },
    members: [{ // Array de usuarios que pertenecen al grupo
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdBy: { // Quién creó el grupo (Admin)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});


const Group = mongoose.model('Group', groupSchema);

export default Group;