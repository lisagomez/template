# Reel del celular (app)

La parte de la app que usa `@tu-scope/reel` (`tools/reel`). Plan con candado: `.claude/PRPs/PRP-007-reel-del-celular.md`.

| Pieza | Dónde | Qué hace |
|---|---|---|
| Cuentas | `src/features/auth`, `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Correo y contraseña (Supabase). El proxy protege SOLO `/reel`, `/cuenta` y `/api/reel`; el resto del template no cambia |
| Tus reels | `src/app/(main)/reel/page.tsx`, `components/subir-clip.tsx` | Lista y subida del clip (con marca, catálogo y diccionario del negocio) |
| Sala | `src/app/(main)/reel/[id]/page.tsx`, `components/sala.tsx` | Video, bloqueos, marcar corte o texto en el segundo exacto, aprobar con la huella calculada en el celular, registro, borrar |
| API | `src/app/api/reel/**` | Subir, archivo (con `Range`), decisión, ajustes, consentimientos, borrar. Sesión + `Origin` del mismo sitio + Zod + RLS |
| Almacén | `services/servidor/almacen.ts` | `REEL_DATOS` (por defecto `~/.reel/datos`): video, transcripción, máster y documentos. Rutas desde UUIDs; nunca desde el cliente |
| Proceso | `services/servidor/reproceso.ts` → `scripts/reel/procesa-proyecto.ts` | Proceso hijo con los motores locales; uno a la vez; cada versión nueva revoca lo aprobado |
| Datos | `supabase/migrations/20260927200000_perfiles.sql`, `…200100_reel.sql` | Perfiles y reel con RLS por dueño; aprobaciones y consentimientos inmutables salvo revocar |

Scripts: `npm run reel:laboratorio` (clips sintéticos, medición), `reel:marcas`, `reel:rls` (aislamiento contra la
base, con dos cuentas @example.com), `reel:retencion -- --ahora <ISO>` (job de plataforma, reloj inyectado),
`reel:migraciones` (job de plataforma declarado, C7: único que usa `SUPABASE_DB_URL`).

Solo local: el render necesita ffmpeg, Tesseract, OpenCV de Python y los modelos de `tools/dictado`. En producción
queda bloqueado (fase 16 del PRP-007).
