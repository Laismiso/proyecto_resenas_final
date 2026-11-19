import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directorioProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const archivoEnv = path.join(directorioProyecto, ".env");

function cargarEnv() {
  if (!fs.existsSync(archivoEnv)) return;

  for (const linea of fs.readFileSync(archivoEnv, "utf8").split(/\r?\n/)) {
    const texto = linea.trim();
    if (!texto || texto.startsWith("#")) continue;

    const separador = texto.indexOf("=");
    if (separador < 1) continue;

    const clave = texto.slice(0, separador).trim();
    const valor = texto.slice(separador + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[clave]) process.env[clave] = valor;
  }
}

cargarEnv();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const hostPublico = host === "0.0.0.0" ? "127.0.0.1" : host;
const appUrl = (process.env.APP_URL || `http://${hostPublico}:${port}`).replace(/\/+$/, "");
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;

export const configuracion = {
  proyecto: directorioProyecto,
  host,
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  sessionDays: Number(process.env.SESSION_DAYS || 7),
  appUrl,
  recoveryMinutes: Number(process.env.RECOVERY_MINUTES || 60),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: smtpPort,
    secure: smtpSecure,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Sabor & Reseña <no-reply@localhost>"
  }
};

export function correoConfigurado() {
  return Boolean(configuracion.smtp.host);
}
