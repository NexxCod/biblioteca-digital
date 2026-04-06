import { Resend } from "resend";

class EmailServiceConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailServiceConfigError";
    this.statusCode = 503;
  }
}

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new EmailServiceConfigError(
      "Servicio de correo no configurado: falta RESEND_API_KEY."
    );
  }

  return new Resend(apiKey);
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

const stripHtml = (htmlContent = "") => htmlContent.replace(/<[^>]*>?/gm, "").trim();

const sendEmail = async (to, subject, htmlContent, textContent = "") => {
  try {
    const resend = getResendClient();
    const from = getFromAddress();

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: htmlContent,
      text: textContent || stripHtml(htmlContent),
    });

    if (error) {
      console.error("Error al enviar correo con Resend:", error);
      throw new Error(error.message || "No se pudo enviar el correo.");
    }

    console.log(`Correo enviado correctamente con Resend. ID: ${data?.id ?? "sin-id"}`);
    return data;
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
