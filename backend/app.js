import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { reviewsRouter } from "./routes/reviews.js";
import { restaurantsRouter } from "./routes/restaurants.js";
import { adminRouter } from "./routes/admin.js";
import { comprobarBaseDeDatos } from "./config/database.js";
import { aplicarSeguridad, limitarJson } from "./middleware/security.js";
import { prepararCsrf, exigirCsrf } from "./middleware/csrf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizProyecto = path.resolve(__dirname, "..");

export const app = express();

app.disable("x-powered-by");
app.use((req, res, next) => {
  aplicarSeguridad(res);
  next();
});
app.use(prepararCsrf);
app.use(express.json({ limit: "32kb" }));
app.use(limitarJson);
app.use(exigirCsrf);

app.get("/api/health", async (req, res, next) => {
  try {
    const base = await comprobarBaseDeDatos();
    res.json({ estado: "ok", base });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/admin", adminRouter);

app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(raizProyecto, "index.html"));
});
app.get("/registro.html", (req, res) => {
  res.sendFile(path.join(raizProyecto, "registro.html"));
});
app.get(["/recuperar.html", "/recuperar"], (req, res) => {
  res.sendFile(path.join(raizProyecto, "recuperar.html"));
});
app.get(["/restablecer.html", "/restablecer"], (req, res) => {
  res.sendFile(path.join(raizProyecto, "restablecer.html"));
});
app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(raizProyecto, "admin.html"));
});
app.use("/css", express.static(path.join(raizProyecto, "css")));
app.use("/js", express.static(path.join(raizProyecto, "js")));
app.use("/img", express.static(path.join(raizProyecto, "img")));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Ruta no encontrada." });
  // Página amable con el estilo del sitio para cualquier ruta desconocida.
  res.status(404).sendFile(path.join(raizProyecto, "404.html"));
});

app.use((error, req, res, next) => {
  console.error("Error interno:", error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Ocurrió un error interno." });
});
