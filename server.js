import { app } from "./backend/app.js";
import { configuracion, correoConfigurado } from "./backend/config/env.js";

app.listen(configuracion.port, configuracion.host, () => {
  console.log(`Sabor & Reseña disponible en http://${configuracion.host}:${configuracion.port}`);

  if (!correoConfigurado()) {
    const aviso = "Recuperación por correo: no hay SMTP configurado. En desarrollo, los enlaces aparecerán en esta consola.";
    if (configuracion.nodeEnv === "production") {
      console.warn(`AVISO: ${aviso} Configura SMTP_HOST para enviar correos reales.`);
    } else {
      console.log(aviso);
    }
  }
});
