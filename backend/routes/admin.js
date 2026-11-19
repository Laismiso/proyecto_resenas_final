import { Router } from "express";
import { pool } from "../config/database.js";
import { exigirAdmin, exigirSesion } from "../middleware/auth.js";

export const adminRouter = Router();

// Todas las rutas de este módulo exigen una sesión con rol de administrador.
adminRouter.use(exigirSesion, exigirAdmin);

const LIMITE_PREDETERMINADO = 10;
const LIMITE_MAXIMO = 100;

function idValido(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 ? numero : null;
}

function leerPaginacion(req) {
  const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
  const limite = Math.min(
    LIMITE_MAXIMO,
    Math.max(1, Number.parseInt(req.query.limite, 10) || LIMITE_PREDETERMINADO)
  );
  const buscar = String(req.query.buscar || "").trim().slice(0, 100);

  return { pagina, limite, buscar, offset: (pagina - 1) * limite };
}

// Escapa los comodines de ILIKE para que una búsqueda con % o _ no se
// convierta en un patrón accidental. El carácter ! es el escape elegido.
function patronBusqueda(texto) {
  return `%${texto.replace(/[!%_]/g, "!$&")}%`;
}

function paginacion(pagina, limite, total) {
  return {
    pagina,
    limite,
    total,
    totalPaginas: Math.max(1, Math.ceil(total / limite))
  };
}

adminRouter.get("/resumen", async (req, res, next) => {
  try {
    const resultado = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM usuarios)::int AS usuarios,
        (SELECT COUNT(*) FROM usuarios WHERE baneado = TRUE)::int AS suspendidos,
        (SELECT COUNT(*) FROM resenas)::int AS publicadas
    `);
    const fila = resultado.rows[0];

    res.json({
      resumen: {
        usuarios: fila.usuarios,
        suspendidos: fila.suspendidos,
        resenasPublicadas: fila.publicadas
      }
    });
  } catch (error) {
    next(error);
  }
});

// Lista las cuentas con su cantidad de reseñas activas. Acepta búsqueda por
// nombre o correo y devuelve una página, no la tabla completa.
adminRouter.get("/usuarios", async (req, res, next) => {
  try {
    const { pagina, limite, buscar, offset } = leerPaginacion(req);
    const parametros = [];
    let filtro = "";

    if (buscar) {
      parametros.push(patronBusqueda(buscar));
      filtro = "WHERE (u.nombre_usuario ILIKE $1 ESCAPE '!' OR u.email ILIKE $1 ESCAPE '!')";
    }

    parametros.push(limite, offset);
    const posicionLimite = parametros.length - 1;
    const posicionOffset = parametros.length;

    const resultado = await pool.query(
      `SELECT u.id, u.nombre_usuario, u.email, u.rol, u.baneado, u.fecha_registro,
              COUNT(r.id)::int AS total_resenas,
              CAST(COUNT(*) OVER() AS INTEGER) AS total
       FROM usuarios u
       LEFT JOIN resenas r ON r.usuario_id = u.id
       ${filtro}
       GROUP BY u.id
       ORDER BY u.id ASC
       LIMIT $${posicionLimite} OFFSET $${posicionOffset}`,
      parametros
    );

    const total = resultado.rows[0]?.total ?? 0;

    res.json({
      usuarios: resultado.rows.map((usuario) => ({
        id: usuario.id,
        nombreUsuario: usuario.nombre_usuario,
        email: usuario.email,
        rol: usuario.rol,
        baneado: usuario.baneado,
        fechaRegistro: usuario.fecha_registro,
        totalResenas: usuario.total_resenas
      })),
      paginacion: paginacion(pagina, limite, total)
    });
  } catch (error) {
    next(error);
  }
});

// Suspende o reactiva una cuenta. Al suspenderla se borran sus sesiones, de
// modo que deja de tener acceso de inmediato, incluso si tenía la pestaña
// abierta. Las cuentas administrativas quedan protegidas.
adminRouter.patch("/usuarios/:id/estado", async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    const baneado = req.body?.baneado;

    if (!id) return res.status(400).json({ error: "Usuario no válido." });
    if (typeof baneado !== "boolean") return res.status(400).json({ error: "Indica si la cuenta debe quedar suspendida." });
    if (id === req.usuario.id) return res.status(400).json({ error: "No puedes suspender tu propia cuenta." });

    const objetivo = await pool.query("SELECT id, nombre_usuario, rol FROM usuarios WHERE id = $1", [id]);
    if (objetivo.rowCount === 0) return res.status(404).json({ error: "El usuario no existe." });
    if (objetivo.rows[0].rol === "admin") {
      return res.status(400).json({ error: "Las cuentas administrativas no se pueden suspender desde el panel." });
    }

    const actualizado = await pool.query(
      `UPDATE usuarios
       SET baneado = $2::boolean,
           baneado_en = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
           baneado_por = CASE WHEN $2::boolean THEN $3::int ELSE NULL END
       WHERE id = $1
       RETURNING id, nombre_usuario, baneado`,
      [id, baneado, req.usuario.id]
    );

    if (baneado) await pool.query("DELETE FROM sesiones WHERE usuario_id = $1", [id]);

    res.json({
      usuario: {
        id: actualizado.rows[0].id,
        nombreUsuario: actualizado.rows[0].nombre_usuario,
        baneado: actualizado.rows[0].baneado
      }
    });
  } catch (error) {
    next(error);
  }
});

// Elimina una cuenta y, por las claves foráneas en cascada, sus reseñas y
// sesiones. Se protege la propia cuenta y las demás cuentas administrativas.
adminRouter.delete("/usuarios/:id", async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ error: "Usuario no válido." });
    if (id === req.usuario.id) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });

    const objetivo = await pool.query("SELECT id, rol FROM usuarios WHERE id = $1", [id]);
    if (objetivo.rowCount === 0) return res.status(404).json({ error: "El usuario no existe." });
    if (objetivo.rows[0].rol === "admin") {
      return res.status(400).json({ error: "Las cuentas administrativas no se pueden eliminar desde el panel." });
    }

    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Lista las reseñas publicadas con búsqueda, filtro por calificación y orden.
// El panel la usa para moderar el contenido sin traer toda la tabla.
adminRouter.get("/resenas", async (req, res, next) => {
  try {
    const { pagina, limite, buscar, offset } = leerPaginacion(req);
    const calificacion = [1, 2, 3, 4, 5].includes(Number(req.query.calificacion))
      ? Number(req.query.calificacion)
      : null;
    const orden = ["recientes", "antiguas", "mejor", "peor"].includes(req.query.orden)
      ? req.query.orden
      : "recientes";
    const condiciones = [];
    const parametros = [];

    if (buscar) {
      parametros.push(patronBusqueda(buscar));
      const posicion = parametros.length;
      condiciones.push(`(u.nombre_usuario ILIKE $${posicion} ESCAPE '!' OR p.nombre ILIKE $${posicion} ESCAPE '!' OR r.comentario ILIKE $${posicion} ESCAPE '!')`);
    }

    if (calificacion !== null) {
      parametros.push(calificacion);
      condiciones.push(`r.calificacion = $${parametros.length}`);
    }

    const ordenes = {
      recientes: "r.fecha_creacion DESC, r.id DESC",
      antiguas: "r.fecha_creacion ASC, r.id ASC",
      mejor: "r.calificacion DESC, r.fecha_creacion DESC, r.id DESC",
      peor: "r.calificacion ASC, r.fecha_creacion DESC, r.id DESC"
    };

    const filtro = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
    parametros.push(limite, offset);
    const posicionLimite = parametros.length - 1;
    const posicionOffset = parametros.length;

    const resultado = await pool.query(
      `SELECT r.id, r.calificacion, r.comentario, r.fecha_creacion,
              u.id AS usuario_id, u.nombre_usuario, u.email AS usuario_email,
              u.rol AS usuario_rol, u.baneado AS usuario_baneado,
              p.id AS restaurante_id, p.nombre AS restaurante_nombre,
              CAST(COUNT(*) OVER() AS INTEGER) AS total
       FROM resenas r
       JOIN usuarios u ON u.id = r.usuario_id
       JOIN restaurantes p ON p.id = r.restaurante_id
       ${filtro}
       ORDER BY ${ordenes[orden]}
       LIMIT $${posicionLimite} OFFSET $${posicionOffset}`,
      parametros
    );

    const total = resultado.rows[0]?.total ?? 0;

    res.json({
      resenas: resultado.rows.map((resena) => ({
        id: resena.id,
        calificacion: resena.calificacion,
        comentario: resena.comentario,
        fechaCreacion: resena.fecha_creacion,
        usuarioId: resena.usuario_id,
        nombreUsuario: resena.nombre_usuario,
        usuarioEmail: resena.usuario_email,
        usuarioRol: resena.usuario_rol,
        usuarioBaneado: resena.usuario_baneado,
        restauranteId: resena.restaurante_id,
        restauranteNombre: resena.restaurante_nombre
      })),
      paginacion: paginacion(pagina, limite, total),
      filtro: {
        buscar,
        calificacion: calificacion ?? "todas",
        orden
      }
    });
  } catch (error) {
    next(error);
  }
});

// Borrado definitivo de cualquier reseña. La fila sale de la base de datos y
// deja de existir para siempre; no se puede restaurar.
adminRouter.delete("/resenas/:id", async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ error: "Reseña no válida." });

    const resultado = await pool.query(
      `DELETE FROM resenas
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: "La reseña no existe." });
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
