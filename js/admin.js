// Panel de administración: consulta usuarios y reseñas con búsqueda y
// paginación, permite suspender cuentas y moderar comentarios. Toda la
// autorización real vive en el servidor; esta interfaz solo muestra lo que
// la API permite.

const estadoAdmin = {
  usuario: null,
  usuarios: [],
  resenas: [],
  resumen: { usuarios: 0, suspendidos: 0, resenasPublicadas: 0 },
  paginacionUsuarios: { pagina: 1, totalPaginas: 1, total: 0 },
  paginacionResenas: { pagina: 1, totalPaginas: 1, total: 0 },
  filtrosUsuarios: { buscar: "" },
  filtrosResenas: { buscar: "", calificacion: "todas", orden: "recientes" }
};

// Reseña que se está mostrando en la ventana de detalle.
let resenaDetalle = null;

document.addEventListener("DOMContentLoaded", iniciarPanel);

async function iniciarPanel() {
  configurarMenuAdmin();
  configurarPestanas();
  configurarCierreSesion();
  configurarBusquedas();
  configurarPaginacion();
  configurarDialogoResena();

  const respuesta = await solicitar("GET", "/api/auth/me");
  const usuario = respuesta.datos?.usuario || null;

  if (!usuario || usuario.rol !== "admin") {
    mostrarAccesoDenegado(usuario
      ? "Tu cuenta no tiene permisos de administrador."
      : "Inicia sesión con una cuenta de administrador para entrar aquí.");
    return;
  }

  estadoAdmin.usuario = usuario;

  const nombre = document.querySelector("#admin-usuario");
  if (nombre) nombre.textContent = `Hola, ${usuario.nombreUsuario}`;

  const denegado = document.querySelector("#acceso-denegado");
  const panel = document.querySelector("#panel-admin");
  if (denegado) denegado.hidden = true;
  if (panel) panel.hidden = false;

  await Promise.all([cargarResumen(), cargarUsuarios(1), cargarResenas(1)]);
}

function leerCookie(nombre) {
  const cookies = document.cookie.split(";");
  const encontrada = cookies.find((cookie) => cookie.trim().startsWith(`${nombre}=`));
  return encontrada ? decodeURIComponent(encontrada.trim().slice(nombre.length + 1)) : "";
}

async function solicitar(metodo, url, datos) {
  try {
    const opciones = { method: metodo, credentials: "same-origin", headers: {} };

    if (datos !== undefined) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(datos);
    }

    if (metodo !== "GET" && metodo !== "HEAD") {
      opciones.headers["X-CSRF-Token"] = leerCookie("sabor_resena_csrf");
    }

    const respuesta = await fetch(url, opciones);
    const cuerpo = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, estado: respuesta.status, datos: cuerpo };
  } catch (error) {
    return { ok: false, estado: 0, datos: { error: "No se pudo conectar con el servidor." } };
  }
}

function configurarMenuAdmin() {
  const boton = document.querySelector("#boton-menu-admin");
  const menu = document.querySelector("#menu-admin");
  if (!boton || !menu) return;

  boton.addEventListener("click", () => {
    const abierto = menu.classList.toggle("abierto");
    boton.setAttribute("aria-expanded", String(abierto));
  });

  menu.querySelectorAll("a, button").forEach((elemento) => {
    elemento.addEventListener("click", () => {
      menu.classList.remove("abierto");
      boton.setAttribute("aria-expanded", "false");
    });
  });
}

function configurarPestanas() {
  const botones = document.querySelectorAll(".pestana-admin");
  botones.forEach((boton) => {
    boton.addEventListener("click", () => {
      mostrarVista(boton.dataset.vista);
    });
  });
}

function mostrarVista(vista) {
  document.querySelectorAll(".pestana-admin").forEach((boton) => {
    const activa = boton.dataset.vista === vista;
    boton.classList.toggle("activa", activa);
    boton.setAttribute("aria-selected", String(activa));
  });

  const usuarios = document.querySelector("#vista-usuarios");
  const resenas = document.querySelector("#vista-resenas");
  if (usuarios) usuarios.hidden = vista !== "usuarios";
  if (resenas) resenas.hidden = vista !== "resenas";
}

function configurarCierreSesion() {
  const boton = document.querySelector("#boton-salir-admin");
  if (!boton) return;

  boton.addEventListener("click", async () => {
    await solicitar("POST", "/api/auth/logout");
    window.location.href = "/";
  });
}

// Búsqueda por formulario. La página vuelve a la primera para no quedar en
// una página que ya no existe al cambiar el filtro.
function configurarBusquedas() {
  const formularioUsuarios = document.querySelector("#formulario-buscar-usuarios");
  const buscarUsuarios = document.querySelector("#buscar-usuarios");
  const limpiarUsuarios = document.querySelector("#limpiar-usuarios");

  if (formularioUsuarios && buscarUsuarios) {
    formularioUsuarios.addEventListener("submit", (evento) => {
      evento.preventDefault();
      estadoAdmin.filtrosUsuarios.buscar = buscarUsuarios.value.trim();
      cargarUsuarios(1);
    });
  }

  if (limpiarUsuarios && buscarUsuarios) {
    limpiarUsuarios.addEventListener("click", () => {
      buscarUsuarios.value = "";
      estadoAdmin.filtrosUsuarios.buscar = "";
      cargarUsuarios(1);
    });
  }

  const formularioResenas = document.querySelector("#formulario-buscar-resenas");
  const buscarResenas = document.querySelector("#buscar-resenas");
  const filtroCalificacion = document.querySelector("#filtro-calificacion-resenas");
  const ordenResenas = document.querySelector("#orden-resenas");
  const limpiarResenas = document.querySelector("#limpiar-resenas");

  if (formularioResenas && buscarResenas && filtroCalificacion && ordenResenas) {
    formularioResenas.addEventListener("submit", (evento) => {
      evento.preventDefault();
      estadoAdmin.filtrosResenas.buscar = buscarResenas.value.trim();
      estadoAdmin.filtrosResenas.calificacion = filtroCalificacion.value;
      estadoAdmin.filtrosResenas.orden = ordenResenas.value;
      cargarResenas(1);
    });
  }

  if (limpiarResenas && buscarResenas && filtroCalificacion && ordenResenas) {
    limpiarResenas.addEventListener("click", () => {
      buscarResenas.value = "";
      filtroCalificacion.value = "todas";
      ordenResenas.value = "recientes";
      estadoAdmin.filtrosResenas = { buscar: "", calificacion: "todas", orden: "recientes" };
      cargarResenas(1);
    });
  }
}

function configurarPaginacion() {
  const usuarios = document.querySelector("#paginacion-usuarios");
  const resenas = document.querySelector("#paginacion-resenas");

  if (usuarios) {
    usuarios.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-pagina]");
      if (!boton || boton.disabled) return;
      const destino = estadoAdmin.paginacionUsuarios.pagina + (boton.dataset.pagina === "siguiente" ? 1 : -1);
      cargarUsuarios(destino);
    });
  }

  if (resenas) {
    resenas.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-pagina]");
      if (!boton || boton.disabled) return;
      const destino = estadoAdmin.paginacionResenas.pagina + (boton.dataset.pagina === "siguiente" ? 1 : -1);
      cargarResenas(destino);
    });
  }
}

function mostrarAccesoDenegado(texto) {
  const denegado = document.querySelector("#acceso-denegado");
  const mensaje = document.querySelector("#mensaje-acceso");
  const panel = document.querySelector("#panel-admin");
  const nombre = document.querySelector("#admin-usuario");

  if (denegado) denegado.hidden = false;
  if (mensaje) mensaje.textContent = texto;
  if (panel) panel.hidden = true;
  if (nombre) nombre.textContent = "Sin sesión de administrador";
}

function mostrarMensaje(texto, esError = false) {
  const mensaje = document.querySelector("#mensaje-admin");
  if (!mensaje) return;

  mensaje.textContent = texto;
  mensaje.classList.toggle("aviso-error", esError);
}

async function cargarResumen() {
  const respuesta = await solicitar("GET", "/api/admin/resumen");
  if (!respuesta.ok) return;

  estadoAdmin.resumen = respuesta.datos.resumen || estadoAdmin.resumen;
  actualizarResumen();
}

function actualizarResumen() {
  const totalUsuarios = document.querySelector("#total-usuarios");
  const totalSuspendidos = document.querySelector("#total-suspendidos");
  const totalResenas = document.querySelector("#total-resenas");

  if (totalUsuarios) totalUsuarios.textContent = String(estadoAdmin.resumen.usuarios);
  if (totalSuspendidos) totalSuspendidos.textContent = String(estadoAdmin.resumen.suspendidos);
  if (totalResenas) totalResenas.textContent = String(estadoAdmin.resumen.resenasPublicadas);
}

async function cargarUsuarios(pagina = 1) {
  const parametros = new URLSearchParams({ pagina: String(pagina), limite: "10" });
  if (estadoAdmin.filtrosUsuarios.buscar) {
    parametros.set("buscar", estadoAdmin.filtrosUsuarios.buscar);
  }

  const respuesta = await solicitar("GET", `/api/admin/usuarios?${parametros}`);

  if (!respuesta.ok) {
    mostrarMensaje(respuesta.datos?.error || "No se pudieron cargar los usuarios.", true);
    return;
  }

  estadoAdmin.usuarios = respuesta.datos.usuarios || [];
  estadoAdmin.paginacionUsuarios = respuesta.datos.paginacion || { pagina: 1, totalPaginas: 1, total: 0 };

  // Si se borró el último elemento de la última página, se retrocede una.
  if (estadoAdmin.usuarios.length === 0 && estadoAdmin.paginacionUsuarios.pagina > 1) {
    await cargarUsuarios(estadoAdmin.paginacionUsuarios.pagina - 1);
    return;
  }

  renderizarUsuarios();
  renderizarPaginacion(
    "usuarios",
    estadoAdmin.paginacionUsuarios,
    estadoAdmin.filtrosUsuarios.buscar ? "No hay usuarios que coincidan con la búsqueda." : "No hay usuarios registrados."
  );
}

async function cargarResenas(pagina = 1) {
  const filtros = estadoAdmin.filtrosResenas;
  const parametros = new URLSearchParams({
    pagina: String(pagina),
    limite: "10",
    orden: filtros.orden || "recientes"
  });
  if (filtros.buscar) {
    parametros.set("buscar", filtros.buscar);
  }
  if (filtros.calificacion && filtros.calificacion !== "todas") {
    parametros.set("calificacion", filtros.calificacion);
  }

  const respuesta = await solicitar("GET", `/api/admin/resenas?${parametros}`);

  if (!respuesta.ok) {
    mostrarMensaje(respuesta.datos?.error || "No se pudieron cargar las reseñas.", true);
    return;
  }

  estadoAdmin.resenas = respuesta.datos.resenas || [];
  estadoAdmin.paginacionResenas = respuesta.datos.paginacion || { pagina: 1, totalPaginas: 1, total: 0 };

  if (estadoAdmin.resenas.length === 0 && estadoAdmin.paginacionResenas.pagina > 1) {
    await cargarResenas(estadoAdmin.paginacionResenas.pagina - 1);
    return;
  }

  renderizarResenas();
  renderizarPaginacion(
    "resenas",
    estadoAdmin.paginacionResenas,
    estadoAdmin.filtrosResenas.buscar || estadoAdmin.filtrosResenas.calificacion !== "todas"
      ? "No hay reseñas que coincidan con el filtro."
      : "Todavía no hay reseñas en la base de datos."
  );
}

// Pinta los controles de página y desactiva los extremos. El texto se arma
// con el total real que devuelve el servidor, no con la fila actual.
function renderizarPaginacion(tipo, paginacion, textoVacio) {
  const contenedor = document.querySelector(`#paginacion-${tipo}`);
  const info = document.querySelector(`#info-${tipo}`);
  const cuerpo = document.querySelector(`#tabla-${tipo}`);
  if (!contenedor || !info) return;

  const totalPaginas = Math.max(1, paginacion.totalPaginas || 1);
  const total = paginacion.total || 0;
  const pagina = paginacion.pagina || 1;

  info.textContent = total === 0
    ? textoVacio
    : `Página ${pagina} de ${totalPaginas} · ${total} ${total === 1 ? "resultado" : "resultados"}`;

  const anterior = contenedor.querySelector('[data-pagina="anterior"]');
  const siguiente = contenedor.querySelector('[data-pagina="siguiente"]');
  if (anterior) anterior.disabled = pagina <= 1;
  if (siguiente) siguiente.disabled = pagina >= totalPaginas;

  contenedor.hidden = total === 0 && totalPaginas <= 1;
  if (cuerpo && pagina > 1) cuerpo.closest(".vista-admin")?.scrollIntoView({ block: "start" });
}

function renderizarUsuarios() {
  const cuerpo = document.querySelector("#tabla-usuarios");
  if (!cuerpo) return;

  cuerpo.replaceChildren();

  if (estadoAdmin.usuarios.length === 0) {
    cuerpo.appendChild(filaVacia("No hay usuarios para mostrar.", 7));
    return;
  }

  estadoAdmin.usuarios.forEach((usuario) => {
    const fila = document.createElement("tr");
    const esAdmin = usuario.rol === "admin";
    const esUnoMismo = usuario.id === estadoAdmin.usuario?.id;

    fila.appendChild(celda(usuario.nombreUsuario, "nombre-en-tabla"));
    fila.appendChild(celda(usuario.email));
    fila.appendChild(celda(usuario.rol === "admin" ? "Administrador" : "Usuario"));
    fila.appendChild(celda(formatearFecha(usuario.fechaRegistro)));
    fila.appendChild(celda(String(usuario.totalResenas)));

    const estado = document.createElement("td");
    estado.appendChild(etiquetaEstado(usuario.baneado ? "Suspendida" : "Activa", usuario.baneado ? "suspendido" : "activo"));
    fila.appendChild(estado);

    const acciones = document.createElement("td");
    acciones.className = "acciones-tabla";

    if (esAdmin) {
      acciones.appendChild(etiquetaEstado("Protegida", "protegido"));
    } else if (esUnoMismo) {
      acciones.appendChild(etiquetaEstado("Tu cuenta", "protegido"));
    } else {
      const botonEstado = document.createElement("button");
      botonEstado.type = "button";
      botonEstado.className = `boton-tabla ${usuario.baneado ? "exito" : "advertencia"}`;
      botonEstado.textContent = usuario.baneado ? "Reactivar" : "Suspender";
      botonEstado.addEventListener("click", () => cambiarEstadoUsuario(usuario, !usuario.baneado));
      acciones.appendChild(botonEstado);

      const botonEliminar = document.createElement("button");
      botonEliminar.type = "button";
      botonEliminar.className = "boton-tabla peligro";
      botonEliminar.textContent = "Eliminar";
      botonEliminar.addEventListener("click", () => eliminarUsuario(usuario));
      acciones.appendChild(botonEliminar);
    }

    fila.appendChild(acciones);
    cuerpo.appendChild(fila);
  });
}

function renderizarResenas() {
  const cuerpo = document.querySelector("#tabla-resenas");
  if (!cuerpo) return;

  cuerpo.replaceChildren();

  if (estadoAdmin.resenas.length === 0) {
    cuerpo.appendChild(filaVacia("No hay reseñas para mostrar.", 6));
    return;
  }

  estadoAdmin.resenas.forEach((resena) => {
    const fila = document.createElement("tr");

    fila.appendChild(celda(resena.restauranteNombre, "nombre-en-tabla"));

    const celdaAutor = document.createElement("td");
    const contenedorAutor = document.createElement("div");
    contenedorAutor.className = "autor-en-tabla";
    const nombreAutor = document.createElement("span");
    nombreAutor.className = "nombre-en-tabla";
    nombreAutor.textContent = resena.nombreUsuario;
    contenedorAutor.appendChild(nombreAutor);
    if (resena.usuarioBaneado) {
      contenedorAutor.appendChild(etiquetaEstado("Suspendido", "suspendido"));
    }
    celdaAutor.appendChild(contenedorAutor);
    fila.appendChild(celdaAutor);

    fila.appendChild(celda(`${"★".repeat(resena.calificacion)}${"☆".repeat(5 - resena.calificacion)}`, "estrellas-tabla"));
    fila.appendChild(celda(resena.comentario, "comentario-tabla"));
    fila.appendChild(celda(formatearFecha(resena.fechaCreacion)));

    const acciones = document.createElement("td");
    acciones.className = "acciones-tabla";

    const botonVer = document.createElement("button");
    botonVer.type = "button";
    botonVer.className = "boton-tabla neutro";
    botonVer.textContent = "Ver";
    botonVer.addEventListener("click", () => abrirDetalleResena(resena));
    acciones.appendChild(botonVer);

    const botonEliminar = document.createElement("button");
    botonEliminar.type = "button";
    botonEliminar.className = "boton-tabla peligro";
    botonEliminar.textContent = "Eliminar";
    botonEliminar.addEventListener("click", () => eliminarResena(resena));
    acciones.appendChild(botonEliminar);

    fila.appendChild(acciones);
    cuerpo.appendChild(fila);
  });
}

async function cambiarEstadoUsuario(usuario, baneado) {
  const accion = baneado ? "suspender" : "reactivar";
  if (!window.confirm(`¿Seguro que quieres ${accion} la cuenta de ${usuario.nombreUsuario}?`)) return;

  const respuesta = await solicitar("PATCH", `/api/admin/usuarios/${usuario.id}/estado`, { baneado });

  if (!respuesta.ok) {
    mostrarMensaje(respuesta.datos?.error || "No se pudo cambiar el estado de la cuenta.", true);
    return;
  }

  mostrarMensaje(baneado
    ? `La cuenta de ${usuario.nombreUsuario} quedó suspendida y su sesión se cerró.`
    : `La cuenta de ${usuario.nombreUsuario} quedó reactivada.`);
  await Promise.all([cargarUsuarios(estadoAdmin.paginacionUsuarios.pagina), cargarResumen()]);
}

async function eliminarUsuario(usuario) {
  const aviso = `¿Eliminar definitivamente a ${usuario.nombreUsuario}? También se borrarán sus ${usuario.totalResenas} reseña(s). Esta acción no se puede deshacer.`;
  if (!window.confirm(aviso)) return;

  const respuesta = await solicitar("DELETE", `/api/admin/usuarios/${usuario.id}`);

  if (!respuesta.ok) {
    mostrarMensaje(respuesta.datos?.error || "No se pudo eliminar la cuenta.", true);
    return;
  }

  mostrarMensaje(`La cuenta de ${usuario.nombreUsuario} fue eliminada.`);
  await Promise.all([
    cargarUsuarios(estadoAdmin.paginacionUsuarios.pagina),
    cargarResenas(estadoAdmin.paginacionResenas.pagina),
    cargarResumen()
  ]);
}

async function eliminarResena(resena) {
  const aviso = `¿Eliminar definitivamente la reseña de ${resena.nombreUsuario} en "${resena.restauranteNombre}"? Se borrará de la base de datos y de la página pública. Esta acción no se puede deshacer.`;
  if (!window.confirm(aviso)) return false;

  const respuesta = await solicitar("DELETE", `/api/admin/resenas/${resena.id}`);

  if (!respuesta.ok) {
    mostrarMensaje(respuesta.datos?.error || "No se pudo eliminar la reseña.", true);
    return false;
  }

  mostrarMensaje("La reseña se eliminó definitivamente de la base de datos y de la página pública.");
  await Promise.all([
    cargarResenas(estadoAdmin.paginacionResenas.pagina),
    cargarUsuarios(estadoAdmin.paginacionUsuarios.pagina),
    cargarResumen()
  ]);
  return true;
}

// Detalle de una reseña: muestra el comentario completo, los datos del autor
// y las acciones de moderación que no caben en la fila de la tabla.
function abrirDetalleResena(resena) {
  const dialogo = document.querySelector("#dialogo-resena");
  if (!dialogo) return;

  resenaDetalle = resena;

  escribirTexto("#detalle-restaurante", resena.restauranteNombre);
  escribirTexto("#detalle-autor", resena.nombreUsuario);
  escribirTexto("#detalle-email", resena.usuarioEmail || "No disponible");
  escribirTexto("#detalle-calificacion", `${"★".repeat(resena.calificacion)}${"☆".repeat(5 - resena.calificacion)} (${resena.calificacion} de 5)`);
  escribirTexto("#detalle-fecha", formatearFecha(resena.fechaCreacion));
  escribirTexto("#detalle-comentario", resena.comentario);

  actualizarAccionesDetalle(resena);

  if (typeof dialogo.showModal === "function") {
    if (!dialogo.open) dialogo.showModal();
  } else {
    dialogo.setAttribute("open", "");
  }
}

function actualizarAccionesDetalle(resena) {
  const botonAutor = document.querySelector("#detalle-boton-estado-autor");
  const botonModerar = document.querySelector("#detalle-boton-moderar");

  if (botonAutor) {
    const esAdmin = resena.usuarioRol === "admin";
    botonAutor.hidden = esAdmin;
    botonAutor.textContent = resena.usuarioBaneado ? "Reactivar autor" : "Suspender autor";
    botonAutor.className = `boton-tabla ${resena.usuarioBaneado ? "exito" : "advertencia"}`;
  }

  if (botonModerar) {
    botonModerar.textContent = "Eliminar reseña";
    botonModerar.className = "boton-tabla peligro";
  }
}

function cerrarDetalleResena() {
  const dialogo = document.querySelector("#dialogo-resena");
  if (!dialogo) return;

  if (typeof dialogo.close === "function" && dialogo.open) {
    dialogo.close();
  } else {
    dialogo.removeAttribute("open");
  }
  resenaDetalle = null;
}

function configurarDialogoResena() {
  const dialogo = document.querySelector("#dialogo-resena");
  if (!dialogo) return;

  document.querySelector("#cerrar-dialogo-resena")?.addEventListener("click", cerrarDetalleResena);
  document.querySelector("#detalle-boton-cerrar")?.addEventListener("click", cerrarDetalleResena);
  document.querySelector("#detalle-boton-estado-autor")?.addEventListener("click", cambiarEstadoAutorDesdeDetalle);
  document.querySelector("#detalle-boton-moderar")?.addEventListener("click", eliminarDesdeDetalle);
  document.querySelector("#detalle-boton-ver-autor")?.addEventListener("click", verAutorDesdeDetalle);

  // Un clic en el fondo oscuro (fuera del contenido) también cierra.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target === dialogo) cerrarDetalleResena();
  });

  dialogo.addEventListener("close", () => {
    resenaDetalle = null;
  });
}

async function cambiarEstadoAutorDesdeDetalle() {
  const resena = resenaDetalle;
  if (!resena) return;

  const baneado = !resena.usuarioBaneado;
  const accion = baneado ? "suspender" : "reactivar";
  if (!window.confirm(`¿Seguro que quieres ${accion} la cuenta de ${resena.nombreUsuario}?`)) return;

  const respuesta = await solicitar("PATCH", `/api/admin/usuarios/${resena.usuarioId}/estado`, { baneado });

  if (!respuesta.ok) {
    mostrarMensaje(respuesta.datos?.error || "No se pudo cambiar el estado de la cuenta.", true);
    return;
  }

  mostrarMensaje(baneado
    ? `La cuenta de ${resena.nombreUsuario} quedó suspendida y su sesión se cerró.`
    : `La cuenta de ${resena.nombreUsuario} quedó reactivada.`);

  cerrarDetalleResena();
  await Promise.all([
    cargarResenas(estadoAdmin.paginacionResenas.pagina),
    cargarUsuarios(estadoAdmin.paginacionUsuarios.pagina),
    cargarResumen()
  ]);
}

async function eliminarDesdeDetalle() {
  const resena = resenaDetalle;
  if (!resena) return;

  const exito = await eliminarResena(resena);
  if (exito) cerrarDetalleResena();
}

function verAutorDesdeDetalle() {
  const resena = resenaDetalle;
  if (!resena) return;

  cerrarDetalleResena();
  mostrarVista("usuarios");

  const buscarUsuarios = document.querySelector("#buscar-usuarios");
  if (buscarUsuarios) buscarUsuarios.value = resena.nombreUsuario;
  estadoAdmin.filtrosUsuarios.buscar = resena.nombreUsuario;
  cargarUsuarios(1);
}

function escribirTexto(selector, valor) {
  const elemento = document.querySelector(selector);
  if (elemento) elemento.textContent = valor;
}

function celda(texto, clase = "") {
  const elemento = document.createElement("td");
  elemento.textContent = texto;
  if (clase) elemento.className = clase;
  return elemento;
}

function filaVacia(texto, columnas) {
  const fila = document.createElement("tr");
  const celdaVacia = document.createElement("td");
  celdaVacia.colSpan = columnas;
  celdaVacia.className = "celda-vacia";
  celdaVacia.textContent = texto;
  fila.appendChild(celdaVacia);
  return fila;
}

function etiquetaEstado(texto, tipo) {
  const etiqueta = document.createElement("span");
  etiqueta.className = `etiqueta-estado ${tipo}`;
  etiqueta.textContent = texto;
  return etiqueta;
}

function formatearFecha(fecha) {
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(valor);
}
