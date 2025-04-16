// backend/controllers/tagController.js
import Tag from '../models/Tag.js'; // Importa el modelo Tag

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


// Exportar los controladores de tags
export { createTag, listTags };