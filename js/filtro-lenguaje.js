// Filtro de lenguaje inapropiado para reseñas (lado del navegador).
// Se usa antes de enviar una reseña para avisar al usuario al instante.
// La lista es moderada y extensible; el servidor aplica su propia copia
// (backend/lib/filtro-lenguaje.js) para que la regla no se pueda saltar.
(function () {
  "use strict";

  // Palabras prohibidas escritas sin acentos; el texto se normaliza antes
  // de comparar, por lo que variantes con acentos también se detectan.
  const PALABRAS_PROHIBIDAS = [
    "puta", "puto", "putas", "putos", "mierda", "pendejo", "pendeja",
    "pendejos", "pendejas", "carajo", "verga", "idiota", "idiotas",
    "imbecil", "imbeciles", "estupido", "estupida", "estupidos",
    "estupidas", "cabron", "cabrona", "cono", "coño", "joder", "jodido",
    "jodida", "maricon", "marica", "gilipollas", "bastardo", "bastarda",
    "chinga", "chingar", "zorra", "zorras", "malparido", "malparida",
    "hijueputa", "huevon", "huevona"
  ];

  // Convierte el texto a minúsculas, quita acentos y traduce sustituciones
  // comunes (letras por números) para detectar engaños simples.
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

  // Devuelve { prohibido: booleano, palabras: [] } con las coincidencias.
  function analizar(texto) {
    const normalizado = normalizar(texto);
    const encontradas = [];

    for (const prohibida of PALABRAS_PROHIBIDAS) {
      const patron = new RegExp(`(^|[^a-z])${prohibida}([^a-z]|$)`, "i");
      if (patron.test(normalizado)) encontradas.push(prohibida);
    }

    return { prohibido: encontradas.length > 0, palabras: encontradas };
  }

  window.SaborFiltro = { analizar };
})();
