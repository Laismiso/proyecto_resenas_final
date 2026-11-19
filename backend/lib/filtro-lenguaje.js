// Filtro de lenguaje inapropiado para reseñas (lado del servidor).
// Aplica la misma regla que el navegador para que el envío no se pueda
// saltar desactivando JavaScript. Mantener lista sincronizada con
// js/filtro-lenguaje.js.

const PALABRAS_PROHIBIDAS = [
  "puta", "puto", "putas", "putos", "mierda", "pendejo", "pendeja",
  "pendejos", "pendejas", "carajo", "verga", "idiota", "idiotas",
  "imbecil", "imbeciles", "estupido", "estupida", "estupidos",
  "estupidas", "cabron", "cabrona", "cono", "coño", "joder", "jodido",
  "jodida", "maricon", "marica", "gilipollas", "bastardo", "bastarda",
  "chinga", "chingar", "zorra", "zorras", "malparido", "malparida",
  "hijueputa", "huevon", "huevona"
];

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/(.)\1+/g, "$1");
}

export function analizarLenguaje(texto) {
  const normalizado = normalizar(texto);
  const encontradas = [];

  for (const prohibida of PALABRAS_PROHIBIDAS) {
    const patron = new RegExp(`(^|[^a-z])${prohibida}([^a-z]|$)`, "i");
    if (patron.test(normalizado)) encontradas.push(prohibida);
  }

  return { prohibido: encontradas.length > 0, palabras: encontradas };
}
