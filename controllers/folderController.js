// backend/controllers/folderController.js
import Folder from '../models/Folder.js'; // Importa el modelo Folder

// --- Controlador para Crear Carpeta ---
const createFolder = async (req, res) => {
    // 1. Obtener datos del cuerpo de la petición
    // Esperamos el 'name' de la carpeta y opcionalmente un 'parentFolder' (ID de la carpeta padre)
    const { name, parentFolder } = req.body;

    // 2. Validación básica
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre de la carpeta es obligatorio.' });
    }

    // Si se proporciona parentFolder, podrías validar aquí si ese ID es válido o existe (opcional)

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
            name: name.trim(),
            parentFolder: parentFolder || null, // Guarda null si no se especifica padre
            createdBy: req.user._id // Asigna el ID del usuario logueado (viene de 'protect')
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
    // 1. Obtener el ID de la carpeta padre (opcional) de los query parameters
    const { parentFolder } = req.query; // ej: /api/folders?parentFolder=60b...

    try {
        // 2. Construir el filtro de búsqueda
        const filter = {};
        if (parentFolder) {
            // Si se proporciona parentFolder, buscar subcarpetas de esa carpeta
            filter.parentFolder = parentFolder;
        } else {
            // Si NO se proporciona parentFolder, buscar carpetas raíz (aquellas sin padre)
            filter.parentFolder = null;
        }

        // Opcional: Filtrar por usuario si las carpetas fueran privadas
        // filter.createdBy = req.user._id;

        // 3. Buscar las carpetas en la BD que cumplan con el filtro
        const folders = await Folder.find(filter)
                                    .sort({ name: 1 }) // Opcional: Ordenar alfabéticamente por nombre
                                    .populate('createdBy', 'username'); // Opcional: Traer username del creador

        // 4. Enviar respuesta
        res.status(200).json(folders); // Devuelve el array de carpetas encontradas

    } catch (error) {
        console.error('Error al listar carpetas:', error);
        res.status(500).json({ message: 'Error interno del servidor al listar carpetas.' });
    }
};


// Exportar ambos controladores
export { createFolder, listFolders };