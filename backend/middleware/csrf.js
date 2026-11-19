import { randomBytes, timingSafeEqual } from "node:crypto";

const NOMBRE_COOKIE = "sabor_resena_csrf";
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export function prepararCsrf(req, res, next) {
  if (!leerCookie(req, NOMBRE_COOKIE)) {
    const token = randomBytes(32).toString("base64url");
    res.append("Set-Cookie", `${NOMBRE_COOKIE}=${token}; SameSite=Lax; Max-Age=86400; Path=/`);
  }
  next();
}

export function exigirCsrf(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const cookie = leerCookie(req, NOMBRE_COOKIE);
  const encabezado = req.get("X-CSRF-Token") || "";
  const iguales = cookie && encabezado && cookie.length === encabezado.length
    && timingSafeEqual(Buffer.from(cookie), Buffer.from(encabezado));

  if (!iguales) return res.status(403).json({ error: "Token CSRF inválido o ausente." });
  next();
}

function leerCookie(req, nombre) {
  const cookies = req.headers.cookie?.split(";") || [];
  const encontrada = cookies.find((cookie) => cookie.trim().startsWith(`${nombre}=`));
  return encontrada ? decodeURIComponent(encontrada.trim().slice(nombre.length + 1)) : "";
}
