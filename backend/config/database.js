import pg from "pg";
import { configuracion } from "./env.js";

const { Pool } = pg;

if (!configuracion.databaseUrl) {
  throw new Error("Falta DATABASE_URL. Copia .env.example como .env y completa la conexión.");
}

export const pool = new Pool({
  connectionString: configuracion.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

export async function comprobarBaseDeDatos() {
  const resultado = await pool.query("SELECT current_database() AS base, current_user AS usuario");
  return resultado.rows[0];
}
