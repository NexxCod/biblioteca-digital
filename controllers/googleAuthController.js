import {
  createGoogleOAuthClient,
  GOOGLE_OAUTH_SCOPES,
} from "../config/googleDriveConfig.js";

const validateGoogleOAuthEnv = () => {
  const requiredVars = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
  ];

  const missingVars = requiredVars.filter((envName) => !process.env[envName]);

  if (missingVars.length > 0) {
    const error = new Error(
      `Faltan variables OAuth de Google: ${missingVars.join(", ")}`
    );
    error.statusCode = 500;
    throw error;
  }
};

const getGoogleAuthUrl = async (_req, res) => {
  try {
    validateGoogleOAuthEnv();

    const oauth2Client = createGoogleOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_OAUTH_SCOPES,
    });

    res.status(200).json({
      authUrl,
      oauthParams: {
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
        redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
        responseType: "code",
        accessType: "offline",
        prompt: "consent",
      },
      scopes: GOOGLE_OAUTH_SCOPES,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    });
  } catch (error) {
    console.error("Error generando URL OAuth de Google:", error);
    res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo generar la URL de autorización de Google.",
    });
  }
};

const handleGoogleAuthCallback = async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`
      <h1>Autorización cancelada</h1>
      <p>Google devolvió el error: <strong>${error}</strong></p>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <h1>Falta el código OAuth</h1>
      <p>No se recibió el parámetro <code>code</code> en el callback.</p>
    `);
  }

  try {
    validateGoogleOAuthEnv();

    const oauth2Client = createGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const refreshToken = tokens.refresh_token || "";

    const html = `
      <h1>OAuth configurado</h1>
      <p>Copia este valor en tu <code>.env</code> del backend:</p>
      <pre style="padding:12px;border:1px solid #ccc;white-space:pre-wrap;word-break:break-all;">GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}</pre>
      <p>Scopes concedidos:</p>
      <pre style="padding:12px;border:1px solid #ccc;white-space:pre-wrap;word-break:break-all;">${(tokens.scope || GOOGLE_OAUTH_SCOPES.join(" ")).toString()}</pre>
      <p>Si el refresh token llegó vacío, revoca el acceso de la app en tu cuenta de Google y vuelve a autorizar con la misma URL.</p>
    `;

    res.status(200).send(html);
  } catch (callbackError) {
    console.error("Error procesando callback OAuth de Google:", callbackError);
    res.status(500).send(`
      <h1>Error en el callback OAuth</h1>
      <p>No se pudieron intercambiar las credenciales con Google.</p>
      <pre style="padding:12px;border:1px solid #ccc;white-space:pre-wrap;word-break:break-all;">${callbackError.message}</pre>
    `);
  }
};

export { getGoogleAuthUrl, handleGoogleAuthCallback };
