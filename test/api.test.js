// Pruebas de la API de punta a punta: registran un usuario único, crean un
// restaurante y recorren el ciclo completo de una reseña contra PostgreSQL.
//
// IMPORTANTE: estas pruebas necesitan que el servicio de PostgreSQL esté en
// ejecución y que .env tenga una DATABASE_URL válida. Para correr solo las
// pruebas que no dependen de la base (contraseñas y filtro de lenguaje):
//
//   node --test test/passwords.test.js test/filtro.test.js
//
// La limpieza del final elimina únicamente los datos que esta prueba creó,
// con consultas dirigidas; nunca toca datos de otros usuarios.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { app } from "../backend/app.js";
import { pool } from "../backend/config/database.js";
import { crearHash } from "../backend/lib/passwords.js";

let servidor;
let baseUrl;

// Tarro de cookies simple: guarda el último valor recibido de cada cookie.
const tarroCookies = new Map();

// Datos creados por la prueba; se limpian al final.
let usuarioPrueba = null;
let restaurantePrueba = null;
let resenaPrueba = null;
let adminPrueba = null;
let usuarioModeracion = null;
let restauranteModeracion = null;
let usuarioRecuperacion = null;
let usuarioImportacion = null;
const restaurantesImportados = [];

before(async () => {
  servidor = app.listen(0);
  await new Promise((resuelto) => servidor.once("listening", resuelto));
  const { port } = servidor.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resuelto) => servidor.close(resuelto));

  // Limpieza dirigida: solo las filas que esta prueba registró.
  const idsUsuarios = [usuarioPrueba?.id, adminPrueba?.id, usuarioModeracion?.id, usuarioRecuperacion?.id, usuarioImportacion?.id].filter(Number.isInteger);
  const idsRestaurantes = [restaurantePrueba?.id, restauranteModeracion?.id, ...restaurantesImportados].filter(Number.isInteger);

  await pool.query("DELETE FROM resenas WHERE usuario_id = ANY($1::int[]) OR restaurante_id = ANY($2::int[])", [idsUsuarios, idsRestaurantes]);
  await pool.query("DELETE FROM sesiones WHERE usuario_id = ANY($1::int[])", [idsUsuarios]);
  await pool.query("DELETE FROM usuarios WHERE id = ANY($1::int[])", [idsUsuarios]);
  await pool.query("DELETE FROM restaurantes WHERE id = ANY($1::int[])", [idsRestaurantes]);
  await pool.end();
});

// Registra en el tarro todas las cookies Set-Cookie de la respuesta.
// Cuando una misma cookie aparece varias veces (por ejemplo, la sesión se
// borra y se vuelve a crear en un mismo registro), gana la última.
function guardarCookies(respuesta) {
  for (const cookie of respuesta.headers.getSetCookie()) {
    const corte = cookie.indexOf("=");
    const fin = cookie.indexOf(";", corte);
    const nombre = cookie.slice(0, corte).trim();
    const valor = decodeURIComponent(cookie.slice(corte + 1, fin === -1 ? undefined : fin));
    tarroCookies.set(nombre, valor);
  }
}

// Arma el encabezado Cookie con las cookies que tengan valor.
function encabezadoCookie() {
  return [...tarroCookies.entries()]
    .filter(([, valor]) => valor)
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join("; ");
}

// Empieza una sesión limpia: borra el tarro y pide el token CSRF de nuevo.
function reiniciarCookies() {
  tarroCookies.clear();
}

// Solicitud JSON contra el servidor de la prueba. Agrega el token CSRF y las
// cookies en toda mutación, igual que lo hace el navegador real.
async function solicitar(metodo, ruta, cuerpo = undefined) {
  const encabezados = { cookie: encabezadoCookie() };

  if (cuerpo !== undefined) encabezados["content-type"] = "application/json";
  if (metodo !== "GET") encabezados["x-csrf-token"] = tarroCookies.get("sabor_resena_csrf") || "";

  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: encabezados,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });

  guardarCookies(respuesta);
  return respuesta;
}

test("las rutas protegidas rechazan solicitudes sin sesión (401)", async () => {
  // Primera visita: el servidor entrega el token CSRF en una cookie.
  await solicitar("GET", "/");

  const respuesta = await solicitar("POST", "/api/reviews", {
    restauranteId: 1,
    calificacion: 5,
    comentario: "No debería alcanzarme"
  });

  assert.equal(respuesta.status, 401);
});

test("ciclo completo: registro, restaurante, reseña y eliminación", async () => {
  const nombreUnico = `prueba_api_${Date.now().toString(36)}`;

  // 1. Registro del usuario de prueba. La respuesta crea su sesión.
  const registro = await solicitar("POST", "/api/auth/register", {
    nombreUsuario: nombreUnico,
    email: `${nombreUnico}@example.com`,
    contrasena: "PruebaApi_2026"
  });

  assert.equal(registro.status, 201);
  const datosRegistro = await registro.json();
  usuarioPrueba = datosRegistro.usuario;
  assert.equal(usuarioPrueba.nombreUsuario, nombreUnico);

  // 2. Crea un restaurante en el catálogo propio.
  const creacion = await solicitar("POST", "/api/restaurants", {
    nombre: `Restaurante de ${nombreUnico}`,
    direccion: "Calle de prueba #1-23",
    categoria: "Cafeteria",
    telefono: "5550001"
  });

  assert.equal(creacion.status, 201);
  restaurantePrueba = (await creacion.json()).restaurante;
  assert.ok(restaurantePrueba.id >= 1);

  // 3. El buscador del catálogo lo encuentra por texto.
  const busqueda = await solicitar("GET", `/api/restaurants?q=${encodeURIComponent(nombreUnico)}`);
  assert.equal(busqueda.status, 200);
  const encontrados = (await busqueda.json()).restaurantes;
  assert.ok(encontrados.some((restaurante) => restaurante.id === restaurantePrueba.id));

  // 4. El servidor también rechaza el lenguaje inapropiado (HTTP 400).
  const grosera = await solicitar("POST", "/api/reviews", {
    restauranteId: restaurantePrueba.id,
    calificacion: 2,
    comentario: "Un lugar idiota, no vuelvo"
  });

  assert.equal(grosera.status, 400);
  const datosGrosera = await grosera.json();
  assert.ok(datosGrosera.palabras.includes("idiota"));

  // 5. Una reseña limpia se guarda con éxito.
  const valida = await solicitar("POST", "/api/reviews", {
    restauranteId: restaurantePrueba.id,
    calificacion: 5,
    comentario: "Excelente atención en la prueba automatizada"
  });

  assert.equal(valida.status, 201);
  resenaPrueba = (await valida.json()).resena;
  assert.ok(resenaPrueba.id >= 1);

  // 6. Una segunda reseña del mismo usuario al mismo lugar se rechaza (409).
  const duplicada = await solicitar("POST", "/api/reviews", {
    restauranteId: restaurantePrueba.id,
    calificacion: 4,
    comentario: "Intento duplicado"
  });

  assert.equal(duplicada.status, 409);

  // 7. La reseña aparece en la lectura pública del restaurante.
  const lecturaUno = await solicitar("GET", `/api/reviews/restaurant/${restaurantePrueba.id}`);
  assert.equal(lecturaUno.status, 200);
  const visibles = (await lecturaUno.json()).resenas;
  assert.equal(visibles.length, 1);
  assert.equal(visibles[0].comentario, "Excelente atención en la prueba automatizada");

  // 8. El autor puede eliminar su reseña: borrado definitivo con respuesta 204.
  const borrado = await solicitar("DELETE", `/api/reviews/${resenaPrueba.id}`);
  assert.equal(borrado.status, 204);

  // La fila ya no existe en PostgreSQL: no queda una copia "fantasma".
  const enBase = await pool.query("SELECT COUNT(*)::int AS total FROM resenas WHERE id = $1", [resenaPrueba.id]);
  assert.equal(enBase.rows[0].total, 0);

  // 9. Tras el borrado, la reseña ya no aparece en la lectura.
  const lecturaDos = await solicitar("GET", `/api/reviews/restaurant/${restaurantePrueba.id}`);
  const visiblesDespues = (await lecturaDos.json()).resenas;
  assert.equal(visiblesDespues.length, 0);

  // 10. Eliminar de nuevo (o una reseña ajena) responde 404, no un error.
  const borradoRepetido = await solicitar("DELETE", `/api/reviews/${resenaPrueba.id}`);
  assert.equal(borradoRepetido.status, 404);

  // 11. Como la fila se borró de verdad, la misma persona puede volver a
  //     reseñar el restaurante sin chocar con una restricción vieja.
  const nuevaResena = await solicitar("POST", "/api/reviews", {
    restauranteId: restaurantePrueba.id,
    calificacion: 3,
    comentario: "Segunda opinión después de eliminar la anterior"
  });
  assert.equal(nuevaResena.status, 201);

  // 12. Cerrar sesión y comprobar que el servidor ya no la reconoce.
  const cierre = await solicitar("POST", "/api/auth/logout");
  assert.equal(cierre.status, 204);

  const estado = await solicitar("GET", "/api/auth/me");
  assert.equal(estado.status, 200);
  const datosEstado = await estado.json();
  assert.equal(datosEstado.usuario, null);
});

test("importación de reseñas locales de OpenStreetMap", async () => {
  const sufijo = Date.now().toString(36);
  const nombre = `prueba_osm_${sufijo}`;

  reiniciarCookies();
  await solicitar("GET", "/");

  const registro = await solicitar("POST", "/api/auth/register", {
    nombreUsuario: nombre,
    email: `${nombre}@example.com`,
    contrasena: "PruebaOsm_2026"
  });
  assert.equal(registro.status, 201);
  usuarioImportacion = (await registro.json()).usuario;

  const osmId = 900000000 + Math.floor(Math.random() * 90000000);
  const cuerpo = {
    resenas: [
      {
        idLocal: "local-1",
        lugar: {
          osmTipo: "node",
          osmId,
          nombre: `Lugar de prueba ${sufijo}`,
          direccion: "Carrera de prueba #10-20",
          categoria: "cafe",
          telefono: "5550002",
          latitud: 4.65,
          longitud: -74.05
        },
        calificacion: 5,
        comentario: "Reseña importada desde el navegador",
        fecha: "2026-01-15T12:00:00.000Z"
      },
      { idLocal: "local-2", calificacion: 9, comentario: "Calificación inválida" }
    ]
  };

  const primera = await solicitar("POST", "/api/reviews/importar", cuerpo);
  assert.equal(primera.status, 200);
  const resultadoPrimera = await primera.json();
  assert.equal(resultadoPrimera.resumen.importadas, 1);
  assert.equal(resultadoPrimera.resumen.omitidas, 1);

  const importada = resultadoPrimera.resultados.find((resultado) => resultado.estado === "importada");
  assert.ok(importada.restauranteId >= 1);
  restaurantesImportados.push(importada.restauranteId);

  // El mismo lugar de OpenStreetMap no se duplica y la reseña tampoco.
  const segunda = await solicitar("POST", "/api/reviews/importar", cuerpo);
  assert.equal(segunda.status, 200);
  const resultadoSegunda = await segunda.json();
  assert.equal(resultadoSegunda.resumen.duplicadas, 1);

  const lectura = await solicitar("GET", `/api/reviews/restaurant/${importada.restauranteId}`);
  assert.equal(lectura.status, 200);
  const resenas = (await lectura.json()).resenas;
  assert.equal(resenas.length, 1);
  assert.equal(resenas[0].es_propia, true);

  reiniciarCookies();
  await solicitar("GET", "/");
  const sinSesion = await solicitar("POST", "/api/reviews/importar", cuerpo);
  assert.equal(sinSesion.status, 401);
});

test("lectura de reseñas publicadas en PostgreSQL por lugar de OpenStreetMap", async () => {
  const sufijo = Date.now().toString(36);
  const osmId = 920000000 + Math.floor(Math.random() * 90000000);

  // Se crea el restaurante con el mismo identificador de OSM que tendría un
  // lugar descubierto en el mapa; la reseña viaja a la base con él.
  const restaurante = await pool.query(
    `INSERT INTO restaurantes (nombre, direccion, categoria, telefono, osm_tipo, osm_id, latitud, longitud)
     VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), 'node', $5, $6, $7)
     RETURNING id`,
    [`Lugar de prueba lectura ${sufijo}`, "Calle de lectura #4-56", "cafe", "5550003", osmId, 4.66, -74.04]
  );
  const restauranteId = restaurante.rows[0].id;
  restaurantesImportados.push(restauranteId);

  const resena = await pool.query(
    `INSERT INTO resenas (usuario_id, restaurante_id, calificacion, comentario)
     VALUES ($1, $2, $3, $4)`,
    [usuarioPrueba.id, restauranteId, 3, "Reseña publicada directamente en la base"]
  );

  const lectura = await solicitar("GET", `/api/reviews/osm/node/${osmId}`);
  assert.equal(lectura.status, 200);
  const datosLectura = await lectura.json();
  assert.equal(datosLectura.restauranteId, restauranteId);
  assert.equal(datosLectura.resenas.length, 1);
  assert.equal(datosLectura.resenas[0].calificacion, 3);

  const invalido = await solicitar("GET", "/api/reviews/osm/punto/12345");
  assert.equal(invalido.status, 400);
});

test("recuperación de contraseña con token de un solo uso", async () => {
  const sufijo = Date.now().toString(36);
  const nombre = `prueba_rec_${sufijo}`;
  const correo = `${nombre}@example.com`;
  const claveVieja = "ClaveVieja_2026";
  const claveNueva = "ClaveNueva_2026";

  reiniciarCookies();
  await solicitar("GET", "/");

  const registro = await solicitar("POST", "/api/auth/register", {
    nombreUsuario: nombre,
    email: correo,
    contrasena: claveVieja
  });
  assert.equal(registro.status, 201);
  usuarioRecuperacion = (await registro.json()).usuario;

  // La solicitud responde siempre lo mismo, exista o no el correo.
  const solicitud = await solicitar("POST", "/api/auth/recuperar", { email: correo });
  assert.equal(solicitud.status, 200);
  const mensaje = (await solicitud.json()).mensaje;
  assert.ok(mensaje.includes("Si el correo está registrado"));

  const desconocido = await solicitar("POST", "/api/auth/recuperar", { email: `nadie_${sufijo}@example.com` });
  assert.equal(desconocido.status, 200);
  assert.equal((await desconocido.json()).mensaje, mensaje);

  const guardados = await pool.query(
    "SELECT COUNT(*)::int AS total FROM recuperaciones_contrasena WHERE usuario_id = $1",
    [usuarioRecuperacion.id]
  );
  assert.equal(guardados.rows[0].total, 1);

  // Se simula el token que viajaría en el correo: en la base solo queda su hash.
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await pool.query("DELETE FROM recuperaciones_contrasena WHERE usuario_id = $1", [usuarioRecuperacion.id]);
  await pool.query(
    `INSERT INTO recuperaciones_contrasena (usuario_id, token_hash, expira_en)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
    [usuarioRecuperacion.id, hash]
  );

  const restablecer = await solicitar("POST", "/api/auth/restablecer", {
    token,
    contrasena: claveNueva
  });
  assert.equal(restablecer.status, 204);

  // El cambio cierra la sesión que estaba abierta.
  const estado = await solicitar("GET", "/api/auth/me");
  assert.equal((await estado.json()).usuario, null);

  // El mismo enlace ya no sirve.
  const repetido = await solicitar("POST", "/api/auth/restablecer", {
    token,
    contrasena: "OtraClave_2026"
  });
  assert.equal(repetido.status, 400);

  reiniciarCookies();
  await solicitar("GET", "/");

  const loginViejo = await solicitar("POST", "/api/auth/login", {
    identificador: nombre,
    contrasena: claveVieja
  });
  assert.equal(loginViejo.status, 401);

  const loginNuevo = await solicitar("POST", "/api/auth/login", {
    identificador: nombre,
    contrasena: claveNueva
  });
  assert.equal(loginNuevo.status, 200);
});

test("panel de administración: permisos, suspensión y moderación", async () => {
  const sufijo = Date.now().toString(36);
  const nombreVictima = `prueba_mod_${sufijo}`;
  const claveVictima = "PruebaMod_2026";
  const nombreAdmin = `admin_prueba_${sufijo}`;
  const claveAdmin = "AdminPrueba_2026";

  // 1. Una cuenta normal crea un restaurante y publica una reseña.
  reiniciarCookies();
  await solicitar("GET", "/");

  const registro = await solicitar("POST", "/api/auth/register", {
    nombreUsuario: nombreVictima,
    email: `${nombreVictima}@example.com`,
    contrasena: claveVictima
  });
  assert.equal(registro.status, 201);
  usuarioModeracion = (await registro.json()).usuario;

  const creacion = await solicitar("POST", "/api/restaurants", {
    nombre: `Restaurante moderación ${sufijo}`,
    direccion: "Calle de prueba #9-99",
    categoria: "Prueba"
  });
  assert.equal(creacion.status, 201);
  restauranteModeracion = (await creacion.json()).restaurante;

  const publicacion = await solicitar("POST", "/api/reviews", {
    restauranteId: restauranteModeracion.id,
    calificacion: 4,
    comentario: "Comentario creado para probar la moderación"
  });
  assert.equal(publicacion.status, 201);
  const resenaModeracion = (await publicacion.json()).resena;

  // 2. Una cuenta normal no puede entrar al panel.
  const sinPermiso = await solicitar("GET", "/api/admin/usuarios");
  assert.equal(sinPermiso.status, 403);

  // 3. Se crea una cuenta administradora de prueba y se inicia sesión.
  const hashAdmin = await crearHash(claveAdmin);
  const creado = await pool.query(
    `INSERT INTO usuarios (nombre_usuario, email, password_hash, rol)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, nombre_usuario`,
    [nombreAdmin, `${nombreAdmin}@example.com`, hashAdmin]
  );
  adminPrueba = creado.rows[0];

  reiniciarCookies();
  await solicitar("GET", "/");
  const loginAdmin = await solicitar("POST", "/api/auth/login", {
    identificador: nombreAdmin,
    contrasena: claveAdmin
  });
  assert.equal(loginAdmin.status, 200);

  // 4. El panel lista las cuentas y las reseñas.
  const listaUsuarios = await solicitar("GET", "/api/admin/usuarios");
  assert.equal(listaUsuarios.status, 200);
  const usuarios = (await listaUsuarios.json()).usuarios;
  assert.ok(usuarios.some((usuario) => usuario.id === usuarioModeracion.id));

  const listaResenas = await solicitar("GET", "/api/admin/resenas");
  assert.equal(listaResenas.status, 200);
  const resenas = (await listaResenas.json()).resenas;
  assert.ok(resenas.some((resena) => resena.id === resenaModeracion.id));

  // 4b. Búsqueda y paginación en el servidor: no se trae toda la tabla.
  const busquedaUsuarios = await solicitar("GET", `/api/admin/usuarios?buscar=${encodeURIComponent(nombreVictima)}&limite=1`);
  assert.equal(busquedaUsuarios.status, 200);
  const cuerpoBusqueda = await busquedaUsuarios.json();
  assert.equal(cuerpoBusqueda.usuarios.length, 1);
  assert.equal(cuerpoBusqueda.usuarios[0].id, usuarioModeracion.id);
  assert.equal(cuerpoBusqueda.paginacion.total, 1);
  assert.equal(cuerpoBusqueda.paginacion.limite, 1);

  const busquedaResenas = await solicitar("GET", `/api/admin/resenas?buscar=${encodeURIComponent("moderación")}`);
  assert.equal(busquedaResenas.status, 200);
  const cuerpoResenas = await busquedaResenas.json();
  assert.ok(cuerpoResenas.resenas.some((resena) => resena.id === resenaModeracion.id));

  // 4c. Filtro por calificación y orden, resueltos en el servidor. La reseña
  //     incluye los datos del autor que necesita la ventana de detalle.
  const filtroCalificacion = await solicitar(
    "GET",
    `/api/admin/resenas?buscar=${encodeURIComponent(nombreVictima)}&calificacion=4&orden=mejor`
  );
  assert.equal(filtroCalificacion.status, 200);
  const cuerpoFiltro = await filtroCalificacion.json();
  assert.equal(cuerpoFiltro.filtro.calificacion, 4);
  assert.equal(cuerpoFiltro.filtro.orden, "mejor");
  assert.equal(cuerpoFiltro.resenas.length, 1);
  assert.equal(cuerpoFiltro.resenas[0].id, resenaModeracion.id);
  assert.equal(cuerpoFiltro.resenas[0].usuarioEmail, `${nombreVictima}@example.com`);
  assert.equal(cuerpoFiltro.resenas[0].usuarioRol, "usuario");
  assert.equal(cuerpoFiltro.resenas[0].usuarioBaneado, false);

  // Los comodines de SQL se buscan como texto literal, no como patrón.
  const comodin = await solicitar("GET", `/api/admin/usuarios?buscar=${encodeURIComponent("%")}`);
  assert.equal((await comodin.json()).paginacion.total, 0);

  const resumen = await solicitar("GET", "/api/admin/resumen");
  assert.equal(resumen.status, 200);
  const datosResumen = (await resumen.json()).resumen;
  assert.ok(datosResumen.usuarios >= 2);
  assert.ok(datosResumen.resenasPublicadas >= 1);

  // 5. El administrador suspende a la cuenta: su sesión deja de valer y el
  //    inicio de sesión responde 403.
  const suspender = await solicitar("PATCH", `/api/admin/usuarios/${usuarioModeracion.id}/estado`, { baneado: true });
  assert.equal(suspender.status, 200);

  // El panel refleja el estado del autor en la misma lista de reseñas.
  const resenaConAutorSuspendido = await solicitar(
    "GET",
    `/api/admin/resenas?buscar=${encodeURIComponent(nombreVictima)}`
  );
  const cuerpoAutorSuspendido = await resenaConAutorSuspendido.json();
  assert.equal(cuerpoAutorSuspendido.resenas[0].usuarioBaneado, true);

  reiniciarCookies();
  await solicitar("GET", "/");
  const loginSuspendido = await solicitar("POST", "/api/auth/login", {
    identificador: nombreVictima,
    contrasena: claveVictima
  });
  assert.equal(loginSuspendido.status, 403);

  // 6. Moderación de la reseña: el administrador la borra definitivamente.
  reiniciarCookies();
  await solicitar("GET", "/");
  await solicitar("POST", "/api/auth/login", { identificador: nombreAdmin, contrasena: claveAdmin });

  const eliminarResena = await solicitar("DELETE", `/api/admin/resenas/${resenaModeracion.id}`);
  assert.equal(eliminarResena.status, 204);

  const lecturaEliminada = await solicitar("GET", `/api/reviews/restaurant/${restauranteModeracion.id}`);
  assert.equal((await lecturaEliminada.json()).resenas.length, 0);

  // La fila tampoco queda en PostgreSQL: no hay nada que restaurar.
  const enBaseAdmin = await pool.query("SELECT COUNT(*)::int AS total FROM resenas WHERE id = $1", [resenaModeracion.id]);
  assert.equal(enBaseAdmin.rows[0].total, 0);

  const restaurar = await solicitar("PATCH", `/api/admin/resenas/${resenaModeracion.id}/restaurar`);
  assert.equal(restaurar.status, 404);

  // 7. Se reactiva la cuenta y la persona puede volver a entrar.
  const reactivar = await solicitar("PATCH", `/api/admin/usuarios/${usuarioModeracion.id}/estado`, { baneado: false });
  assert.equal(reactivar.status, 200);

  reiniciarCookies();
  await solicitar("GET", "/");
  const loginReactivado = await solicitar("POST", "/api/auth/login", {
    identificador: nombreVictima,
    contrasena: claveVictima
  });
  assert.equal(loginReactivado.status, 200);

  // 8. El administrador no puede eliminar su propia cuenta.
  reiniciarCookies();
  await solicitar("GET", "/");
  await solicitar("POST", "/api/auth/login", { identificador: nombreAdmin, contrasena: claveAdmin });

  const autoEliminar = await solicitar("DELETE", `/api/admin/usuarios/${adminPrueba.id}`);
  assert.equal(autoEliminar.status, 400);

  // 9. Al eliminar la cuenta, sus reseñas desaparecen en cascada.
  const eliminarUsuario = await solicitar("DELETE", `/api/admin/usuarios/${usuarioModeracion.id}`);
  assert.equal(eliminarUsuario.status, 204);

  const lecturaFinal = await solicitar("GET", `/api/reviews/restaurant/${restauranteModeracion.id}`);
  assert.equal((await lecturaFinal.json()).resenas.length, 0);

  // 10. La cuenta eliminada ya no puede iniciar sesión.
  reiniciarCookies();
  await solicitar("GET", "/");
  const loginEliminado = await solicitar("POST", "/api/auth/login", {
    identificador: nombreVictima,
    contrasena: claveVictima
  });
  assert.equal(loginEliminado.status, 401);
});
