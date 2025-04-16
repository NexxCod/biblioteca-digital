// backend/controllers/tagController.js
import Tag from '../models/Tag.js'; 
import File from '../models/File.js'; 
import mongoose from 'mongoose'; 

// --- Controlador para Crear una Nueva Etiqueta ---
const createTag = async (req, res) => {
    // 1. Obtener el nombre de la etiqueta del cuerpo (JSON)
    const { name } = req.body;

    // 2. Validación básica
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre de la etiqueta es obligatorio.' });
    }

    // 3. Preparar nombre (minúsculas y sin espacios extra) - coincide con el schema
    const tagName = name.trim().toLowerCase();

    try {
        // 4. Verificar si la etiqueta ya existe (opcional, el índice único lo haría fallar igual)
        // Hacemos la verificación para dar un mensaje más claro.
        const tagExists = await Tag.findOne({ name: tagName });
        if (tagExists) {
            return res.status(400).json({ message: `La etiqueta "${tagName}" ya existe.` });
        }

        // 5. Crear la nueva etiqueta en la BD
        const tag = await Tag.create({
            name: tagName,
            createdBy: req.user._id // Usuario logueado que la creó
        });

        // 6. Enviar respuesta exitosa
        res.status(201).json(tag);

    } catch (error) {
        console.error('Error al crear etiqueta:', error);
        // Manejo específico si el error es por la restricción única del índice (si quitamos la verificación previa)
        if (error.code === 11000) {
             return res.status(400).json({ message: `Error: La etiqueta "${tagName}" ya existe.` });
        }
        res.status(500).json({ message: 'Error interno del servidor al crear la etiqueta.' });
    }
};


// --- Controlador para Listar Todas las Etiquetas ---
const listTags = async (req, res) => {
    try {
        // Buscar todas las etiquetas, ordenadas alfabéticamente
        const tags = await Tag.find({}) // Filtro vacío para traer todas
                             .sort({ name: 1 }) // Ordenar por nombre A-Z
                             .populate('createdBy', 'username'); // Opcional: Mostrar quién creó cada tag

        res.status(200).json(tags);

    } catch (error) {
        console.error('Error al listar etiquetas:', error);
        res.status(500).json({ message: 'Error interno del servidor al listar etiquetas.' });
    }
};

// --- NUEVO Controlador para Actualizar Etiqueta ---
const updateTag = async (req, res) => {
    const { id: tagId } = req.params;
    const { name } = req.body; // Solo permitimos cambiar el nombre

    if (!mongoose.Types.ObjectId.isValid(tagId)) {
        return res.status(400).json({ message: 'ID de etiqueta inválido.' });
    }
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nuevo nombre de la etiqueta es obligatorio.' });
    }

    const newTagName = name.trim().toLowerCase();

    try {
        // 1. Encontrar la etiqueta
        const tag = await Tag.findById(tagId);
        if (!tag) {
            return res.status(404).json({ message: 'Etiqueta no encontrada.' });
        }

        // 2. Verificar Permisos
        const isAdmin = req.user.role === 'admin';
        // Compara ObjectIds como strings para seguridad
        const isOwner = tag.createdBy.toString() === req.user._id.toString();

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ message: 'No autorizado para modificar esta etiqueta.' });
        }

        // 3. Verificar Conflicto de Nombre Duplicado (con otra etiqueta)
        const duplicate = await Tag.findOne({
            name: newTagName,
            _id: { $ne: tagId } // Excluir la etiqueta actual de la búsqueda
        });
        if (duplicate) {
             return res.status(400).json({ message: `La etiqueta "${newTagName}" ya existe.` });
        }

        // 4. Actualizar y Guardar
        tag.name = newTagName;
        const updatedTag = await tag.save();

        // 5. Devolver la etiqueta actualizada
        const populatedTag = await Tag.findById(updatedTag._id)
                                        .populate('createdBy', 'username'); // Poblar creador
        res.status(200).json(populatedTag);

    } catch (error) {
        console.error('Error al actualizar etiqueta:', error);
        if (error.code === 11000) { // Error de índice único
            return res.status(400).json({ message: `Error: La etiqueta "${newTagName}" ya existe.` });
         }
        res.status(500).json({ message: 'Error interno del servidor al actualizar.' });
    }
};


// --- NUEVO Controlador para Eliminar Etiqueta ---
const deleteTag = async (req, res) => {
    const { id: tagId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(tagId)) {
        return res.status(400).json({ message: 'ID de etiqueta inválido.' });
    }

    try {
        // 1. Encontrar la etiqueta
        const tag = await Tag.findById(tagId);
        if (!tag) {
            return res.status(204).send(); // Si no existe, éxito silencioso
        }

        // 2. Verificar Permisos
        const isAdmin = req.user.role === 'admin';
        const isOwner = tag.createdBy.toString() === req.user._id.toString();

        if (!isAdmin && !isOwner) {
             return res.status(403).json({ message: 'No autorizado para eliminar esta etiqueta.' });
        }

        // 3. Eliminar la referencia a esta etiqueta de TODOS los archivos que la contengan
        // Usamos $pull para quitar el tagId del array 'tags' en los documentos File
        await File.updateMany(
            { tags: tagId }, // Filtro: encuentra archivos que contengan el tagId
            { $pull: { tags: tagId } } // Operación: quita ese tagId del array 'tags'
        );

        // 4. Eliminar la etiqueta en sí
        await Tag.findByIdAndDelete(tagId);

        // 5. Enviar respuesta de éxito sin contenido
        res.status(204).send();

    } catch (error) {
        console.error('Error al eliminar etiqueta:', error);
        res.status(500).json({ message: 'Error interno del servidor al eliminar.' });
    }
};


// Exportar TODOS los controladores de tags
export { createTag, listTags, updateTag, deleteTag };