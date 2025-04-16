// backend/controllers/folderController.js
import Folder from '../models/Folder.js'; // Importa el modelo Folder
import Group from '../models/Group.js'; // <--- Importar Group para validación
import mongoose from 'mongoose';

// --- Controlador para Crear Carpeta ---
const createFolder = async (req, res) => {
    // 1. Obtener datos del cuerpo de la petición
    // Esperamos el 'name' de la carpeta y opcionalmente un 'parentFolder' (ID de la carpeta padre)
    const { name, parentFolder, assignedGroupId } = req.body;

    // 2. Validación básica
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre de la carpeta es obligatorio.' });
    }
    const folderName = name.trim();

    // Si se proporciona parentFolder, podrías validar aquí si ese ID es válido o existe (opcional)

    // 3. Validación de assignedGroupId (NUEVO)
    let validatedGroupId = null; // Por defecto es null (público/rol)
    if (assignedGroupId) {
        if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
            return res.status(400).json({ message: 'El assignedGroupId proporcionado no es válido.' });
        }
        try {
            const groupExists = await Group.findById(assignedGroupId);
            if (!groupExists) {
                return res.status(404).json({ message: 'El grupo asignado no existe.' });
            }
            validatedGroupId = assignedGroupId; // ID es válido y el grupo existe
        } catch (error) {
             console.error('Error buscando grupo asignado:', error);
             return res.status(500).json({ message: 'Error al verificar el grupo asignado.' });
        }
    }

    try {
        // 3. Verificar si ya existe una carpeta con el mismo nombre en el mismo nivel (padre)
        // Usamos el 'createdBy' para asegurar que la unicidad sea por usuario (o podríamos quitarlo si las carpetas son globales)
        // Ajuste: La unicidad la definimos por parentFolder y name en el modelo.
        const query = {
            name: name.trim(),
            parentFolder: parentFolder || null, // Si no hay parentFolder, busca en la raíz (null)
            // createdBy: req.user._id // Descomentar si quieres que la unicidad sea por usuario dentro del mismo nivel
        };
        const folderExists = await Folder.findOne(query);

        if (folderExists) {
            const location = parentFolder ? `dentro de la carpeta padre especificada` : `en la raíz`;
            return res.status(400).json({ message: `Ya existe una carpeta llamada "${name.trim()}" ${location}.` });
        }

        // 4. Crear la nueva carpeta en la BD
        const folder = await Folder.create({
            name: folderName,
            parentFolder: parentFolder || null, // Guarda null si no se especifica padre
            createdBy: req.user._id ,// Asigna el ID del usuario logueado (viene de 'protect')
            assignedGroup: validatedGroupId // Asigna el grupo validado (o null si no se asignó)
        });

        // 5. Enviar respuesta exitosa
        res.status(201).json(folder); // 201 Creado, devuelve la carpeta creada

    } catch (error) {
        console.error('Error al crear carpeta:', error);
        // Manejo específico si el error es por la restricción única del índice
        if (error.code === 11000) { // Código de error de MongoDB para violación de índice único
             const location = parentFolder ? `dentro de la carpeta padre especificada` : `en la raíz`;
             return res.status(400).json({ message: `Error: Ya existe una carpeta llamada "${name.trim()}" ${location}.` });
        }
        res.status(500).json({ message: 'Error interno del servidor al crear la carpeta.' });
    }
};



// --- NUEVO Controlador para Listar Carpetas ---
const listFolders = async (req, res) => {
    const { parentFolder } = req.query; // ID de la carpeta padre opcional
    const user = req.user; // Usuario autenticado (con _id, role, groups)

    if (!user) {
        // Esto no debería pasar si 'protect' funciona, pero es una doble verificación
        return res.status(401).json({ message: 'Usuario no autenticado.' });
    }

    try {
        let filter = {};

        // 1. Filtro base por nivel (raíz o subcarpeta)
        const baseFilter = { parentFolder: parentFolder || null };

        // 2. Construir filtro de permisos según el rol
        if (user.role === 'admin') {
            // Admin ve todo en el nivel solicitado
            filter = baseFilter;
        } else {
            // Para Becado y Docente, necesitamos los IDs de sus grupos
            const userGroupIds = user.groups.map(group => group._id); // Extraer IDs de los grupos populados

            let permissionFilter = {};
            if (user.role === 'residente/alumno') {
                // Becado ve: (Públicas O Asignadas a sus Grupos)
                permissionFilter = {
                    $or: [
                        { assignedGroup: null }, // Públicas
                        { assignedGroup: { $in: userGroupIds } } // Asignadas a sus grupos
                    ]
                };
            } else if (user.role === 'docente') {
                // Docente ve: (Creadas por él O Asignadas a sus Grupos)
                permissionFilter = {
                    $or: [
                        { createdBy: user._id }, // Creadas por él
                        { assignedGroup: { $in: userGroupIds } } // Asignadas a sus grupos
                    ]
                };
            } else {
                // Rol desconocido o sin permisos definidos (no debería pasar)
                return res.status(403).json({ message: 'Rol de usuario no tiene permisos definidos para listar.' });
            }

            // Combinar filtro base y filtro de permisos
            filter = { $and: [baseFilter, permissionFilter] };
        }

        // 3. Buscar las carpetas aplicando el filtro final
        const folders = await Folder.find(filter)
                                    .sort({ name: 1 })
                                    .populate('createdBy', 'username')
                                    .populate('assignedGroup', 'name'); // Poblar también el grupo asignado

        // 4. Enviar respuesta
        res.status(200).json(folders);

    } catch (error) {
        console.error('Error al listar carpetas:', error);
        res.status(500).json({ message: 'Error interno del servidor al listar carpetas.' });
    }
};


// Exportar ambos controladores
export { createFolder, listFolders };