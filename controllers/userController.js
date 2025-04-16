// backend/controllers/userController.js
import User from '../models/User.js'; 
import jwt from 'jsonwebtoken';     
import 'dotenv/config';            

// Función auxiliar para generar el token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId }, // Payload: información incluida en el token
    process.env.JWT_SECRET, 
    { expiresIn: '30d' } 
  );
};


// --- Controlador para Registrar Usuario ---
const registerUser = async (req, res) => {
  // 1. Obtener datos del cuerpo de la petición
  const { username, email, password } = req.body;

  // 2. Validación básica 
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Por favor, incluye nombre de usuario, email y contraseña.' });
  }

  try {
    // 3. Verificar si el usuario ya existe (por email o username)
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'El email o nombre de usuario ya está en uso.' });
    }

    // 4. Crear el nuevo usuario en la BD
    // La contraseña se hashea automáticamente por 'pre-save' hook en el modelo User.js
    const user = await User.create({
      username,
      email,
      password
    });

    // 5. Si el usuario se crea correctamente
    if (user) {
      // Generar el token
      const token = generateToken(user._id);

      // 6. Enviar respuesta al cliente
      res.status(201).json({ // 201 Creado
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        token: token // Enviar el token generado
      });
    } else {
    
      res.status(400).json({ message: 'Datos de usuario inválidos.' });
    }
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ message: 'Error interno del servidor al registrar usuario.' });
  }
};


// --- Controlador para Iniciar Sesión ---
const loginUser = async (req, res) => {
  // 1. Obtener email y password del cuerpo de la petición
  const { email, password } = req.body;

  // 2. Validación básica
  if (!email || !password) {
    return res.status(400).json({ message: 'Por favor, incluye email y contraseña.' });
  }

  try {
    // 3. Buscar al usuario por email
    // Utilizando .select('+password') porque en el modelo lo marcamos como no seleccionable por defecto
    const user = await User.findOne({ email }).select('+password').populate('groups', '_id name');

    // 4. Verificar si el usuario existe Y si la contraseña coincide
    if (user && (await user.matchPassword(password))) {
      // Si todo es correcto, generar token
      const token = generateToken(user._id);

      // 5. Enviar respuesta
      res.status(200).json({ // 200 OK
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        groups: user.groups,
        token: token
      });
    } else {
      // Si el usuario no existe o la contraseña es incorrecta
      res.status(401).json({ message: 'Email o contraseña incorrectos.' }); // 401 No autorizado
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
      res.status(404).json({ message: 'Usuario no encontrado' });
  }
  // No necesitas buscar en la BD aquí, protect ya lo hizo.
};

// Asegúrate de exportar getUserProfile (o getMe)
export { registerUser, loginUser, getUserProfile };