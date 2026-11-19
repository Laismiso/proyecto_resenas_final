// Formularios de recuperación de contraseña. Solo hablan con la API; nunca
// guardan el token en localStorage ni lo muestran en la dirección.
document.addEventListener("DOMContentLoaded", () => {
  configurarMenu();
  configurarMostrarContrasena();
  configurarSolicitud();
  configurarRestablecimiento();
});

function configurarMenu() {
  const boton = document.querySelector("#boton-menu");
  const menu = document.querySelector("#menu-principal");
  if (!boton || !menu) return;

  boton.addEventListener("click", () => {
    const abierto = menu.classList.toggle("abierto");
    boton.setAttribute("aria-expanded", String(abierto));
  });
}

function configurarMostrarContrasena() {
  document.querySelectorAll(".boton-contrasena").forEach((boton) => {
    boton.addEventListener("click", () => {
      const campo = document.querySelector(`#${boton.dataset.campo}`);
      if (!campo) return;

      const visible = campo.type === "text";
      campo.type = visible ? "password" : "text";
      boton.textContent = visible ? "👁" : "🙈";
      boton.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
    });
  });
}

function configurarSolicitud() {
  const formulario = document.querySelector("#formulario-recuperar");
  const mensaje = document.querySelector("#mensaje-recuperar");
  if (!formulario || !mensaje) return;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);

    mensaje.textContent = "Enviando la solicitud...";
    mensaje.classList.remove("aviso-error");

    const respuesta = await enviarJson("/api/auth/recuperar", {
      email: String(datos.get("correo") || "").trim()
    });

    if (respuesta.ok) {
      // El servidor responde lo mismo exista o no la cuenta, para no revelar
      // qué correos están registrados.
      mensaje.textContent = respuesta.datos.mensaje
        || "Si el correo está registrado, recibirás un enlace para crear una contraseña nueva.";
      formulario.reset();
    } else {
      mensaje.textContent = respuesta.datos?.error || "No se pudo enviar la solicitud.";
      mensaje.classList.add("aviso-error");
    }
  });
}

function configurarRestablecimiento() {
  const formulario = document.querySelector("#formulario-restablecer");
  const estado = document.querySelector("#estado-restablecer");
  const mensaje = document.querySelector("#mensaje-restablecer");
  if (!formulario || !estado || !mensaje) return;

  const token = new URLSearchParams(window.location.search).get("token") || "";

  if (!token) {
    estado.textContent = "El enlace no trae un token válido. Pide uno nuevo desde la página de recuperación.";
    estado.classList.add("aviso-error");
    return;
  }

  // El token se queda en memoria mientras la página está abierta.
  formulario.hidden = false;
  estado.textContent = "";
  estado.hidden = true;

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const contrasena = String(datos.get("contrasena") || "");
    const confirmar = String(datos.get("confirmar") || "");

    if (contrasena.length < 8) {
      mensaje.textContent = "La contraseña debe tener al menos 8 caracteres.";
      mensaje.classList.add("aviso-error");
      return;
    }
    if (contrasena !== confirmar) {
      mensaje.textContent = "Las dos contraseñas no coinciden.";
      mensaje.classList.add("aviso-error");
      return;
    }

    mensaje.textContent = "Guardando la contraseña...";
    mensaje.classList.remove("aviso-error");

    const respuesta = await enviarJson("/api/auth/restablecer", { token, contrasena });

    if (!respuesta.ok) {
      mensaje.textContent = respuesta.datos?.error || "No se pudo cambiar la contraseña.";
      mensaje.classList.add("aviso-error");
      return;
    }

    formulario.hidden = true;
    estado.hidden = false;
    estado.textContent = "Contraseña actualizada. Te llevamos al inicio de sesión...";
    // Se limpia el token de la barra de direcciones antes de salir.
    window.history.replaceState(null, "", "restablecer.html");
    window.setTimeout(() => {
      window.location.href = "index.html?recuperada=1#inicio-sesion";
    }, 1200);
  });
}

async function enviarJson(ruta, cuerpo) {
  try {
    const respuesta = await fetch(ruta, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": leerCookie("sabor_resena_csrf")
      },
      credentials: "same-origin",
      body: JSON.stringify(cuerpo)
    });
    const datos = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, estado: respuesta.status, datos };
  } catch (error) {
    return { ok: false, estado: 0, datos: { error: "No se pudo conectar con el servidor." } };
  }
}

function leerCookie(nombre) {
  const cookies = document.cookie.split(";");
  const encontrada = cookies.find((cookie) => cookie.trim().startsWith(`${nombre}=`));
  return encontrada ? decodeURIComponent(encontrada.trim().slice(nombre.length + 1)) : "";
}
