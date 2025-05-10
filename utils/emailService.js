import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// 🔥 Configurar Nodemailer con credenciales desde `.env`
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === "true", // Si es `true`, usa SSL; si es `false`, usa STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ✅ Verificar la conexión al iniciar
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Error de conexión SMTP:", error);
  } else {
    console.log("✅ Servidor SMTP listo para enviar correos.");
  }
});

// 📌 Función reutilizable para enviar correos
const sendEmail = async (to, subject, htmlContent, textContent = '') => {
  const mailOptions = {
    from: `"Biblioteca Imagenología UDP" <${process.env.SMTP_FROM}>`,
    to: to, // Dirección del destinatario
    subject: subject, // Asunto
    text: textContent || htmlContent.replace(/<[^>]*>?/gm, ''), // Versión en texto plano (opcional pero recomendable)
    html: htmlContent, // Contenido HTML
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Correo enviado: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo:', error);
    throw new Error('No se pudo enviar el correo.');
  }
};

export const sendVerificationEmail = async (userEmail, token) => {
  const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;
  const subject = 'Verifica tu dirección de correo electrónico';
  const htmlContent = `
    <p>Hola,</p>
    <p>Gracias por registrarte. Por favor, haz clic en el siguiente enlace para verificar tu correo electrónico:</p>
    <p><a href="${verificationLink}">${verificationLink}</a></p>
    <p>Si no te registraste en nuestra aplicación, por favor ignora este mensaje.</p>
    <p>Este enlace expirará en 24 horas.</p>
  `;
  await sendEmail(userEmail, subject, htmlContent);
};

export const sendPasswordResetEmail = async (userEmail, token) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  const subject = 'Restablecimiento de contraseña';
  const htmlContent = `
    <p>Hola,</p>
    <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>Si no solicitaste un restablecimiento de contraseña, por favor ignora este mensaje.</p>
    <p>Este enlace expirará en 1 hora.</p>
  `;
  await sendEmail(userEmail, subject, htmlContent);
};

export default sendEmail;