// backend/server.js
console.log("--- Backend server.js started ---"); // <<< LOG AÑADIDO

import express from "express";
import "dotenv/config";
import cors from "cors";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import folderRoutes from "./routes/folderRoutes.js";
import tagRoutes from "./routes/tagRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";

// --- Conexión a la Base de Datos ---
console.log("Attempting DB connection..."); // <<< LOG AÑADIDO
// connectDB es async, pero lo llamamos aquí para iniciarla.
// El logging interno de connectDB dirá si tuvo éxito o falló.
connectDB();
console.log("DB connection attempt initiated."); // <<< LOG AÑADIDO

// --- Inicialización de Express ---
const app = express();
console.log("Express app initialized."); // <<< LOG AÑADIDO

// --- Middlewares Esenciales ---
console.log("Setting up CORS middleware..."); // <<< LOG AÑADIDO
// Usando la versión simple que probaste por última vez
app.use(cors());
console.log("CORS middleware applied."); // <<< LOG AÑADIDO

console.log("Setting up JSON/URL-encoded middleware..."); // <<< LOG AÑADIDO
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
console.log("JSON/URL-encoded middleware applied."); // <<< LOG AÑADIDO

// --- Rutas ---
console.log("Setting up routes..."); // <<< LOG AÑADIDO
app.get("/", (req, res) => {
  console.log(">>> GET / request received"); // <<< LOG AÑADIDO EN HANDLER
  res.send("API de Imagenología funcionando!");
});

app.use("/api/users", userRoutes);
console.log("Applied /api/users route"); // <<< LOG AÑADIDO
app.use("/api/files", fileRoutes);
console.log("Applied /api/files route"); // <<< LOG AÑADIDO
app.use("/api/folders", folderRoutes);
console.log("Applied /api/folders route"); // <<< LOG AÑADIDO
app.use("/api/tags", tagRoutes);
console.log("Applied /api/tags route"); // <<< LOG AÑADIDO
app.use("/api/groups", groupRoutes);
console.log("Applied /api/groups route"); // <<< LOG AÑADIDO
console.log("Route setup complete."); // <<< LOG AÑADIDO

// --- Definición del Puerto ---
// Railway proporciona la variable de entorno PORT.
const PORT = process.env.PORT || 5000;
console.log(`PORT variable set to: ${PORT}`); // <<< LOG AÑADIDO

// --- Iniciar el Servidor ---
console.log("Attempting to start server listening..."); // <<< LOG AÑADIDO
// Añadimos '0.0.0.0', que a menudo es necesario para que el servidor
// escuche conexiones externas en contenedores/entornos cloud.
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Servidor corriendo en el puerto ${PORT} y escuchando en 0.0.0.0`
  ); // <<< LOG MODIFICADO
});

app.on("error", (error) => {
  // Este evento 'error' en app es menos común para errores de inicio
  console.error('❌ Error en el evento "error" de la app Express:', error); // <<< LOG MODIFICADO
});

console.log("--- Backend server.js finished synchronous execution ---"); // <<< LOG AÑADIDO
