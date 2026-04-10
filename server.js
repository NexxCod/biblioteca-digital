import express from "express";
import "dotenv/config";
import cors from "cors";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import folderRoutes from "./routes/folderRoutes.js";
import tagRoutes from "./routes/tagRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";

connectDB();

// --- Inicialización de Express ---
const app = express();

// --- Middlewares Esenciales ---
app.use(cors());

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
app.use(express.urlencoded({ extended: false }));

// --- Rutas ---
app.get("/", (req, res) => {
  res.send("API de Imagenología funcionando!");
});

app.use("/api/users", userRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/groups", groupRoutes);

// --- Definición del Puerto ---
// Railway proporciona la variable de entorno PORT.
const PORT = process.env.PORT || 5000;

// --- Iniciar el Servidor ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});

app.on("error", (error) => {
  console.error('❌ Error en el evento "error" de la app Express:', error);
});
