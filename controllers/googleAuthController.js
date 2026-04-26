import jwt from "jsonwebtoken";
import {
  createGoogleOAuthClient,
  GOOGLE_OAUTH_SCOPES,
  getActiveGoogleDriveClient,
  invalidateGoogleDriveCredentialCache,
  describeGoogleDriveAuthAvailability,
} from "../config/googleDriveConfig.js";
import GoogleDriveCredential from "../models/GoogleDriveCredential.js";

const STATE_TTL_SECONDS = 5 * 60;

const resolveAllowedOpenerOrigin = () => {
  const raw = process.env.FRONTEND_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch (_) {
    console.warn(
      `FRONTEND_URL no es una URL válida (${raw}); el postMessage del callback no podrá restringir destinatario.`
    );
    return null;
  }
};

const ALLOWED_OPENER_ORIGIN = resolveAllowedOpenerOrigin();

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const signOAuthState = (adminId) =>
  jwt.sign(
    { adminId: String(adminId), purpose: "google-drive-oauth" },
    process.env.JWT_SECRET,
    { expiresIn: STATE_TTL_SECONDS }
  );

const verifyOAuthState = (state) => {
  const payload = jwt.verify(state, process.env.JWT_SECRET);
  if (payload?.purpose !== "google-drive-oauth" || !payload.adminId) {
    throw new Error("Estado OAuth inválido.");
  }
  return payload;
};

const verifyDriveConnection = async () => {
  try {
    const drive = await getActiveGoogleDriveClient();
    const response = await drive.about.get({ fields: "user, storageQuota" });
    return {
      ok: true,
      email: response.data?.user?.emailAddress || null,
      displayName: response.data?.user?.displayName || null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "No se pudo verificar la conexión con Drive.",
    };
  }
};

const buildPopupResponseHtml = ({ status, message, payload }) => {
  const safeStatus = escapeHtml(status);
  const safeMessage = escapeHtml(message);
  const safePayload = JSON.stringify(payload || {}).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Conexión con Google Drive</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 32px; max-width: 520px; margin: auto; color: #1f2937; }
      h1 { font-size: 1.4rem; }
      .ok { color: #047857; }
      .err { color: #b91c1c; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
    </style>
  </head>
  <body>
    <h1 class="${safeStatus === "success" ? "ok" : "err"}">
      ${safeStatus === "success" ? "Conexión exitosa" : "Conexión finalizada"}
    </h1>
    <p>${safeMessage}</p>
    <p>Esta ventana intentará cerrarse automáticamente.</p>
    <script>
      (function () {
        var data = { source: "google-drive-oauth", status: ${JSON.stringify(safeStatus)}, payload: ${safePayload} };
        var targetOrigin = ${JSON.stringify(ALLOWED_OPENER_ORIGIN || "")};
        try {
          if (window.opener && !window.opener.closed && targetOrigin) {
            window.opener.postMessage(data, targetOrigin);
          }
        } catch (e) {}
        setTimeout(function () { try { window.close(); } catch (e) {} }, 1500);
      })();
    </script>
  </body>
</html>`;
};

const getGoogleDriveStatus = async (req, res) => {
  try {
    const availability = describeGoogleDriveAuthAvailability();
    const credential = await GoogleDriveCredential.getSingleton();
    const hasDbCredential = Boolean(credential?.refreshToken);
    const hasEnvFallback = Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
    const source = hasDbCredential
      ? "database"
      : hasEnvFallback
      ? "env"
      : availability.hasServiceAccountCredentials
      ? "service_account"
      : "none";

    let verification = null;
    if (req.query?.verify === "1") {
      verification = await verifyDriveConnection();

      if (credential) {
        credential.lastVerifiedAt = new Date();
        credential.lastVerifiedOk = verification.ok;
        credential.lastVerifiedError = verification.ok ? null : verification.error || null;
        await credential.save();
      }
    }

    res.status(200).json({
      source,
      configured: source !== "none",
      hasDbCredential,
      hasEnvFallback,
      hasServiceAccountFallback: availability.hasServiceAccountCredentials,
      hasOAuthAppCredentials: availability.hasOAuthAppCredentials,
      configuredScopes: availability.configuredScopes,
      credential: credential
        ? {
            scopes: credential.scopes || [],
            updatedAt: credential.updatedAt,
            updatedBy: credential.updatedBy,
            lastVerifiedAt: credential.lastVerifiedAt,
            lastVerifiedOk: credential.lastVerifiedOk,
            lastVerifiedError: credential.lastVerifiedError,
          }
        : null,
      verification,
    });
  } catch (error) {
    console.error("Error obteniendo estado de Google Drive:", error);
    res.status(500).json({
      message: "No se pudo obtener el estado de la integración.",
    });
  }
};

const startGoogleAuthFlow = async (req, res) => {
  try {
    validateGoogleOAuthEnv();

    const state = signOAuthState(req.user._id);
    const oauth2Client = createGoogleOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_OAUTH_SCOPES,
      state,
    });

    res.status(200).json({
      authUrl,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      scopes: GOOGLE_OAUTH_SCOPES,
      stateExpiresInSeconds: STATE_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Error generando URL OAuth de Google:", error);
    res.status(error.statusCode || 500).json({
      message:
        error.message || "No se pudo generar la URL de autorización de Google.",
    });
  }
};

const saveManualRefreshToken = async (req, res) => {
  const { refreshToken, scopes } = req.body || {};

  if (!refreshToken || typeof refreshToken !== "string") {
    return res.status(400).json({
      message: "Se requiere un refreshToken válido.",
    });
  }

  try {
    validateGoogleOAuthEnv();

    const credential = await GoogleDriveCredential.findOneAndUpdate(
      { key: GoogleDriveCredential.SINGLETON_KEY },
      {
        refreshToken: refreshToken.trim(),
        scopes:
          Array.isArray(scopes) && scopes.length ? scopes : GOOGLE_OAUTH_SCOPES,
        updatedBy: req.user._id,
        lastVerifiedAt: null,
        lastVerifiedOk: null,
        lastVerifiedError: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    invalidateGoogleDriveCredentialCache();

    const verification = await verifyDriveConnection();
    credential.lastVerifiedAt = new Date();
    credential.lastVerifiedOk = verification.ok;
    credential.lastVerifiedError = verification.ok ? null : verification.error || null;
    await credential.save();

    res.status(200).json({
      message: verification.ok
        ? "Token guardado y verificado correctamente."
        : "Token guardado, pero la verificación con Drive falló.",
      verification,
      credential: {
        scopes: credential.scopes,
        updatedAt: credential.updatedAt,
        updatedBy: credential.updatedBy,
        lastVerifiedAt: credential.lastVerifiedAt,
        lastVerifiedOk: credential.lastVerifiedOk,
        lastVerifiedError: credential.lastVerifiedError,
      },
    });
  } catch (error) {
    console.error("Error guardando refresh token manual:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "No se pudo guardar el refresh token.",
    });
  }
};

const handleGoogleAuthCallback = async (req, res) => {
  const { code, error: oauthError, state } = req.query;

  if (oauthError) {
    return res.status(400).send(
      buildPopupResponseHtml({
        status: "error",
        message: `Google devolvió un error: ${oauthError}.`,
        payload: { reason: "google_error", detail: String(oauthError) },
      })
    );
  }

  if (!state) {
    return res.status(400).send(
      buildPopupResponseHtml({
        status: "error",
        message:
          "No se recibió el parámetro de estado para verificar la solicitud.",
        payload: { reason: "missing_state" },
      })
    );
  }

  let statePayload;
  try {
    statePayload = verifyOAuthState(state);
  } catch (verifyError) {
    return res.status(400).send(
      buildPopupResponseHtml({
        status: "error",
        message:
          "El estado OAuth es inválido o expiró. Vuelve a iniciar la conexión desde el panel.",
        payload: { reason: "invalid_state" },
      })
    );
  }

  if (!code) {
    return res.status(400).send(
      buildPopupResponseHtml({
        status: "error",
        message: "No se recibió el código OAuth de Google.",
        payload: { reason: "missing_code" },
      })
    );
  }

  try {
    validateGoogleOAuthEnv();

    const oauth2Client = createGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return res.status(400).send(
        buildPopupResponseHtml({
          status: "error",
          message:
            "Google no devolvió un refresh token. Revoca el acceso de la app en https://myaccount.google.com/permissions y vuelve a intentar.",
          payload: { reason: "no_refresh_token" },
        })
      );
    }

    const grantedScopes = (tokens.scope || GOOGLE_OAUTH_SCOPES.join(" "))
      .split(/\s+/)
      .filter(Boolean);

    const credential = await GoogleDriveCredential.findOneAndUpdate(
      { key: GoogleDriveCredential.SINGLETON_KEY },
      {
        refreshToken,
        scopes: grantedScopes,
        updatedBy: statePayload.adminId,
        lastVerifiedAt: null,
        lastVerifiedOk: null,
        lastVerifiedError: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    invalidateGoogleDriveCredentialCache();

    const verification = await verifyDriveConnection();
    credential.lastVerifiedAt = new Date();
    credential.lastVerifiedOk = verification.ok;
    credential.lastVerifiedError = verification.ok
      ? null
      : verification.error || null;
    await credential.save();

    return res.status(200).send(
      buildPopupResponseHtml({
        status: verification.ok ? "success" : "warning",
        message: verification.ok
          ? `Conexión guardada${
              verification.email ? ` para ${verification.email}` : ""
            }.`
          : `Token guardado, pero la verificación falló: ${
              verification.error || "error desconocido"
            }.`,
        payload: {
          verification,
          scopes: grantedScopes,
        },
      })
    );
  } catch (callbackError) {
    console.error("Error procesando callback OAuth de Google:", callbackError);
    return res.status(500).send(
      buildPopupResponseHtml({
        status: "error",
        message:
          "No se pudo intercambiar el código con Google. Revisa los logs del servidor.",
        payload: {
          reason: "exchange_failed",
          detail: callbackError?.message || null,
        },
      })
    );
  }
};

const clearGoogleCredential = async (req, res) => {
  try {
    await GoogleDriveCredential.deleteOne({
      key: GoogleDriveCredential.SINGLETON_KEY,
    });
    invalidateGoogleDriveCredentialCache();
    res.status(200).json({ message: "Credencial eliminada." });
  } catch (error) {
    console.error("Error eliminando credencial Google:", error);
    res.status(500).json({ message: "No se pudo eliminar la credencial." });
  }
};

export {
  getGoogleDriveStatus,
  startGoogleAuthFlow,
  saveManualRefreshToken,
  handleGoogleAuthCallback,
  clearGoogleCredential,
};
