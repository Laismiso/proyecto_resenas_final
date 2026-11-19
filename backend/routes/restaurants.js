import { Router } from "express";
import { pool } from "../config/database.js";
import { exigirSesion } from "../middleware/auth.js";
import { limitarSolicitudes } from "../middleware/rate-limit.js";

export const restaurantsRouter = Router();

restaurantsRouter.get("/", async (req, res, next) => {
  try {
    const texto = String(req.query.q || "").trim();
    const parametros = [];
    let filtro = "";

    if (texto) {
      parametros.push(`%${texto}%`);
      filtro = "WHERE nombre ILIKE $1 OR direccion ILIKE $1 OR categoria ILIKE $1";
    }

    const resultado = await pool.query(
      `SELECT id, nombre, direccion, categoria, telefono
       FROM restaurantes
       ${filtro}
       ORDER BY nombre ASC
       LIMIT 50`,
      parametros
    );
    res.json({ restaurantes: resultado.rows });
  } catch (error) {
    next(error);
  }
});

restaurantsRouter.post("/", exigirSesion, limitarSolicitudes("restaurant-create", 20, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const direccion = String(req.body?.direccion || "").trim();
    const categoria = String(req.body?.categoria || "").trim();
    const telefono = String(req.body?.telefono || "").trim();

    if (nombre.length < 1 || nombre.length > 150) return res.status(400).json({ error: "El nombre no es válido." });
    if (direccion.length > 255 || categoria.length > 100 || telefono.length > 20) return res.status(400).json({ error: "Uno de los campos supera su longitud permitida." });

    const resultado = await pool.query(
      `INSERT INTO restaurantes (nombre, direccion, categoria, telefono)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''))
       RETURNING id, nombre, direccion, categoria, telefono`,
      [nombre, direccion, categoria, telefono]
    );
    res.status(201).json({ restaurante: resultado.rows[0] });
  } catch (error) {
    next(error);
  }
});
