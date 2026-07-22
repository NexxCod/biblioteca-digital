class EmailServiceConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailServiceConfigError";
    this.statusCode = 503;
  }
}

const getResendApiKey = () => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new EmailServiceConfigError(
      "Servicio de correo no configurado: falta RESEND_API_KEY."
    );
  }

  return apiKey;
};

const getFromAddress = () => {
  const from = process.env.EMAIL_FROM;

  if (!from) {
    throw new EmailServiceConfigError(
      "Servicio de correo no configurado: falta EMAIL_FROM."
    );
  }

  return from;
};

const stripHtml = (htmlContent = "") =>
  htmlContent.replace(/<[^>]*>?/gm, "").trim();

const sendEmail = async (to, subject, htmlContent, textContent = "") => {
  try {
    const apiKey = getResendApiKey();
    const from = getFromAddress();
    const endpoint = process.env.RESEND_API_URL || "https://api.resend.com/emails";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: htmlContent,
        text: textContent || stripHtml(htmlContent),
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = payload?.message || payload?.error || "No se pudo enviar el correo.";
      console.error("Error al enviar correo con API Resend:", {
        status: response.status,
        payload,
      });
      throw new Error(errorMessage);
    }

    console.log(`Correo enviado correctamente con Resend API. ID: ${payload?.id ?? "sin-id"}`);
    return payload;
  } catch (error) {
    if (error instanceof EmailServiceConfigError) {
      console.error(error.message);
      throw error;
    }

    console.error("Error inesperado en sendEmail:", error);
    throw new Error("No se pudo enviar el correo.");
  }
};

export const sendVerificationEmail = async (userEmail, token) => {
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;
  const subject = "Verifica tu dirección de correo electrónico";
  const htmlContent = `
    <p>Hola,</p>
    <p>Gracias por registrarte. Por favor, haz clic en el siguiente enlace para verificar tu correo electrónico:</p>
    <p><a href="${verificationLink}">${verificationLink}</a></p>
    <p>Si no te registraste en nuestra aplicación, por favor ignora este mensaje.</p>
    <p>Este enlace expirará en 24 horas.</p>
  `;

  return sendEmail(userEmail, subject, htmlContent);
};

export const sendLoginLinkEmail = async (userEmail, token) => {
  const loginLink = `${process.env.FRONTEND_URL}/magic-link/${token}`;
  const subject = "Tu enlace de acceso a la Biblioteca Digital";
  const htmlContent = `
    <p>Hola,</p>
    <p>Solicitaste acceder a la Biblioteca Digital sin contraseña. Haz clic en el siguiente botón para iniciar sesión:</p>
    <p style="margin: 24px 0;">
      <a href="${loginLink}" style="background-color: #3b6f63; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; font-weight: bold;">
        Entrar a la biblioteca
      </a>
    </p>
    <p>O copia y pega este enlace en tu navegador:</p>
    <p><a href="${loginLink}">${loginLink}</a></p>
    <p>Este enlace expirará en 15 minutos y solo puede usarse una vez.</p>
    <p>Si no solicitaste este acceso, puedes ignorar este mensaje: tu cuenta sigue segura.</p>
  `;

  return sendEmail(userEmail, subject, htmlContent);
};

export const sendPasswordResetEmail = async (userEmail, token) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  const subject = "Restablecimiento de contraseña";
  const htmlContent = `
    <p>Hola,</p>
    <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>Si no solicitaste un restablecimiento de contraseña, por favor ignora este mensaje.</p>
    <p>Este enlace expirará en 1 hora.</p>
  `;

  return sendEmail(userEmail, subject, htmlContent);
};

export { EmailServiceConfigError };
export default sendEmail;
