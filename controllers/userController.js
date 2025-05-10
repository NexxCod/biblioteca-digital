// backend/controllers/userController.js
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import "dotenv/config";
import mongoose from "mongoose";
import Group from "../models/Group.js";
import crypto from "crypto"; // Para hashear tokens recibidos
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../utils/emailService.js";

// Función auxiliar para generar el token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId }, // Payload: información incluida en el token
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
};

// --- Controlador para Registrar Usuario ---
const registerUser = async (req, res) => {
  // 1. Obtener datos del cuerpo de la petición
  const { username, email, password } = req.body;

  // 2. Validación básica
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({
        message: "Por favor, incluye nombre de usuario, email y contraseña.",
      });
  }

  try {
    // 3. Verificar si el usuario ya existe (por email o username)
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res
        .status(400)
        .json({ message: "El email o nombre de usuario ya está en uso." });
    }

    // 4. Crear el nuevo usuario en la BD
    // La contraseña se hashea automáticamente por 'pre-save' hook en el modelo User.js
    const user = new User({
      // Usamos 'new User' para poder llamar al método antes de guardar
      username,
      email,
      password,
    });

    const verificationToken = user.generateEmailVerificationToken(); // Genera y guarda token hasheado
    await user.save(); // Guarda el usuario con el token de verificación

    // Enviar correo de verificación (sin bloquear la respuesta al cliente)
    sendVerificationEmail(user.email, verificationToken)
      .then(() => console.log(`Correo de verificación enviado a ${user.email}`))
      .catch((err) =>
        console.error(
          `Error enviando correo de verificación a ${user.email}:`,
          err
        )
      );

    // No generamos token JWT aquí, el usuario debe verificar su email primero
    res.status(201).json({
      message: 'Registro exitoso. Por favor, verifica tu correo electrónico.',
      // No envíes datos de usuario ni token JWT hasta que verifique
    });

  } catch (error) {
    console.error('Error en registro:', error);
    if (error.code === 11000) { // Error de duplicado de MongoDB
        return res.status(400).json({ message: 'El email o nombre de usuario ya está en uso (desde catch).' });
    }
    res.status(500).json({ message: 'Error interno del servidor al registrar usuario.' });
  }
};

// --- Controlador para Iniciar Sesión ---
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Por favor, incluye email y contraseña.' });
  }

  try {
    const user = await User.findOne({ email }).select('+password').populate('groups', '_id name');

    if (!user) {
      return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    }

    // --- NUEVO: Chequeo de verificación de email ---
    if (!user.isEmailVerified) {
      return res.status(403).json({ // 403 Forbidden
        message: 'Por favor, verifica tu correo electrónico antes de iniciar sesión.',
        // Opcional: puedes añadir una forma de reenviar el correo de verificación
        // needsVerification: true
      });
    }
    // --- FIN CHEQUEO ---

    if (await user.matchPassword(password)) {
      const token = generateToken(user._id);
      res.status(200).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        groups: user.groups,
        token: token,
        isEmailVerified: user.isEmailVerified // Añadir para el frontend
      });
    } else {
      res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error interno del servidor al iniciar sesión.' });
  }
};

// --- Controlador para obtener datos del usuario logueado ('Me') ---
const getUserProfile = async (req, res) => {
  // El middleware 'protect' ya ha verificado el token y adjuntado
  // el usuario (con grupos populados) a req.user.
  // Simplemente devolvemos req.user.
  if (req.user) {
    res.status(200).json(req.user);
  } else {
    // Esto no debería ocurrir si protect está bien, pero por si acaso
    res.status(404).json({ message: "Usuario no encontrado" });
  }
  // No necesitas buscar en la BD aquí, protect ya lo hizo.
};

// --- NUEVO: Controlador para listar TODOS los usuarios (Admin Only) ---
const getUsers = async (req, res) => {
  try {
    // Buscar todos los usuarios, excluyendo la contraseña por seguridad
    // y poblando los grupos a los que pertenecen.
    const users = await User.find({})
      .select("-password")
      .populate("groups", "name");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error al obtener usuarios (Admin):", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al listar usuarios." });
  }
};

// --- NUEVO: Controlador para obtener detalles de un usuario por ID (Admin Only) ---
const getUserById = async (req, res) => {
  const { id } = req.params; // Obtener ID del usuario de la URL

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID de usuario inválido." });
  }

  try {
    // Buscar usuario por ID, excluyendo contraseña y poblando grupos
    const user = await User.findById(id)
      .select("-password")
      .populate("groups", "name");

    if (user) {
      res.status(200).json(user);
    } else {
      res.status(404).json({ message: "Usuario no encontrado." });
    }
  } catch (error) {
    console.error(`Error al obtener usuario ${id} (Admin):`, error);
    res.status(500).json({ message: "Error interno del servidor." });
  }
};

// --- NUEVO: Controlador para actualizar usuario (cambiar rol, asignar grupos) (Admin Only) ---
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, email, role, groups } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID de usuario inválido." });
  }

  try {
    const user = await User.findById(id).populate("groups", "_id");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const currentUserGroupIds = user.groups.map((group) =>
      group._id.toString()
    );
    let newGroupIdsStrings = currentUserGroupIds; // Usaremos strings para la comparación

    // ... (validación y actualización de username y email, mantener igual) ...
    if (
      username !== undefined &&
      username.trim() !== "" &&
      user.username !== username.trim()
    ) {
      const usernameExists = await User.findOne({
        username: username.trim(),
        _id: { $ne: id },
      });
      if (usernameExists) {
        return res
          .status(400)
          .json({ message: "El nombre de usuario ya está en uso." });
      }
      user.username = username.trim();
    }

    if (
      email !== undefined &&
      email.trim() !== "" &&
      user.email !== email.trim()
    ) {
      const emailExists = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: id },
      });
      if (emailExists) {
        return res
          .status(400)
          .json({ message: "El correo electrónico ya está en uso." });
      }
      user.email = email.trim().toLowerCase();
    }
    // ... (fin validación y actualización de username y email) ...

    // Actualizar rol si se proporciona y es un rol válido (mantener igual)
    if (role !== undefined) {
      const validRoles = User.schema.path("role").enumValues;
      if (!validRoles.includes(role)) {
        return res
          .status(400)
          .json({
            message: `Rol inválido. Roles permitidos: ${validRoles.join(", ")}`,
          });
      }
      user.role = role;
    }

    // --- MODIFICADO: Lógica para actualizar grupos y sincronizar miembros en el modelo Group ---
    if (groups !== undefined) {
      if (!Array.isArray(groups)) {
        return res
          .status(400)
          .json({
            message: "El campo groups debe ser un array de IDs de grupo.",
          });
      }

      const validGroupIdsStrings = []; // Array para strings de IDs válidos
      const validGroupObjectIds = []; // *** NUEVO: Array para almacenar ObjectIds ***

      // 1. Validar IDs recibidos y construir arrays de strings y ObjectIds
      for (const groupIdString of groups) {
        // Iterar sobre las cadenas de ID recibidas
        if (!mongoose.Types.ObjectId.isValid(groupIdString)) {
          return res
            .status(400)
            .json({ message: `ID de grupo inválido: ${groupIdString}` });
        }
        const groupExists = await Group.findById(groupIdString); // Buscar grupo por su ID (string válido)
        if (!groupExists) {
          return res
            .status(404)
            .json({ message: `Grupo no encontrado con ID: ${groupIdString}` });
        }
        validGroupIdsStrings.push(groupIdString.toString()); // Asegurarse de que sea string
        validGroupObjectIds.push(new mongoose.Types.ObjectId(groupIdString)); // *** Convertir a ObjectId ***
      }

      newGroupIdsStrings = validGroupIdsStrings; // Los nuevos IDs válidos (como strings)

      // 2. Determinar qué grupos se añadieron y cuáles se eliminaron (usando strings para comparación)
      const groupsAddedStrings = newGroupIdsStrings.filter(
        (groupId) => !currentUserGroupIds.includes(groupId)
      );
      const groupsRemovedStrings = currentUserGroupIds.filter(
        (groupId) => !newGroupIdsStrings.includes(groupId)
      );

      // 3. Sincronizar el array 'members' en los documentos de Group (usando strings de IDs de grupo y el ObjectId del usuario)
      const syncPromises = [];

      // Añadir este usuario a los arrays 'members' de los grupos añadidos
      if (groupsAddedStrings.length > 0) {
        syncPromises.push(
          Group.updateMany(
            { _id: { $in: groupsAddedStrings } }, // Buscar grupos por sus IDs (strings)
            { $addToSet: { members: user._id } } // Añadir el ObjectId del usuario
          )
        );
      }

      // Quitar este usuario de los arrays 'members' de los grupos eliminados
      if (groupsRemovedStrings.length > 0) {
        syncPromises.push(
          Group.updateMany(
            { _id: { $in: groupsRemovedStrings } }, // Buscar grupos por sus IDs (strings)
            { $pull: { members: user._id } } // Quitar el ObjectId del usuario
          )
        );
      }

      await Promise.all(syncPromises); // Esperar a que terminen las sincronizaciones

      // 4. Asignar el array de ObjectIds al campo groups del usuario
      user.groups = validGroupObjectIds; // *** MODIFICADO: Asignar array de ObjectIds ***
    }
    // --- FIN MODIFICADO: Lógica para actualizar grupos y sincronizar miembros ---

    // 5. Guardar los cambios en el documento del usuario.
    // Mongoose ahora guardará un array de ObjectIds en user.groups
    const updatedUser = await user.save();

    // 6. Devolver el usuario actualizado (sin contraseña, con grupos populados por nombre)
    const populatedUser = await User.findById(updatedUser._id)
      .select("-password")
      .populate("groups", "name");

    res.status(200).json(populatedUser);
  } catch (error) {
    console.error(`Error al actualizar usuario ${id} (Admin):`, error);
    if (error.code === 11000) {
      const field = error.message.includes("email")
        ? "email"
        : "nombre de usuario";
      return res
        .status(400)
        .json({ message: `Error: El ${field} ya está en uso.` });
    }
    // Si el error original es el CastError específico, podrías querer dar un mensaje más amigable
    if (
      error.name === "CastError" &&
      error.path === "_id" &&
      error.value === "groups"
    ) {
      return res
        .status(400)
        .json({
          message:
            "Error de datos al actualizar grupos. Asegúrate de que los IDs de grupo sean correctos.",
        });
    }
    res
      .status(500)
      .json({ message: "Error interno del servidor al actualizar usuario." });
  }
};

// --- NUEVO: Controlador para eliminar usuario (Admin Only) ---
const deleteUser = async (req, res) => {
  const { id } = req.params; // ID del usuario a eliminar

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID de usuario inválido." });
  }

  // Opcional: Evitar que un admin se elimine a sí mismo (a menos que sea el único)
  if (req.user._id.toString() === id) {
    // Lógica para verificar si hay otros admins
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      return res
        .status(400)
        .json({
          message: "No puedes eliminarte si eres el único administrador.",
        });
    }
  }

  try {
    // Buscar el usuario antes de eliminarlo para obtener su _id si no lo tenemos ya validado
    const userToDelete = await User.findById(id);

    if (!userToDelete) {
      // Si no se encuentra, consideramos la operación exitosa (ya no está)
      return res.status(204).send(); // 204 No Content
    }

    // --- NUEVO: Limpieza de referencias en los grupos ---
    // Quitar la referencia de este usuario del array 'members' de TODOS los grupos
    // a los que pertenecía.
    await Group.updateMany(
      { members: userToDelete._id }, // Filtrar: encontrar grupos que contienen el ID del usuario a eliminar
      { $pull: { members: userToDelete._id } } // Operación: quitar el ID del usuario del array 'members'
    );
    // --- FIN NUEVO: Limpieza de referencias en los grupos ---

    // Ahora sí, eliminar el documento del usuario
    await User.findByIdAndDelete(id);

    // Opcional: Limpieza adicional si es necesario (ej: contenido creado por el usuario)
    // Esto puede ser complejo y depende de tus reglas. Podrías reasignar contenido,
    // marcarlo como creado por un usuario "Eliminado", o eliminar su contenido también.
    // Por ahora, solo eliminamos el usuario y limpiamos referencias en grupos.

    res.status(204).send(); // 204 No Content
  } catch (error) {
    console.error(`Error al eliminar usuario ${id} (Admin):`, error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al eliminar usuario." });
  }
};

const verifyEmail = async (req, res) => {
  const { token } = req.params;
  if (!token) {
    return res.status(400).json({ message: 'Token de verificación no proporcionado.' });
  }

  // Hashea el token recibido para compararlo con el almacenado
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  try {
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationTokenExpires: { $gt: Date.now() }, // Verifica que no haya expirado
    });

    if (!user) {
      return res.status(400).json({ message: 'Token de verificación inválido o expirado.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined; // Limpia el token
    user.emailVerificationTokenExpires = undefined; // Limpia la expiración
    await user.save();

    // Opcional: Podrías generar un token JWT aquí y loguear al usuario automáticamente
    // const jwtToken = generateToken(user._id);
    // res.status(200).json({ message: 'Correo verificado exitosamente.', token: jwtToken, user: { _id: user._id, ... } });

    res.status(200).json({ message: 'Correo verificado exitosamente. Ya puedes iniciar sesión.' });

  } catch (error) {
    console.error('Error verificando email:', error);
    res.status(500).json({ message: 'Error interno del servidor al verificar el correo.' });
  }
};

// --- NUEVO: Controlador para Solicitar Restablecimiento de Contraseña ---
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Por favor, proporciona tu correo electrónico.' });
  }

  try {
    const user = await User.findOne({ email });

    if (user) {
      // Solo si el usuario existe, genera y envía el token
      // Esto evita revelar si un email está registrado o no
      const resetToken = user.generatePasswordResetToken();
      await user.save({ validateBeforeSave: false }); // Evita validaciones que no sean necesarias aquí

      try {
        await sendPasswordResetEmail(user.email, resetToken);
        console.log(`Correo de restablecimiento enviado a ${user.email}`);
      } catch (emailError) {
        console.error(`Error enviando correo de restablecimiento a ${user.email}:`, emailError);
        // No falles la petición principal por un error de email, pero loguealo.
        // El usuario no sabrá si el correo se envió o no, pero el token está guardado.
      }
    } else {
        console.log(`Intento de restablecimiento para email no registrado: ${email}`);
    }

    // Siempre envía una respuesta genérica
    res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.' });

  } catch (error) {
    console.error('Error en forgotPassword:', error);
    // Aunque hay un error, envía una respuesta genérica para no revelar información
    res.status(200).json({ message: 'Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
  }
};

// --- NUEVO: Controlador para Restablecer Contraseña ---
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token de restablecimiento no proporcionado.' });
  }
  if (!password || !confirmPassword) {
    return res.status(400).json({ message: 'Por favor, proporciona la nueva contraseña y su confirmación.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Las contraseñas no coinciden.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.'})
  }

  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  try {
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetTokenExpires'); // Asegúrate de seleccionar los campos para el query

    if (!user) {
      return res.status(400).json({ message: 'Token de restablecimiento inválido o expirado.' });
    }

    user.password = password; // El hook pre-save se encargará del hasheo
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    user.isEmailVerified = true; // Si resetean contraseña, también consideramos el email verificado
    await user.save();

    // Opcional: Loguear al usuario automáticamente
    // const jwtToken = generateToken(user._id);
    // res.status(200).json({ message: 'Contraseña restablecida exitosamente.', token: jwtToken, user: { ... }});

    res.status(200).json({ message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.' });

  } catch (error) {
    console.error('Error restableciendo contraseña:', error);
    res.status(500).json({ message: 'Error interno del servidor al restablecer la contraseña.' });
  }
};

// --- NUEVO: Controlador para Cambiar Contraseña (Usuario Autenticado) ---
const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const userId = req.user._id; // Obtenido del middleware 'protect'

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: 'Por favor, completa todos los campos.' });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: 'La nueva contraseña y su confirmación no coinciden.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.'})
  }


  try {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      // Esto no debería pasar si 'protect' funciona bien
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'La contraseña actual es incorrecta.' });
    }

    user.password = newPassword; // El hook pre-save se encargará del hasheo
    await user.save();

    res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });

  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ message: 'Error interno del servidor al cambiar la contraseña.' });
  }
};

// --- REENVIAR CORREO DE VERIFICACIÓN (OPCIONAL PERO RECOMENDADO) ---
const resendVerificationEmail = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Por favor, proporciona tu correo electrónico.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            // No revelar si el usuario existe o no
            return res.status(200).json({ message: 'Si tu correo está registrado y no verificado, recibirás un nuevo enlace.' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'Este correo electrónico ya ha sido verificado.' });
        }

        // Generar nuevo token
        const verificationToken = user.generateEmailVerificationToken();
        await user.save({ validateBeforeSave: false });

        // Enviar correo
        await sendVerificationEmail(user.email, verificationToken);
        res.status(200).json({ message: 'Se ha enviado un nuevo correo de verificación.' });

    } catch (error) {
        console.error('Error reenviando correo de verificación:', error);
        res.status(500).json({ message: 'Error interno del servidor al reenviar el correo.' });
    }
};

// Exportar TODOS los controladores del archivo
export {
  registerUser,
  loginUser,
  getUserProfile,
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  verifyEmail,           // NUEVO
  forgotPassword,        // NUEVO
  resetPassword,         // NUEVO
  changePassword,        // NUEVO
  resendVerificationEmail // NUEVO
};
