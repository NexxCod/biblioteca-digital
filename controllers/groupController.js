// backend/controllers/groupController.js
import Group from '../models/Group.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

// --- Controlador para Crear un Nuevo Grupo (Admin Only)---
const createGroup = async (req, res) => {
    // 1. Obtener datos del cuerpo (JSON)
    const { name, description } = req.body;

    // 2. Validación básica
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre del grupo es obligatorio.' });
    }
    const groupName = name.trim();

    try {
        // 3. Verificar si ya existe un grupo con ese nombre
        const groupExists = await Group.findOne({ name: groupName });
        if (groupExists) {
            return res.status(400).json({ message: `El grupo "${groupName}" ya existe.` });
        }

        // 4. Crear el nuevo grupo en la BD
        const group = await Group.create({
            name: groupName,
            description: description || '', // Descripción opcional
            createdBy: req.user._id, // El admin que lo está creando
            members: [] // Inicialmente sin miembros
        });

        // 5. Enviar respuesta exitosa
        res.status(201).json(group);

    } catch (error) {
        console.error('Error al crear grupo:', error);
        if (error.code === 11000) { // Error de índice único
            return res.status(400).json({ message: `Error: El grupo "${groupName}" ya existe.` });
        }
        res.status(500).json({ message: 'Error interno del servidor al crear el grupo.' });
    }
};


// --- Controlador para Listar Todos los Grupos (Admin Only) ---
const listGroups = async (req, res) => {
    try {
        // Usamos el framework de agregación para calcular memberCount y poblar createdBy
        const groups = await Group.aggregate([
            // Opcional: podrías añadir un $match aquí si necesitaras filtrar grupos
            // { $match: { some_condition: true } },

            // 1. Ordenar por nombre
            { $sort: { name: 1 } },

            // 2. Añadir el campo calculado memberCount
            {
                $addFields: {
                    memberCount: { $size: "$members" } // Calcula el tamaño del array 'members'
                }
            },

            // 3. "Poblar" el campo createdBy usando $lookup
            {
                $lookup: {
                    from: 'users', // Nombre de la colección de usuarios en MongoDB (generalmente en minúsculas y plural)
                    localField: 'createdBy', // Campo en la colección 'groups'
                    foreignField: '_id',     // Campo en la colección 'users'
                    as: 'creatorInfo'        // Nombre del nuevo array donde se pondrá el resultado del join
                }
            },

            // 4. Desestructurar el array creatorInfo (contendrá 0 o 1 elemento)
            {
                $unwind: {
                    path: '$creatorInfo',
                    preserveNullAndEmptyArrays: true // Mantiene el grupo aunque no se encuentre el creador (importante)
                }
            },

            // 5. Proyectar (seleccionar) los campos finales que queremos devolver
            {
                $project: {
                    _id: 1, // Incluir _id
                    name: 1, // Incluir name
                    description: 1, // Incluir description
                    memberCount: 1, // Incluir el contador calculado
                    createdAt: 1, // Incluir createdAt
                    updatedAt: 1, // Incluir updatedAt
                    // Formatear el campo createdBy para que se parezca a populate
                    createdBy: {
                        _id: '$creatorInfo._id',
                        username: '$creatorInfo.username',
                        email: '$creatorInfo.email' // Puedes añadir más campos si los necesitas
                    },
                    // Podemos excluir el array completo de 'members' si no lo queremos en la lista
                    // members: 0 // Descomenta esta línea si NO quieres la lista de IDs de miembros
                }
            }
        ]);

        res.status(200).json(groups);

    } catch (error) {
        console.error('Error al listar grupos:', error);
        res.status(500).json({ message: 'Error interno del servidor al listar grupos.' });
    }
};


// --- NUEVO Controlador para Añadir Miembro a Grupo (Admin Only) ---
const addMemberToGroup = async (req, res) => {
    const { groupId } = req.params; // ID del grupo desde la URL
    const { userId } = req.body;    // ID del usuario desde el body JSON

    // Validación básica de IDs
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Se requiere un userId válido.' });
    }
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ message: 'GroupId inválido.' });
    }

    try {
        // Buscar grupo y usuario concurrentemente
        const [group, user] = await Promise.all([
            Group.findById(groupId),
            User.findById(userId)
        ]);

        // Verificar que ambos existen
        if (!group) {
            return res.status(404).json({ message: 'Grupo no encontrado.' });
        }
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Añadir usuario al grupo y grupo al usuario (usando $addToSet para evitar duplicados)
        // Nota: Estas son dos operaciones separadas. Para atomicidad real se necesitarían transacciones.
        const updateGroupPromise = Group.findByIdAndUpdate(
            groupId,
            { $addToSet: { members: userId } }, // Añade userId al array members si no está ya
            { new: true } // Devuelve el documento actualizado
        );

        const updateUserPromise = User.findByIdAndUpdate(
            userId,
            { $addToSet: { groups: groupId } }, // Añade groupId al array groups si no está ya
            { new: true }
        );

        // Esperar ambas actualizaciones
        const [updatedGroup] = await Promise.all([updateGroupPromise, updateUserPromise]);

        // Poblar el creador en el documento actualizado y calcular count
        await updatedGroup.populate('createdBy', 'username email'); // Populate SÍ funciona en un documento
        const memberCount = updatedGroup.members.length; // Calcula el tamaño manualmente

        // Construir la respuesta
        const responseGroup = {
             ...updatedGroup.toObject(), // Convierte el documento Mongoose a objeto JS
             memberCount: memberCount // Añade el contador
        };

        res.status(200).json({ message: 'Miembro añadido correctamente.', group: responseGroup });

    } catch (error) {
        console.error('Error al añadir miembro al grupo:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};


// --- NUEVO Controlador para Quitar Miembro de Grupo (Admin Only) ---
const removeMemberFromGroup = async (req, res) => {
    const { groupId, userId } = req.params; // IDs desde la URL

    // Validación básica de IDs
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ message: 'Se requiere un groupId y userId válidos.' });
    }

    try {
         // Buscar grupo y usuario concurrentemente (opcional, podríamos solo intentar quitar)
         const [group, user] = await Promise.all([
            Group.findById(groupId),
            User.findById(userId)
        ]);

        if (!group) return res.status(404).json({ message: 'Grupo no encontrado.' });
        // No necesitamos chequear el usuario explícitamente, $pull no hará nada si no existe el ID

        // Quitar usuario del grupo y grupo del usuario usando $pull
        const updateGroupPromise = Group.findByIdAndUpdate(
            groupId,
            { $pull: { members: userId } }, // Quita el userId del array members
            { new: true }
        );

        const updateUserPromise = User.findByIdAndUpdate(
            userId,
            { $pull: { groups: groupId } }, // Quita el groupId del array groups
            { new: true }
        );

        // Esperar ambas actualizaciones
        const [updatedGroup] = await Promise.all([updateGroupPromise, updateUserPromise]);

        // Poblar el creador en el documento actualizado y calcular count
        await updatedGroup.populate('createdBy', 'username email'); // Populate SÍ funciona en un documento
        const memberCount = updatedGroup.members.length; // Calcula el tamaño manualmente

        // Construir la respuesta
        const responseGroup = {
             ...updatedGroup.toObject(), // Convierte el documento Mongoose a objeto JS
             memberCount: memberCount // Añade el contador
        };

        res.status(200).json({ message: 'Miembro eliminado correctamente.', group: responseGroup });

    } catch (error) {
        console.error('Error al quitar miembro del grupo:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};


// Exportar todos los controladores de grupos
export { createGroup, listGroups, addMemberToGroup, removeMemberFromGroup };