import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../backend/config/database.js";

const proyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directorioMigraciones = path.join(proyecto, "db", "migrations");
const archivos = (await fs.readdir(directorioMigraciones)).filter((archivo) => archivo.endsWith(".sql")).sort();

const conexion = await pool.connect();
try {
  await conexion.query("BEGIN");
  // La tabla de control se crea antes de aplicar migraciones para permitir
  // la primera ejecución en una base recién creada. Es idempotente.
  await conexion.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const archivo of archivos) {
    const yaAplicada = await conexion.query("SELECT 1 FROM schema_migrations WHERE version = $1", [archivo]);
    if (yaAplicada.rowCount > 0) {
      console.log(`Omitida: ${archivo}`);
      continue;
    }

    const sql = await fs.readFile(path.join(directorioMigraciones, archivo), "utf8");
    await conexion.query(sql);
    await conexion.query("INSERT INTO schema_migrations (version) VALUES ($1)", [archivo]);
    console.log(`Aplicada: ${archivo}`);
  }

  await conexion.query("COMMIT");
} catch (error) {
  await conexion.query("ROLLBACK");
  console.error("La migración fue revertida:", error.message);
  process.exitCode = 1;
} finally {
  conexion.release();
  await pool.end();
}
