// backend/server.js
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import folderRoutes from './routes/folderRoutes.js';
import tagRoutes from './routes/tagRoutes.js';
import groupRoutes from './routes/groupRoutes.js';

// --- Conexión a la Base de Datos ---
connectDB(); 

// --- Inicialización de Express ---
const app = express();

// --- Middlewares Esenciales ---

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


// --- Rutas (Definiremos más adelante) ---
app.get('/', (req, res) => {
    res.send('API de Imagenología funcionando!');
  });

  app.use('/api/users', userRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/folders', folderRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/groups', groupRoutes);



// --- Definición del Puerto ---

const PORT = process.env.PORT || 5000;

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});


app.on('error', (error) => {
  console.error('Error al iniciar el servidor:', error);
});