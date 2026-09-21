---
paths:
  - "src/**"
  - "tools/**"
  - "scripts/**"
  - "Dockerfile"
  - "docker-compose.yml"
  - ".env*"
  - "*.config.*"
---
# Aprendizajes del stack (Auto-Blindaje Activo)

Trasladados de `AGENTS.md` el 2026-08-26, texto original. En Claude Code cargan solo al tocar
los archivos de `paths:`; en opencode cargan siempre (`opencode.json`). Un error critico que
aplique a TODO sigue yendo a `AGENTS.md`, no aqui.

### 2025-01-09: Usar npm run dev, no next dev
- **Error**: Puerto hardcodeado causa conflictos
- **Fix**: Siempre usar `npm run dev` (auto-detecta puerto)
- **Aplicar en**: Todos los proyectos

### 2026-08-22: globals.css con sintaxis v4 sobre Tailwind v3 rompe el build
- **Error**: `Module not found: Can't resolve 'v8'`. El boilerplate traia
  `@import 'tailwindcss'` (sintaxis Tailwind **v4**) con `tailwindcss@3.4`
  instalado. En v3 ese import resuelve al paquete **JS**, no al CSS, y arrastra
  `tailwindcss/lib -> jiti -> v8/util` al bundle del navegador.
- **Sintoma**: falla igual con Turbopack y con webpack. `npm run dev` no lo delata.
- **Fix**: con Tailwind 3.4 van las directivas `@tailwind base/components/utilities`.
  `@import 'tailwindcss'` solo si se migra a v4 + `@tailwindcss/postcss`.
- **Aplicar en**: cualquier proyecto que mezcle Next 16 con Tailwind v3.

### 2026-08-31: los tokens de shadcn dentro de `@layer base` se purgan
- **Error**: el bloque `.dark { --background: ... }` de `globals.css` **no aparecia en el
  CSS compilado**. Tailwind v3 purga las reglas de `@layer base` cuyo selector no encuentra
  en el contenido escaneado, y en un proyecto recien cableado ningun componente usa `dark`
  todavia: se lleva el tema oscuro entero.
- **Sintoma**: ninguno. Compila verde, `:root` esta, y el dia que alguien ponga `class="dark"`
  en `<html>` no pasa nada. Un fallo que solo se ve mirando el `.css` de `.next/static/`.
- **Fix**: `:root` y `.dark` van **fuera** de `@layer base` (el bloque de `@apply` con
  `border-border` / `bg-background` sigue dentro, ahi si hace falta).
- **Verificar**: `grep -c '\.dark{' .next/static/chunks/*.css` tras `npm run build`.
- **Aplicar en**: cualquier cableado de shadcn/ui sobre Tailwind v3.

### 2026-08-31: tailwind-merge 3.x es para Tailwind v4
- **Error**: instalar `tailwind-merge@latest` (3.x) junto a `tailwindcss@3.4`. Sus tablas de
  clases son las de v4, asi que resuelve mal los conflictos del v3 — sin error, con clases
  que ganan la que no toca.
- **Fix**: con Tailwind 3.4 va `tailwind-merge@^2`. Misma familia de trampa que el
  `@import 'tailwindcss'` de arriba: el numero mayor del paquete satelite sigue al de
  Tailwind, no al calendario.
- **Aplicar en**: `cn()` y cualquier utilidad que mezcle clases.

### 2026-08-22: createServerClient necesita anotar CookieMethodsServer
- **Error**: `TS7006/TS7031: Parameter 'cookiesToSet' implicitly has an 'any' type`
  en `src/lib/supabase/server.ts`. Rompe `next build` (no `npm run dev`).
- **Fix**: declarar el objeto como `CookieMethodsServer` (se exporta desde
  `@supabase/ssr`) para dar tipado contextual a `setAll`. NUNCA parchear con `any`.
- **Aplicar en**: todo helper SSR de Supabase.

### 2026-08-22: NEXT_PUBLIC_* se inlinea en BUILD, no en runtime
- **Error**: `supabaseUrl is required` en el navegador tras deploy con Docker,
  aunque las variables estuvieran en `docker-compose environment:`.
- **Fix**: las `NEXT_PUBLIC_*` viajan como `ARG`/`build.args`. Solo los secretos
  server-side (service_role, API keys) van en `environment:`.
- **Aplicar en**: todo deploy self-hosted (Hetzner, VPS, Docker).

### 2026-09-13: Node en modo strip-only no admite «parameter properties»
- **Error**: `constructor(private readonly x: T) {}` en un archivo `.ts` que se importa desde
  `node --test` (sin transpilar) revienta con `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. `tsc` lo
  acepta, Next lo compila, y solo falla al ejecutar el `.ts` directo con Node.
- **Fix**: campo explícito + asignación en el constructor. Vale para todo `.ts` que Node vaya
  a correr sin build (`scripts/*.ts`, `src/features/**` importado desde una prueba).
- **Aplicar en**: cualquier módulo que compartan Next y `node --test`.

### 2026-09-13: Compose interpola TODOS los servicios, también los de perfiles inactivos
- **Error**: `${VAR:?mensaje}` en un servicio de perfil `ocr-gpu` hacía fallar
  `docker compose --profile ocr up` sin GPU, por una variable que ese arranque no necesita.
  Y `env_file` con una ruta inexistente rompe hasta `docker compose config`.
- **Fix**: defaults `${VAR:-}` y la exigencia real en `configura:deploy`; `env_file` con
  `required: false` solo para validar, y el runbook exige el archivo en el servidor.
- **Aplicar en**: todo servicio bajo `profiles:`.

### 2026-09-13: otro `next-server` en el 3000 responde por ti, con redirect y todo
- **Error**: `npm run start` falló con `EADDRINUSE` y la prueba siguió pegando a `:3000`, que
  contestaba un Next de OTRO proyecto con `307 /login?error=config`. Parecía un middleware de
  auth propio delante de `/a2a/health`; no existía.
- **Fix**: antes de culpar a una ruta, `ss -ltnp | grep :PUERTO`. Y arrancar con `PORT` libre.
- **Aplicar en**: toda prueba contra un servidor local.

### 2026-09-13: un `import()` dinámico resuelve desde el archivo que lo hace, no desde el proceso
- **Error**: la imagen del servicio OCR instalaba `zxing-wasm` en `servicio/node_modules`, pero
  quien lo importa es `dist/lectores/zxing.js`, que busca hacia arriba desde `dist/`. Cada
  página avisaba «Cannot find package 'zxing-wasm'» y el arranque decía «cargado» porque la
  sonda solo comprobaba que el `import()` se había INTENTADO.
- **Fix**: instalar las dependencias del servicio en la raíz del paquete dentro de la imagen
  (`npm install --no-save` en `/extractor`) y sondear con una lectura real, distinguiendo
  «no está el paquete» de «esta imagen de 8 bytes no es una imagen».
- **Aplicar en**: toda imagen que copie un `dist/` y sus adaptadores con peers opcionales.

### 2026-09-13: `pkill -f '<patrón>'` mata la shell que lo lanza (medido: 10 errores en 21 sesiones)
- **Error**: `pkill -f 'node servidor.mjs'` desde Bash mata también el propio proceso de la
  herramienta, porque su línea de comando contiene el patrón. La sesión ve exit 144 y pierde el
  resto del comando. Las trayectorias lo destaparon: es el error de Bash más repetido.
- **Fix**: matar por puerto (`fuser -k 8081/tcp`) o por PID guardado; si hay que usar `pkill`,
  anclar el patrón al inicio (`pkill -f '^node servidor.mjs'`) para que la shell no case.
- **Aplicar en**: toda limpieza de procesos lanzados desde una sesión.
- **Reincidió el 2026-09-20** con la regla cargada (exit 144). Lo que sirvió: `ss -ltnp` → PID → `kill`.

### 2026-09-13: `gh pr edit` falla por un aviso de GitHub ajeno al PR
- **Error**: `gh pr edit N --body-file ...` devuelve `GraphQL: Projects (classic) is being
  deprecated` y no edita nada, aunque el PR sea correcto.
- **Fix**: `gh api -X PATCH repos/<dueña>/<repo>/pulls/N -F body=@archivo`. Crear y mezclar
  con `gh pr create` / `gh pr merge` sigue funcionando.
- **Aplicar en**: cualquier edición de la descripción de un PR desde una sesión.

### 2026-09-20: Turbopack rastrea como assets el disco que el bundle toca con `fs`
- **Error**: `existsSync` en un route handler con ruta plegable; el build siguió `medicion/banco/` y
  reventó con el symlink del venv («points out of the filesystem root»).
- **Fix**: el bundle no toca ese disco: todo sondeo va en `scripts/laboratorio-voz/maquina.mjs` por
  `execFile`; `fs` solo sobre temporales de `mkdtemp`.
- **Aplicar en**: todo route handler o server component que mire carpetas fuera de `src/`.

### 2026-09-20: `npm install` poda lo no declarado (Playwright desapareció): lo que un guion importa se declara pineado.

### 2026-09-20: Node avisa `MODULE_TYPELESS_PACKAGE_JSON` al correr un `.ts` sin `type`
- **Fix**: `{ "type": "module" }` en `scripts/package.json` y `src/package.json`; en la raíz no
  (reinterpretaría `postcss.config.js`, CommonJS). Nombra solo el PRIMER archivo sin tipo.

### 2026-09-20: el WAV que ffmpeg escribe a una tubería lleva tamaños «desconocidos»
- **Error**: `-f wav pipe:1` pone `0xFFFFFFFF` en la cabecera; el servicio de dictado lo rechazaba
  con 500 y la ruta caía al CLI en silencio: el demonio «vivo» no bajaba la latencia.
- **Fix**: PCM crudo (`-f s16le`) con la frecuencia en cabecera; y la respuesta dice por dónde
  pasó (`via`), o la caída al respaldo no se ve.
- **Aplicar en**: toda tubería de audio entre procesos.

### 2026-09-20: un proceso de Node sin handles sale en silencio, aunque espere una promesa
- **Error**: con el micrófono cerrado en espera y el único intervalo con `.unref()`, `dictar` salió
  con código 0 sin decir nada; `await` de una promesa pendiente no mantiene el proceso.
- **Fix**: un latido con referencia hasta `salir()`; medir con la salida a archivo.
- **Aplicar en**: todo demonio o CLI de larga vida que cierre recursos en reposo.

### 2026-09-20: dos de React en `/historial`
- **Una respuesta vieja pisa a la nueva si nadie numera las cargas** (sondeo «vivo» + buscador:
  188 donde debía haber 28): cada carga lleva número y solo se aplica la última; el sondeo no
  corre con una carga en vuelo; la captura exige cuenta y lista iguales.
- **`react-hooks/set-state-in-effect` no acepta un `await` como separación**: el efecto solo
  dispara la promesa; el estado lo escribe la promesa al resolver.

### 2026-09-21: cinco de los goals de ajustes y de voz (detalle en sus post-mortem)
- **Matar `npx` no mata a `next-server`**: un servidor de pruebas quedó huérfano en su puerto.
  `spawn` con `detached: true` y `process.kill(-pid)` al salir y por señal.
- **Un control gobernado por el servidor rompe `check()` de Playwright**: estado optimista local
  que vuelve si el servidor rechaza; cajas rearmadas por `key`.
- **Una bandera a secas es presencia, no valor**: `--tecla` (`true`) en un campo de texto no es
  un valor inválido; se salta esa capa sin aviso.
- **Un peer obligatorio de la familia no está en ningún registro**: el empaquetador instala su
  tarball desde `tools/<x>/`; el consumidor, los dos tarballs.
- **PCM16 asimétrico (×32767 / ÷32768) pierde 1 LSB**: una conversión en `voz/node` (×32768 con
  tope) y las inversas se prueban juntas.
