// backend/controllers/folderController.js
import Folder from '../models/Folder.js'; // Importa el modelo Folder
import Group from '../models/Group.js'; // <--- Importar Group para validación
import File from '../models/File.js';
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

// NUEVO Controlador para Actualizar Carpeta ---
const updateFolder = async (req, res) => {
    const { id: folderId } = req.params; // ID de la carpeta desde la URL
    // Campos actualizables del body (JSON)
    const { name, assignedGroupId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(folderId)) {
        return res.status(400).json({ message: 'ID de carpeta inválido.' });
    }

    try {
        // 1. Encontrar la carpeta existente
        const folder = await Folder.findById(folderId);
        if (!folder) {
            return res.status(404).json({ message: 'Carpeta no encontrada.' });
        }

        // 2. Verificar Permisos para actualizar
        const isAdmin = req.user.role === 'admin';
        const isOwner = folder.createdBy.toString() === req.user._id.toString();

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ message: 'No autorizado para modificar esta carpeta.' });
        }

        // 3. Validar y Actualizar Campos

        // Actualizar nombre si se proporciona
        if (name !== undefined) {
            const newName = name.trim();
            if (newName === '') {
                 return res.status(400).json({ message: 'El nombre de la carpeta no puede estar vacío.' });
            }
            // Verificar si ya existe otra carpeta con ese nombre en el mismo nivel
            const duplicate = await Folder.findOne({
                name: newName,
                parentFolder: folder.parentFolder, // Mismo padre que la carpeta actual
                _id: { $ne: folderId } // Excluir la carpeta actual de la búsqueda
            });
            if (duplicate) {
                 return res.status(400).json({ message: `Ya existe otra carpeta llamada "${newName}" en esta ubicación.` });
            }
            folder.name = newName;
        }

        // Actualizar grupo asignado si se proporciona (permite null)
        if (assignedGroupId !== undefined) {
            let validatedGroupId = null;
            if (assignedGroupId !== null) { // Si no es null, validar ID y existencia
                if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
                     return res.status(400).json({ message: 'El assignedGroupId proporcionado no es válido.' });
                }
                const groupExists = await Group.findById(assignedGroupId);
                if (!groupExists) {
                     return res.status(404).json({ message: 'El grupo asignado no existe.' });
                }
                validatedGroupId = assignedGroupId;
            }
            folder.assignedGroup = validatedGroupId;
        }

        // 4. Guardar los cambios
        const updatedFolder = await folder.save();

        // 5. Devolver la carpeta actualizada y poblada
        const populatedFolder = await Folder.findById(updatedFolder._id)
                                           .populate('createdBy', 'username')
                                           .populate('assignedGroup', 'name');
        res.status(200).json(populatedFolder);

    } catch (error) {
        console.error('Error al actualizar carpeta:', error);
         if (error.code === 11000) { // Error de índice único (si falla la validación manual)
            return res.status(400).json({ message: `Error: Ya existe una carpeta con ese nombre en esta ubicación.` });
         }
        res.status(500).json({ message: 'Error interno del servidor al actualizar.' });
    }
};


// --- NUEVO Controlador para Eliminar Carpeta ---
const deleteFolder = async (req, res) => {
    const { id: folderId } = req.params; // ID de la carpeta desde la URL

    if (!mongoose.Types.ObjectId.isValid(folderId)) {
        return res.status(400).json({ message: 'ID de carpeta inválido.' });
    }

    try {
        // 1. Encontrar la carpeta existente
        const folder = await Folder.findById(folderId);
        if (!folder) {
            // Si no existe, consideramos la operación exitosa (ya no está)
            return res.status(204).send();
        }

        // 2. Verificar Permisos para eliminar
        const isAdmin = req.user.role === 'admin';
        const isOwner = folder.createdBy.toString() === req.user._id.toString();

        // Solo el admin o el propietario pueden intentar borrar
        if (!isAdmin && !isOwner) {
             return res.status(403).json({ message: 'No autorizado para eliminar esta carpeta.' });
        }

        // 3. Verificar si la carpeta está vacía (Regla Universal, incluye Admins)
        const subfolderCount = await Folder.countDocuments({ parentFolder: folderId });
        if (subfolderCount > 0) {
             return res.status(400).json({ message: 'No se puede eliminar la carpeta porque contiene subcarpetas.' });
        }

        const fileCount = await File.countDocuments({ folder: folderId });
        if (fileCount > 0) {
            return res.status(400).json({ message: 'No se puede eliminar la carpeta porque contiene archivos.' });
        }

        // 4. Si está vacía y tiene permiso, eliminar de MongoDB
        await Folder.findByIdAndDelete(folderId);

        // 5. Enviar respuesta de éxito sin contenido
        res.status(204).send();

    } catch (error) {
        console.error('Error al eliminar carpeta:', error);
        res.status(500).json({ message: 'Error interno del servidor al eliminar.' });
    }
};


// Exportar TODOS los controladores de carpetas
export { createFolder, listFolders, updateFolder, deleteFolder };