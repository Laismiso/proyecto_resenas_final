import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "../config/database.js";
import { configuracion } from "../config/env.js";
import { crearHash, verificarHash } from "../lib/passwords.js";
import { crearSesion, eliminarSesion, obtenerUsuarioSesion } from "../lib/sessions.js";
import { enviarCorreoRecuperacion } from "../lib/email.js";
import { limitarSolicitudes } from "../middleware/rate-limit.js";

export const authRouter = Router();

const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MENSAJE_RECUPERACION = "Si el correo está registrado, recibirás un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.";

function datosUsuario(usuario) {
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombre_usuario,
    email: usuario.email,
    rol: usuario.rol
  };
}

function hashRecuperacion(token) {
  return createHash("sha256").update(token).digest("hex");
}

authRouter.post("/register", limitarSolicitudes("register", 5, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const nombreUsuario = String(req.body?.nombreUsuario || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const contrasena = String(req.body?.contrasena || "");

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(nombreUsuario)) {
      return res.status(400).json({ error: "El nombre debe tener entre 3 y 50 caracteres: letras, números o guion bajo." });
    }
    if (!correoValido.test(email) || email.length > 255) {
      return res.status(400).json({ error: "Escribe un correo válido." });
    }
    if (contrasena.length < 8 || contrasena.length > 200) {
      return res.status(400).json({ error: "La contraseña debe tener entre 8 y 200 caracteres." });
    }

    const hash = await crearHash(contrasena);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, nombre_usuario, email, rol`,
      [nombreUsuario, email, hash]
    );

    await eliminarSesion(req, res);
    await crearSesion(res, resultado.rows[0].id);
    res.status(201).json({ usuario: datosUsuario(resultado.rows[0]) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "El nombre de usuario o correo ya está registrado." });
    next(error);
  }
});

authRouter.post("/login", limitarSolicitudes("login", 10, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const identificador = String(req.body?.identificador || "").trim().toLowerCase();
    const contrasena = String(req.body?.contrasena || "");
    const recordar = req.body?.recordarme === true;

    if (!identificador || !contrasena) return res.status(400).json({ error: "Completa el usuario o correo y la contraseña." });

    const resultado = await pool.query(
      `SELECT id, nombre_usuario, email, password_hash, rol, baneado
       FROM usuarios
       WHERE lower(nombre_usuario) = $1 OR lower(email) = $1
       ORDER BY CASE WHEN lower(nombre_usuario) = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [identificador]
    );
    const usuario = resultado.rows[0];

    if (!usuario || !(await verificarHash(contrasena, usuario.password_hash))) {
      return res.status(401).json({ error: "Las credenciales no son válidas." });
    }

    if (usuario.baneado) {
      return res.status(403).json({ error: "Tu cuenta está suspendida. Contacta con un administrador." });
    }

    await eliminarSesion(req, res);
    await crearSesion(res, usuario.id, { recordar });
    // Limpieza oportunista de sesiones vencidas; no toca sesiones válidas.
    await pool.query("DELETE FROM sesiones WHERE expira_en <= CURRENT_TIMESTAMP");
    res.json({ usuario: datosUsuario(usuario) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await eliminarSesion(req, res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const usuario = await obtenerUsuarioSesion(req);
    res.json({ usuario: usuario ? datosUsuario(usuario) : null });
  } catch (error) {
    next(error);
  }
});

// Solicita un enlace de recuperación. La respuesta es siempre la misma para
// no revelar si un correo está registrado.
authRouter.post("/recuperar", limitarSolicitudes("recuperar", 5, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!correoValido.test(email) || email.length > 255) {
      return res.status(400).json({ error: "Escribe un correo válido." });
    }

    const resultado = await pool.query(
      `SELECT id, nombre_usuario, email
       FROM usuarios
       WHERE lower(email) = $1 AND baneado = FALSE
       LIMIT 1`,
      [email]
    );

    if (resultado.rowCount > 0) {
      const usuario = resultado.rows[0];
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashRecuperacion(token);
      const minutos = Number.isFinite(configuracion.recoveryMinutes) && configuracion.recoveryMinutes > 0
        ? Math.min(configuracion.recoveryMinutes, 24 * 60)
        : 60;

      // Un enlace nuevo invalida los anteriores de esa misma cuenta.
      await pool.query("DELETE FROM recuperaciones_contrasena WHERE usuario_id = $1", [usuario.id]);
      await pool.query(
        `INSERT INTO recuperaciones_contrasena (usuario_id, token_hash, expira_en)
         VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'))`,
        [usuario.id, tokenHash, minutos]
      );
      await pool.query("DELETE FROM recuperaciones_contrasena WHERE expira_en < CURRENT_TIMESTAMP - INTERVAL '1 day'");

      const enlace = `${configuracion.appUrl}/restablecer.html?token=${encodeURIComponent(token)}`;

      try {
        await enviarCorreoRecuperacion({
          destinatario: usuario.email,
          nombreUsuario: usuario.nombre_usuario,
          enlace
        });
      } catch (error) {
        // No se informa del fallo al navegador para no filtrar datos de la
        // cuenta. El administrador puede verlo en la consola del servidor.
        console.error("No se pudo enviar el correo de recuperación:", error.message);
      }
    }

    res.json({ mensaje: MENSAJE_RECUPERACION });
  } catch (error) {
    next(error);
  }
});

// Cambia la contraseña usando el token de un solo uso. El token se guarda
// hasheado y se invalida junto con todas las sesiones abiertas.
authRouter.post("/restablecer", limitarSolicitudes("restablecer", 10, 15 * 60 * 1000), async (req, res, next) => {
  const token = String(req.body?.token || "").trim();
  const contrasena = String(req.body?.contrasena || "");

  if (token.length < 20 || token.length > 200) {
    return res.status(400).json({ error: "El enlace no es válido o ya venció. Solicita uno nuevo." });
  }
  if (contrasena.length < 8 || contrasena.length > 200) {
    return res.status(400).json({ error: "La contraseña debe tener entre 8 y 200 caracteres." });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    const encontrada = await cliente.query(
      `SELECT id, usuario_id
       FROM recuperaciones_contrasena
       WHERE token_hash = $1
         AND usado_en IS NULL
         AND expira_en > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [hashRecuperacion(token)]
    );

    if (encontrada.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({ error: "El enlace no es válido o ya venció. Solicita uno nuevo." });
    }

    const recuperacion = encontrada.rows[0];
    const nuevoHash = await crearHash(contrasena);

    await cliente.query("UPDATE usuarios SET password_hash = $1 WHERE id = $2", [nuevoHash, recuperacion.usuario_id]);
    await cliente.query(
      `UPDATE recuperaciones_contrasena
       SET usado_en = CURRENT_TIMESTAMP
       WHERE usuario_id = $1 AND usado_en IS NULL`,
      [recuperacion.usuario_id]
    );
    await cliente.query("DELETE FROM sesiones WHERE usuario_id = $1", [recuperacion.usuario_id]);

    await cliente.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
});
