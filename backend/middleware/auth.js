import { obtenerUsuarioSesion } from "../lib/sessions.js";

export async function exigirSesion(req, res, next) {
  try {
    const usuario = await obtenerUsuarioSesion(req);
    if (!usuario) return res.status(401).json({ error: "Debes iniciar sesión." });
    req.usuario = usuario;
    next();
  } catch (error) {
    next(error);
  }
}

// Deja pasar únicamente a las cuentas con rol de administrador. Se usa
// siempre después de exigirSesion, cuando req.usuario ya existe.
export function exigirAdmin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: "Debes iniciar sesión." });
  if (req.usuario.rol !== "admin") {
    return res.status(403).json({ error: "Esta sección es solo para administradores." });
  }
  next();
}
