// backend/config/googleDriveConfig.js
import { google } from 'googleapis';
import dotenv from 'dotenv';
import GoogleDriveCredential from '../models/GoogleDriveCredential.js';

dotenv.config();

const SERVICE_ACCOUNT_SCOPES = ['https://www.googleapis.com/auth/drive'];

const GOOGLE_OAUTH_SCOPES = (
  process.env.GOOGLE_OAUTH_SCOPES ||
  'https://www.googleapis.com/auth/drive.file'
)
  .split(/[,\s]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);

const googleDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

const hasOAuthAppCredentials =
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_OAUTH_REDIRECT_URI);

const hasServiceAccountCredentials =
  Boolean(process.env.GOOGLE_DRIVE_PRIVATE_KEY) &&
  Boolean(process.env.GOOGLE_DRIVE_CLIENT_EMAIL);

const createGoogleOAuthClient = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );

let serviceAccountAuth = null;
if (hasServiceAccountCredentials) {
  serviceAccountAuth = new google.auth.GoogleAuth({
    credentials: {
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    },
    scopes: SERVICE_ACCOUNT_SCOPES,
  });
}

// Cache OAuth2Client per refresh token so we reuse instances and benefit from
// the googleapis internal access-token caching/refreshing.
const oauthClientCache = new Map();
let cachedDbToken = null;
let cachedDbTokenExpiresAt = 0;
const DB_TOKEN_CACHE_MS = 30 * 1000;

const buildOAuthContext = (refreshToken) => {
  if (oauthClientCache.has(refreshToken)) {
    return oauthClientCache.get(refreshToken);
  }

  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const context = { auth: oauth2Client, drive, authMode: 'oauth' };
  oauthClientCache.set(refreshToken, context);
  return context;
};

const buildServiceAccountContext = () => ({
  auth: serviceAccountAuth,
  drive: google.drive({ version: 'v3', auth: serviceAccountAuth }),
  authMode: 'service_account',
});

const readRefreshTokenFromDb = async () => {
  const now = Date.now();
  if (cachedDbToken !== null && now < cachedDbTokenExpiresAt) {
    return cachedDbToken;
  }

  try {
    const credential = await GoogleDriveCredential.getSingleton();
    cachedDbToken = credential?.refreshToken || null;
  } catch (error) {
    console.error('Error leyendo GoogleDriveCredential desde BD:', error);
    cachedDbToken = null;
  }

  cachedDbTokenExpiresAt = now + DB_TOKEN_CACHE_MS;
  return cachedDbToken;
};

const invalidateGoogleDriveCredentialCache = () => {
  cachedDbToken = null;
  cachedDbTokenExpiresAt = 0;
  oauthClientCache.clear();
};

const resolveActiveContext = async () => {
  if (hasOAuthAppCredentials) {
    const dbRefreshToken = await readRefreshTokenFromDb();
    const refreshToken =
      dbRefreshToken || process.env.GOOGLE_OAUTH_REFRESH_TOKEN || null;

    if (refreshToken) {
      return buildOAuthContext(refreshToken);
    }
  }

  if (serviceAccountAuth) {
    return buildServiceAccountContext();
  }

  const error = new Error(
    'No hay credenciales de Google Drive configuradas. Conecta una cuenta desde el panel de administración.'
  );
  error.statusCode = 503;
  error.code = 'GOOGLE_DRIVE_NOT_CONFIGURED';
  throw error;
};

const getActiveGoogleDriveClient = async () => {
  const { drive } = await resolveActiveContext();
  return drive;
};

const getActiveGoogleDriveAuth = async () => {
  const { auth } = await resolveActiveContext();
  return auth;
};

const getActiveGoogleDriveAuthMode = async () => {
  const { authMode } = await resolveActiveContext();
  return authMode;
};

const getGoogleDriveAccessToken = async () => {
  const auth = await getActiveGoogleDriveAuth();
  const tokenResult = await auth.getAccessToken();

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

const describeGoogleDriveAuthAvailability = () => ({
  hasOAuthAppCredentials,
  hasServiceAccountCredentials: Boolean(serviceAccountAuth),
  configuredScopes: GOOGLE_OAUTH_SCOPES,
});

export {
  getActiveGoogleDriveClient,
  getActiveGoogleDriveAuth,
  getActiveGoogleDriveAuthMode,
  getGoogleDriveAccessToken,
  invalidateGoogleDriveCredentialCache,
  describeGoogleDriveAuthAvailability,
  googleDriveFolderId,
  createGoogleOAuthClient,
  GOOGLE_OAUTH_SCOPES,
};
