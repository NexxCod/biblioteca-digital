// backend/server.js

// --- Importaciones ---
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

app.set("trust proxy", 1);
    
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'https://frontend-biblioteca-digital-production.up.railway.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite solicitudes sin 'origin' (ej. Postman, curl) O si el origen está en la lista blanca.
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Si el origen no está permitido, rechaza la solicitud.
      console.warn(`Origen CORS no permitido: ${origin}`); // Log para depuración
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // Métodos HTTP permitidos (¡incluye OPTIONS!)
  allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization', // Cabeceras permitidas (¡incluye Authorization!)
  credentials: true, // Si necesitas enviar/recibir cookies o cabeceras de autorización complejas
  optionsSuccessStatus: 204 // Necesario para compatibilidad con algunos navegadores/proxies
};

// Aplica el middleware CORS con las opciones configuradas a todas las rutas.
app.use(cors());

// 3. Otros middlewares esenciales
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Rutas ---
app.get('/', (req, res) => {
  res.send('API de Imagenología funcionando!');
});

// >>> Monta las rutas DESPUÉS de los manejadores OPTIONS específicos y el CORS general <<<
app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/groups', groupRoutes);

// --- Puerto y Servidor ---
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Servidor CORRIENDO y escuchando en el puerto ${PORT}`);
});

server.on('error', (error) => {
  console.error('Error en el evento "error" del servidor:', error);
});

// Opcional: Listener para SIGTERM para cierre ordenado
process.on('SIGTERM', () => {
  console.log('!!! Señal SIGTERM recibida. Intentando cierre ordenado...');
  server.close(() => {
    console.log('Servidor HTTP cerrado.');
   
    process.exit(0); // Salir después de cerrar el servidor
  });
  // Forzar salida si el cierre ordenado tarda mucho
  setTimeout(() => {
    console.error('Cierre ordenado falló o tardó demasiado. Forzando salida.');
    process.exit(1);
  }, 10000); // 10 segundos
});