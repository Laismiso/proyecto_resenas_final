const contadores = new Map();

export function limitarSolicitudes(nombre, maximo, ventanaMs) {
  return (req, res, next) => {
    const clave = `${nombre}:${req.ip}`;
    const ahora = Date.now();
    const anterior = contadores.get(clave);

    // Limpieza de entradas vencidas para que el mapa no crezca sin límite.
    for (const [cadaClave, dato] of contadores) {
      if (ahora >= dato.expira) contadores.delete(cadaClave);
    }

    if (!anterior || ahora >= anterior.expira) {
      contadores.set(clave, { cantidad: 1, expira: ahora + ventanaMs });
      return next();
    }

    anterior.cantidad += 1;
    if (anterior.cantidad > maximo) {
      res.setHeader("Retry-After", Math.ceil((anterior.expira - ahora) / 1000));
      return res.status(429).json({ error: "Demasiadas solicitudes. Intenta más tarde." });
    }

    next();
  };
}
