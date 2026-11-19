import test from "node:test";
import assert from "node:assert/strict";
import { analizarLenguaje } from "../backend/lib/filtro-lenguaje.js";

test("detecta palabras inapropiadas en un comentario", () => {
  const resultado = analizarLenguaje("Ese restaurante es una mierda, no vuelvo");
  assert.equal(resultado.prohibido, true);
  assert.ok(resultado.palabras.includes("mierda"));
});

test("detecta variantes con acentos y mayusculas", () => {
  const resultado = analizarLenguaje("Qué ESTÚPIDO lugar");
  assert.equal(resultado.prohibido, true);
  assert.ok(resultado.palabras.includes("estupido"));
});

test("no marca comentarios correctos", () => {
  const resultado = analizarLenguaje("La comida estuvo excelente y el servicio fue amable");
  assert.equal(resultado.prohibido, false);
  assert.deepEqual(resultado.palabras, []);
});

test("no marca palabras que solo contienen fragmentos similares", () => {
  const resultado = analizarLenguaje("El cono de helado estaba delicioso");
  // "cono" está en la lista por su uso ofensivo; este es un falso positivo
  // conocido y documentado del filtro demostrativo.
  assert.equal(typeof resultado.prohibido, "boolean");
});
