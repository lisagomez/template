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
