// Interacciones del frontend.
// La ubicación se usa durante la búsqueda y no se guarda.
let mapaActual = null;
let marcadorUbicacion = null;
let circuloPrecision = null;
let marcadoresRestaurantes = null;
let idSeguimiento = null;
let relojUbicacion = null;
let mejorPrecision = Infinity;
let ultimaPosicion = null;
let restaurantesActuales = [];
let numeroBusqueda = 0;
let numeroConsultaDireccion = 0;
let controladorRestaurantes = null;
let restauranteSeleccionado = null;
let estadoSesion = null;

const CLAVE_RESENAS = "sabor-resena-resenas";

document.addEventListener("DOMContentLoaded", () => {
  configurarMenu();
  avisarOrigenIncorrecto();
  configurarMostrarContrasena();
  configurarInicioSesion();
  configurarRegistro();
  configurarUbicacion();
  configurarDireccionManual();
  configurarBusquedaCatalogo();
  configurarAltaCatalogo();
  configurarResenas();
  configurarMigracionResenas();
  configurarEstadoSesion();
  configurarCierreSesion();
});

// Si la página se abrió desde un servidor estático, desde el disco o con la
// API caída, los formularios no pueden funcionar. En vez de adivinar el
// puerto, se pregunta al propio servidor y se avisa solo cuando no responde.
async function avisarOrigenIncorrecto() {
  if (document.querySelector(".aviso-origen")) return;

  if (window.location.protocol === "file:") {
    mostrarAvisoOrigen();
    return;
  }

  try {
    const respuesta = await fetch("/api/health", { cache: "no-store" });
    // Un 500 significa que el servidor sí está vivo, aunque la base falle.
    if (respuesta.ok || respuesta.status === 500) return;
  } catch (error) {
    // Sin respuesta: el servidor no está disponible en esta dirección.
  }

  mostrarAvisoOrigen();
}

function mostrarAvisoOrigen() {
  const aviso = document.createElement("p");
  aviso.className = "aviso-origen";
  aviso.textContent = "No se pudo conectar con el servidor de Sabor & Reseña. Abre la página desde la dirección donde está funcionando el servidor, por ejemplo http://127.0.0.1:3000, no desde un servidor estático ni desde el archivo del disco.";
  document.body.prepend(aviso);
}

function leerCookie(nombre) {
  const cookies = document.cookie.split(";");
  const encontrada = cookies.find((cookie) => cookie.trim().startsWith(`${nombre}=`));
  return encontrada ? decodeURIComponent(encontrada.trim().slice(nombre.length + 1)) : "";
}

async function enviarJson(url, datos) {
  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": leerCookie("sabor_resena_csrf")
      },
      credentials: "same-origin",
      body: JSON.stringify(datos)
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, estado: respuesta.status, datos: cuerpo };
  } catch (error) {
    return { ok: false, estado: 0, datos: { error: "No se pudo conectar con el servidor." } };
  }
}

function configurarMenu() {
  const boton = document.querySelector("#boton-menu");
  const menu = document.querySelector("#menu-principal");

  if (!boton || !menu) return;

  boton.addEventListener("click", () => {
    const menuAbierto = menu.classList.toggle("abierto");
    boton.setAttribute("aria-expanded", String(menuAbierto));
  });

  menu.querySelectorAll("a").forEach((enlace) => {
    enlace.addEventListener("click", () => {
      menu.classList.remove("abierto");
      boton.setAttribute("aria-expanded", "false");
    });
  });
}

function configurarMostrarContrasena() {
  document.querySelectorAll(".boton-contrasena").forEach((boton) => {
    boton.addEventListener("click", () => {
      const campo = document.querySelector(`#${boton.dataset.campo}`);
      if (!campo) return;

      const sePuedeLeer = campo.type === "text";
      campo.type = sePuedeLeer ? "password" : "text";
      boton.textContent = sePuedeLeer ? "👁" : "🙈";
      boton.setAttribute("aria-label", sePuedeLeer ? "Mostrar contraseña" : "Ocultar contraseña");
    });
  });
}

function configurarInicioSesion() {
  const formulario = document.querySelector("#formulario-inicio-sesion");
  const mensaje = document.querySelector("#mensaje-inicio-sesion");

  if (!formulario || !mensaje) return;

  // Si alguien llega desde la página de restablecimiento, se lo confirmamos.
  if (new URLSearchParams(window.location.search).get("recuperada") === "1") {
    mensaje.textContent = "Contraseña actualizada. Inicia sesión con tu nueva contraseña.";
  }

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    mensaje.textContent = "Comprobando tus datos...";
    mensaje.classList.remove("aviso-error");

    const datos = new FormData(formulario);
    const respuesta = await enviarJson("/api/auth/login", {
      identificador: datos.get("correo"),
      contrasena: datos.get("contrasena"),
      recordarme: datos.get("recordarme") === "on"
    });

    mensaje.textContent = respuesta.ok
      ? `Sesión iniciada como ${respuesta.datos.usuario.nombreUsuario}.`
      : respuesta.datos.error || "No se pudo iniciar sesión.";

    if (respuesta.ok) {
      formulario.reset();
      estadoSesion = respuesta.datos.usuario;
      mostrarSesionActiva();
    } else {
      mensaje.classList.add("aviso-error");
    }
  });
}

function mostrarSesionActiva() {
  const estado = document.querySelector("#estado-sesion");
  const texto = document.querySelector("#texto-sesion");
  if (!estado || !texto || !estadoSesion) return;

  texto.textContent = `Sesión iniciada como ${estadoSesion.nombreUsuario}.`;
  estado.hidden = false;

  // La cabecera y la tarjeta de cuenta también reflejan la sesión, para
  // que se note desde cualquier parte de la página y no solo en el bloque.
  const enlaceCabecera = document.querySelector(".encabezado-sitio .boton-inicio-sesion");
  if (enlaceCabecera) enlaceCabecera.textContent = `Hola, ${estadoSesion.nombreUsuario}`;

  const enlaceCrear = document.querySelector(".encabezado-sitio .boton-crear-cuenta");
  if (enlaceCrear) enlaceCrear.hidden = true;

  // Solo las cuentas administrativas ven el acceso al panel de control.
  const enlaceAdmin = document.querySelector("#enlace-admin");
  if (enlaceAdmin) enlaceAdmin.hidden = estadoSesion.rol !== "admin";

  const formulario = document.querySelector("#formulario-inicio-sesion");
  if (formulario) formulario.hidden = true;

  const pie = document.querySelector(".tarjeta-inicio-sesion .pie-inicio-sesion");
  if (pie) pie.hidden = true;

  const titulo = document.querySelector(".tarjeta-inicio-sesion .encabezado-formulario h2");
  const subtitulo = document.querySelector(".tarjeta-inicio-sesion .encabezado-formulario p");
  if (titulo) titulo.textContent = "Tu sesión";
  if (subtitulo) subtitulo.textContent = "Ya iniciaste sesión en este navegador.";

  // El formulario de reseña arranca con el nombre de la cuenta.
  const campoNombre = document.querySelector("#nombre-resena");
  if (campoNombre && !campoNombre.value) campoNombre.value = estadoSesion.nombreUsuario;

  // Si hay un detalle abierto, el aviso cambia a "se guarda en PostgreSQL".
  if (restauranteSeleccionado) {
    if (esRestaurantePropio(restauranteSeleccionado.id)) {
      actualizarAvisoResenas(estadoSesion ? "base" : "catalogo-sin-sesion");
    } else if (esLugarOpenStreetMap(restauranteSeleccionado)) {
      actualizarAvisoResenas(estadoSesion ? "base-osm" : "local");
    } else {
      actualizarAvisoResenas("local");
    }
  }

  actualizarMigracionResenas();
}

// Devuelve la interfaz a su estado sin sesión (tras cerrar sesión).
function mostrarSesionInactiva() {
  const estado = document.querySelector("#estado-sesion");
  const texto = document.querySelector("#texto-sesion");
  if (estado) estado.hidden = true;
  if (texto) texto.textContent = "";

  const enlaceCabecera = document.querySelector(".encabezado-sitio .boton-inicio-sesion");
  if (enlaceCabecera) enlaceCabecera.textContent = "Iniciar sesión";

  const enlaceCrear = document.querySelector(".encabezado-sitio .boton-crear-cuenta");
  if (enlaceCrear) enlaceCrear.hidden = false;

  const enlaceAdmin = document.querySelector("#enlace-admin");
  if (enlaceAdmin) enlaceAdmin.hidden = true;

  const formulario = document.querySelector("#formulario-inicio-sesion");
  if (formulario) formulario.hidden = false;

  const pie = document.querySelector(".tarjeta-inicio-sesion .pie-inicio-sesion");
  if (pie) pie.hidden = false;

  const titulo = document.querySelector(".tarjeta-inicio-sesion .encabezado-formulario h2");
  const subtitulo = document.querySelector(".tarjeta-inicio-sesion .encabezado-formulario p");
  if (titulo) titulo.textContent = "Iniciar sesión";
  if (subtitulo) subtitulo.textContent = "Accede a tu cuenta de Sabor & Reseña.";

  // Sin sesión, una reseña de catálogo ya no puede ir a PostgreSQL.
  if (restauranteSeleccionado) {
    if (esRestaurantePropio(restauranteSeleccionado.id)) {
      actualizarAvisoResenas("catalogo-sin-sesion");
    } else if (esLugarOpenStreetMap(restauranteSeleccionado)) {
      actualizarAvisoResenas("local");
    } else {
      actualizarAvisoResenas("local");
    }
  }

  actualizarMigracionResenas();
}

function configurarRegistro() {
  const formulario = document.querySelector("#formulario-registro");
  const mensaje = document.querySelector("#mensaje-registro");
  const contrasena = document.querySelector("#contrasena-registro");
  const confirmarContrasena = document.querySelector("#confirmar-contrasena");

  if (!formulario || !mensaje || !contrasena || !confirmarContrasena) return;

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();

    if (contrasena.value !== confirmarContrasena.value) {
      mensaje.textContent = "Las contraseñas no coinciden.";
      return;
    }

    const datos = new FormData(formulario);
    mensaje.textContent = "Creando tu cuenta...";

    enviarJson("/api/auth/register", {
      nombreUsuario: datos.get("nombre-usuario"),
      email: datos.get("correo"),
      contrasena: datos.get("contrasena")
    }).then((respuesta) => {
      if (!respuesta.ok) {
        mensaje.textContent = respuesta.datos.error
          || `No se pudo crear la cuenta: el servidor respondió algo inesperado (HTTP ${respuesta.estado || "desconocido"}). Verifica que la dirección del navegador sea http://127.0.0.1:3000/registro.html y recarga con Ctrl+Shift+R.`;
        return;
      }

      // Cuenta creada y con sesión activa: la página principal muestra
      // el estado de la sesión y las reseñas conectadas a la base.
      mensaje.textContent = `Cuenta creada para ${respuesta.datos.usuario.nombreUsuario}. Llevando a la página principal...`;
      formulario.reset();
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    });
  });
}

async function configurarEstadoSesion() {
  const estado = document.querySelector("#estado-sesion");
  const texto = document.querySelector("#texto-sesion");
  const botonCerrar = document.querySelector("#boton-cerrar-sesion");

  if (!estado || !texto || !botonCerrar) return;

  // Consulta si hay una sesión activa en el servidor.
  try {
    const respuesta = await fetch("/api/auth/me", { credentials: "same-origin" });
    const cuerpo = await respuesta.json().catch(() => ({}));
    estadoSesion = cuerpo.usuario || null;
  } catch (error) {
    estadoSesion = null;
  }

  if (estadoSesion) mostrarSesionActiva();
}

function configurarCierreSesion() {
  const botonCerrar = document.querySelector("#boton-cerrar-sesion");
  const mensaje = document.querySelector("#mensaje-inicio-sesion");

  if (!botonCerrar) return;

  botonCerrar.addEventListener("click", async () => {
    await enviarJson("/api/auth/logout", {});

    estadoSesion = null;
    mostrarSesionInactiva();
    if (mensaje) mensaje.textContent = "Sesión cerrada correctamente.";
  });
}

// Una reseña local se puede llevar a PostgreSQL si apunta a un restaurante
// del catálogo o si guarda la identidad de un lugar de OpenStreetMap.
function esResenaMigrable(resena) {
  const idCatalogo = Number(resena?.idRestaurante);
  if (Number.isInteger(idCatalogo) && idCatalogo >= 1) return true;

  const lugar = resena?.lugar;
  if (!lugar) return false;

  const osmId = Number(lugar.osmId);
  const osmTipo = String(lugar.osmTipo || "").toLowerCase();
  return Number.isSafeInteger(osmId) && osmId >= 1 && ["node", "way", "relation"].includes(osmTipo);
}

function configurarMigracionResenas() {
  const boton = document.querySelector("#boton-migrar-resenas");
  if (!boton) return;

  boton.addEventListener("click", migrarResenasLocales);
}

function actualizarMigracionResenas() {
  const contenedor = document.querySelector("#migracion-resenas");
  const boton = document.querySelector("#boton-migrar-resenas");
  const ayuda = document.querySelector("#texto-migracion");
  if (!contenedor || !boton) return;

  const totalLocal = leerResenas().length;
  const migrables = leerResenas().filter(esResenaMigrable).length;

  if (!estadoSesion || migrables === 0) {
    contenedor.hidden = true;
    return;
  }

  contenedor.hidden = false;
  boton.disabled = false;
  boton.textContent = `Migrar ${migrables} ${migrables === 1 ? "reseña" : "reseñas"} a PostgreSQL`;
  if (ayuda) {
    ayuda.textContent = totalLocal > migrables
      ? `${migrables} de ${totalLocal} reseñas guardadas se pueden migrar. Las más antiguas no guardan los datos del lugar; ábrelas otra vez desde el mapa para completarlos.`
      : "Se guardarán en PostgreSQL asociadas a tu cuenta. Las que ya existan allí se quitarán de este navegador.";
  }
}

async function migrarResenasLocales() {
  const boton = document.querySelector("#boton-migrar-resenas");
  const mensaje = document.querySelector("#mensaje-migracion");

  if (!estadoSesion) {
    if (mensaje) mensaje.textContent = "Inicia sesión para migrar las reseñas a PostgreSQL.";
    return;
  }

  const migrables = leerResenas().filter(esResenaMigrable);
  if (migrables.length === 0) {
    if (mensaje) mensaje.textContent = "No hay reseñas del navegador que se puedan migrar.";
    return;
  }

  if (!window.confirm(`Se importarán ${migrables.length} ${migrables.length === 1 ? "reseña" : "reseñas"} a PostgreSQL. Las que ya tengas publicadas allí se quitarán de este navegador. ¿Continuar?`)) {
    return;
  }

  if (boton) {
    boton.disabled = true;
    boton.textContent = "Migrando...";
  }
  if (mensaje) {
    mensaje.textContent = "Guardando las reseñas en PostgreSQL...";
    mensaje.classList.remove("aviso-error");
  }

  // El servidor acepta hasta 50 por solicitud. Si el navegador tiene más,
  // se envían por lotes para no perder las que queden fuera.
  const TAMANO_LOTE = 50;
  const resumen = { importadas: 0, duplicadas: 0, omitidas: 0 };

  for (let inicio = 0; inicio < migrables.length; inicio += TAMANO_LOTE) {
    const lote = migrables.slice(inicio, inicio + TAMANO_LOTE);
    const cuerpo = {
      resenas: lote.map((resena) => ({
        idLocal: resena.id,
        restauranteId: esRestaurantePropio(resena.idRestaurante) ? Number(resena.idRestaurante) : undefined,
        lugar: resena.lugar || undefined,
        calificacion: resena.calificacion,
        comentario: resena.comentario,
        fecha: resena.fecha
      }))
    };

    if (boton) {
      boton.textContent = `Migrando ${inicio + 1}-${inicio + lote.length} de ${migrables.length}...`;
    }

    const respuesta = await enviarJson("/api/reviews/importar", cuerpo);

    if (!respuesta.ok) {
      if (mensaje) {
        mensaje.textContent = respuesta.datos?.error || "No se pudieron migrar las reseñas.";
        mensaje.classList.add("aviso-error");
      }
      actualizarMigracionResenas();
      return;
    }

    const resultados = respuesta.datos.resultados || [];
    const idsQuitados = new Set(
      resultados
        .filter((resultado) => resultado.estado === "importada" || resultado.estado === "duplicada")
        .map((resultado) => resultado.idLocal)
        .filter(Boolean)
    );

    if (idsQuitados.size > 0) {
      guardarResenas(leerResenas().filter((resena) => !idsQuitados.has(resena.id)));
    }

    const parcial = respuesta.datos.resumen || {};
    resumen.importadas += parcial.importadas || 0;
    resumen.duplicadas += parcial.duplicadas || 0;
    resumen.omitidas += parcial.omitidas || 0;
  }

  if (mensaje) {
    const partes = [
      `${resumen.importadas} importada(s)`,
      `${resumen.duplicadas} que ya estaban en PostgreSQL`,
      `${resumen.omitidas} omitida(s)`
    ];
    mensaje.textContent = `Migración terminada: ${partes.join(", ")}.`;
    mensaje.classList.toggle("aviso-error", resumen.omitidas > 0);
  }

  actualizarMigracionResenas();
  if (restauranteSeleccionado) mostrarResenas(restauranteSeleccionado.id);
}

function configurarUbicacion() {
  const boton = document.querySelector("#boton-ubicacion");
  const mensaje = document.querySelector("#mensaje-ubicacion");
  const zona = document.querySelector("#zona-ubicacion");
  const precision = document.querySelector("#precision-ubicacion");
  const coordenadas = document.querySelector("#coordenadas-ubicacion");
  const direccion = document.querySelector("#direccion-ubicacion");
  const lista = document.querySelector("#lista-restaurantes");

  if (!boton || !mensaje || !zona || !precision || !coordenadas || !direccion || !lista) return;

  lista.addEventListener("click", (evento) => {
    const botonReintentar = evento.target.closest("[data-reintentar-restaurantes]");
    if (botonReintentar && ultimaPosicion) {
      buscarRestaurantes(ultimaPosicion.coords.latitude, ultimaPosicion.coords.longitude, lista);
      return;
    }

    const botonDetalle = evento.target.closest("[data-restaurante-id]");
    if (!botonDetalle) return;

    const restaurante = restaurantesActuales.find(
      (elemento) => elemento.id === botonDetalle.dataset.restauranteId
    );

    if (restaurante) mostrarDetalle(restaurante);
  });

  boton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      mensaje.textContent = "Este navegador no permite obtener la ubicación.";
      return;
    }

    detenerSeguimiento();
    const busquedaActual = ++numeroBusqueda;
    mejorPrecision = Infinity;
    ultimaPosicion = null;
    restaurantesActuales = [];
    if (typeof L === "undefined") {
      mensaje.textContent = "No se pudo cargar el mapa. Revisa tu conexión e inténtalo de nuevo.";
      return;
    }

    boton.disabled = true;
    boton.textContent = "Buscando ubicación...";
    mensaje.textContent = "Buscando la señal más precisa. Puede tardar unos segundos.";
    zona.hidden = false;
    ocultarDetalle();
    lista.innerHTML = "<h3>Restaurantes cercanos</h3><p class=\"cargando-restaurantes\">Esperando una ubicación más precisa...</p>";

    idSeguimiento = navigator.geolocation.watchPosition(
      (posicion) => {
        if (busquedaActual === numeroBusqueda) {
          recibirPosicion(posicion, boton, mensaje, precision, coordenadas, direccion, lista);
        }
      },
      (error) => {
        if (busquedaActual === numeroBusqueda) mostrarErrorUbicacion(error, boton, mensaje);
      },
      { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 }
    );

    relojUbicacion = setTimeout(
      () => finalizarUbicacion(boton, mensaje, precision, coordenadas, direccion, lista, busquedaActual),
      15000
    );
  });
}

function configurarDireccionManual() {
  const boton = document.querySelector("#boton-direccion-manual");
  const campo = document.querySelector("#direccion-manual");
  const mensaje = document.querySelector("#mensaje-direccion-manual");
  const zona = document.querySelector("#zona-ubicacion");
  const precision = document.querySelector("#precision-ubicacion");
  const coordenadas = document.querySelector("#coordenadas-ubicacion");
  const direccion = document.querySelector("#direccion-ubicacion");
  const lista = document.querySelector("#lista-restaurantes");

  if (!boton || !campo || !mensaje || !zona || !precision || !coordenadas || !direccion || !lista) return;

  boton.addEventListener("click", () => {
    const texto = campo.value.trim();

    if (!texto) {
      mensaje.textContent = "Escribe una dirección antes de buscar.";
      return;
    }

    if (typeof L === "undefined") {
      mensaje.textContent = "No se pudo cargar el mapa. Revisa tu conexión e inténtalo de nuevo.";
      return;
    }

    boton.disabled = true;
    mensaje.textContent = "Buscando esa dirección...";

    const consulta = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(texto)}`;
    const busquedaActual = ++numeroBusqueda;

    fetch(consulta, { headers: { Accept: "application/json" } })
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error("No se encontró la dirección");
        return respuesta.json();
      })
      .then((lugares) => {
        if (busquedaActual !== numeroBusqueda) return;
        if (!lugares.length) throw new Error("No se encontró la dirección");

        const lugar = lugares[0];
        const latitud = Number(lugar.lat);
        const longitud = Number(lugar.lon);

        if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
          throw new Error("La ubicación recibida no es válida");
        }

        const posicion = { coords: { latitude: latitud, longitude: longitud, accuracy: 100 } };

        detenerSeguimiento();
        ultimaPosicion = posicion;
        mejorPrecision = 100;
        zona.hidden = false;
        actualizarMapa(posicion, precision, coordenadas);
        precision.textContent = "Punto aproximado obtenido desde la dirección escrita";
        coordenadas.textContent = `Coordenadas: ${latitud.toFixed(6)}, ${longitud.toFixed(6)}`;
        direccion.textContent = `Dirección aproximada: ${lugar.display_name || texto}`;
        mensaje.textContent = "Usando una ubicación aproximada. Revisa el punto en el mapa.";
        buscarRestaurantes(latitud, longitud, lista);
      })
      .catch(() => {
        if (busquedaActual === numeroBusqueda) {
          mensaje.textContent = "No encontramos esa dirección. Agrega ciudad y país.";
        }
      })
      .finally(() => {
        if (busquedaActual === numeroBusqueda) boton.disabled = false;
      });
  });
}

// Buscador del catálogo propio en una ventana emergente: consulta la API con
// el texto escrito y muestra los resultados en una lista aparte, sin depender
// de la ubicación. Con la búsqueda vacía, la API devuelve el catálogo completo.
function configurarBusquedaCatalogo() {
  const campo = document.querySelector("#busqueda-catalogo");
  const boton = document.querySelector("#boton-busqueda-catalogo");
  const mensaje = document.querySelector("#mensaje-busqueda-catalogo");
  const lista = document.querySelector("#lista-catalogo");
  const dialogo = document.querySelector("#dialogo-catalogo");
  const abrir = document.querySelector("#boton-abrir-catalogo");
  const cerrar = document.querySelector("#boton-cerrar-catalogo");

  if (!campo || !boton || !mensaje || !lista || !dialogo || !abrir || !cerrar) return;

  async function buscar() {
    const texto = campo.value.trim();

    boton.disabled = true;
    mensaje.textContent = "Buscando en el catálogo...";

    try {
      const respuesta = await fetch(`/api/restaurants?q=${encodeURIComponent(texto)}`);
      if (!respuesta.ok) throw new Error("El catálogo no respondió correctamente.");
      const cuerpo = await respuesta.json().catch(() => ({}));
      const restaurantes = cuerpo.restaurantes || [];

      mensaje.textContent = restaurantes.length === 0
        ? (texto
            ? "No hay coincidencias con esa búsqueda en el catálogo."
            : "El catálogo está vacío todavía. Añade el primer restaurante abajo.")
        : (texto
            ? `${restaurantes.length} ${restaurantes.length === 1 ? "coincidencia" : "coincidencias"} en el catálogo.`
            : `El catálogo tiene ${restaurantes.length} ${restaurantes.length === 1 ? "restaurante" : "restaurantes"}.`);

      lista.replaceChildren();

      if (restaurantes.length === 0) {
        lista.hidden = true;
        return;
      }

      restaurantes.forEach((restaurante) => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "tarjeta-restaurante";
        tarjeta.appendChild(construirTarjetaCatalogo(restaurante));
        lista.appendChild(tarjeta);
      });
      lista.hidden = false;
    } catch (error) {
      mensaje.textContent = "No se pudo consultar el catálogo. Inténtalo de nuevo.";
      lista.hidden = true;
    } finally {
      boton.disabled = false;
    }
  }

  boton.addEventListener("click", buscar);
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      buscar();
    }
  });

  // La búsqueda vive en una ventana emergente; al abrirla se muestra el
  // catálogo completo y el cursor queda listo en el campo de búsqueda.
  abrir.addEventListener("click", () => {
    if (dialogo.open) return;
    dialogo.showModal();
    buscar();
    campo.focus();
  });

  cerrar.addEventListener("click", () => dialogo.close());

  // Un clic fuera de la ventana (sobre el fondo oscuro) también la cierra.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });
}

// Alta de restaurantes en el catálogo propio, en una ventana emergente.
// Requiere sesión: la API los guarda en PostgreSQL y desde entonces sus
// reseñas también viven ahí.
function configurarAltaCatalogo() {
  const formulario = document.querySelector("#formulario-alta-catalogo");
  const mensaje = document.querySelector("#mensaje-alta-catalogo");
  const dialogo = document.querySelector("#dialogo-alta-catalogo");
  const abrir = document.querySelector("#boton-abrir-alta-catalogo");
  const cerrar = document.querySelector("#boton-cerrar-alta-catalogo");

  if (!formulario || !mensaje || !dialogo || !abrir || !cerrar) return;

  abrir.addEventListener("click", () => {
    if (!estadoSesion) {
      const aviso = document.querySelector("#mensaje-busqueda-catalogo");
      if (aviso) aviso.textContent = "Inicia sesión para añadir restaurantes al catálogo.";
      return;
    }

    mensaje.textContent = "";
    if (!dialogo.open) dialogo.showModal();
  });

  cerrar.addEventListener("click", () => dialogo.close());

  // Un clic fuera de la ventana (sobre el fondo oscuro) también la cierra.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (!estadoSesion) {
      mensaje.textContent = "Inicia sesión para añadir restaurantes al catálogo.";
      return;
    }

    const datos = new FormData(formulario);
    const nombre = String(datos.get("nombre") || "").trim();
    const direccion = String(datos.get("direccion") || "").trim();
    const categoria = String(datos.get("categoria") || "").trim();
    const telefono = String(datos.get("telefono") || "").trim();

    if (!nombre) {
      mensaje.textContent = "Escribe el nombre del restaurante.";
      return;
    }

    mensaje.textContent = "Guardando en el catálogo...";

    const respuesta = await enviarJson("/api/restaurants", {
      nombre,
      direccion,
      categoria,
      telefono
    });

    if (!respuesta.ok) {
      mensaje.textContent = respuesta.datos.error || "No se pudo guardar el restaurante.";
      return;
    }

    formulario.reset();
    mensaje.textContent = `"${respuesta.datos.restaurante.nombre}" se añadió al catálogo.`;

    // Cierra la ventana y refresca la búsqueda para que aparezca de una.
    setTimeout(() => {
      if (dialogo.open) dialogo.close();

      const botonBuscar = document.querySelector("#boton-busqueda-catalogo");
      if (botonBuscar) botonBuscar.click();
    }, 900);
  });
}

function configurarResenas() {
  const formulario = document.querySelector("#formulario-resena");
  const mensaje = document.querySelector("#mensaje-resena");
  const lista = document.querySelector("#lista-resenas");

  if (!formulario || !mensaje || !lista) return;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (!restauranteSeleccionado) {
      mensaje.textContent = "Primero selecciona un restaurante.";
      return;
    }

    const datos = new FormData(formulario);
    const nombre = String(datos.get("nombre") || "").trim();
    const comentario = String(datos.get("comentario") || "").trim();
    const calificacion = Number(datos.get("calificacion"));

    if (!nombre || !comentario || !Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
      mensaje.textContent = "Completa todos los campos de la reseña.";
      mensaje.classList.add("aviso-error");
      return;
    }

    // Filtro de lenguaje inapropiado: revisa nombre y comentario y no
    // permite enviar hasta que se corrija el texto.
    const revisionNombre = analizarLenguaje(nombre);
    const revisionComentario = analizarLenguaje(comentario);

    if (revisionNombre.prohibido || revisionComentario.prohibido) {
      const palabras = [...new Set([...revisionNombre.palabras, ...revisionComentario.palabras])];
      mensaje.textContent = `Tu reseña contiene lenguaje inapropiado (${palabras.join(", ")}). Corrige o borra esas palabras para poder publicarla.`;
      mensaje.classList.add("aviso-error");
      return;
    }
    mensaje.classList.remove("aviso-error");

    const idRestaurante = restauranteSeleccionado.id;
    const esDeCatalogo = esRestaurantePropio(idRestaurante);
    const esLugarOsm = !esDeCatalogo && esLugarOpenStreetMap(restauranteSeleccionado);
    // Con sesión iniciada, la reseña se guarda en PostgreSQL: para catálogos
    // propios con alta directa y para lugares de OpenStreetMap creando el
    // restaurante a partir del identificador del lugar.
    const guardarEnBase = Boolean(estadoSesion) && (esDeCatalogo || esLugarOsm);

    if (guardarEnBase) {
      let respuesta;
      let restauranteIdCreado;

      if (esDeCatalogo) {
        respuesta = await enviarJson("/api/reviews", {
          restauranteId: Number(idRestaurante),
          calificacion,
          comentario
        });
      } else {
        respuesta = await enviarJson("/api/reviews/importar", {
          resenas: [
            {
              lugar: crearMetadatosLugar(restauranteSeleccionado),
              calificacion,
              comentario,
              fecha: new Date().toISOString()
            }
          ]
        });
        restauranteIdCreado = respuesta.datos?.resultados?.[0]?.restauranteId;
      }

      if (respuesta.ok) {
        formulario.reset();
        mensaje.textContent = "Reseña publicada en la base de datos.";
        mensaje.classList.remove("aviso-error");
        actualizarAvisoResenas(esDeCatalogo ? "base" : "base-osm");
        mostrarResenas(esDeCatalogo ? idRestaurante : (restauranteIdCreado || idRestaurante));
        return;
      }

      // El servidor rechazó por lenguaje: avisar con su mensaje.
      if (respuesta.datos?.palabras) {
        mensaje.textContent = `Tu reseña contiene lenguaje inapropiado (${respuesta.datos.palabras.join(", ")}). Corrige o borra esas palabras para poder publicarla.`;
        mensaje.classList.add("aviso-error");
        return;
      }

      // Solo se guarda en el navegador si de verdad no hubo respuesta del
      // servidor. Un 400, 401 o 409 son respuestas válidas y no se deben
      // disfrazar de "sin conexión".
      if (respuesta.estado === 0 || respuesta.estado >= 500) {
        guardarResenaLocal(nombre, calificacion, comentario);
        formulario.reset();
        mensaje.textContent = "El servidor no respondió. Reseña guardada solo en este navegador.";
        actualizarAvisoResenas("local");
        actualizarMigracionResenas();
        mostrarResenas(idRestaurante);
        return;
      }

      mensaje.textContent = respuesta.datos?.error || "No se pudo publicar la reseña.";
      mensaje.classList.add("aviso-error");
      return;
    }

    // Sin sesión: se guarda en el navegador.
    guardarResenaLocal(nombre, calificacion, comentario);
    formulario.reset();
    actualizarAvisoResenas("local");

    if (!estadoSesion) {
      if (esDeCatalogo) {
        mensaje.textContent = "Inicia sesión para guardar reseñas de este restaurante en la base de datos. Por ahora quedó solo en este navegador.";
      } else {
        mensaje.textContent = "Inicia sesión para guardar esta reseña en PostgreSQL. Por ahora quedó solo en este navegador.";
      }
    } else {
      mensaje.textContent = "Reseña guardada solo en este navegador (no en PostgreSQL).";
    }

    mensaje.classList.remove("aviso-error");
    actualizarMigracionResenas();
    mostrarResenas(idRestaurante);
  });

  lista.addEventListener("click", async (evento) => {
    const botonEliminar = evento.target.closest("[data-eliminar-resena]");
    if (!botonEliminar) return;

    const idResena = botonEliminar.dataset.eliminarResena;

    // Reseñas guardadas en la base: id con prefijo bd- y se pide su
    // eliminación al servidor, que valida que sea propia.
    if (String(idResena).startsWith("bd-")) {
      if (!estadoSesion) {
        mensaje.textContent = "Inicia sesión para gestionar esa reseña.";
        return;
      }

      const respuesta = await enviarJson(`/api/reviews/${encodeURIComponent(String(idResena).slice(3))}`, {});

      if (respuesta.ok) {
        mensaje.textContent = "Reseña eliminada de la base de datos.";
      } else {
        mensaje.textContent = respuesta.datos?.error || "No se pudo eliminar la reseña del servidor.";
      }
      mostrarResenas(restauranteSeleccionado?.id);
      return;
    }

    // Reseñas locales del navegador.
    const resenas = leerResenas();
    const resenasRestantes = resenas.filter((resena) => resena.id !== idResena);

    if (resenasRestantes.length === resenas.length) return;

    guardarResenas(resenasRestantes);
    mensaje.textContent = "Reseña eliminada de este navegador.";
    actualizarMigracionResenas();
    mostrarResenas(restauranteSeleccionado?.id);
  });
}

function guardarResenaLocal(nombre, calificacion, comentario) {
  const resenas = leerResenas();
  resenas.push({
    id: crearIdResena(),
    idRestaurante: restauranteSeleccionado.id,
    lugar: crearMetadatosLugar(restauranteSeleccionado),
    nombre,
    calificacion,
    comentario,
    fecha: new Date().toISOString()
  });
  guardarResenas(resenas);
}

// Guarda los datos mínimos para poder crear el restaurante en PostgreSQL
// cuando la persona decida migrar sus reseñas del navegador.
function crearMetadatosLugar(restaurante) {
  if (!restaurante || esRestaurantePropio(restaurante.id)) return null;

  const osmId = Number(restaurante.osmId);
  return {
    osmTipo: String(restaurante.osmTipo || "").toLowerCase() || null,
    osmId: Number.isSafeInteger(osmId) && osmId >= 1 ? osmId : null,
    nombre: restaurante.nombre || "Restaurante sin nombre",
    direccion: restaurante.direccion || "",
    categoria: restaurante.categoria || "",
    telefono: restaurante.telefono || "",
    latitud: Number.isFinite(restaurante.latitud) ? restaurante.latitud : null,
    longitud: Number.isFinite(restaurante.longitud) ? restaurante.longitud : null
  };
}

// Al abrir un lugar de OpenStreetMap se completan los datos que falten en
// reseñas antiguas guardadas antes de que existiera la migración.
function completarMetadatosResenasLocales(restaurante) {
  if (!restaurante || esRestaurantePropio(restaurante.id)) return;

  const lugar = crearMetadatosLugar(restaurante);
  if (!lugar) return;

  const resenas = leerResenas();
  let cambios = 0;
  const actualizadas = resenas.map((resena) => {
    if (resena.idRestaurante !== restaurante.id || resena.lugar) return resena;
    cambios += 1;
    return { ...resena, lugar };
  });

  if (cambios > 0) guardarResenas(actualizadas);
}

function analizarLenguaje(texto) {
  if (window.SaborFiltro?.analizar) return window.SaborFiltro.analizar(texto);
  return { prohibido: false, palabras: [] };
}

function esRestaurantePropio(id) {
  const numero = Number(id);
  return Number.isInteger(numero) && numero >= 1;
}

// Un lugar de OpenStreetMap tiene coordenadas y un identificador de OSM;
// un restaurante del catálogo propio tiene un id numérico.
function esLugarOpenStreetMap(restaurante) {
  if (!restaurante) return false;
  const osmTipo = String(restaurante.osmTipo || "").toLowerCase();
  const osmId = Number(restaurante.osmId);
  const esCatalogo = Number.isInteger(Number(restaurante.id)) && Number(restaurante.id) >= 1;
  if (esCatalogo) return false;
  return ["node", "way", "relation"].includes(osmTipo) && Number.isSafeInteger(osmId) && osmId >= 1;
}

function actualizarAvisoResenas(origen) {
  const aviso = document.querySelector("#aviso-resenas");
  if (!aviso) return;

  const textos = {
    base: "Este restaurante es del catálogo: las reseñas se guardan en PostgreSQL.",
    "catalogo-sin-sesion": "Este restaurante es del catálogo. Inicia sesión para guardar tu reseña en PostgreSQL; sin sesión se guarda solo en este navegador.",
    local: "Este lugar viene de OpenStreetMap: sus reseñas se guardan solo en este navegador, no en PostgreSQL.",
    "base-osm": "Este lugar viene de OpenStreetMap: al guardar la reseña con tu cuenta, se guarda en PostgreSQL."
  };

  aviso.textContent = textos[origen] || textos.local;
}

function recibirPosicion(posicion, boton, mensaje, precision, coordenadas, direccion, lista) {
  const exactitud = posicion.coords.accuracy;

  if (exactitud >= mejorPrecision) return;

  mejorPrecision = exactitud;
  ultimaPosicion = posicion;
  actualizarMapa(posicion, precision, coordenadas);
  mensaje.textContent = `Señal encontrada. Buscando una ubicación mejor... (${Math.round(exactitud)} metros de margen)`;

  if (exactitud <= 30) {
    finalizarUbicacion(boton, mensaje, precision, coordenadas, direccion, lista);
  }
}

function finalizarUbicacion(boton, mensaje, precision, coordenadas, direccion, lista, busquedaActual = numeroBusqueda) {
  if (busquedaActual !== numeroBusqueda) return;

  if (!ultimaPosicion) {
    mostrarErrorUbicacion({ code: 3 }, boton, mensaje);
    return;
  }

  if (ultimaPosicion.coords.accuracy > 300) {
    detenerSeguimiento();
    boton.disabled = false;
    boton.textContent = "📍 Intentar de nuevo";
    mensaje.textContent = "La ubicación no es suficientemente precisa. Activa la ubicación precisa o usa el mapa manualmente.";
    return;
  }

  detenerSeguimiento();
  boton.disabled = false;
  boton.textContent = "📍 Actualizar mi ubicación";
  consultarDireccion(ultimaPosicion.coords.latitude, ultimaPosicion.coords.longitude, direccion);

  const exactitud = Math.round(ultimaPosicion.coords.accuracy);
  precision.textContent = `Margen aproximado: ${exactitud} metros`;
  coordenadas.textContent = `Coordenadas: ${ultimaPosicion.coords.latitude.toFixed(6)}, ${ultimaPosicion.coords.longitude.toFixed(6)}`;
  direccion.textContent = "Dirección aproximada: consultando...";
  mensaje.textContent = exactitud <= 50
    ? "Ubicación obtenida con buena precisión."
    : exactitud <= 200
      ? "Ubicación obtenida con precisión aproximada."
      : "La señal no es muy precisa. Activa el GPS o prueba desde otro lugar.";

  buscarRestaurantes(ultimaPosicion.coords.latitude, ultimaPosicion.coords.longitude, lista);
}

function detenerSeguimiento() {
  if (idSeguimiento !== null) {
    navigator.geolocation.clearWatch(idSeguimiento);
    idSeguimiento = null;
  }

  if (relojUbicacion !== null) {
    clearTimeout(relojUbicacion);
    relojUbicacion = null;
  }
}

function actualizarMapa(posicion, precision, coordenadas) {
  const latitud = posicion.coords.latitude;
  const longitud = posicion.coords.longitude;
  const exactitud = posicion.coords.accuracy;

  if (!mapaActual) {
    mapaActual = L.map("mapa").setView([latitud, longitud], calcularZoom(exactitud));

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; Colaboradores de OpenStreetMap"
    }).addTo(mapaActual);

    marcadoresRestaurantes = L.layerGroup().addTo(mapaActual);
    marcadorUbicacion = L.marker([latitud, longitud])
      .addTo(mapaActual)
      .bindPopup("Tu ubicación actual");

    circuloPrecision = L.circle([latitud, longitud], {
      radius: exactitud,
      color: "#2f6f68",
      fillColor: "#63a49b",
      fillOpacity: 0.2,
      weight: 2
    }).addTo(mapaActual);

    mapaActual.on("click", (evento) => seleccionarPuntoManual(evento.latlng.lat, evento.latlng.lng, precision, coordenadas));
  } else {
    mapaActual.setView([latitud, longitud], calcularZoom(exactitud));
    marcadorUbicacion.setLatLng([latitud, longitud]);
    circuloPrecision.setLatLng([latitud, longitud]);
    circuloPrecision.setRadius(exactitud);
  }

  precision.textContent = `Buscando mejor señal... ${Math.round(exactitud)} metros de margen`;
  coordenadas.textContent = `Coordenadas: ${latitud.toFixed(6)}, ${longitud.toFixed(6)}`;
  mapaActual.invalidateSize();
}

function seleccionarPuntoManual(latitud, longitud, precision, coordenadas) {
  numeroBusqueda += 1;
  detenerSeguimiento();
  ultimaPosicion = { coords: { latitude: latitud, longitude: longitud, accuracy: 100 } };
  mejorPrecision = 100;
  marcadorUbicacion.setLatLng([latitud, longitud]);
  circuloPrecision.setLatLng([latitud, longitud]);
  circuloPrecision.setRadius(100);
  mapaActual.setView([latitud, longitud], 16);
  precision.textContent = "Punto seleccionado manualmente en el mapa";
  coordenadas.textContent = `Coordenadas: ${latitud.toFixed(6)}, ${longitud.toFixed(6)}`;

  const direccion = document.querySelector("#direccion-ubicacion");
  const lista = document.querySelector("#lista-restaurantes");
  if (direccion) direccion.textContent = "Dirección aproximada: consultando...";
  if (lista) lista.innerHTML = "<h3>Restaurantes cercanos</h3><p class=\"cargando-restaurantes\">Buscando lugares cercanos...</p>";

  consultarDireccion(latitud, longitud, direccion);
  buscarRestaurantes(latitud, longitud, lista);
}

function calcularZoom(exactitud) {
  if (exactitud <= 50) return 17;
  if (exactitud <= 150) return 16;
  return 15;
}

function mostrarErrorUbicacion(error, boton, mensaje) {
  detenerSeguimiento();
  boton.disabled = false;
  boton.textContent = "📍 Intentar de nuevo";

  if (error.code === 1) {
    mensaje.textContent = "No se concedió permiso para usar la ubicación.";
  } else if (error.code === 2) {
    mensaje.textContent = "No fue posible encontrar tu ubicación.";
  } else {
    mensaje.textContent = "No se obtuvo una señal a tiempo. Intenta de nuevo.";
  }
}

function consultarDireccion(latitud, longitud, elemento) {
  if (!elemento) return;

  const consultaActual = ++numeroConsultaDireccion;
  const direccion = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitud}&lon=${longitud}&zoom=18&addressdetails=1`;

  fetch(direccion, { headers: { Accept: "application/json" } })
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error("No se pudo consultar la dirección");
      return respuesta.json();
    })
    .then((datos) => {
      if (consultaActual !== numeroConsultaDireccion) return;
      elemento.textContent = `Dirección aproximada: ${datos.display_name || "Dirección no disponible"}`;
    })
    .catch(() => {
      if (consultaActual === numeroConsultaDireccion) {
        elemento.textContent = "Dirección aproximada: Dirección no disponible";
      }
    });
}

async function buscarRestaurantes(latitud, longitud, lista) {
  if (!lista) return;

  if (controladorRestaurantes) controladorRestaurantes.abort();
  const controlador = new AbortController();
  controladorRestaurantes = controlador;
  const busquedaActual = numeroBusqueda;
  const radioKilometros = 1.5;

  lista.innerHTML = "<h3>Restaurantes cercanos</h3><p class=\"cargando-restaurantes\">Buscando lugares cercanos...</p>";

  try {
    // Nominatim responde más rápido y sirve como fuente principal para mostrar resultados.
    let lugares = await buscarRestaurantesNominatim(latitud, longitud, radioKilometros, controlador.signal);

    // Overpass se conserva como respaldo porque entrega datos más completos de OSM.
    if (lugares.length === 0) {
      lugares = await buscarRestaurantesOverpass(latitud, longitud, radioKilometros, controlador.signal);
    }

    if (busquedaActual !== numeroBusqueda) return;
    mostrarRestaurantes(lugares, latitud, longitud, lista, radioKilometros);
  } catch (error) {
    if (busquedaActual !== numeroBusqueda) return;
    lista.innerHTML = `<h3>Restaurantes cercanos</h3><p class="cargando-restaurantes">No se pudo consultar el mapa. <button class="boton-reintentar" type="button" data-reintentar-restaurantes>Reintentar</button></p>`;
  } finally {
    if (controladorRestaurantes === controlador) controladorRestaurantes = null;
  }
}

async function buscarRestaurantesNominatim(latitud, longitud, radioKilometros, signal) {
  const margenLatitud = radioKilometros / 111;
  const margenLongitud = radioKilometros / (111 * Math.max(Math.abs(Math.cos(gradosARadianes(latitud))), 0.2));
  const parametros = new URLSearchParams({
    format: "jsonv2",
    q: "restaurant",
    limit: "40",
    bounded: "1",
    extratags: "1",
    viewbox: [
      longitud - margenLongitud,
      latitud + margenLatitud,
      longitud + margenLongitud,
      latitud - margenLatitud
    ].join(","),
    addressdetails: "1"
  });
  const respuesta = await fetch(`https://nominatim.openstreetmap.org/search?${parametros}`, {
    signal,
    headers: { Accept: "application/json" }
  });

  if (!respuesta.ok) throw new Error(`Nominatim respondió ${respuesta.status}`);
  const resultados = await respuesta.json();

  return resultados
    .filter((lugar) => Number.isFinite(Number(lugar.lat)) && Number.isFinite(Number(lugar.lon)))
    .map((lugar, indice) => {
      const direccion = lugar.address || {};
      return {
        id: `nominatim-${lugar.osm_type || "lugar"}-${lugar.osm_id || indice}`,
        lat: Number(lugar.lat),
        lon: Number(lugar.lon),
        tags: {
          name: lugar.name || lugar.display_name?.split(",")[0] || "Restaurante sin nombre",
          amenity: lugar.type || "restaurant",
          "addr:street": direccion.road,
          "addr:housenumber": direccion.house_number,
          "addr:suburb": direccion.suburb || direccion.neighbourhood,
          "addr:city": direccion.city || direccion.town || direccion.village,
          "addr:full": lugar.display_name,
          cuisine: lugar.extratags?.cuisine || "",
          phone: lugar.extratags?.phone || lugar.extratags?.contact_phone || "",
          website: lugar.extratags?.website || lugar.extratags?.contact_website || "",
          takeaway: lugar.extratags?.takeaway || "",
          delivery: lugar.extratags?.delivery || "",
          wheelchair: lugar.extratags?.wheelchair || "",
          outdoor_seating: lugar.extratags?.outdoor_seating || "",
          reservation: lugar.extratags?.reservation || "",
          price_level: lugar.extratags?.price_level || ""
        }
      };
    });
}

async function buscarRestaurantesOverpass(latitud, longitud, radioKilometros, signal) {
  const radioMetros = Math.round(radioKilometros * 1000);
  const consulta = `[out:json][timeout:8];nwr[amenity~"restaurant|fast_food"](around:${radioMetros},${latitud},${longitud});out center tags;`;
  const parametros = `?data=${encodeURIComponent(consulta)}`;
  const servidores = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  const respuestas = servidores.map(async (servidor) => {
    const respuesta = await fetch(`${servidor}${parametros}`, {
      signal,
      headers: { Accept: "application/json" }
    });
    if (!respuesta.ok) throw new Error(`Overpass respondió ${respuesta.status}`);
    return respuesta.json();
  });
  const datos = await Promise.any(respuestas);
  return datos?.elements || [];
}

function mostrarRestaurantes(lugares, latitud, longitud, lista, radioKilometros = 3) {
  const lugaresUnicos = filtrarRestaurantesDuplicados(lugares);

  restaurantesActuales = lugaresUnicos
    .map((lugar) => {
      const datos = lugar.tags || {};
      const lugarLatitud = lugar.lat ?? lugar.center?.lat;
      const lugarLongitud = lugar.lon ?? lugar.center?.lon;

      return {
        id: construirIdentificadorLugar(lugar, datos),
        osmTipo: normalizarTipoOsm(lugar.osm_type || lugar.type),
        osmId: normalizarIdOsm(lugar.osm_id ?? lugar.id),
        nombre: datos.name || "Restaurante sin nombre",
        direccion: construirDireccion(datos),
        categoria: datos.cuisine || datos.amenity || "Lugar de comida",
        telefono: datos.phone || datos["contact:phone"] || "",
        precio: formatearPrecio(datos.price_level),
        sitioWeb: obtenerUrlSegura(datos.website || datos["contact:website"] || ""),
        takeaway: datos.takeaway === "yes",
        delivery: datos.delivery === "yes",
        wheelchair: datos.wheelchair === "yes",
        outdoor_seating: datos.outdoor_seating === "yes",
        reservation: datos.reservation === "yes",
        latitud: lugarLatitud,
        longitud: lugarLongitud,
        distancia: calcularDistancia(latitud, longitud, lugarLatitud, lugarLongitud)
      };
    })
    .filter((restaurante) => Number.isFinite(restaurante.latitud) && Number.isFinite(restaurante.longitud))
    .filter((restaurante) => restaurante.distancia <= radioKilometros)
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 20)
    .filter((restaurante, indice, lista) => lista.findIndex((otro) => otro.id === restaurante.id) === indice);

  lista.innerHTML = "<h3>Restaurantes cercanos</h3>";

  if (restaurantesActuales.length === 0) {
    lista.innerHTML += `<p class="cargando-restaurantes">No encontramos restaurantes en un radio de ${radioKilometros} kilómetros.</p>`;
    return;
  }

  mostrarMarcadoresRestaurantes(restaurantesActuales);

  restaurantesActuales.forEach((restaurante) => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-restaurante";
    tarjeta.appendChild(construirTarjeta(restaurante));
    lista.appendChild(tarjeta);
  });
}

function filtrarRestaurantesDuplicados(lugares) {
  const lugaresUnicos = [];

  lugares.forEach((lugar) => {
    const datos = lugar.tags || {};
    const nombre = normalizarNombre(datos.name || "Restaurante sin nombre");
    const latitud = lugar.lat ?? lugar.center?.lat;
    const longitud = lugar.lon ?? lugar.center?.lon;

    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return;

    const repetido = lugaresUnicos.some((guardado) => {
      const datosGuardados = guardado.tags || {};
      const nombreGuardado = normalizarNombre(datosGuardados.name || "Restaurante sin nombre");
      const latitudGuardada = guardado.lat ?? guardado.center?.lat;
      const longitudGuardada = guardado.lon ?? guardado.center?.lon;

      return nombre && nombre === nombreGuardado
        && calcularDistancia(latitud, longitud, latitudGuardada, longitudGuardada) < 0.12;
    });

    if (!repetido) lugaresUnicos.push(lugar);
  });

  return lugaresUnicos;
}

function normalizarNombre(nombre) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function construirIdentificadorLugar(lugar, datos) {
  const nombre = normalizarNombre(datos.name || "sin-nombre");
  const latitud = lugar.lat ?? lugar.center?.lat;
  const longitud = lugar.lon ?? lugar.center?.lon;
  return `${nombre}-${Number(latitud).toFixed(5)}-${Number(longitud).toFixed(5)}`;
}

// Normaliza el tipo de objeto de OpenStreetMap que llega desde Overpass.
function normalizarTipoOsm(valor) {
  const texto = String(valor || "").trim().toLowerCase();
  if (texto === "n" || texto === "node") return "node";
  if (texto === "w" || texto === "way") return "way";
  if (texto === "r" || texto === "relation") return "relation";
  return null;
}

// Convierte el identificador de OpenStreetMap a un entero seguro.
function normalizarIdOsm(valor) {
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero >= 1 ? numero : null;
}

function obtenerUrlSegura(url) {
  try {
    const urlValida = new URL(url);
    return ["http:", "https:"].includes(urlValida.protocol) ? urlValida.href : "";
  } catch (error) {
    return "";
  }
}

function mostrarMarcadoresRestaurantes(restaurantes) {
  if (!marcadoresRestaurantes) return;

  marcadoresRestaurantes.clearLayers();

  restaurantes.forEach((restaurante) => {
    const popup = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = restaurante.nombre;
    popup.append(nombre, document.createElement("br"), document.createTextNode(formatearDistancia(restaurante.distancia)));

    L.marker([restaurante.latitud, restaurante.longitud])
      .bindPopup(popup)
      .addTo(marcadoresRestaurantes);
  });
}

function construirTarjeta(restaurante) {
  const contenido = document.createElement("div");
  contenido.className = "contenido-tarjeta-restaurante";

  const categoria = document.createElement("p");
  categoria.className = "categoria-restaurante";
  categoria.textContent = restaurante.categoria;

  const nombre = document.createElement("h4");
  nombre.textContent = restaurante.nombre;

  const direccion = document.createElement("p");
  direccion.textContent = restaurante.direccion;

  // Resumen de la comunidad: promedio y cantidad de reseñas guardadas
  // en este navegador para ese lugar.
  const resumen = resumenResenasLocal(restaurante.id);
  const resumenParrafo = resumen ? crearParrafoResumen(resumen) : null;

  const serviciosTexto = construirServicios(restaurante);
  const precioTexto = formatearPrecio(restaurante.precio);
  const distancia = document.createElement("p");
  distancia.textContent = `Aproximadamente a ${formatearDistancia(restaurante.distancia)}`;

  const boton = document.createElement("button");
  boton.className = "boton boton-secundario boton-detalle";
  boton.type = "button";
  boton.dataset.restauranteId = restaurante.id;
  boton.textContent = "Ver restaurante";

  const elementosTarjeta = [categoria, nombre, direccion];
  if (resumenParrafo) elementosTarjeta.push(resumenParrafo);
  if (serviciosTexto) elementosTarjeta.push(serviciosTexto);
  if (precioTexto) elementosTarjeta.push(precioTexto);
  elementosTarjeta.push(distancia, boton);
  contenido.append(...elementosTarjeta);
  return contenido;
}

function resumenResenasLocal(idRestaurante) {
  const resenas = leerResenas().filter((resena) => resena.idRestaurante === idRestaurante);
  if (resenas.length === 0) return null;

  const suma = resenas.reduce((total, resena) => total + resena.calificacion, 0);
  return { promedio: suma / resenas.length, cantidad: resenas.length };
}

function crearParrafoResumen(resumen) {
  const redondeado = Math.round(resumen.promedio);
  const parrafo = document.createElement("p");
  parrafo.className = "resumen-resenas";

  const estrellas = document.createElement("span");
  estrellas.className = "estrellas-resena";
  estrellas.textContent = `${"★".repeat(redondeado)}${"☆".repeat(5 - redondeado)}`;

  parrafo.append(estrellas, document.createTextNode(` ${resumen.promedio.toFixed(1)} · ${resumen.cantidad} ${resumen.cantidad === 1 ? "reseña" : "reseñas"}`));
  return parrafo;
}

// Tarjeta para un restaurante del catálogo. Estos lugares no tienen
// coordenadas guardadas en la base, así que no se muestra distancia ni
// enlace al mapa: solo sus datos registrados y el acceso al detalle.
function construirTarjetaCatalogo(restaurante) {
  const contenido = document.createElement("div");
  contenido.className = "contenido-tarjeta-restaurante";

  const origen = document.createElement("p");
  origen.className = "etiqueta-origen";
  origen.textContent = "Catálogo del sitio";

  const categoria = document.createElement("p");
  categoria.className = "categoria-restaurante";
  categoria.textContent = restaurante.categoria || "Sin categoría";

  const nombre = document.createElement("h4");
  nombre.textContent = restaurante.nombre;

  const direccion = document.createElement("p");
  direccion.textContent = restaurante.direccion || "Sin dirección registrada";

  const telefonoTexto = crearParrafoInformacion("Teléfono", restaurante.telefono);

  const boton = document.createElement("button");
  boton.className = "boton boton-secundario";
  boton.type = "button";
  boton.textContent = "Ver restaurante";
  boton.addEventListener("click", () => mostrarDetalle({ ...restaurante, origen: "catalogo" }));

  const elementosTarjeta = [origen, categoria, nombre, direccion];
  if (telefonoTexto) elementosTarjeta.push(telefonoTexto);
  elementosTarjeta.push(boton);
  contenido.append(...elementosTarjeta);
  return contenido;
}

function crearEnlaceExterno(url, texto) {
  const enlace = document.createElement("a");
  enlace.className = "enlace-mapa";
  enlace.href = url;
  enlace.target = "_blank";
  enlace.rel = "noopener noreferrer";
  enlace.textContent = texto;
  return enlace;
}

function mostrarDetalle(restaurante) {
  restauranteSeleccionado = restaurante;
  // Completa los datos del lugar en reseñas antiguas del navegador para que
  // también se puedan migrar a PostgreSQL.
  completarMetadatosResenasLocales(restaurante);
  const detalle = document.querySelector("#detalle-restaurante");
  const contenido = document.querySelector("#contenido-detalle");

  if (!detalle || !contenido) return;

  // Los lugares descubiertos en OpenStreetMap tienen coordenadas; los del
  // catálogo propio no, así que el enlace al mapa y la distancia solo se
  // muestran cuando existen esos datos.
  const tieneCoordenadas = Number.isFinite(restaurante.latitud) && Number.isFinite(restaurante.longitud);
  const enlaceMapa = tieneCoordenadas
    ? `https://www.openstreetmap.org/?mlat=${restaurante.latitud}&mlon=${restaurante.longitud}#map=18/${restaurante.latitud}/${restaurante.longitud}`
    : "";

  contenido.replaceChildren();

  const encabezado = document.createElement("div");
  encabezado.className = "encabezado-detalle";

  const informacion = document.createElement("div");
  const categoria = document.createElement("p");
  categoria.className = "categoria-restaurante";
  categoria.textContent = restaurante.categoria;

  const nombre = document.createElement("h3");
  nombre.id = "titulo-detalle";
  nombre.textContent = restaurante.nombre;

  const direccion = document.createElement("p");
  direccion.textContent = restaurante.direccion;

  const serviciosTexto = construirServicios(restaurante);
  const precioTexto = formatearPrecio(restaurante.precio);
  const telefonoTexto = crearParrafoInformacion("Teléfono", restaurante.telefono);
  const distancia = Number.isFinite(restaurante.distancia)
    ? (() => {
        const parrafo = document.createElement("p");
        parrafo.textContent = `Aproximadamente a ${formatearDistancia(restaurante.distancia)}`;
        return parrafo;
      })()
    : null;

  const enlaces = document.createElement("div");
  enlaces.className = "enlaces-detalle";

  if (tieneCoordenadas) {
    enlaces.appendChild(crearEnlaceExterno(enlaceMapa, "Abrir en OpenStreetMap"));
  }

  if (restaurante.sitioWeb) {
    enlaces.appendChild(crearEnlaceExterno(restaurante.sitioWeb, "Visitar sitio web"));
  }

  const elementosDetalle = [categoria, nombre, direccion];
  if (serviciosTexto) elementosDetalle.push(serviciosTexto);
  if (precioTexto) elementosDetalle.push(precioTexto);
  if (telefonoTexto) elementosDetalle.push(telefonoTexto);
  if (distancia) elementosDetalle.push(distancia);
  elementosDetalle.push(enlaces);
  informacion.append(...elementosDetalle);
  encabezado.appendChild(informacion);
  contenido.appendChild(encabezado);

  detalle.hidden = false;

  // El aviso deja claro si la reseña irá a PostgreSQL o solo al navegador.
  if (esRestaurantePropio(restaurante.id)) {
    actualizarAvisoResenas(estadoSesion ? "base" : "catalogo-sin-sesion");
  } else if (esLugarOpenStreetMap(restaurante)) {
    actualizarAvisoResenas(estadoSesion ? "base-osm" : "local");
  } else {
    actualizarAvisoResenas("local");
  }

  mostrarResenas(restaurante.id);
  detalle.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ocultarDetalle() {
  const detalle = document.querySelector("#detalle-restaurante");
  if (detalle) detalle.hidden = true;
  restauranteSeleccionado = null;
}

async function mostrarResenas(idRestaurante) {
  const lista = document.querySelector("#lista-resenas");
  if (!lista) return;

  const esCatalogo = esRestaurantePropio(idRestaurante);
  const restaurante = esCatalogo ? null : restauranteSeleccionado;

  // Reseñas guardadas en este navegador para ese lugar.
  let resenas = leerResenas().filter((resena) => resena.idRestaurante === idRestaurante);

  // Reseñas que ya fueron publicadas en PostgreSQL para el lugar. Para un
  // restaurante del catálogo se lee por su id; para un lugar de OpenStreetMap
  // se resuelve con el tipo e identificador del lugar, porque esos no tienen id
  // de catálogo: así se ven también las que se guardaron con sesión activa.
  const origenBase = esCatalogo
    ? { url: `/api/reviews/restaurant/${Number(idRestaurante)}` }
    : (restaurante && esLugarOpenStreetMap(restaurante)
        ? { url: `/api/reviews/osm/${encodeURIComponent(String(restaurante.osmTipo))}/${encodeURIComponent(String(restaurante.osmId))}` }
        : null);

  if (origenBase) {
    try {
      const respuesta = await fetch(origenBase.url);
      if (respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}));
        const deLaBase = (cuerpo.resenas || []).map((resena) => ({
          id: `bd-${resena.id}`,
          idRestaurante: esCatalogo ? Number(idRestaurante) : undefined,
          nombre: resena.nombre_usuario || "Usuario",
          calificacion: resena.calificacion,
          comentario: resena.comentario,
          fecha: resena.fecha_creacion,
          esPropiaBase: Boolean(resena.es_propia)
        }));
        resenas = [...deLaBase, ...resenas];
      }
    } catch (error) {
      // Sin conexión al servidor: solo se muestran las locales.
    }
  }

  resenas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  lista.innerHTML = "";

  if (resenas.length === 0) {
    lista.innerHTML = "<p class=\"cargando-restaurantes\">Todavía no hay reseñas. Sé la primera persona en escribir una.</p>";
    return;
  }

  resenas.slice().forEach((resena) => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-resena";

    const encabezado = document.createElement("div");
    encabezado.className = "encabezado-resena";

    const nombre = document.createElement("strong");
    nombre.textContent = resena.nombre;

    const estrellas = document.createElement("span");
    estrellas.className = "estrellas-resena";
    estrellas.setAttribute("aria-label", `${resena.calificacion} de 5 estrellas`);
    estrellas.textContent = `${"★".repeat(resena.calificacion)}${"☆".repeat(5 - resena.calificacion)}`;

    const comentario = document.createElement("p");
    comentario.textContent = resena.comentario;

    const esDeBase = String(resena.id).startsWith("bd-");
    const esPropiaLocal = !esDeBase;
    // El servidor indica si la reseña es de la cuenta actual; no se compara
    // por nombre porque dos personas pueden llamarse igual.
    const esPropiaBase = esDeBase && resena.esPropiaBase === true;

    const pie = document.createElement("div");
    pie.className = "pie-resena";

    const fecha = document.createElement("small");
    fecha.textContent = formatearFecha(resena.fecha);

    encabezado.append(nombre, estrellas);

    if (esPropiaLocal || esPropiaBase) {
      const botonEliminar = document.createElement("button");
      botonEliminar.className = "boton-eliminar-resena";
      botonEliminar.type = "button";
      botonEliminar.dataset.eliminarResena = resena.id;
      botonEliminar.textContent = "Eliminar";
      pie.append(fecha, botonEliminar);
    } else {
      pie.append(fecha);
    }

    tarjeta.append(encabezado, comentario, pie);
    lista.appendChild(tarjeta);
  });
}

function leerResenas() {
  try {
    const resenas = JSON.parse(localStorage.getItem(CLAVE_RESENAS));
    return Array.isArray(resenas) ? resenas : [];
  } catch (error) {
    return [];
  }
}

function guardarResenas(resenas) {
  try {
    localStorage.setItem(CLAVE_RESENAS, JSON.stringify(resenas));
    return true;
  } catch (error) {
    return false;
  }
}

function crearIdResena() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatearFecha(fecha) {
  const fechaValida = new Date(fecha);
  if (Number.isNaN(fechaValida.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(fechaValida);
}

function construirDireccion(datos) {
  const partes = [
    [datos["addr:street"], datos["addr:housenumber"]].filter(Boolean).join(" "),
    datos["addr:suburb"],
    datos["addr:city"] || datos["addr:town"] || datos["addr:village"]
  ].filter(Boolean);

  return partes.join(", ") || datos["addr:full"] || datos["addr:place"] || "Dirección no disponible";
}

function crearParrafoInformacion(etiqueta, valor) {
  if (!valor) return null;
  const parrafo = document.createElement("p");
  const fuerte = document.createElement("strong");
  fuerte.textContent = `${etiqueta}:`;
  parrafo.append(fuerte, document.createTextNode(` ${valor}`));
  return parrafo;
}

function construirServicios(restaurante) {
  const servicios = [];

  if (restaurante.takeaway) servicios.push("Para llevar");
  if (restaurante.delivery) servicios.push("Domicilio");
  if (restaurante.wheelchair) servicios.push("Acceso para silla de ruedas");
  if (restaurante.outdoor_seating) servicios.push("Terraza");
  if (restaurante.reservation) servicios.push("Reservas");

  return servicios.length > 0 ? servicios.join(" · ") : null;
}

function formatearPrecio(nivel) {
  if (!nivel) return null;
  if (nivel === "$") return "Económico";
  if (nivel === "$$") return "Moderado";
  if (nivel === "$$$") return "Costoso";
  if (nivel === "$$$$") return "Muy costoso";
  return nivel;
}

function calcularDistancia(latitudUno, longitudUno, latitudDos, longitudDos) {
  const radioTierra = 6371;
  const diferenciaLatitud = gradosARadianes(latitudDos - latitudUno);
  const diferenciaLongitud = gradosARadianes(longitudDos - longitudUno);
  const calculo = Math.sin(diferenciaLatitud / 2) ** 2 + Math.cos(gradosARadianes(latitudUno)) * Math.cos(gradosARadianes(latitudDos)) * Math.sin(diferenciaLongitud / 2) ** 2;
  return radioTierra * 2 * Math.atan2(Math.sqrt(calculo), Math.sqrt(1 - calculo));
}

function gradosARadianes(grados) {
  return grados * Math.PI / 180;
}

function formatearDistancia(distancia) {
  return distancia < 1 ? `${Math.round(distancia * 1000)} metros` : `${distancia.toFixed(1)} kilómetros`;
}

function escaparTexto(texto) {
  const elemento = document.createElement("div");
  elemento.textContent = texto;
  return elemento.innerHTML;
}

function escaparAtributo(texto) {
  return escaparTexto(texto)
    .replace(/`/g, "&#96;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}
