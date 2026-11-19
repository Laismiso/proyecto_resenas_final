import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PARAMETROS = { N: 32_768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export async function crearHash(contrasena) {
  const salt = randomBytes(16).toString("base64url");
  const derivada = await scrypt(contrasena, salt, 64, PARAMETROS);
  return `scrypt$${PARAMETROS.N}$${PARAMETROS.r}$${PARAMETROS.p}$${salt}$${Buffer.from(derivada).toString("hex")}`;
}

export async function verificarHash(contrasena, hashGuardado) {
  const partes = String(hashGuardado).split("$");

  if (partes.length === 6 && partes[0] === "scrypt") {
    const [, n, r, p, salt, hashHex] = partes;
    return verificarScrypt(contrasena, salt, hashHex, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * 1024 * 1024
    });
  }

  if (partes.length === 3 && partes[0].startsWith("scrypt:")) {
    const [, salt, hashHex] = partes;
    const [, n, r, p] = partes[0].split(":");
    return verificarScrypt(contrasena, salt, hashHex, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * 1024 * 1024
    });
  }

  return false;
}

async function verificarScrypt(contrasena, salt, hashHex, parametros) {
  if (!Number.isInteger(parametros.N) || !Number.isInteger(parametros.r) || !Number.isInteger(parametros.p)) return false;
  if (!/^[0-9a-f]+$/i.test(hashHex) || hashHex.length % 2 !== 0) return false;

  const derivada = Buffer.from(await scrypt(contrasena, salt, hashHex.length / 2, parametros));
  const esperada = Buffer.from(hashHex, "hex");
  return derivada.length === esperada.length && timingSafeEqual(derivada, esperada);
}
