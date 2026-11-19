import { pool } from "../backend/config/database.js";

try {
  const base = await pool.query("SELECT current_database() AS base, current_user AS usuario");
  const tablas = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const admin = await pool.query(`
    SELECT nombre_usuario, email, rol
    FROM usuarios
    WHERE nombre_usuario = 'admin'
  `);

  console.log(JSON.stringify({ base: base.rows[0], tablas: tablas.rows, admin: admin.rows }, null, 2));
} catch (error) {
  console.error("No se pudo verificar la base:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
