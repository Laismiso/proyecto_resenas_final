import test from "node:test";
import assert from "node:assert/strict";
import { crearHash, verificarHash } from "../backend/lib/passwords.js";

test("crea y verifica un hash scrypt nuevo", async () => {
  const hash = await crearHash("ClaveDePrueba_123");
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verificarHash("ClaveDePrueba_123", hash), true);
  assert.equal(await verificarHash("otra-clave", hash), false);
});

test("rechaza hashes inválidos", async () => {
  assert.equal(await verificarHash("clave", "invalido"), false);
});
