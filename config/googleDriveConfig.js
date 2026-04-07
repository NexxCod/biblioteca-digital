// backend/config/googleDriveConfig.js
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config(); // Asegúrate de cargar las variables del .env local si pruebas en desarrollo

const SCOPES = ['https://www.googleapis.com/auth/drive']; // Scope necesario
const GOOGLE_OAUTH_SCOPES = (
  process.env.GOOGLE_OAUTH_SCOPES ||
  'https://www.googleapis.com/auth/drive.file'
)
  .split(/[,\s]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);

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

const createGoogleOAuthClient = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );

const hasGoogleOAuthConfig =
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_OAUTH_REDIRECT_URI) &&
  Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN);

const getActiveGoogleDriveClient = () => {
  if (hasGoogleOAuthConfig) {
    const oauth2Client = createGoogleOAuthClient();
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });

    return {
      client: google.drive({ version: 'v3', auth: oauth2Client }),
      authMode: 'oauth',
    };
  }

  return {
    client: googleDriveClient,
    authMode: 'service_account',
  };
};

const {
  client: activeGoogleDriveClient,
  authMode: googleDriveAuthMode,
} = getActiveGoogleDriveClient();

const activeGoogleDriveAuth =
  googleDriveAuthMode === 'oauth'
    ? (() => {
        const oauth2Client = createGoogleOAuthClient();
        oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
        });
        return oauth2Client;
      })()
    : auth;

const getGoogleDriveAccessToken = async () => {
  const tokenResult = await activeGoogleDriveAuth.getAccessToken();

  if (!tokenResult) {
    return null;
  }

  if (typeof tokenResult === 'string') {
    return tokenResult;
  }

  if (typeof tokenResult === 'object' && 'token' in tokenResult) {
    return tokenResult.token;
  }

  return null;
};

export {
  googleDriveClient,
  activeGoogleDriveClient,
  activeGoogleDriveAuth,
  getGoogleDriveAccessToken,
  googleDriveFolderId,
  createGoogleOAuthClient,
  GOOGLE_OAUTH_SCOPES,
  googleDriveAuthMode,
}; // Exporta ambos
