// backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "El nombre de usuario es obligatorio."],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "El correo electrónico es obligatorio."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Por favor, introduce un correo electrónico válido.",
      ],
    },
    password: {
      type: String,
      required: [true, "La contraseña es obligatoria."],
      minlength: [6, "La contraseña debe tener al menos 6 caracteres."],
      select: false, // No incluir por defecto en las consultas
    },
    role: {
      type: String,
      enum: ["admin", "docente", "residente", "usuario"],
      default: "usuario",
    },
    groups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group", // Referencia al nuevo modelo 'Group'
      },
    ],
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false, // No incluir por defecto en las consultas
    },
    emailVerificationTokenExpires: {
      type: Date,
      select: false, // No incluir por defecto en las consultas
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetTokenExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true, // Añade createdAt y updatedAt
  }
);

// Hook para hashear la contraseña antes de guardar
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar contraseñas
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generar y hashear token de verificación de email
userSchema.methods.generateEmailVerificationToken = function () {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  this.emailVerificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 horas

  return verificationToken; // Devuelve el token original para enviarlo por email
};

// Generar y hashear token de restablecimiento de contraseña
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hora

  return resetToken; // Devuelve el token original para enviarlo por email
};

const User = mongoose.model("User", userSchema);

export default User;
