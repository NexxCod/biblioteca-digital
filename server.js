import express from "express";
import "dotenv/config";
import cors from "cors";
import connectDB from "./config/db.js";
import { describeGoogleDriveAuthAvailability } from "./config/googleDriveConfig.js";
import userRoutes from "./routes/userRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import folderRoutes from "./routes/folderRoutes.js";
import tagRoutes from "./routes/tagRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import googleAuthRoutes from "./routes/googleAuthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import favoritesRoutes from "./routes/favoritesRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";
import { startCronWorker } from "./utils/cronWorker.js";

connectDB();

const app = express();

// Railway (y la mayoría de PaaS) sirve detrás de un proxy. Sin esto,
// express-rate-limit y req.ip ven la IP interna del balanceador en
// vez de la del cliente. "1" = confiar en el primer hop solamente
// para evitar spoofing del header X-Forwarded-For.
app.set("trust proxy", 1);

const parseAllowedOrigins = () => {
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.FRONTEND_URL) {
    configuredOrigins.push(process.env.FRONTEND_URL.trim());
  }

  if (process.env.NODE_ENV !== "production") {
    configuredOrigins.push(
      "http://localhost:3000",
      "http://localhost:4173",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:4173",
      "http://127.0.0.1:5173"
    );
  }

  return [...new Set(configuredOrigins)];
};

const allowedOrigins = parseAllowedOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origen no permitido por CORS."));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (_req, res) => {
  res.send("API de Imagenología funcionando!");
});

app.use("/api/users", userRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/google", googleAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/integration", integrationRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  const driveAuth = describeGoogleDriveAuthAvailability();
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  console.log(
    `Google Drive: OAuth app=${driveAuth.hasOAuthAppCredentials}, service account=${driveAuth.hasServiceAccountCredentials}`
  );
  console.log(
    `CORS allowed origins: ${allowedOrigins.length ? allowedOrigins.join(", ") : "none"}`
  );

  if (!process.env.INTEGRATION_API_KEY) {
    console.warn(
      "INTEGRATION_API_KEY no configurada: la API de integración (/api/integration) está deshabilitada (responderá 503)."
    );
  }

  if (process.env.DISABLE_CRON !== "true") {
    startCronWorker();
  }
});
