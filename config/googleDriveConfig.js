// backend/config/googleDriveConfig.js
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config(); // Asegúrate de cargar las variables del .env local si pruebas en desarrollo

const SCOPES = ['https://www.googleapis.com/auth/drive']; // Scope necesario

// Lee las credenciales desde las variables de entorno
const auth = new google.auth.GoogleAuth({
    credentials: {
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'), // IMPORTANTE: reemplaza \\n por saltos de línea reales
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    },
    scopes: SCOPES,
});

const googleDriveClient = google.drive({ version: 'v3', auth });

// Opcional: Exporta también el ID de la carpeta raíz de Google Drive si lo necesitas en otro lugar
const googleDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

export { googleDriveClient, googleDriveFolderId }; // Exporta ambos