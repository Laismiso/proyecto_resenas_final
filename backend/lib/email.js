import nodemailer from "nodemailer";
import { configuracion, correoConfigurado } from "../config/env.js";

let transporte = null;

function obtenerTransporte() {
  if (!correoConfigurado()) return null;

  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: configuracion.smtp.host,
      port: configuracion.smtp.port,
      secure: configuracion.smtp.secure,
      auth: configuracion.smtp.user
        ? { user: configuracion.smtp.user, pass: configuracion.smtp.pass }
        : undefined
    });
  }

  return transporte;
}

// Envía el enlace de recuperación. Sin SMTP configurado no se puede enviar un
// correo real: en desarrollo se muestra el enlace en la consola del servidor
// y en producción se registra el fallo, sin revelarlo nunca al navegador.
export async function enviarCorreoRecuperacion({ destinatario, nombreUsuario, enlace }) {
  const transporteCorreo = obtenerTransporte();

  if (!transporteCorreo) {
    if (configuracion.nodeEnv === "production") {
      throw new Error("El correo de recuperación no está configurado (SMTP).");
    }

    console.log("");
    console.log("[recuperación] No hay SMTP configurado.");
    console.log(`[recuperación] Enlace para el usuario "${nombreUsuario}":`);
    console.log(enlace);
    console.log("");
    return { enviado: false, motivo: "sin_smtp" };
  }

  await transporteCorreo.sendMail({
    from: configuracion.smtp.from,
    to: destinatario,
    subject: "Recupera tu contraseña de Sabor & Reseña",
    text: [
      `Hola, ${nombreUsuario}:`,
      "",
      "Recibimos una solicitud para cambiar la contraseña de tu cuenta.",
      "Abre este enlace para elegir una nueva:",
      enlace,
      "",
      `El enlace vence en ${configuracion.recoveryMinutes} minutos y solo se puede usar una vez.`,
      "Si no solicitaste el cambio, puedes ignorar este mensaje."
    ].join("\n"),
    html: `
      <p>Hola, <strong>${escaparHtml(nombreUsuario)}</strong>:</p>
      <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
      <p><a href="${escaparHtml(enlace)}">Elegir una nueva contraseña</a></p>
      <p>El enlace vence en ${configuracion.recoveryMinutes} minutos y solo se puede usar una vez.
      Si no solicitaste el cambio, puedes ignorar este mensaje.</p>
    `
  });

  return { enviado: true };
}

function escaparHtml(texto) {
  return String(texto)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
