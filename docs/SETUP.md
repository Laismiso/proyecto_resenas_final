# Guía de instalación de Sabor & Reseña

Esta guía cubre la instalación completa en Linux, macOS y Windows: desde una máquina limpia hasta la aplicación corriendo en `http://127.0.0.1:3000`. Cada paso explica qué hace el comando, qué debe aparecer en pantalla y cómo reaccionar si algo falla.

## Requisitos previos

Antes de tocar el proyecto, comprueba que tienes:

- **Node.js 20 o superior.** Verifica con `node --version`. Es el que ejecuta el backend, las migraciones y el lanzador.
- **PostgreSQL 16 o superior** (el proyecto se desarrolló con 18.3). En Linux se verifica con `pg_isready`; debe responder "aceptando conexiones".
- **Una terminal** para ejecutar los comandos. En Windows sirve PowerShell, el Símbolo del sistema o la terminal de Visual Studio Code.
- **Las dependencias de Node instaladas.** En la raíz del proyecto ejecuta:

```bash
npm install
```

Esto descarga Express (el servidor web), `pg` (el cliente de PostgreSQL) y `nodemailer` (el envío de correos) dentro de `node_modules/`. Debe terminar con "found 0 vulnerabilities" o similar.

## Paso 1: crear el rol y la base de datos

La base no se crea a mano tabla por tabla: el archivo `db/bootstrap.sql` hace todo el trabajo.

### En Linux o macOS

Ejecuta desde la raíz del proyecto:

```bash
sudo -u postgres psql -d postgres -f db/bootstrap.sql
```

El terminal va a pedir **tres cosas seguidas**:

1. Tu contraseña de usuario del sistema (por el `sudo`).
2. La contraseña nueva para el rol `admin_app`.
3. La misma contraseña otra vez, como confirmación.

### En Windows

Opción A: Desde el menú Inicio.

1. Abre **SQL Shell (psql)** (viene con PostgreSQL).
2. Pulsa Enter en Server, Database, Port y Username para aceptar los valores por defecto.
3. Cuando pida **Password**, escribe la contraseña del usuario `postgres` que definiste al instalar PostgreSQL.
4. Dentro de la consola de PostgreSQL, carga el archivo con la ruta completa del proyecto y barras normales. Por ejemplo:

```text
\i 'C:/Users/TuUsuario/Documentos/Proyecto/resenas-restaurantes/db/bootstrap.sql'
```

También puedes abrir una terminal en la carpeta del proyecto y ejecutar:

```bat
psql -U postgres -d postgres -f db\bootstrap.sql
```

En ese caso te pedirá la contraseña de `postgres` y después la nueva contraseña para `admin_app` dos veces.

Opción B: Ejecutando el script `db/bootstrap.sql` como administrador.

1. Clic derecho sobre `db/bootstrap.sql` en Explorador de archivos → **Ejecutar con PowerShell**.
2. O copia el contenido y págalo en una ventana de `psql` abierta como `postgres`.

### Qué debe aparecer

Después de eso verás una salida parecida a esta, que confirma que todo se creó:

```text
DO
CREATE DATABASE
Ahora está conectado a la base de datos «restaurant_reviews» con el usuario «postgres».
ALTER DATABASE
ALTER SCHEMA
GRANT
GRANT
```

**Qué hizo el script, por dentro:**

- Creó el rol `admin_app` con inicio de sesión, solo si no existía.
- Le asignó la contraseña que escribiste, de forma interactiva (nunca queda en ningún archivo).
- Creó la base `restaurant_reviews` con `admin_app` como dueño, usando `template0` para heredar una configuración limpia de colación.
- Le dio permisos completos sobre la base y el esquema `public`.

**Ten en cuenta:**

- Guarda bien la contraseña que escribiste: es la única pieza que necesitas para el paso 2.
- Si el rol o la base ya existían, el script no los recrea ni borra nada; solo ajusta dueños y permisos. Es seguro repetirlo.
- El script nunca contiene contraseñas ni comandos destructivos (`DROP`, `DELETE`, `TRUNCATE`).

## Paso 2: configurar la conexión del backend

El backend lee su configuración de un archivo `.env` que no está en el repositorio (así las contraseñas nunca se suben a Git). Se crea desde la plantilla `.env.example`:

**Linux o macOS:**

```bash
cp .env.example .env
```

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
notepad .env
```

También puedes abrirlo con Visual Studio Code: `code .env`.

Verás algo así:

```text
NODE_ENV=development
PORT=3000
HOST=127.0.0.1

# Conexión a PostgreSQL local. Reemplaza CAMBIA_ESTA_CLAVE por la
# contraseña que asignaste al rol admin_app en el paso 1.
DATABASE_URL=postgresql://admin_app:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/restaurant_reviews

# Cookie segura solo con HTTPS en producción. En local: false.
COOKIE_SECURE=false
SESSION_DAYS=7
APP_URL=http://127.0.0.1:3000
RECOVERY_MINUTES=60
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Sabor & Reseña <no-reply@example.com>
```

La única línea obligatoria de editar es `DATABASE_URL`: sustituye `CAMBIA_ESTA_CLAVE` por la contraseña que asignaste en el paso 1. Por ejemplo, si tu contraseña fuera `clave123`, la línea quedaría:

```text
DATABASE_URL=postgresql://admin_app:clave123@127.0.0.1:5432/restaurant_reviews
```

**Qué significa cada variable** (las demás pueden quedarse como están en desarrollo local):

| Variable | Significado |
|---|---|
| `DATABASE_URL` | Conexión completa: usuario, contraseña, host, puerto y base. Es el único dato sensible del proyecto. |
| `PORT` | Puerto donde escucha la API. Si el 3000 está ocupado, cámbialo aquí. |
| `HOST` | Dirección de escucha. `127.0.0.1` significa "solo esta máquina"; no expongas la API a tu red sin necesidad. |
| `COOKIE_SECURE` | Actívala en `true` solo si sirves la aplicación por HTTPS; en local debe ser `false` o las cookies no funcionan. |
| `SESSION_DAYS` | Días de vida de una sesión antes de que el servidor la deje de aceptar. Con "Recordarme" se usan 30 días. |
| `APP_URL` | Dirección que se usa para armar los enlaces de recuperación de contraseña. |
| `RECOVERY_MINUTES` | Minutos que dura el enlace de recuperación antes de vencer. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Datos del correo saliente. En desarrollo pueden quedar vacíos: el enlace de recuperación se muestra en la consola. En producción hay que completarlos. |
| `NODE_ENV` | Entorno de ejecución. `development` en tu máquina; `production` en despliegue real. |

Guarda el archivo. `.gitignore` ya excluye `.env`, pero conviene comprobarlo con `git status` antes de cualquier commit: no debe aparecer nunca.

## Paso 3: aplicar el esquema

Las tablas se crean con las migraciones, que se ejecutan en orden y de forma repetible:

```bash
npm run db:migrate
```

Salida esperada en la primera ejecución:

```text
Aplicada: 001_schema.sql
Aplicada: 002_seed_admin.sql
Aplicada: 003_moderacion.sql
Aplicada: 004_recuperacion.sql
Aplicada: 005_osm_y_unicidad.sql
```

Esto creó, dentro de `restaurant_reviews`:

- `schema_migrations`: registro de qué migraciones ya se aplicaron (es lo que hace repetible el proceso).
- `usuarios`: cuentas con `nombre_usuario`, `email`, `password_hash` (hash scrypt, nunca la contraseña), `rol` (usuario, moderador o admin) y estado de suspensión (`baneado`).
- `restaurantes`: catálogo propio con `nombre`, `direccion`, `categoria`, `telefono` y, desde la migración 005, la identificación del lugar en OpenStreetMap (`osm_tipo`, `osm_id`, `latitud`, `longitud`).
- `resenas`: una reseña por usuario y restaurante, con calificación entre 1 y 5, comentario de hasta 500 caracteres y fecha de creación. Al eliminar una reseña, la fila se borra de la tabla.
- `sesiones`: sesiones activas, guardadas por el hash SHA-256 del token y su fecha de expiración.
- `recuperaciones_contrasena`: enlaces de recuperación guardados solo como hash, con fecha de vencimiento y marca de uso.

La segunda migración crea una cuenta administrativa de ejemplo con usuario `admin`. La cuarta agrega la recuperación de contraseña. La quinta prepara el catálogo para los lugares de OpenStreetMap e impide registrar nombres de usuario o correos que solo difieran en mayúsculas y minúsculas. Luego, verifica que todo está en orden:

```bash
npm run db:check
```

Debe imprimir la conexión como usuario `admin_app`, la lista de tablas y el administrador. Si ejecutas `db:migrate` otra vez, verás "Omitida" en cada archivo: es el comportamiento correcto, no duplica nada.

## Paso 4: arrancar la aplicación

```bash
npm run dev
```

La consola muestra:

```text
Sabor & Reseña disponible en http://127.0.0.1:3000
```

En ese modo, el servidor se reinicia solo cada vez que guardas un archivo del backend. Para un uso sin reinicios automáticos, `npm start` hace lo mismo sin recarga.

Abre `http://127.0.0.1:3000` en el navegador. El formulario de registro está en `http://127.0.0.1:3000/registro.html`.

### El atajo que abre todo

Si no quieres arrancar el servidor y abrir el navegador en dos pasos, ejecuta:

```bash
npm run abrir
```

El lanzador comprueba si el servidor responde, lo levanta en segundo plano si está apagado y abre la página principal. Funciona igual en los tres sistemas. En Windows también puedes hacer doble clic en `abrir.cmd`, y en Linux o macOS queda `./abrir.sh` como envoltorio del mismo lanzador.

El servidor lanzado en segundo plano guarda su salida en `sabor-backend.log`, dentro del proyecto. Si algo falla al arrancar, ese archivo dice qué pasó.

## Verificar que la API responde

Sin abrir el navegador puedes comprobar el estado con:

```bash
curl http://127.0.0.1:3000/api/health
```

En Windows PowerShell, si `curl` no está disponible, usa:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Respuesta esperada:

```json
{"estado":"ok","base":{"base":"restaurant_reviews","usuario":"admin_app"}}
```

Si la base no está disponible, la misma ruta devolverá un error 500; eso indica que el servicio de PostgreSQL está detenido o que la conexión de `.env` no es correcta.

## Recuperación de contraseña por correo

La página `recuperar.html` pide el correo y responde siempre lo mismo, exista o no la cuenta. Si existe, crea un enlace de un solo uso.

- **En desarrollo, sin SMTP configurado:** el enlace aparece en la consola del servidor. Es la forma más rápida de probar el flujo.
- **Con correo real:** completa `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` en `.env`. Por ejemplo, con un servicio que use el puerto 587 y STARTTLS, deja `SMTP_SECURE=false`; si usa el puerto 465, ponlo en `true`.
- **En producción:** el enlace se arma con `APP_URL`. Si la aplicación estuviera en `https://mi-sitio.com`, esa variable debe tener exactamente esa dirección.

El enlace vence según `RECOVERY_MINUTES` (60 minutos por defecto) y se invalida al usarlo. Al cambiar la contraseña se cierran todas las sesiones de esa cuenta.

## Ejecutar las pruebas

```bash
npm test
```

Corre las pruebas automatizadas del proyecto: la creación y verificación de contraseñas, el filtro de lenguaje y, desde `test/api.test.js`, **seis recorridos** contra la base de datos real (rutas protegidas, ciclo completo de registro y reseña, importación desde OpenStreetMap, lectura de reseñas por lugar, recuperación de contraseña y suspensión/moderación desde el panel). Ese último bloque **necesita PostgreSQL en ejecución**; si la base está apagada, esas pruebas fallarán mientras las demás siguen pasando. Al terminar, las pruebas eliminan por sí solas los datos que crearon, así que no dejan rastro en la base.

Si solo quieres comprobar las partes que no usan la base:

```bash
node --test test/passwords.test.js test/filtro.test.js
```

## Panel de administración

La cuenta con rol `admin` puede entrar a `http://127.0.0.1:3000/admin.html`. Desde ahí puede:

- Ver las cuentas y cuántas reseñas tiene cada una, con búsqueda por nombre o correo y páginas de 10 resultados.
- Suspender una cuenta (sus sesiones se cierran al instante) o reactivarla.
- Eliminar una cuenta y, con ella, sus reseñas.
- Ver las reseñas con búsqueda por autor, restaurante o comentario, filtrar por calificación (1 a 5) y ordenarlas por fecha o puntuación.
- Abrir el detalle completo de una reseña con **Ver**. Desde esa ventana se puede suspender o reactivar al autor o eliminar la reseña.
- Eliminar una reseña la borra definitivamente de la base de datos y de la página pública. No queda una copia oculta ni se puede restaurar.

Si no recuerdas la contraseña del usuario `admin`, cámbiala sin exponerla:

```bash
npm run admin:password
```

El comando la pide dos veces y no la muestra en pantalla. Funciona en Linux, macOS y Windows. No es la misma contraseña del rol `admin_app` de PostgreSQL: esa está en `.env` y solo la usa el backend.

### Dar o quitar el rol de administrador

El rol se cambia con una consulta SQL, no desde el panel. En pgAdmin abre **Tools → Query Tool**, o entra a `psql` con el usuario `admin_app`, y ejecuta:

```sql
UPDATE usuarios SET rol = 'admin' WHERE nombre_usuario = 'Manu_12';
```

Para retirarlo:

```sql
UPDATE usuarios SET rol = 'usuario' WHERE nombre_usuario = 'Manu_12';
```

El cambio se aplica en la siguiente solicitud de esa persona, sin reiniciar el servidor. Se recomienda mantener al menos una cuenta `admin`; las cuentas administrativas están protegidas contra suspensión y borrado desde el panel.

## Ver la base desde pgAdmin

pgAdmin no trae servidores configurados: hay que registrar la conexión una vez. Funciona igual en Linux y Windows.

1. Clic derecho en **Servers** → **Register** → **Server...**
2. En **General**, nombre: `Sabor y Reseña`.
3. En **Connection**:

   | Campo | Valor |
   |---|---|
   | Host | `127.0.0.1` |
   | Port | `5432` |
   | Maintenance database | `restaurant_reviews` |
   | Username | `admin_app` |
   | Password | la que está en `DATABASE_URL` dentro de `.env` |

4. Pulsa **Save** y despliega:

   ```text
   Servers → Sabor y Reseña → Databases → restaurant_reviews
            → Schemas → public → Tables
   ```

5. Para ver las filas: clic derecho en una tabla → **View/Edit Data** → **All Rows**. También puedes usar **Tools → Query Tool** y ejecutar `SELECT * FROM usuarios;` con **F5**.

Si aparece `permission denied for database postgres`, conectaste como `admin_app` pero elegiste la base de mantenimiento `postgres`. Vuelve a editar la conexión y usa `restaurant_reviews`.

## Problemas frecuentes

**"Falta DATABASE_URL. Copia .env.example como .env..."**
El archivo `.env` no existe o la línea `DATABASE_URL` quedó sin completar. Vuelve al paso 2.

**`npm` no se reconoce como comando en Windows**
Node.js no quedó en el PATH. Cierra y vuelve a abrir la terminal después de instalarlo; si sigue igual, reinstala Node.js marcando la opción de agregarlo al PATH.

**PowerShell bloquea `npm.ps1`**
Windows puede impedir la ejecución de scripts. Abre PowerShell y ejecuta una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

También puedes usar el Símbolo del sistema (`cmd`) en lugar de PowerShell.

**Error de contraseña al migrar** (`password authentication failed`)
La contraseña de `.env` no coincide con la del rol. Reasígnala de forma segura.

En Linux:

```bash
sudo -u postgres psql -d postgres
```

En Windows, abre **SQL Shell (psql)** y entra como `postgres`. Dentro de `psql` escribe `\password admin_app`, ingresa la nueva clave y actualiza `.env`.

**"la base de datos restaurant_reviews no existe"** (o similar en `db:check`)
El paso 1 no se completó. Ejecuta de nuevo `db/bootstrap.sql` y revisa que la salida incluya `CREATE DATABASE`.

**Publiqué una reseña de un lugar del mapa y no aparece en PostgreSQL**
Si estaba iniciada la sesión en ese momento, la reseña se publica directamente en PostgreSQL al guardarla; no hace falta migrar. Si no había sesión, se guarda en el navegador y es normal que no aparezca en PostgreSQL: inicia sesión y usa **Migrar reseñas a PostgreSQL** en la tarjeta de tu cuenta. Si la reseña es muy antigua y no guardó los datos del lugar, abre otra vez ese restaurante desde el mapa para completarlos y vuelve a intentarlo. La interfaz muestra cuántas se pueden migrar.

**Pedí recuperar mi contraseña y no llega el correo**
Si no configuraste SMTP, el enlace no se envía: aparece en la consola del servidor. En producción, revisa las variables `SMTP_*` y la carpeta de spam. Por seguridad, la página nunca dice si el correo está registrado o no.

**No recuerdo la contraseña del usuario admin de la aplicación**
No se puede recuperar porque está guardada como hash. Cámbiala con `npm run admin:password`; el comando la pide de forma oculta y cierra las sesiones anteriores.

**El puerto 3000 ya está en uso**
Otro proceso lo ocupa (posiblemente una instancia anterior del servidor). Cambia `PORT` en `.env` a otro valor, por ejemplo 3001, y reinicia. Recuerda actualizar `APP_URL` si cambias el puerto.

**La página carga pero el mapa no aparece**
El mapa depende de Leaflet y OpenStreetMap, que se cargan desde internet. Si no hay conexión, la interfaz lo indica con un mensaje y el resto de la página sigue funcionando.

**Errores de colación al crear la base** (`collation version mismatch`)
Aparece solo si se creó la base con `template1` después de actualizar PostgreSQL. El script lo evita usando `template0`; si la base la creaste a mano, bórrala (si está vacía) y repite el paso 1.

## Resumen del camino completo

```text
npm install  →  psql -f db/bootstrap.sql  →  copiar .env.example a .env
             →  editar DATABASE_URL  →  npm run db:migrate
             →  npm run db:check  →  npm run dev  →  http://127.0.0.1:3000
```