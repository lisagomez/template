---
paths:
  - "src/**"
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
