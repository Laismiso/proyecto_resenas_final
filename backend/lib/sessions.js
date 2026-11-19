import { createHash, randomBytes } from "node:crypto";
import { pool } from "../config/database.js";
import { configuracion } from "../config/env.js";

const NOMBRE_COOKIE = "sabor_resena_session";

export function leerCookieSesion(req) {
  const cookies = req.headers.cookie?.split(";") || [];
  const encontrada = cookies.find((cookie) => cookie.trim().startsWith(`${NOMBRE_COOKIE}=`));
  return encontrada ? decodeURIComponent(encontrada.trim().slice(NOMBRE_COOKIE.length + 1)) : "";
}

export async function crearSesion(res, usuarioId, { recordar = false } = {}) {
  const token = randomBytes(32).toString("base64url");
  const hash = hashSesion(token);
  const diasConfigurados = Number.isFinite(configuracion.sessionDays) && configuracion.sessionDays > 0
    ? configuracion.sessionDays
    : 7;
  // "Recordarme" alarga la sesión y la guarda en el navegador. Sin marcarlo,
  // la cookie dura lo que la pestaña, aunque el servidor la conserve 7 días.
  const dias = recordar ? 30 : diasConfigurados;

  await pool.query(
    "INSERT INTO sesiones (id_hash, usuario_id, expira_en) VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 day'))",
    [hash, usuarioId, dias]
  );

  const atributos = [
    `${NOMBRE_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/"
  ];
  if (recordar) atributos.push(`Max-Age=${dias * 24 * 60 * 60}`);
  if (configuracion.cookieSecure) atributos.push("Secure");
  res.append("Set-Cookie", atributos.join("; "));
}

export async function obtenerUsuarioSesion(req) {
  const token = leerCookieSesion(req);
  if (!token) return null;

  const resultado = await pool.query(
    `SELECT u.id, u.nombre_usuario, u.email, u.rol
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id_hash = $1 AND s.expira_en > CURRENT_TIMESTAMP AND u.baneado = FALSE`,
    [hashSesion(token)]
  );

  return resultado.rows[0] || null;
}

export async function eliminarSesion(req, res) {
  const token = leerCookieSesion(req);
  if (token) await pool.query("DELETE FROM sesiones WHERE id_hash = $1", [hashSesion(token)]);
  const atributos = [`${NOMBRE_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Max-Age=0", "Path=/"];
  if (configuracion.cookieSecure) atributos.push("Secure");
  res.append("Set-Cookie", atributos.join("; "));
}

function hashSesion(token) {
  return createHash("sha256").update(token).digest("hex");
}
