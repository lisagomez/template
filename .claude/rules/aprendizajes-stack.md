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

Trasladados de `AGENTS.md` el 2026-08-26 y resumidos el 2026-09-29 sin quitar ninguna lección (el texto
largo sigue en git: `git show e823f09:.claude/rules/aprendizajes-stack.md`). En Claude Code cargan al tocar
los `paths:`; en opencode, siempre. Un error crítico que aplique a TODO va a `AGENTS.md`, no aquí.

### 2026-08-22: globals.css con sintaxis v4 sobre Tailwind v3 rompe el build
- `@import 'tailwindcss'` (v4) con `tailwindcss@3.4` resuelve al paquete JS y arrastra `jiti -> v8/util` al
  bundle: `Can't resolve 'v8'`, con Turbopack y con webpack; `npm run dev` no lo delata.
- Con 3.4 van `@tailwind base/components/utilities`; `@import` solo al migrar a v4 + `@tailwindcss/postcss`.

### 2026-08-31: los tokens de shadcn dentro de `@layer base` se purgan
- Tailwind v3 purga de `@layer base` los selectores que no ve en el contenido: `.dark { --... }` desaparece
  del CSS sin error. `:root` y `.dark` van FUERA de `@layer base` (el bloque de `@apply` sigue dentro).
- Verificar: `grep -c '\.dark{' .next/static/chunks/*.css` tras `npm run build`.

### 2026-08-31: tailwind-merge 3.x es para Tailwind v4
- Con `tailwindcss@3.4` va `tailwind-merge@^2`: la 3.x resuelve mal los conflictos del v3, sin error. El mayor
  del paquete satélite sigue al de Tailwind, no al calendario. Aplica a `cn()` y a toda utilidad que mezcle clases.

### 2026-08-22: createServerClient necesita anotar CookieMethodsServer
- `TS7006/TS7031` en `src/lib/supabase/server.ts` rompe `next build` (no `dev`): declarar el objeto como
  `CookieMethodsServer` (se exporta de `@supabase/ssr`). NUNCA parchear con `any`.

### 2026-08-22: NEXT_PUBLIC_* se inlinea en BUILD, no en runtime
- `supabaseUrl is required` en el navegador tras deploy con Docker: las `NEXT_PUBLIC_*` viajan como
  `ARG`/`build.args`; en `environment:` solo los secretos de servidor.

### 2026-09-13: Node en modo strip-only no admite «parameter properties»
- `constructor(private readonly x: T)` en un `.ts` que corre `node --test` sin transpilar revienta
  (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`); tsc y Next lo aceptan. Campo explícito + asignación en el constructor.

### 2026-09-13: Compose interpola TODOS los servicios, también los de perfiles inactivos
- `${VAR:?}` en un servicio bajo `profiles:` tumba el `up` de otro perfil, y un `env_file` inexistente rompe hasta
  `docker compose config`. Defaults `${VAR:-}`, la exigencia real en `configura:deploy`, y `required: false`.

### 2026-09-13: otro `next-server` en el 3000 responde por ti, con redirect y todo
- Un Next de OTRO proyecto contestaba `307 /login?error=config` y parecía un middleware propio. Antes de culpar
  a una ruta, `ss -ltnp | grep :PUERTO`. Arrancar con `npm run dev` (elige puerto libre), nunca `next dev` a pelo.

### 2026-09-13: un `import()` dinámico resuelve desde el archivo que lo hace, no desde el proceso
- En la imagen OCR, `dist/lectores/zxing.js` no veía `zxing-wasm` instalado en `servicio/node_modules`, y la
  sonda decía «cargado» porque solo INTENTABA el import. Instalar en la raíz del paquete (`npm install --no-save` en `/extractor`), y sondear con una
  lectura real que distinga «falta el paquete» de «entrada inválida».

### 2026-09-13: `pkill -f '<patrón>'` mata la shell que lo lanza (el error de Bash más repetido; reincidió el 20/09)
- La línea de comando de la herramienta contiene el patrón (exit 144). Matar por puerto o PID:
  `ss -ltnp` → PID → `kill`, o `fuser -k 8081/tcp`; si `pkill`, anclado: `pkill -f '^node servidor.mjs'`.

### 2026-09-13: `gh pr edit` falla por un aviso de GitHub ajeno al PR
- `Projects (classic) is being deprecated` y no edita. `gh api -X PATCH repos/<dueña>/<repo>/pulls/N -F
  body=@archivo`; `gh pr create` y `gh pr merge` sí funcionan.

### 2026-09-20: Turbopack rastrea como assets el disco que el bundle toca con `fs` (reincidió el 29/09)
- `existsSync` o `resolve(process.env.X ?? …)` en un route handler hace que el build siga carpetas de fuera de
  `src/` (el venv del banco revienta; un clon limpio no lo ve). Sondeos por `execFile` a un script (como `scripts/laboratorio-voz/maquina.mjs`), `fs` solo
  sobre temporales de `mkdtemp`, o `/*turbopackIgnore: true*/` en el primer argumento.

### 2026-09-20: `npm install` poda lo no declarado (Playwright desapareció): lo que un guion importa se declara pineado.

### 2026-09-20: Node avisa `MODULE_TYPELESS_PACKAGE_JSON` al correr un `.ts` sin `type`
- `{ "type": "module" }` en `scripts/package.json` y `src/package.json`; en la raíz no (reinterpretaría
  `postcss.config.js`, CommonJS). El aviso nombra solo el PRIMER archivo sin tipo.

### 2026-09-20: el WAV que ffmpeg escribe a una tubería lleva tamaños «desconocidos»
- `-f wav pipe:1` pone `0xFFFFFFFF` en la cabecera y el servicio de dictado lo rechazaba; la ruta caía al CLI
  en silencio. PCM crudo (`-f s16le`) con la frecuencia aparte, y la respuesta dice por dónde pasó (`via`).

### 2026-09-20: un proceso de Node sin handles sale en silencio, aunque espere una promesa
- Con el único intervalo en `.unref()`, `dictar` salió con 0 sin decir nada. Un latido con referencia hasta
  `salir()`; medir con la salida a archivo.

### 2026-09-20: dos de React en `/historial`
- Una respuesta vieja pisa a la nueva si nadie numera las cargas: solo se aplica la última, y el sondeo no
  corre con una carga en vuelo.
- `react-hooks/set-state-in-effect` no acepta un `await` como separación: el estado lo escribe la promesa.

### 2026-09-21: cinco de los goals de ajustes y de voz (detalle en sus post-mortem)
- Matar `npx` no mata a `next-server`: `spawn` con `detached: true` y `process.kill(-pid)` al salir.
- Un control gobernado por el servidor rompe `check()` de Playwright: estado optimista que vuelve si rechaza.
- Una bandera a secas es presencia, no valor (`--tecla` = `true`): no se salta la capa en silencio.
- Un peer obligatorio de la familia no está en ningún registro: su tarball se instala desde `tools/<x>/`.
- PCM16 asimétrico (×32767 / ÷32768) pierde 1 LSB: una sola conversión en `voz/node` (×32768 con tope), y su inversa se prueba junto.
