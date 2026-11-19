// Cambia la contraseña del usuario admin de la aplicación.
// Pide la clave de forma oculta en la misma terminal, así que funciona en
// Linux, macOS y Windows sin depender de bash. La clave nunca se imprime ni
// se guarda en el historial de comandos.

import { configuracion } from "../backend/config/env.js";
import { pool } from "../backend/config/database.js";
import { crearHash } from "../backend/lib/passwords.js";

function preguntarOculto(texto) {
  return new Promise((resolver, rechazar) => {
    if (!process.stdin.isTTY) {
      rechazar(new Error("Este comando necesita una terminal interactiva."));
      return;
    }

    process.stdout.write(texto);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let valor = "";

    const terminar = (resultado, codigo) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", alEscribir);
      process.stdout.write("\n");
      if (codigo !== undefined) {
        process.exit(codigo);
      }
      resolver(resultado);
    };

    const alEscribir = (datos) => {
      for (const tecla of datos) {
        if (tecla === "\u0003") {
          terminar("", 130);
          return;
        }
        if (tecla === "\r" || tecla === "\n") {
          terminar(valor);
          return;
        }
        if (tecla === "\u007f" || tecla === "\b") {
          if (valor.length > 0) {
            valor = valor.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        // Se ignoran las secuencias de las flechas y otras teclas especiales.
        if (tecla === "\u001b") continue;
        valor += tecla;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", alEscribir);
  });
}

async function principal() {
  if (!configuracion.databaseUrl) {
    console.error("No se encontró DATABASE_URL. Copia .env.example como .env y completa la conexión.");
    process.exitCode = 1;
    return;
  }

  const clave = await preguntarOculto("Nueva contraseña para el usuario admin (mínimo 8 caracteres): ");
  const repetida = await preguntarOculto("Repite la contraseña: ");

  if (clave !== repetida) {
    console.error("Las contraseñas no coinciden. No se cambió nada.");
    process.exitCode = 1;
    return;
  }
  if (clave.length < 8 || clave.length > 200) {
    console.error("La contraseña debe tener entre 8 y 200 caracteres. No se cambió nada.");
    process.exitCode = 1;
    return;
  }

  const hash = await crearHash(clave);
  const resultado = await pool.query(
    `UPDATE usuarios
     SET password_hash = $1
     WHERE lower(nombre_usuario) = 'admin'
     RETURNING id, nombre_usuario, email`,
    [hash]
  );

  if (resultado.rowCount === 0) {
    console.error("No existe el usuario 'admin'. Aplica las migraciones primero.");
    process.exitCode = 1;
    return;
  }

  // Las sesiones anteriores dejan de ser válidas tras el cambio.
  await pool.query("DELETE FROM sesiones WHERE usuario_id = $1", [resultado.rows[0].id]);
  console.log(`Contraseña actualizada para ${resultado.rows[0].nombre_usuario} (${resultado.rows[0].email}).`);
  console.log(`Entra en ${configuracion.appUrl} y usa el usuario admin con la nueva contraseña.`);
}

try {
  await principal();
} catch (error) {
  console.error("No se pudo actualizar la contraseña:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
