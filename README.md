# Sabor & Reseña

Sabor & Reseña es una aplicación web para descubrir restaurantes cerca de ti y guardar tus impresiones sobre ellos. Escribes una dirección o compartes tu ubicación, la página dibuja un mapa con los lugares que tienes alrededor y, al entrar en el detalle de cualquiera de ellos, puedes calificarlo de 1 a 5 estrellas y dejar tu opinión.

## ¿Qué incluye el proyecto?

- **Búsqueda de restaurantes por ubicación.** Puedes usar tu posición real (con el permiso del navegador) o escribir una dirección de referencia. El radio inicial de búsqueda es de 1,5 km para que la respuesta sea rápida.
- **Mapa interactivo.** Los resultados se dibujan con Leaflet sobre las capas de OpenStreetMap, con marcadores por restaurante y un punto que muestra tu ubicación con su margen de error.
- **Datos reales de los lugares.** Nombre, dirección aproximada, tipo de cocina, teléfono, sitio web y servicios (para llevar, domicilios, terraza, reservas, accesibilidad) cuando están registrados en OpenStreetMap. Si un dato no existe, simplemente no se muestra.
- **Cuentas de usuario.** Registro e inicio de sesión propios, con contraseñas protegidas, sesiones por cookie y la opción "Recordarme".
- **Recuperación de contraseña.** Si olvidas la clave, puedes pedir un enlace por correo. El enlace vence, sirve solo una vez y cierra las sesiones abiertas al usarlo.
- **Reseñas permanentes.** Para los restaurantes del catálogo propio, las reseñas se guardan en PostgreSQL con autor, calificación y fecha. Para los lugares descubiertos en OpenStreetMap, cuando hay sesión iniciada la reseña se publica directamente en PostgreSQL (creando el restaurante a partir del identificador del lugar); sin sesión se guarda en el navegador y se puede migrar con un botón.
- **Panel de administración.** Las cuentas con rol `admin` pueden entrar a `admin.html` para ver usuarios y reseñas con búsqueda, filtros y paginación, abrir el detalle completo de una reseña, suspender o reactivar al autor, eliminar comentarios definitivamente y ordenarlos por fecha o calificación. Las suspensiones de cuentas quedan registradas en la base.
- **Filtro de lenguaje.** Los comentarios con palabras ofensivas se rechazan antes de publicarse, tanto en el navegador como en el servidor.
- **Seguridad en todas las capas.** Cabeceras de protección, tokens CSRF, límite de solicitudes por IP y validación de cada dato que entra.

## ¿Cómo está armada la aplicación?

El navegador solo se encarga de mostrar: HTML, CSS y JavaScript sin frameworks. Todo lo que requiere datos —cuentas, reseñas, búsqueda en el catálogo propio— pasa por una API escrita en Node.js con Express, y esa API es la única que habla con PostgreSQL. Las credenciales de la base viven en un archivo local (`.env`) que nunca sale de tu computadora.

Los lugares se descubren con servicios públicos de OpenStreetMap: Nominatim para convertir direcciones en coordenadas y Overpass para consultar negocios cercanos. Como son servicios gratuitos sin garantía de disponibilidad, la aplicación consulta a más de un servidor, cancela las solicitudes que tardan demasiado y ofrece un botón de reintento.

## Cómo ponerlo en marcha

Necesitas **Node.js 20 o superior** y **PostgreSQL 16 o superior**. La guía completa, con cada comando, los resultados esperados y la instalación en Windows, está en [`docs/SETUP.md`](docs/SETUP.md). En resumen:

```bash
# 1. Crear el rol y la base de datos (pide una contraseña para admin_app)
sudo -u postgres psql -d postgres -f db/bootstrap.sql

# 2. Configurar la conexión local
cp .env.example .env          # y escribir la contraseña en DATABASE_URL

# 3. Instalar dependencias y crear las tablas
npm install
npm run db:migrate

# 4. Arrancar la aplicación
npm run dev
```

Listo: `http://127.0.0.1:3000` en tu navegador.

Si no quieres recordar comandos, el proyecto incluye un atajo:

```bash
npm run abrir
```

Ese comando comprueba si el servidor ya está encendido, lo levanta si hace falta y abre la página en el navegador. Funciona igual en Linux, macOS y Windows. En Windows también puedes hacer doble clic en `abrir.cmd`; en Linux y macOS queda `./abrir.sh` como envoltorio del mismo lanzador.

### Qué son `.env.example` y `.gitignore`

- **`.env.example`** es una plantilla pública. Muestra qué variables hay que configurar (conexión a PostgreSQL, correo, puerto) sin incluir contraseñas reales. Se copia como `.env` y se completa en cada computador. Sin esta plantilla, una persona nueva no sabría qué datos necesita.
- **`.env`** es el archivo real con tus contraseñas. Está ignorado por Git y nunca debe compartirse.
- **`.gitignore`** le dice a Git qué archivos no debe subir: `.env`, `node_modules`, registros, copias ZIP y archivos propios del sistema operativo. Así se evita publicar secretos o archivos que se pueden regenerar.

## Recuperación de contraseña

La página **¿Olvidaste tu contraseña?** está en `recuperar.html`. Al escribir el correo, el servidor responde siempre lo mismo para no revelar si la cuenta existe. Si existe, crea un enlace de un solo uso y lo envía por correo.

Para enviar correos reales hay que configurar un servidor SMTP en `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`). Sin esas variables, en desarrollo el enlace aparece **solo en la consola del servidor**, para poder probar el flujo sin contratar un servicio de correo. En producción sí es obligatorio configurarlas.

## Panel de administración

La cuenta con rol `admin` ve un enlace **Panel admin** en la cabecera. También se puede entrar directo a `http://127.0.0.1:3000/admin.html`. Desde ahí se pueden ver los usuarios registrados, buscarlos, suspenderlos o reactivarlos, eliminarlos y moderar las reseñas. En la pestaña **Reseñas** cada fila tiene un botón **Ver** que abre el comentario completo con los datos del autor; desde esa ventana se puede suspender o reactivar al autor o eliminar la reseña. También hay filtro por calificación y orden por fecha o puntuación. Los listados se piden al servidor por páginas, no se descarga la tabla completa en el navegador.

**Eliminar una reseña es definitivo:** la fila se borra de PostgreSQL y desaparece de la página pública. No queda una copia oculta en el panel ni se puede restaurar después.

La contraseña del usuario `admin` se guarda como hash y no se puede leer. Si no la recuerdas, cámbiala con:

```bash
npm run admin:password
```

El comando pide la nueva contraseña dos veces, sin mostrarla en pantalla, y cierra las sesiones anteriores de esa cuenta.

**Importante:** la contraseña del rol de PostgreSQL `admin_app` es otra distinta. Esa vive en la línea `DATABASE_URL` del archivo `.env` y solo la usan el backend y herramientas como pgAdmin.

### Cómo dar o quitar el rol de administrador

Hoy el rol no se cambia desde una pantalla web; se cambia con una consulta SQL controlada por quien administra el computador. Es más seguro y fácil de auditar que hacerlo desde una página, que requeriría protecciones adicionales (confirmación fuerte, registro de quién otorgó el permiso, evitar que alguien se ascienda a sí mismo o que se quede la aplicación sin ningún administrador).

Para dar permisos a una cuenta, por ejemplo `Manu_12`:

```sql
UPDATE usuarios SET rol = 'admin' WHERE nombre_usuario = 'Manu_12';
```

Para retirárselos:

```sql
UPDATE usuarios SET rol = 'usuario' WHERE nombre_usuario = 'Manu_12';
```

La consulta se ejecuta en pgAdmin (**Query Tool**) o en `psql`, sobre la base `restaurant_reviews`. El cambio se aplica en la siguiente solicitud de esa persona, sin necesidad de reiniciar el servidor.

Se dejó fuera del panel a propósito: dar permisos de administrador es una acción muy delicada. Hacerlo desde una pantalla web exigiría protecciones adicionales (confirmación fuerte, registro de quién otorgó el permiso, evitar que alguien se ascienda a sí mismo o que se quede la aplicación sin ningún administrador). Mientras el proyecto es pequeño, una consulta SQL controlada por quien administra el computador es más seguro y más fácil de auditar.

## Reseñas de OpenStreetMap y PostgreSQL

**Cómo guardan las reseñas:**

- **Restaurantes del catálogo propio.** Tienen un número de identificación y sus reseñas viven en PostgreSQL siempre que hay sesión iniciada.
- **Lugares de OpenStreetMap.** No tienen fila en la base de datos propia. Sus reseñas se guardan primero en el navegador (`localStorage`). Cuando hay sesión iniciada, la reseña se publica directamente en PostgreSQL, creando el restaurante a partir del identificador del lugar en OpenStreetMap. Si ya tenías reseñas en el navegador, la tarjeta de la cuenta muestra un botón para **migrar las reseñas guardadas en ese navegador** a la base.

**Al abrir el detalle de un lugar.**

Cuando entras al detalle de un lugar descubierto en el mapa, la página consulta la API `GET /api/reviews/osm/:tipo/:osmId`, que devuelve todas las reseñas publicadas en PostgreSQL para ese lugar (si alguien las guardó con sesión). También aparecen las reseñas que el propio navegador tenía guardadas. Ambas listas se ordenan por fecha descendente, así la más reciente esté siempre al principio.

**Resumen del flujo:**

1. Sin sesión → la reseña queda solo en el navegador.
2. Con sesión + lugar de OSM → la reseña se guarda directo en PostgreSQL (se crea el restaurante con el mismo `osm_tipo`/`osm_id`).
3. Con sesión + catálogo propio → la reseña se guarda en PostgreSQL (comportamiento anterior).
4. Para ver las reseñas ya publicadas, abre el detalle del lugar y la página las trae de la base automáticamente.

La interfaz muestra avisos claros en cada caso: si la reseña irá a la base o solo al navegador, y el botón de migrar aparece solo cuando corresponde.

## Estructura del proyecto

```text
resenas-restaurantes/
├── backend/
│   ├── config/          Lectura de .env y conexión a PostgreSQL
│   ├── lib/             Hashing, sesiones, filtro de lenguaje y correo
│   ├── middleware/      Seguridad, CSRF, límites de tasa y sesión obligatoria
│   ├── routes/          Endpoints: autenticación, restaurantes, reseñas y administración
│   └── app.js           Ensamble de la API y páginas servidas
├── css/
│   ├── estilos.css      Estilos de toda la interfaz
│   └── admin.css        Estilos del panel de administración
├── img/
│   └── principal.jpeg   Foto de terraza usada como fondo del héroe
├── db/
│   ├── bootstrap.sql    Creación segura del rol y la base (sin contraseñas)
│   └── migrations/      Esquema y datos iniciales, en orden y repetibles
├── docs/
│   ├── SETUP.md         Guía de instalación paso a paso
│   └── ARQUITECTURA.md  Cómo funciona por dentro y por qué
├── js/
│   ├── principal.js     Lógica de la página principal
│   ├── admin.js         Lógica del panel de administración
│   ├── recuperacion.js  Formularios de recuperación de contraseña
│   └── filtro-lenguaje.js  Filtro de palabras ofensivas (lado del usuario)
├── scripts/
│   ├── abrir.js         Lanzador multiplataforma (servidor + navegador)
│   ├── migrate.js       Ejecuta las migraciones pendientes
│   ├── check-database.js  Verifica tablas, dueño y conexión
│   └── restablecer-admin.js  Cambia la contraseña del usuario admin
├── test/                Pruebas automatizadas (contraseñas, filtro y API completa)
├── index.html           Página principal: mapa, búsqueda y reseñas
├── admin.html           Panel para moderar usuarios y reseñas
├── registro.html        Formulario de creación de cuenta
├── recuperar.html       Formulario para pedir el enlace de recuperación
├── restablecer.html     Formulario para elegir la contraseña nueva
├── 404.html             Página para rutas inexistentes
├── server.js            Punto de entrada del servidor
├── abrir.cmd            Atajo de doble clic para Windows
├── package.json         Dependencias y comandos
└── .env.example         Plantilla de configuración local
```

## Seguridad y privacidad, en corto

- Las contraseñas nunca se guardan tal cual: se almacena un hash `scrypt` del que no se puede recuperar el original.
- Las sesiones usan un token aleatorio en una cookie `HttpOnly`; en la base solo queda el hash del token, de modo que leer la base no permite suplantar a nadie.
- Los enlaces de recuperación también se guardan como hash, vencen y se invalidan al usarse.
- Suspender una cuenta invalida sus sesiones de inmediato y registra quién lo hizo y cuándo. Eliminar una reseña la borra definitivamente de la base.
- El navegador no conoce la contraseña de la base de datos: todo pasa por la API.
- Los datos de tu ubicación se usan únicamente durante la búsqueda y no se guardan.