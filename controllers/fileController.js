// backend/controllers/fileController.js
import cloudinary from '../config/cloudinaryConfig.js'; // Importa la instancia configurada
import File from '../models/File.js';
import Folder from '../models/Folder.js';
import Tag from '../models/Tag.js';
import Group from '../models/Group.js';
import mongoose from 'mongoose';
import streamifier from 'streamifier';      // Ayuda a crear un stream desde el buffer

// --- Controlador para Subir Archivo ---
const uploadFile = async (req, res) => {
    // 1. Verificar que Multer procesó un archivo
    if (!req.file) {
        return res.status(400).json({ message: 'No se proporcionó ningún archivo.' });
    }

    // 2. Obtener datos adicionales del cuerpo (si los enviaste)
    // Estos deben venir como campos en el mismo form-data que el archivo
    const { description, folderId, tags, assignedGroupId } = req.body; // Asumimos que se envían folderId y tags (como string separado por comas, por ejemplo)

    // Validación simple (necesitas una carpeta donde guardar!)
    if (!folderId) {
        return res.status(400).json({ message: 'Se requiere especificar la carpeta (folderId).' });
    }
    // Aquí deberías validar que la carpeta (folderId) existe y pertenece al usuario si es necesario.

    // Validación de assignedGroupId (NUEVO) - Igual que en createFolder
    let validatedGroupId = null;
    if (assignedGroupId) {
        if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
            return res.status(400).json({ message: 'El assignedGroupId proporcionado no es válido.' });
        }
        try {
            const groupExists = await Group.findById(assignedGroupId);
            if (!groupExists) {
                return res.status(404).json({ message: 'El grupo asignado no existe.' });
            }
            validatedGroupId = assignedGroupId;
        } catch (error) {
             console.error('Error buscando grupo asignado:', error);
             return res.status(500).json({ message: 'Error al verificar el grupo asignado.' });
        }
    }

    try {
        // 3. Función para subir el stream a Cloudinary
        const uploadStream = (buffer) => {
            return new Promise((resolve, reject) => {
                // Usamos upload_stream de Cloudinary
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: 'imagenologia_recursos', // Opcional: Carpeta dentro de Cloudinary
                        resource_type: 'auto' // Detecta automáticamente si es imagen, video, pdf, etc.
                    },
                    (error, result) => {
                        if (error) {
                            console.error('Cloudinary Upload Error:', error);
                            return reject(new Error('Error al subir archivo a Cloudinary.'));
                        }
                        resolve(result);
                    }
                );
                // Convertimos el buffer del archivo (req.file.buffer) en un stream legible
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        // 4. Ejecutar la subida a Cloudinary
        const cloudinaryResult = await uploadStream(req.file.buffer);

        // Determinar fileType basado en resource_type o format (simplificado)
        let fileType = 'other';
        if (cloudinaryResult.resource_type === 'image') {
            fileType = 'image';
        } else if (cloudinaryResult.format === 'pdf') {
            fileType = 'pdf';
        } else if (['doc', 'docx'].includes(cloudinaryResult.format)) {
            fileType = 'word';
        }
        // Podrías añadir más tipos si es necesario

        // Procesar tags si vienen como string separado por comas
        let tagIds = [];
        if (tags && typeof tags === 'string') {
            const tagNames = tags.split(',') // 1. Separa los nombres por coma
                                 .map(tag => tag.trim().toLowerCase()) // 2. Limpia (quita espacios, minúsculas)
                                 .filter(Boolean); // 3. Filtra nombres vacíos

            // 4. Procesa cada nombre: busca o crea la tag y obtiene su ID
            tagIds = await Promise.all( // Ejecuta las búsquedas/creaciones en paralelo
                tagNames.map(async (name) => {
                    // Busca una tag con ese nombre. Si no existe, la crea (upsert: true).
                    // $setOnInsert asegura que createdBy solo se añada si es una tag nueva.
                    const tag = await Tag.findOneAndUpdate(
                        { name: name }, // Filtro: busca por nombre (case-insensitive por el schema)
                        { $setOnInsert: { name: name, createdBy: req.user._id } }, // Datos a insertar si no existe
                        { upsert: true, new: true, runValidators: true } // Opciones: crear si no existe, devolver el doc nuevo/encontrado, correr validaciones
                    );
                    return tag._id; // Devuelve el ID de la tag encontrada o creada
                })
            );
        }
        // Ahora tagIds es un array con los ObjectIds de las tags correspondientes


        // 5. Guardar metadata en MongoDB
        const newFile = await File.create({
            filename: req.file.originalname, // Nombre original del archivo
            description: description || '', // Descripción opcional
            fileType: fileType, // Tipo determinado
            cloudinaryId: cloudinaryResult.public_id, // ID público de Cloudinary
            secureUrl: cloudinaryResult.secure_url,  // URL segura de Cloudinary
            size: cloudinaryResult.bytes,           // Tamaño en bytes
            folder: folderId,                       // ID de la carpeta (¡Validar antes!)
            tags: tagIds,                           // IDs de las etiquetas (requiere lógica adicional)
            uploadedBy: req.user._id,                // ID del usuario logueado (viene de 'protect')
            assignedGroup: validatedGroupId
        });

        // 6. Enviar respuesta exitosa
        // Opcional: Poblar la respuesta para devolver los nombres de las tags inmediatamente
        const populatedFile = await File.findById(newFile._id)
                                        .populate('uploadedBy', 'username email')
                                        .populate('tags', 'name')
                                        .populate('assignedGroup', 'name');
        res.status(201).json(populatedFile || newFile);

    } catch (error) {
        console.error('Error en uploadFile:', error);
        if (error.message.includes('Cloudinary')) { /* ... */ }
        res.status(500).json({ message: 'Error interno del servidor al procesar el archivo.' });
    }
};

//  Controlador para Listar Archivos por Carpeta ---
const getFilesByFolder = async (req, res) => {
    // 1. Obtener folderId de los query parameters
    const { folderId } = req.query; // Accedemos a req.query para parámetros GET (?folderId=...)

    // 2. Validación básica
    if (!folderId) {
        return res.status(400).json({ message: 'Se requiere el parámetro folderId.' });
    }

    // Aquí podrías añadir validación extra:
    // - Verificar si folderId es un ObjectId válido de MongoDB.
    // - Verificar si la carpeta existe.
    // - Verificar si el usuario (req.user) tiene permiso para ver esta carpeta (más avanzado).

    try {
        // 3. Buscar archivos en la BD que pertenezcan a esa carpeta
        const files = await File.find({ folder: folderId }) // Busca todos los 'File' cuyo campo 'folder' sea igual a folderId
                                .sort({ createdAt: -1 }) // Opcional: Ordena por fecha de creación descendente (más nuevos primero)
                                .populate('uploadedBy', 'username email') // Opcional: Trae datos del usuario que subió (username y email) en lugar de solo el ID
                                .populate('tags', 'name'); // Opcional: Trae los nombres de las tags en lugar de solo los IDs

        // 4. Enviar respuesta
        res.status(200).json(files); // Devuelve el array de archivos encontrados (puede ser vacío [])

    } catch (error) {
        console.error('Error al obtener archivos por carpeta:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener archivos.' });
    }
};

//  Controlador para Añadir Enlace de Video ---
const addVideoLink = async (req, res) => {
    // 1. Obtener datos del cuerpo (esperamos JSON aquí, no form-data)
    const { youtubeUrl, title, description, folderId, tags, assignedGroupId } = req.body;

    // 2. Validación básica
    if (!youtubeUrl || !title || !folderId) {
        return res.status(400).json({ message: 'Se requiere URL del video, título y folderId.' });
    }

    // Validación simple de formato de URL de YouTube (puede ser más robusta)
    if (!youtubeUrl.includes('youtube.com/') && !youtubeUrl.includes('youtu.be/')) {
         return res.status(400).json({ message: 'La URL proporcionada no parece ser válida de YouTube.' });
    }

    // Validación de assignedGroupId (NUEVO) - Igual que en createFolder
    let validatedGroupId = null;
    if (assignedGroupId) {
        if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
            return res.status(400).json({ message: 'El assignedGroupId proporcionado no es válido.' });
        }
        try {
            const groupExists = await Group.findById(assignedGroupId);
            if (!groupExists) {
                return res.status(404).json({ message: 'El grupo asignado no existe.' });
            }
            validatedGroupId = assignedGroupId;
        } catch (error) {
             console.error('Error buscando grupo asignado:', error);
             return res.status(500).json({ message: 'Error al verificar el grupo asignado.' });
        }
    }


    // Opcional: Validar que la carpeta (folderId) existe
    try {
        const folderExists = await Folder.findById(folderId);
        if (!folderExists) {
            return res.status(404).json({ message: 'La carpeta especificada no existe.' });
        }
        // Podrías añadir validación de permiso para esta carpeta aquí también
    } catch (error) {
        // Manejo si el folderId no es un ObjectId válido o hay error de DB
        console.error('Error buscando carpeta:', error);
        return res.status(400).json({ message: 'FolderId inválido o error al buscar carpeta.' });
    }


    try {
        // 3. Procesar tags (misma lógica placeholder que en uploadFile)
        let tagIds = []; // Inicializa como array vacío
        if (tags && typeof tags === 'string') {
            const tagNames = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
            tagIds = await Promise.all(
                tagNames.map(async (name) => {
                    const tag = await Tag.findOneAndUpdate(
                        { name: name },
                        { $setOnInsert: { name: name, createdBy: req.user._id } },
                        { upsert: true, new: true, runValidators: true }
                    );
                    return tag._id;
                })
            );
        }

        // 4. Crear el documento en la colección 'files'
        const newVideoFile = await File.create({
            filename: title, // Usamos el título como nombre de archivo
            description: description || '',
            fileType: 'video_link', // ¡Tipo específico!
            cloudinaryId: null,     // No aplica para enlaces
            secureUrl: youtubeUrl,  // Guardamos la URL de YouTube aquí
            size: 0,                // No aplica
            folder: folderId,
            tags: tagIds, // Usamos el array (vacío por ahora)
            uploadedBy: req.user._id, // ID del usuario logueado
            assignedGroup: validatedGroupId // Guarda el ID validado o null
        });

        // 5. Enviar respuesta exitosa
        const populatedFile = await File.findById(newVideoFile._id)
                                        .populate('uploadedBy', 'username email')
                                        .populate('tags', 'name')
                                        .populate('assignedGroup', 'name');
        res.status(201).json(populatedFile || newVideoFile);

    } catch (error) {
        console.error('Error al añadir enlace de video:', error);
        res.status(500).json({ message: 'Error interno del servidor al añadir el enlace.' });
    }
};


// Exportar los tres controladores
export { uploadFile, getFilesByFolder, addVideoLink };