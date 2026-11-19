import { Router } from "express";
import { pool } from "../config/database.js";
import { exigirSesion } from "../middleware/auth.js";
import { limitarSolicitudes } from "../middleware/rate-limit.js";
import { analizarLenguaje } from "../lib/filtro-lenguaje.js";
import { obtenerUsuarioSesion } from "../lib/sessions.js";

export const reviewsRouter = Router();

const MAXIMO_IMPORTACION = 50;

reviewsRouter.get("/restaurant/:restauranteId", async (req, res, next) => {
  try {
    const restauranteId = Number(req.params.restauranteId);
    if (!Number.isInteger(restauranteId) || restauranteId < 1) return res.status(400).json({ error: "Restaurante no válido." });

    // La sesión es opcional: solo sirve para decirle al navegador cuáles de
    // estas reseñas pertenecen a la persona que está mirando.
    const usuario = await obtenerUsuarioSesion(req);

    const resultado = await pool.query(
      `SELECT r.id, r.usuario_id, r.calificacion, r.comentario, r.fecha_creacion,
              u.nombre_usuario
       FROM resenas r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.restaurante_id = $1 AND r.eliminada = FALSE
       ORDER BY r.fecha_creacion DESC`,
      [restauranteId]
    );

    res.json({
      resenas: resultado.rows.map((resena) => ({
        id: resena.id,
        calificacion: resena.calificacion,
        comentario: resena.comentario,
        fecha_creacion: resena.fecha_creacion,
        nombre_usuario: resena.nombre_usuario,
        es_propia: Boolean(usuario && usuario.id === resena.usuario_id)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Reseñas publicadas en PostgreSQL para un lugar que viene de OpenStreetMap.
// El frontend las consulta con el tipo y el identificador del lugar, porque
// esos lugares no tienen id de catálogo: la resolución se hace contra el
// restaurante que la migración o el guardado directo creó con el mismo
// identificador de OSM.
reviewsRouter.get("/osm/:tipo/:osmId", async (req, res, next) => {
  try {
    const osmTipo = String(req.params.tipo || "").trim().toLowerCase();
    const osmId = Number(req.params.osmId);

    if (!["node", "way", "relation"].includes(osmTipo) || !Number.isSafeInteger(osmId) || osmId < 1) {
      return res.status(400).json({ error: "Lugar no válido." });
    }

    const restaurante = await pool.query(
      `SELECT id FROM restaurantes WHERE osm_tipo = $1 AND osm_id = $2 LIMIT 1`,
      [osmTipo, osmId]
    );

    if (restaurante.rowCount === 0) {
      return res.json({ restauranteId: null, resenas: [] });
    }

    const restauranteId = restaurante.rows[0].id;
    const usuario = await obtenerUsuarioSesion(req);

    const resultado = await pool.query(
      `SELECT r.id, r.usuario_id, r.calificacion, r.comentario, r.fecha_creacion, u.nombre_usuario
       FROM resenas r
       JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.restaurante_id = $1 AND r.eliminada = FALSE
       ORDER BY r.fecha_creacion DESC`,
      [restauranteId]
    );

    res.json({
      restauranteId,
      resenas: resultado.rows.map((resena) => ({
        id: resena.id,
        calificacion: resena.calificacion,
        comentario: resena.comentario,
        fecha_creacion: resena.fecha_creacion,
        nombre_usuario: resena.nombre_usuario,
        es_propia: Boolean(usuario && usuario.id === resena.usuario_id)
      }))
    });
  } catch (error) {
    next(error);
  }
});

reviewsRouter.post("/", exigirSesion, limitarSolicitudes("review-create", 20, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const restauranteId = Number(req.body?.restauranteId);
    const calificacion = Number(req.body?.calificacion);
    const comentario = String(req.body?.comentario || "").trim();

    if (!Number.isInteger(restauranteId) || restauranteId < 1) return res.status(400).json({ error: "Restaurante no válido." });
    if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) return res.status(400).json({ error: "La calificación debe estar entre 1 y 5." });
    if (comentario.length < 1 || comentario.length > 500) return res.status(400).json({ error: "El comentario debe tener entre 1 y 500 caracteres." });

    const revision = analizarLenguaje(comentario);
    if (revision.prohibido) {
      return res.status(400).json({
        error: "El comentario contiene lenguaje inapropiado. Corrígelo para poder publicar tu reseña.",
        palabras: revision.palabras
      });
    }

    const resultado = await pool.query(
      `INSERT INTO resenas (usuario_id, restaurante_id, calificacion, comentario)
       VALUES ($1, $2, $3, $4)
       RETURNING id, restaurante_id, calificacion, comentario, fecha_creacion`,
      [req.usuario.id, restauranteId, calificacion, comentario]
    );
    res.status(201).json({ resena: resultado.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ya tienes una reseña para este restaurante." });
    if (error.code === "23503") return res.status(404).json({ error: "El restaurante no existe." });
    next(error);
  }
});

// Importa reseñas guardadas en el navegador. Cada una puede venir asociada a
// un restaurante del catálogo (restauranteId) o a un lugar de OpenStreetMap
// (lugar). La respuesta es por elemento: una reseña mala no tumba las demás.
reviewsRouter.post("/importar", exigirSesion, limitarSolicitudes("review-import", 10, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const lista = req.body?.resenas;
    if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAXIMO_IMPORTACION) {
      return res.status(400).json({ error: `Envía entre 1 y ${MAXIMO_IMPORTACION} reseñas para importar.` });
    }

    const resultados = [];
    const cliente = await pool.connect();

    try {
      for (const item of lista) {
        const idLocal = typeof item?.idLocal === "string" ? item.idLocal.slice(0, 100) : null;
        try {
          await cliente.query("BEGIN");
          const resultado = await importarUnaResena(cliente, item, req.usuario.id);
          await cliente.query("COMMIT");
          resultados.push({ idLocal, ...resultado });
        } catch (error) {
          await cliente.query("ROLLBACK").catch(() => {});
          resultados.push({
            idLocal,
            estado: "omitida",
            motivo: mensajeErrorImportacion(error)
          });
        }
      }
    } finally {
      cliente.release();
    }

    const resumen = {
      importadas: resultados.filter((resultado) => resultado.estado === "importada").length,
      duplicadas: resultados.filter((resultado) => resultado.estado === "duplicada").length,
      omitidas: resultados.filter((resultado) => resultado.estado === "omitida").length
    };

    res.json({ resultados, resumen });
  } catch (error) {
    next(error);
  }
});

// Elimina una reseña propia de forma definitiva. La fila se borra de la base
// de datos y desaparece de la página; no queda una copia "fantasma" que haya
// que restaurar después. Devuelve 404 tanto si la reseña no existe como si
// pertenece a otro usuario, para no revelar qué reseñas existen.
reviewsRouter.delete("/:resenaId", exigirSesion, async (req, res, next) => {
  try {
    const resenaId = Number(req.params.resenaId);
    if (!Number.isInteger(resenaId) || resenaId < 1) {
      return res.status(400).json({ error: "Reseña no válida." });
    }

    const resultado = await pool.query(
      `DELETE FROM resenas
       WHERE id = $1 AND usuario_id = $2
       RETURNING id`,
      [resenaId, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: "La reseña no existe o no es tuya." });
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function importarUnaResena(cliente, item, usuarioId) {
  const calificacion = Number(item?.calificacion);
  const comentario = String(item?.comentario || "").trim();

  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return { estado: "omitida", motivo: "La calificación no está entre 1 y 5." };
  }
  if (comentario.length < 1 || comentario.length > 500) {
    return { estado: "omitida", motivo: "El comentario debe tener entre 1 y 500 caracteres." };
  }

  const revision = analizarLenguaje(comentario);
  if (revision.prohibido) {
    return { estado: "omitida", motivo: "El comentario contiene lenguaje inapropiado." };
  }

  const restauranteId = await resolverRestaurante(cliente, item);
  if (!restauranteId) {
    return { estado: "omitida", motivo: "No se pudo identificar el restaurante de esta reseña." };
  }

  const fecha = normalizarFecha(item?.fecha);
  const insertada = await cliente.query(
    `INSERT INTO resenas (usuario_id, restaurante_id, calificacion, comentario, fecha_creacion)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, CURRENT_TIMESTAMP))
     ON CONFLICT (usuario_id, restaurante_id) WHERE eliminada = FALSE DO NOTHING
     RETURNING id`,
    [usuarioId, restauranteId, calificacion, comentario, fecha]
  );

  if (insertada.rowCount === 0) {
    return {
      estado: "duplicada",
      restauranteId,
      motivo: "Ya tienes una reseña activa de este restaurante; la copia del navegador se puede borrar."
    };
  }

  return {
    estado: "importada",
    restauranteId,
    resenaId: insertada.rows[0].id
  };
}

async function resolverRestaurante(cliente, item) {
  const idCatalogo = Number(item?.restauranteId);
  if (Number.isInteger(idCatalogo) && idCatalogo >= 1) {
    const existe = await cliente.query("SELECT id FROM restaurantes WHERE id = $1", [idCatalogo]);
    return existe.rowCount > 0 ? existe.rows[0].id : null;
  }

  const lugar = item?.lugar;
  if (!lugar || typeof lugar !== "object") return null;

  const osmTipo = String(lugar.osmTipo || "").trim().toLowerCase();
  const osmId = Number(lugar.osmId);
  const nombre = String(lugar.nombre || "").trim().slice(0, 150);

  if (!["node", "way", "relation"].includes(osmTipo)) return null;
  if (!Number.isSafeInteger(osmId) || osmId < 1) return null;
  if (!nombre) return null;

  const direccion = String(lugar.direccion || "").trim().slice(0, 255);
  const categoria = String(lugar.categoria || "").trim().slice(0, 100);
  const telefono = String(lugar.telefono || "").trim().slice(0, 20);
  const latitud = Number(lugar.latitud);
  const longitud = Number(lugar.longitud);
  const coordenadasValidas = Number.isFinite(latitud) && Number.isFinite(longitud)
    && latitud >= -90 && latitud <= 90
    && longitud >= -180 && longitud <= 180;

  const resultado = await cliente.query(
    `INSERT INTO restaurantes (nombre, direccion, categoria, telefono, osm_tipo, osm_id, latitud, longitud)
     VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8)
     ON CONFLICT (osm_tipo, osm_id) WHERE osm_id IS NOT NULL
     DO UPDATE SET
       nombre = EXCLUDED.nombre,
       direccion = COALESCE(EXCLUDED.direccion, restaurantes.direccion),
       categoria = COALESCE(EXCLUDED.categoria, restaurantes.categoria),
       telefono = COALESCE(EXCLUDED.telefono, restaurantes.telefono),
       latitud = COALESCE(EXCLUDED.latitud, restaurantes.latitud),
       longitud = COALESCE(EXCLUDED.longitud, restaurantes.longitud)
     RETURNING id`,
    [
      nombre,
      direccion,
      categoria,
      telefono,
      osmTipo,
      osmId,
      coordenadasValidas ? latitud : null,
      coordenadasValidas ? longitud : null
    ]
  );

  return resultado.rows[0].id;
}

function normalizarFecha(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;

  const tiempo = fecha.getTime();
  const minimo = Date.UTC(2000, 0, 1);
  if (tiempo < minimo || tiempo > Date.now()) return null;
  return fecha.toISOString();
}

function mensajeErrorImportacion(error) {
  if (error.code === "23503") return "El restaurante ya no existe.";
  if (error.code === "23505") return "Ya existe un restaurante con esos datos.";
  return "No se pudo importar esta reseña.";
}
