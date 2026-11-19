// Lanzador multiplataforma: comprueba si el servidor ya responde, lo levanta
// en segundo plano cuando hace falta y abre la página en el navegador.
// Funciona en Linux, macOS y Windows con el mismo comando: npm run abrir.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { configuracion } from "../backend/config/env.js";

const URL_SALUD = `${configuracion.appUrl}/api/health`;
const ARCHIVO_REGISTRO = path.join(configuracion.proyecto, "sabor-backend.log");

function dormir(milisegundos) {
  return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

async function servidorActivo() {
  try {
    const respuesta = await fetch(URL_SALUD, { signal: AbortSignal.timeout(2000) });
    // Un 500 significa que el servidor está vivo aunque la base falle.
    return respuesta.ok || respuesta.status === 500;
  } catch (error) {
    return false;
  }
}

async function levantarServidor() {
  const registro = fs.openSync(ARCHIVO_REGISTRO, "a");
  const hijo = spawn(process.execPath, ["server.js"], {
    cwd: configuracion.proyecto,
    detached: true,
    stdio: ["ignore", registro, registro],
    windowsHide: true
  });
  hijo.unref();
  fs.closeSync(registro);

  for (let intento = 0; intento < 30; intento += 1) {
    await dormir(500);
    if (await servidorActivo()) return true;
  }
  return false;
}

function abrirNavegador(url) {
  const opciones = { detached: true, stdio: "ignore", windowsHide: true };
  let comando;
  let argumentos;

  if (process.platform === "win32") {
    comando = "cmd";
    argumentos = ["/c", "start", "", url];
  } else if (process.platform === "darwin") {
    comando = "open";
    argumentos = [url];
  } else {
    comando = "xdg-open";
    argumentos = [url];
  }

  try {
    const proceso = spawn(comando, argumentos, opciones);
    proceso.on("error", () => {});
    proceso.unref();
    return true;
  } catch (error) {
    return false;
  }
}

if (await servidorActivo()) {
  console.log("El servidor ya estaba en marcha.");
} else {
  console.log("Levantando el servidor...");
  const activo = await levantarServidor();

  if (!activo) {
    console.error(`No se pudo iniciar el servidor. Revisa ${ARCHIVO_REGISTRO}`);
    process.exit(1);
  }
  console.log("Servidor levantado.");
}

console.log(`Abriendo ${configuracion.appUrl} ...`);
if (!abrirNavegador(configuracion.appUrl)) {
  console.log(`Abre esta dirección en tu navegador: ${configuracion.appUrl}`);
}
