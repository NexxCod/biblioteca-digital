// backend/controllers/fileController.js
import { googleDriveClient, googleDriveFolderId } from "../config/googleDriveConfig.js";
import File from "../models/File.js";
import Folder from "../models/Folder.js";
import Tag from "../models/Tag.js";
import Group from "../models/Group.js";
import mongoose from "mongoose";
import streamifier from "streamifier";
import path from "path";
import { getGoogleDriveStorageQuota } from '../utils/getDriveStorage.js';

// --- Función auxiliar para sanitizar nombres de archivo (Simplificada) ---
const sanitizeFilename = (filename) => {
  // 1. Intenta corregir la codificación común incorrecta (Ã¡ -> á, etc.)
  // Esto es un intento, puede que no cubra todos los casos.
  const fixes = {
    "Ã¡": "á",
    "Ã©": "é",
    "Ã­": "í",
    "Ã³": "ó",
    Ãº: "ú",
    "Ã": "Á",
    "Ã‰": "É",
    "Ã": "Í",
    "Ã“": "Ó",
    Ãš: "Ú",
    "Ã±": "ñ",
    "Ã‘": "Ñ",
    // Añade más reemplazos si detectas otros problemas de codificación
  };
  let correctedFilename = filename;
  for (const [bad, good] of Object.entries(fixes)) {
    correctedFilename = correctedFilename.replace(new RegExp(bad, "g"), good);
  }

  // 2. Quita caracteres inválidos para nombres de archivo y reemplaza espacios múltiples
  const invalidCharsRegex = /[/\\?%*:|"<>]/g; // Caracteres inválidos comunes
  const multiSpaceRegex = /\s+/g;
  let sanitized = correctedFilename
    .replace(invalidCharsRegex, "_") // Reemplaza inválidos por _
    .replace(multiSpaceRegex, " ")
    .trim(); // Normaliza espacios

  if (!sanitized) {
    sanitized = "downloaded_file" + path.extname(filename); // Añade extensión si quedó vacío
  } else if (path.extname(sanitized) !== path.extname(filename)) {
    // Asegurarse que la extensión original se mantiene si la sanitización la quitó
    sanitized += path.extname(filename);
  }

  return sanitized;
};
// --- Fin función auxiliar ---

// --- Controlador para Subir Archivo ---
const uploadFile = async (req, res) => {
 
  // 1. Verificar que Multer procesó un archivo
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "No se proporcionó ningún archivo." });
  }

  // 2. Obtener datos adicionales del cuerpo (si los enviaste)
  // Estos deben venir como campos en el mismo form-data que el archivo
  const { description, folderId, tags, assignedGroupId } = req.body; // Asumimos que se envían folderId y tags (como string separado por comas, por ejemplo)

  // Validación simple (necesitas una carpeta donde guardar!)
  if (!folderId) {
    return res
      .status(400)
      .json({ message: "Se requiere especificar la carpeta (folderId)." });
  }
  // Aquí deberías validar que la carpeta (folderId) existe y pertenece al usuario si es necesario.

  // Validación de assignedGroupId (NUEVO) - Igual que en createFolder
  let validatedGroupId = null;
  if (assignedGroupId) {
    if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
      return res
        .status(400)
        .json({ message: "El assignedGroupId proporcionado no es válido." });
    }
    try {
      const groupExists = await Group.findById(assignedGroupId);
      if (!groupExists) {
        return res
          .status(404)
          .json({ message: "El grupo asignado no existe." });
      }
      validatedGroupId = assignedGroupId;
    } catch (error) {
      console.error("Error buscando grupo asignado:", error);
      return res
        .status(500)
        .json({ message: "Error al verificar el grupo asignado." });
    }
  }

  try {
    const sanitizedOriginalName = sanitizeFilename(req.file?.originalname || "");

    const driveResponse = await googleDriveClient.files.create({
      requestBody: {
        name: sanitizedOriginalName, // Nombre del archivo en Drive
         // ID de la carpeta de Google Drive donde se subirá el archivo (desde variables de entorno)
        parents: [googleDriveFolderId],
         // Puedes añadir description aquí si quieres que se refleje en los metadatos de Drive
        description: description || '',
      },
      media: {
        mimeType: req.file.mimetype, // Tipo MIME del archivo
        body: streamifier.createReadStream(req.file.buffer), // Convierte el buffer a stream
      },
       // Campos que quieres que te devuelva Google Drive en la respuesta
       // webContentLink o webViewLink son útiles para acceder al archivo
       fields: 'id, name, webContentLink, size, mimeType, parents, description',
    });

    const driveFile = driveResponse.data;
    console.log('Archivo subido a Google Drive:', driveFile);

    // --- Opcional pero Común: Crear Permiso de Lectura Público ---
    // Esto hace que el archivo sea accesible para cualquiera con el enlace.
    // Adapta según tus necesidades de seguridad y grupos.
     let sharedLink = driveFile.webContentLink; // Enlace de descarga si existe
     try {
         const permissionResponse = await googleDriveClient.permissions.create({
             fileId: driveFile.id,
             requestBody: {
                 role: 'reader', // Permiso de lectura
                 type: 'anyone', // Para cualquier persona
             },
             fields: 'id, role, type', // Campos que quieres de la respuesta de permisos
         });
         console.log('Permiso de lectura público creado para:', driveFile.id);
         // Google Drive puede actualizar el webContentLink después de cambiar permisos
         // Podrías re-obtener el archivo o asumir que el webContentLink es ahora público
         // Para mayor seguridad, podrías obtener el enlace compartible específico con Drive API si webContentLink no es suficiente
         // const updatedFileMetadata = await googleDriveClient.files.get({fileId: driveFile.id, fields: 'webContentLink'});
         // sharedLink = updatedFileMetadata.data.webContentLink;

     } catch (permError) {
         console.error("Error al crear permiso de lectura público:", permError);
       // *** Log Detallado para Error de Permisos ***
       console.error("------ ERROR AL CREAR PERMISO DE LECTURA EN DRIVE ------");
       console.error("Mensaje:", permError.message);
       console.error("Código:", permError.code);
       console.error("Errores detallados:", permError.errors);
       console.error("Stack:", permError.stack);
       console.error("Error Completo (stringify):", JSON.stringify(permError, null, 2));
       console.error('------------------------------------------------------');
       // Decidir si continuar o no. Por ahora, sólo logueamos el error.
     }
     // --- Fin Lógica de Permiso ---


    // --- LÓGICA DE DETECCIÓN DE fileType MEJORADA ---
    let fileType = "other"; // Por defecto
    const originalNameRaw = req.file?.originalname || "";
    const fileExtension = path
      .extname(originalNameRaw)
      .toLowerCase()
      .substring(1);

    if (fileExtension === "pdf") {
      fileType = "pdf";
    } else if (["doc", "docx"].includes(fileExtension)) {
      fileType = "word";
    } else if (["xls", "xlsx"].includes(fileExtension)) {
      fileType = "excel";
    } else if (["ppt", "pptx"].includes(fileExtension)) {
      fileType = "pptx";
    } else if (["jpg", "jpeg", "png", "gif"].includes(fileExtension)) {
      fileType = "image";
    } else if (["mp4"].includes(fileExtension)) {
      fileType = "video";
    } else if ([
      "mp3",
      "aac",
      "wav",
      "flac",
      "aiff",
      "alac",
      "ogg"
    ].includes(fileExtension)) {
      fileType = "audio";
    } 


    // Procesar tags si vienen como string separado por comas
    let tagIds = [];
    if (tags && typeof tags === "string") {
      const tagNames = tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);

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

   

    const newFile = await File.create({
      filename: driveFile.name,
      description: driveFile.description || description || "",
      fileType: fileType,
      driveFileId: driveFile.id,
      secureUrl: sharedLink || driveFile.webContentLink || driveFile.webViewLink || null, 
      size: driveFile.size || 0, 
      folder: folderId, // ID de la carpeta
      tags: tagIds, // IDs de las etiquetas (requiere lógica adicional)
      uploadedBy: req.user._id, // ID del usuario logueado (viene de 'protect')
      assignedGroup: validatedGroupId,
    });

    // 6. Enviar respuesta exitosa

    const populatedFile = await File.findById(newFile._id)
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(201).json(populatedFile || newFile);
  } catch (error) { // *** CAPTURA DE ERROR PRINCIPAL CORREGIDA ***
      console.error('------ ERROR EN EL PROCESO DE SUBIDA (uploadFile) ------');
    
        // Verificar si el error viene de la API de Google (suele tener 'code' y 'errors')
        if (error.code && error.errors) {
             console.error(">>> Error detectado de la API de Google <<<");
             console.error("Mensaje Principal API:", error.message);
             console.error("Código HTTP API:", error.code);
             console.error("Errores Detallados API:", error.errors);
             // Imprimir el 'reason' específico si existe, ¡es clave!
             if (error.errors && error.errors.length > 0) {
                 console.error("Razón específica del error API:", error.errors[0].reason);
                 console.error("Dominio del error API:", error.errors[0].domain);
             }
        } else {
             // Error general (puede ser de Mongoose, código JS, etc.)
             console.error(">>> Error general del servidor <<<");
             console.error("Mensaje:", error.message);
        }
    
        // Loguear siempre el stack trace y el objeto completo para diagnóstico
        console.error("Stack Trace Completo:", error.stack);
        console.error("Objeto de Error Completo (stringify):", JSON.stringify(error, null, 2));
      console.error('------------------------------------------------------');
    
        // Enviar respuesta de error genérica al cliente
      res.status(500).json({ // Usar 500 como default, o error.code si es un error de API HTTP
            message: "Error interno del servidor al procesar el archivo.",
            // Opcional: Enviar detalles MUY limitados o un código de error para rastreo
            // NUNCA enviar el error.stack o detalles internos sensibles al cliente en producción
            errorRef: "UPLOAD_FAIL" // Un código que puedes buscar en tus logs
        });
     }
    };

//  Controlador para Listar Archivos por Carpeta ---
const getFilesByFolder = async (req, res) => {
  // 1. Extraer TODOS los posibles query parameters
  const { folderId, fileType, tags, startDate, endDate, search, sortBy, sortOrder } = req.query;
  const user = req.user;

  // Validación base (folderId sigue siendo requerido por ahora)
  if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
    return res.status(400).json({ message: "Se requiere un folderId válido." });
  }
  if (!user) {
    return res.status(401).json({ message: "Usuario no autenticado." });
  }

  try {
    // 2. Construir Filtro de Permisos (igual que antes)
    let permissionFilter = {};
    const isAdmin = user.role === "admin";
    if (!isAdmin) {
      const userGroupIds = user.groups.map((group) => group._id);
      if (user.role === "residente") {
        permissionFilter = {
          $or: [
            { assignedGroup: null },
            { assignedGroup: { $in: userGroupIds } },
          ],
        };
      } else if (user.role === "docente") {
        permissionFilter = {
          $or: [
            { uploadedBy: user._id },
            { assignedGroup: { $in: userGroupIds } },
          ],
        };
      } else {
        return res.status(403).json({ message: "Rol no autorizado." });
      }
    } // Si es admin, permissionFilter queda vacío {}

    // 3. Construir Filtro de Criterios del Usuario
    let criteriaFilter = { folder: folderId }; // Siempre filtramos por carpeta

    // Añadir filtro por tipo de archivo
    if (fileType) {
      // Opcional: Validar contra el enum del modelo File
      const validTypes = File.schema.path("fileType").enumValues;
      if (validTypes.includes(fileType)) {
        criteriaFilter.fileType = fileType;
      } else {
        console.warn(`Tipo de archivo inválido solicitado: ${fileType}`);
        // Podrías devolver un error 400 o simplemente ignorar el filtro inválido
      }
    }

    // Añadir filtro por tags (espera IDs separados por coma)
    if (tags) {
      const tagIdArray = tags
        .split(",")
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id)); // Valida que sean ObjectIds

      if (tagIdArray.length > 0) {
        // $all: el archivo DEBE tener TODAS las tags especificadas
        criteriaFilter.tags = { $in: tagIdArray };
        // Si quisieras que coincida con CUALQUIERA de las tags, usarías:
        // criteriaFilter.tags = { $in: tagIdArray };
      }
    }

    // Añadir filtro por fecha de creación (createdAt)
    let dateFilter = {};
    if (startDate) {
      const date = new Date(startDate);
      if (!isNaN(date)) {
        // Verifica si la fecha es válida
        date.setUTCHours(0, 0, 0, 0); // Considerar desde el inicio del día UTC
        dateFilter.$gte = date;
      }
    }
    if (endDate) {
      const date = new Date(endDate);
      if (!isNaN(date)) {
        date.setUTCHours(23, 59, 59, 999); // Considerar hasta el final del día UTC
        dateFilter.$lte = date;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      criteriaFilter.createdAt = dateFilter;
    }

    // Añadir filtro de búsqueda por texto (case-insensitive en filename y description)
    if (search) {
      const searchRegex = new RegExp(search.trim(), "i"); // 'i' para case-insensitive
      criteriaFilter.$or = [
        { filename: searchRegex },
        { description: searchRegex },
      ];
      // Nota: Para búsquedas más eficientes en campos grandes, considera usar índices de texto de MongoDB ($text: { $search: ... })
      // lo cual requeriría añadir fileSchema.index({ filename: 'text', description: 'text' }) en File.js
    }

    // 4. Combinar Filtros: Criterios Y Permisos (si no es admin)
    let finalFilter = {};
    if (isAdmin) {
      finalFilter = criteriaFilter; // Admin solo usa los criterios dentro de la carpeta
    } else {
      // Los demás usan los criterios Y ADEMÁS sus permisos
      finalFilter = { $and: [criteriaFilter, permissionFilter] };
    }

    // --- 5. Construir opciones de Ordenación (NUEVO) ---
    let sortOptions = {};
    const validSortBy = ['createdAt', 'filename']; // Campos permitidos para ordenar
    const validSortOrder = ['asc', 'desc']; // Direcciones permitidas

    const sBy = validSortBy.includes(sortBy) ? sortBy : 'createdAt'; // Valor por defecto
    const sOrder = validSortOrder.includes(sortOrder) ? sortOrder : 'desc'; // Valor por defecto

    sortOptions[sBy] = sOrder === 'asc' ? 1 : -1; // 1 para ascendente, -1 para descendente
    // --------------------------------------------------
    

    // 6. Ejecutar la Consulta
    const files = await File.find(finalFilter)
    .sort(sortOptions)

      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");

    // 7. Enviar Respuesta
    res.status(200).json(files);
  } catch (error) {
    console.error("Error al obtener archivos por carpeta:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al obtener archivos." });
  }
};

//  Controlador para Añadir Enlace  ---
const addLink = async (req, res) => {
  // 1. Obtener datos del cuerpo (esperamos JSON aquí, no form-data)
  const { url, title, description, folderId, tags, assignedGroupId } =
    req.body;

  // 2. Validación básica
  if (!url || !title || !folderId) {
    return res.status(400).json({ message: 'Se requiere URL, título y folderId.' });
}

  // Validación simple de formato de URL de YouTube (puede ser más robusta)
  try {
    new URL(url); // Intenta crear un objeto URL para validar formato básico
} catch (_) {
    return res.status(400).json({ message: 'La URL proporcionada no es válida.' });
}

  // Validación de assignedGroupId (NUEVO) - Igual que en createFolder
  let validatedGroupId = null;
  if (assignedGroupId) {
    if (!mongoose.Types.ObjectId.isValid(assignedGroupId)) {
      return res
        .status(400)
        .json({ message: "El assignedGroupId proporcionado no es válido." });
    }
    try {
      const groupExists = await Group.findById(assignedGroupId);
      if (!groupExists) {
        return res
          .status(404)
          .json({ message: "El grupo asignado no existe." });
      }
      validatedGroupId = assignedGroupId;
    } catch (error) {
      console.error("Error buscando grupo asignado:", error);
      return res
        .status(500)
        .json({ message: "Error al verificar el grupo asignado." });
    }
  }

  // Opcional: Validar que la carpeta (folderId) existe
  try {
    const folderExists = await Folder.findById(folderId);
    if (!folderExists) {
      return res
        .status(404)
        .json({ message: "La carpeta especificada no existe." });
    }
    // Podrías añadir validación de permiso para esta carpeta aquí también
  } catch (error) {
    // Manejo si el folderId no es un ObjectId válido o hay error de DB
    console.error("Error buscando carpeta:", error);
    return res
      .status(400)
      .json({ message: "FolderId inválido o error al buscar carpeta." });
  }

  

  try {
     // --- DETECCIÓN DE TIPO DE LINK ---
     let linkFileType = 'generic_link'; // Por defecto
     // Regex simple para detectar URLs de YouTube (youtu.be o youtube.com/watch?v=...)
     const youtubeRegex = /^(https?:\/\/)?(www\.youtube\.com|youtu\.be)\/.+$/;
     if (youtubeRegex.test(url)) {
         linkFileType = 'video_link'; // Es YouTube
     }
     // --- FIN DETECCIÓN ---

    // 3. Procesar tags (misma lógica placeholder que en uploadFile)
    let tagIds = []; // Inicializa como array vacío
    if (tags && typeof tags === "string") {
      const tagNames = tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
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
    const newLinkFile = await File.create({
      filename: title, // Usamos el título como nombre de archivo
      description: description || "",
      fileType: linkFileType, // ¡Tipo específico!
      driveFileId: null, // No aplica para enlaces
      secureUrl: url.trim(), // Guardamos la URL de YouTube aquí
      size: 0, // No aplica
      folder: folderId,
      tags: tagIds, // Usamos el array (vacío por ahora)
      uploadedBy: req.user._id, // ID del usuario logueado
      assignedGroup: validatedGroupId, // Guarda el ID validado o null
    });

    // 5. Enviar respuesta exitosa
    const populatedFile = await File.findById(newLinkFile._id)
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(201).json(populatedFile || newLinkFile);
  } catch (error) {
    console.error("Error al añadir enlace:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al añadir el enlace." });
  }
};

// --- NUEVO Controlador para Actualizar Archivo/Enlace ---
const updateFile = async (req, res) => {
  const { id: fileId } = req.params; // Obtener ID del archivo de la URL
  // Campos potencialmente actualizables del body (JSON)
  const { filename, description, tags, folderId, assignedGroupId } = req.body;

  // Validar el ID del archivo
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID de archivo inválido." });
  }

  try {
    // 1. Encontrar el archivo/enlace existente
    const file = await File.findById(fileId);
    if (!file) {
      return res
        .status(404)
        .json({ message: "Archivo o enlace no encontrado." });
    }

    // 2. Verificar Permisos
    const isAdmin = req.user.role === "admin";
    const isOwner = file.uploadedBy.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res
        .status(403)
        .json({ message: "No autorizado para modificar este recurso." });
    }

    // 3. Validar y Procesar Campos a Actualizar

    // Validar folderId si se proporciona
    if (folderId) {
      if (!mongoose.Types.ObjectId.isValid(folderId))
        return res
          .status(400)
          .json({ message: "El folderId proporcionado no es válido." });
      const folderExists = await Folder.findById(folderId);
      if (!folderExists)
        return res
          .status(404)
          .json({ message: "La nueva carpeta especificada no existe." });
      file.folder = folderId; // Actualizar carpeta
    }

    // Validar assignedGroupId si se proporciona
    if (assignedGroupId !== undefined) {
      // Permitir asignar a null (público)
      if (
        assignedGroupId !== null &&
        !mongoose.Types.ObjectId.isValid(assignedGroupId)
      ) {
        return res
          .status(400)
          .json({ message: "El assignedGroupId proporcionado no es válido." });
      }
      if (assignedGroupId) {
        const groupExists = await Group.findById(assignedGroupId);
        if (!groupExists)
          return res
            .status(404)
            .json({ message: "El grupo asignado no existe." });
      }
      file.assignedGroup = assignedGroupId; // Actualizar grupo (puede ser null)
    }

    // Actualizar filename/título si se proporciona
    if (filename) {
      file.filename = filename;
    }

    // Actualizar descripción si se proporciona (permite string vacío)
    if (description !== undefined) {
      file.description = description;
    }

    // Procesar y actualizar tags si se proporcionan
    if (tags !== undefined) {
      let tagIds = [];
      if (tags && typeof tags === "string") {
        const tagNames = tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
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
      file.tags = tagIds; // Actualiza el array de tags (puede ser vacío si tags="")
    }

    // 4. Guardar los cambios en la BD
    const updatedFile = await file.save();

    // 5. Devolver el archivo actualizado y poblado
    const populatedFile = await File.findById(updatedFile._id)
      .populate("uploadedBy", "username email")
      .populate("tags", "name")
      .populate("assignedGroup", "name");
    res.status(200).json(populatedFile);
  } catch (error) {
    console.error("Error al actualizar archivo/enlace:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al actualizar." });
  }
};

// --- NUEVO Controlador para Eliminar Archivo/Enlace ---
const deleteFile = async (req, res) => {
  const { id: fileId } = req.params; // Obtener ID del archivo de la URL

  // Validar el ID del archivo
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    return res.status(400).json({ message: "ID de archivo inválido." });
  }

  try {
    // 1. Encontrar el archivo/enlace existente
    const file = await File.findById(fileId);
    if (!file) {

      return res.status(204).send();
    }

    // 2. Verificar Permisos
    const isAdmin = req.user.role === "admin";
    const isOwner = file.uploadedBy.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res
        .status(403)
        .json({ message: "No autorizado para eliminar este recurso." });
    }

    // 3. Eliminar de Google Drive SI es un archivo físico (no un enlace externo)
    // Usamos el campo driveFileId para saber si hay un archivo en Drive asociado
    // Asegúrate de que tu modelo File ahora tenga driveFileId para archivos subidos
    if (file.fileType !== "video_link" && file.fileType !== "generic_link" && file.driveFileId) {
      try {
         // Intentamos borrar de Google Drive usando el driveFileId
        await googleDriveClient.files.delete({
            fileId: file.driveFileId, // Usa el ID de Google Drive
            // supportsAllDrives: true, // Descomentar si trabajas con Shared Drives
        });
        console.log(`Archivo ${file.driveFileId} eliminado de Google Drive.`);

      } catch (driveError) {
        console.error("Error al eliminar de Google Drive:", driveError);
        // Decide si fallar la eliminación total o solo loggear y continuar
        // Si el archivo no existía en Drive, el API podría dar un error 404.
        // Puedes chequear el código del error si quieres manejarlo específicamente.
        // throw new Error('Error al eliminar archivo de Google Drive.'); // Opción para fallar
      }
    }
    

    // 4. Eliminar de MongoDB
    await File.findByIdAndDelete(fileId);
    console.log(`Documento de archivo ${fileId} eliminado de la BD.`);

    // 5. Enviar respuesta de éxito sin contenido
    res.status(204).send(); 
  } catch (error) {
    console.error("Error al eliminar archivo/enlace:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al eliminar." });
  }
};

async function handleStorageRequest(req, res) {
  try {
    const storageInfo = await getGoogleDriveStorageQuota();
    res.json({ storageQuota: storageInfo });
  } catch (error) {
    console.error('Error al procesar la solicitud de almacenamiento:', error);
    res.status(500).json({ error: 'No se pudo obtener la información del almacenamiento.' });
  }
}

// Exportar TODOS los controladores del archivo
export { uploadFile, getFilesByFolder, addLink, updateFile, deleteFile, handleStorageRequest };
