# Cómo está construido Sabor & Reseña

Este documento explica la arquitectura del proyecto: qué piezas existen, cómo se comunican y, sobre todo, por qué se tomaron cada una de las decisiones. Está escrito para quien mantendrá el código más adelante, incluyendo el autor de este proyecto dentro de seis meses.

## El camino de un dato

Todo lo que el usuario hace en la página recorre siempre el mismo camino:

```text
Navegador (HTML, CSS, JavaScript)
        │   fetch con JSON + cookie de sesión + token CSRF
        ▼
API de Node.js (Express)
        │   validación → consultas con parámetros $1, $2, ...
        ▼
PostgreSQL  (base: restaurant_reviews)
```

El navegador **jamás** habla directamente con PostgreSQL. Esta separación es la decisión central del proyecto y tiene dos motivos concretos: la base de datos nunca expone credenciales ni acepta conexiones del mundo exterior, y todo lo que llega del usuario pasa por validación en el servidor antes de tocar una tabla. Un navegador puede ser modificado a voluntad por quien lo usa; el servidor es el único punto de confianza.

## Un ejemplo completo: publicar una reseña

Para ver las piezas en acción, este es el recorrido de una reseña que llega al catálogo propio:

1. El usuario completa el formulario y pulsa "Publicar reseña".
2. El navegador valida el texto localmente (campos completos, filtro de lenguaje) y envía `POST /api/reviews` con el token CSRF en el encabezado y la cookie de sesión.
3. La API ejecuta, en orden: verificación del token CSRF, límite de solicitudes por IP (20 reseñas cada 15 minutos), exigencia de sesión, validación de calificación (1 a 5), comentario (1 a 500 caracteres) y filtro de lenguaje.
4. Si todo pasa, se ejecuta `INSERT INTO resenas ...` con parámetros (`$1, $2, $3, $4`), nunca con texto concatenado. Las restricciones de la base (llave foránea, calificación entre 1 y 5, unicidad de una reseña por usuario y restaurante) son la última línea de defensa.
5. La reseña queda guardada con autor y fecha, y se muestra en la página.

Cualquier fallo en el camino termina en una respuesta HTTP con mensaje claro (400 datos inválidos, 401 sin sesión, 403 CSRF, 404 restaurante inexistente, 409 reseña duplicada, 429 demasiadas solicitudes).

## Qué hay en cada carpeta

### `backend/config/`
- `env.js`: lee `.env`, lo interpreta línea a línea y exporta la configuración (puerto, conexión, días de sesión, dirección pública, duración de los enlaces de recuperación y datos SMTP). Si falta `DATABASE_URL`, el proyecto falla de inmediato con un mensaje claro en lugar de arrancar a medias.
- `database.js`: crea el *pool* de conexiones de PostgreSQL (hasta 10 conexiones reutilizadas en lugar de abrir y cerrar por cada consulta).

### `backend/lib/`
- `passwords.js`: hashing y verificación con `scrypt`. El hash guarda sus propios parámetros (`scrypt$32768$8$1$...`), así que si en el futuro suben los costos, los hashes viejos siguen verificándose con sus valores originales.
- `sessions.js`: crea, consulta y destruye sesiones. El token viaja en la cookie; en la base solo se guarda su hash SHA-256. La opción "Recordarme" decide si la cookie sobrevive al cierre del navegador.
- `filtro-lenguaje.js`: detecta palabras ofensivas normalizando el texto (acentos, mayúsculas, letras por números).
- `email.js`: arma y envía el correo de recuperación con `nodemailer`. Si no hay SMTP configurado en desarrollo, muestra el enlace en la consola del servidor en lugar de fallar.

### `backend/middleware/`
- `security.js`: cabeceras de protección (CSP, anti-clickjacking, tipos MIME) y límite de tamaño del cuerpo JSON (32 KB).
- `auth.js`: exige sesión activa para las rutas protegidas y ofrece `exigirAdmin` para las rutas de moderación.
- `csrf.js`: entrega el token en una cookie y exige que cada mutación lo devuelva en el encabezado `X-CSRF-Token`.
- `rate-limit.js`: limita solicitudes por IP y ruta (registro: 5 cada 15 min; login: 10; recuperación y reseñas: límites propios), liberando las entradas vencidas para no acumular memoria.

### `backend/routes/`
- `auth.js`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `POST /recuperar` y `POST /restablecer`. En login y registro se rota la sesión previa para evitar que una sesión vieja siga viva. El login rechaza con 403 las cuentas suspendidas.
- `restaurants.js`: búsqueda por texto y creación en el catálogo propio. El frontend tiene su propio buscador que consulta esta ruta: los resultados aparecen con la etiqueta "Catálogo del sitio".
- `reviews.js`: lectura pública por restaurante (con la marca `es_propia` para saber si la reseña es de la cuenta actual), escritura protegida con filtro de lenguaje, importación de reseñas locales y `DELETE /:resenaId` para que el autor borre su propia reseña de la base.
- `admin.js`: rutas de moderación con búsqueda, filtros y paginación en el servidor. Lista usuarios y reseñas, entrega un resumen para los contadores, suspende o reactiva cuentas, elimina usuarios y borra reseñas definitivamente. La lista de reseñas acepta `calificacion` (1 a 5) y `orden` (recientes, antiguas, mejor o peor), y devuelve los datos del autor que usa la ventana de detalle (`usuarioEmail`, `usuarioRol`, `usuarioBaneado`). Todas pasan por `exigirSesion` y `exigirAdmin`.

### `db/` y `scripts/`
Las migraciones en `db/migrations/` se aplican en orden y una sola vez: `scripts/migrate.js` consulta `schema_migrations` dentro de una transacción, aplica lo pendiente y hace *rollback* si algo falla a mitad de camino, dejando la base como estaba. `scripts/check-database.js` imprime el estado para verificar a mano.

`scripts/abrir.js` es el lanzador multiplataforma: comprueba la salud del servidor con `fetch`, lo inicia en segundo plano si hace falta y abre el navegador según el sistema operativo. `abrir.cmd` (Windows) y `abrir.sh` (Linux/macOS) son solo atajos hacia ese mismo archivo.

## La base de datos

Cuatro decisiones de diseño que conviene conocer antes de modificar el esquema:

- **Roles con ENUM**: `rol_usuario` restringe los valores a `admin`, `moderador`, `usuario`. Añadir un rol requiere una migración de `ALTER TYPE`, no un cambio en el código.
- **Integridad en cascada**: al eliminar un usuario o restaurante se eliminan sus reseñas y sesiones (`ON DELETE CASCADE`), sin dejar huérfanos.
- **Restricciones reales, no solo en la API**: la calificación tiene un `CHECK (BETWEEN 1 AND 5)`, el comentario limita su longitud en la base y la unicidad usuario/restaurante impide que la misma cuenta publique dos reseñas del mismo restaurante. La API puede tener un fallo; la base, no.
- **Identidad sin ambigüedades**: desde la migración `005_osm_y_unicidad.sql`, los nombres de usuario y los correos tienen un índice único sobre su versión en minúsculas. Así no pueden coexistir `Manu_12` y `manu_12`, y el login siempre encuentra una sola cuenta. La misma migración agrega a `restaurantes` el tipo y el id de OpenStreetMap, con un índice único parcial para que un lugar no se duplique al importarlo varias veces.

## Seguridad, decisión por decisión

**Contraseñas con `scrypt`.** Es un algoritmo de la librería estándar de Node, moderno y con costo de memoria configurable, que hace inviable el ataque por fuerza bruta con tarjetas gráficas. Se eligió `node:crypto` para no añadir dependencias que mantener.

**Sesiones sin estado visible.** El token de sesión es aleatorio (32 bytes), viaja en una cookie `HttpOnly` (invisible para JavaScript, inmune a robo por XSS) con `SameSite=Lax`. En la base solo queda su hash, así que quien robe una copia de la base no puede reconstruir sesiones activas.

**Recuperación sin filtrar cuentas.** `POST /api/auth/recuperar` responde el mismo mensaje exista o no el correo. Si la cuenta existe, genera 32 bytes aleatorios, guarda solo su hash SHA-256 en `recuperaciones_contrasena` y envía el valor original por correo. El enlace vence y se marca como usado dentro de una transacción; al cambiar la contraseña se borran todas las sesiones de esa cuenta. Guardar solo el hash significa que una copia de la base no permite usar los enlaces pendientes.

**CSRF con doble envío.** El servidor entrega el token en una cookie y el frontend lo devuelve en un encabezado. Un sitio malicioso puede forzar al navegador a enviar solicitudes, pero no puede leer la cookie del dominio ajeno, así que no puede completar el encabezado: la solicitud se rechaza con 403.

**Cabeceras de protección.** La CSP restringe los orígenes de scripts, estilos, imágenes y conexiones a los que el proyecto realmente usa (unpkg para Leaflet, OpenStreetMap para tiles y geocodificación). `X-Frame-Options: DENY` impide que otro sitio muestre la app en un iframe.

**El cuerpo JSON tiene tope.** 32 KB es más que suficiente para cualquier formulario de la aplicación y evita que un cliente malintencionado intente colgar el proceso con un cuerpo gigante.

## Reseñas en dos destinos y migración a PostgreSQL

Decisión de diseño clave: la aplicación distingue dos fuentes de lugares.

### Origen A — Catálogo propio
Los restaurantes añadidos desde el buscador del catálogo tienen un número de identificación (`id` numérico). Sus reseñas viven siempre en PostgreSQL cuando hay sesión iniciada.

### Origen B — OpenStreetMap
Los lugares descubiertos en el mapa vienen de OpenStreetMap. **No tienen fila en la tabla `restaurantes`** hasta que alguien los importa. Sus reseñas se comportan de la siguiente manera:

| Sesión | Comportamiento |
|---|---|
| Sin sesión | La reseña se guarda solo en el navegador (`localStorage`). Aparece el aviso: "Este lugar viene de OpenStreetMap: sus reseñas se guardan solo en este navegador, no en PostgreSQL." |
| Con sesión | La reseña se publica directamente en PostgreSQL, creando el restaurante a partir del identificador del lugar (`osm_tipo`, `osm_id`). El aviso cambia a: "Este lugar viene de OpenStreetMap: al guardar la reseña con tu cuenta, se guarda en PostgreSQL." |

### ¿Por qué este diseño?
- Los lugares de OSM no tienen dueño ni catálogo propio, por eso sus reseñas no iban a la base originalmente.
- Con sesión, el usuario queda identificado y la reseña sí puede guardarse en PostgreSQL, para que el admin pueda moderarla, buscarla o eliminarla.
- Sin sesión, el anonimato se respeta guardando solo en el navegador.

### Migración desde el navegador
Si ya tenías reseñas guardadas en el navegador (sin sesión) para un lugar de OpenStreetMap, la tarjeta de la cuenta muestra un botón **"Migrar reseñas a PostgreSQL"**. Al pulsarlo:

1. Se crea (o se reutiliza) un restaurante en PostgreSQL usando el identificador del lugar en OpenStreetMap, de modo que no se duplique aunque lo importen varias personas.
2. Se publica la reseña con tu cuenta.
3. Si ya tenías una reseña de ese restaurante en la base, se marca como duplicada y se quita solo la copia del navegador.
4. Las reseñas viejas que no guardaron los datos del lugar no se pueden migrar. Al abrir de nuevo ese lugar desde el mapa, la aplicación completa esos datos para que puedas intentarlo otra vez.

### Lectura desde la API
La página también consulta la API para mostrar las reseñas que ya están en la base:

- Cuando se abre el detalle de un lugar de OpenStreetMap, el frontend ejecuta `GET /api/reviews/osm/:tipo/:osmId`.
- La API resuelve el restaurante por su `osm_tipo` e `osm_id` y devuelve las reseñas publicadas en PostgreSQL.
- Ese resultado se combina con las reseñas que el navegador tenía guardadas para ese mismo lugar y se ordenan por fecha descendente.
- Así una reseña publicada con sesión aparece en el detalle aunque nunca pasó por el flujo de "migración".

### Guardar una reseña local (importación)
Cada reseña guardada en el navegador incluye ahora los datos mínimos para poder importarla a PostgreSQL:

- `osmTipo` (node, way o relation)
- `osmId` (el identificador numérico del lugar)
- `nombre`, `dirección`, `categoría`, `teléfono`, `latitud`, `longitud`

Con esos datos, `POST /api/reviews/importar` puede crear el restaurante en PostgreSQL con `ON CONFLICT (osm_tipo, osm_id)`, publicar la reseña con la cuenta actual y responder por cada elemento si se importó, ya existía o se omitió. La operación se hace elemento por elemento dentro de su propia transacción: una reseña inválida no tumba las demás.

Las reseñas antiguas que no guardaron esos datos (por ejemplo, las creadas antes de que existiera esta columna) se completan al abrir de nuevo el lugar desde el mapa: la aplicación rellena los campos faltantes y entonces sí se pueden migrar.

## Eliminar una reseña: borrado definitivo

Cada autor puede eliminar su propia reseña con `DELETE /api/reviews/:id`. La ruta ejecuta `DELETE FROM resenas WHERE id = $1 AND usuario_id = $2`: la fila sale de la base de datos y desaparece de la página, sin estados intermedios ni copias que haya que limpiar después. Si la reseña no existe o pertenece a otra persona, responde 404 sin distinguir los dos casos.

El panel de administración usa la misma idea: `DELETE /api/admin/resenas/:id` borra la fila completa. No hay botón de "restaurar" porque no queda nada que restaurar; por eso la interfaz ya no muestra un filtro de reseñas eliminadas ni una columna de estado. Antes se usaba borrado lógico (`eliminada = TRUE`), pero dejaba filas "fantasma" en la base y en la lista del panel; se cambió a borrado real para que la eliminación sea definitiva.

La unicidad usuario/restaurante sigue protegiendo contra duplicados mientras la reseña existe. Al borrarla de verdad, la misma persona puede volver a publicar una reseña de ese restaurante sin chocar con una fila vieja.

La ruta devuelve 404 tanto si la reseña no existe como si pertenece a otra persona, sin distinguir un caso del otro: así la API no revela qué reseñas existen ni de quién son. El botón "Eliminar" solo aparece en las reseñas del propio usuario, pero la decisión final la toma el servidor; que el botón no aparezca nunca es una cuestión de experiencia, no de seguridad.

## Panel de administración y suspensión de cuentas

Las cuentas con `rol = 'admin'` acceden a `admin.html` y a las rutas `/api/admin/*`. El middleware `exigirAdmin` comprueba el rol en cada solicitud; esconder el enlace en la interfaz no es una medida de seguridad, solo comodidad.

Suspender una cuenta hace dos cosas: marca `usuarios.baneado = TRUE` y borra sus filas de `sesiones`. Además, `obtenerUsuarioSesion` filtra las cuentas suspendidas y el login responde 403, de modo que la persona pierde acceso de inmediato aunque tenga una pestaña abierta. Las cuentas administrativas están protegidas: no se pueden suspender ni eliminar desde el panel, y nadie puede borrar su propia cuenta.

La moderación de reseñas usa el mismo borrado definitivo: el administrador puede eliminar cualquier reseña y la fila desaparece de la base. En la interfaz, el botón **Ver** abre una ventana con el comentario completo y los datos del autor; desde ahí se puede suspender o reactivar la cuenta sin cambiar de pestaña, además de eliminar la reseña. La lista acepta búsqueda, filtro por calificación y orden; ya no hay filtro por estado porque todas las reseñas que existen están publicadas.

Los listados del panel ya no traen la tabla completa: `GET /api/admin/usuarios` y `GET /api/admin/resenas` reciben `pagina`, `limite` y `buscar`, y devuelven los datos junto con el total de resultados. La lista de reseñas además acepta `estado`, `calificacion` y `orden`; el filtro se aplica en PostgreSQL, no en el navegador. La búsqueda se hace con `ILIKE` y escapa `%`, `_` y `!` para que un comodín escrito por el usuario se busque como texto literal. Los contadores de arriba vienen de `GET /api/admin/resumen`, que cuenta en la base; antes se calculaban sumando solo las filas visibles y por eso no reflejaban la realidad cuando había más de 500.

### Por qué el rol no se cambia desde el panel

Dar o quitar `admin` es la operación más delicada del sistema. Hacerlo desde una pantalla web exigiría, como mínimo, evitar que una persona se ascienda a sí misma, impedir que se quede la aplicación sin administradores, pedir una confirmación fuerte y registrar quién otorgó el permiso. Mientras el proyecto sigue siendo pequeño, una consulta SQL ejecutada por quien controla el computador cubre esas necesidades con menos superficie de error:

```sql
UPDATE usuarios SET rol = 'admin' WHERE nombre_usuario = 'Manu_12';
UPDATE usuarios SET rol = 'usuario' WHERE nombre_usuario = 'Manu_12';
```

Como `obtenerUsuarioSesion` lee el rol de la base en cada solicitud, el cambio surte efecto de inmediato. El panel sí protege las cuentas administrativas existentes: no se pueden suspender ni eliminar desde la interfaz, y nadie puede borrar su propia cuenta.

## Dos fuentes de lugares, una misma pantalla

La página muestra lugares de dos orígenes: los descubiertos en OpenStreetMap (con coordenadas, distancia al punto de búsqueda y enlace al mapa) y los del catálogo propio, que se consultan desde el buscador de la página principal. Los del catálogo no guardan coordenadas, así que su tarjeta no muestra distancia ni enlace al mapa: solo sus datos registrados. El detalle se construye a partir de lo que cada origen puede ofrecer, sin campos inventados.

## La página que no existe

Las rutas desconocidas reciben una página con el estilo del sitio (estado HTTP 404) en lugar de texto plano. Los enlaces de esa página son absolutos (`/index.html`) porque la ruta que la recibió puede tener cualquier nivel de profundidad: con enlaces relativos, el navegador los resolvería contra esa ruta errada y volvería a caer en el 404.

## Filtro de lenguaje en dos capas

El navegador avisa al instante y no envía el formulario; el servidor vuelve a aplicar la misma regla y responde 400 con las palabras detectadas. La razón de la duplicación: un filtro solo en el navegador se desactiva con las herramientas de desarrollador. La capa del servidor es la que hace cumplir la regla de verdad; la del navegador solo mejora la experiencia.

## Datos externos y su manejo

La geocodificación usa Nominatim y la consulta de negocios, Overpass. Ambos son públicos, gratuitos y sin garantía. El frontend maneja esa incertidumbre así: consulta Nominatim primero (respuesta típica en menos de un segundo), y si no hay resultados recurre a Overpass consultando a dos servidores en paralelo y aceptando el primero que responda (`Promise.any`). Un temporizador de 10 segundos cancela la búsqueda y muestra un botón de reintento. Las solicitudes antiguas se abortan al iniciar una nueva, de modo que moverse por el mapa nunca mezcla resultados.