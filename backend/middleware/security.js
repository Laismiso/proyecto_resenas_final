export function aplicarSeguridad(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self)");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' https://unpkg.com",
    "img-src 'self' data: https://unpkg.com https://*.tile.openstreetmap.org",
    "connect-src 'self' https://nominatim.openstreetmap.org https://overpass-api.de https://overpass.kumi.systems",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; "));
}

export function limitarJson(req, res, next) {
  if (req.headers["content-length"] && Number(req.headers["content-length"]) > 32_768) {
    return res.status(413).json({ error: "La solicitud es demasiado grande." });
  }
  next();
}
