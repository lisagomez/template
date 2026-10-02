# Reel del celular (app)

Donde el dueño de una pyme sube el clip que grabó con su celular, lo revisa en la sala y lo aprueba desde el
teléfono. Aprobar no publica: descarga el reel y lo sube él (guía: `docs/GUIA-DUENO-REEL.md`).

## Qué hace

- **Cuentas**: entra con correo y contraseña; cada dueño ve solo lo suyo (RLS por dueño).
- **Tus reels**: sube el clip con su marca, su catálogo y el diccionario del negocio, y lo manda a procesar con los
  motores locales de `@tu-scope/reel`.
- **Sala**: el video con sus bloqueos; marcar un corte o un cambio de texto en el segundo exacto (sale una versión
  nueva, que revoca lo aprobado); confirmar que revisó cada corte que parte lo que dijo otra persona; aprobar con la
  huella del archivo calculada en el celular; el registro; borrar.
- **Consentimientos**: desde la sala registra, con el documento firmado, los de quien sale o se oye, y los respeta al
  procesar; retirar uno borra su documento del servidor, revoca lo aprobado y vuelve a desenfocar y a bloquear lo que
  dependía de esa persona.

### Qué no hace

- No publica ni programa: aprobar no sale a la red.
- No manda el video a ningún servicio, ni para transcribir.
- No borra a una persona del clip original: retirar su consentimiento la saca del reel, pero su voz y su imagen siguen
  en el clip hasta que se borra el proyecto (y se le dice al dueño).
- No procesa en producción: el render queda bloqueado ahí hasta la fase 16 del PRP-007 (solo local).

## Casos de uso

- **El dueño sube lo que grabó**: en «Tus reels» aparece el reel procesado, cortado y subtitulado, o el bloqueo que lo
  detuvo (una cara o una voz sin consentimiento, un dato personal en cuadro, un precio que no coincide) y en qué segundo.
- **Quiere un cambio**: pausa en la sala y toca quitar un tramo o cambiar el texto ahí; sale una versión nueva.
- **Aprueba desde el celular**: queda quién, cuándo, qué versión y la huella de lo que vio; si algo cambia después, la
  aprobación se revoca.
- **Alguien retira su consentimiento**: el dueño lo retira en la sala; lo aprobado queda revocado, la versión nueva
  vuelve a bloquear su voz y a desenfocar su cara, y se le avisa que lo baje de sus redes si ya lo publicó.
- **Borra el proyecto**: se borra todo, en la cuenta y en el servidor.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines` del template) y la app Next.js del template.
- **Dependencias del sistema**: ffmpeg, Tesseract, OpenCV de Python y los modelos y runtimes de `tools/dictado`
  (ver `tools/reel/LICENCIAS.md`). Sin ellos el proceso no corre.
- **CPU, GPU y memoria**: CPU medida en `tools/reel` (clips sintéticos, 2026-09-27): ≈ 45–50 s por clip de 25 s; un
  proceso a la vez. GPU: no medido. Memoria: no medido.
- **Servicios externos**: Supabase (Auth y base de datos con RLS) para cuentas, proyectos, versiones, aprobaciones y
  consentimientos.
- **Variables de entorno**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REEL_DATOS`, `REEL_RECURSOS`,
  `DICTADO_MODELOS` y `DICTADO_RUNTIME`; `SUPABASE_DB_URL` solo el job de migraciones (C7),
  `SUPABASE_SERVICE_ROLE_KEY` solo el job `reel:tras-restaurar` (C7, lectura de retiros) y `REEL_LABORATORIO` solo
  el laboratorio.
- **Almacenamiento**: `REEL_DATOS` (video, transcripción, máster y documentos firmados, en el servidor) y la base de
  Supabase (solo proyecto, versiones, aprobaciones y estado de los consentimientos). A los 30 días de aprobado se
  borran el video original, su copia de trabajo y la transcripción (`reel:retencion`). Si al aprobar habla alguien
  además del dueño con consentimiento vigente, la transcripción íntegra se guarda con los consentimientos y dura lo
  que su vigencia: la borran el retiro o el mismo job al vencer. El documento firmado de cada consentimiento también
  vive lo que su vigencia: el job lo borra al día siguiente de vencer y deja la fecha como constancia, y la sala avisa
  al dueño que baje el reel de sus redes.
- **Salida del perímetro (C4)**: el video y la transcripción no salen del servidor; a Supabase van solo los datos de la
  cuenta y del proyecto listados arriba. Transcribir en la nube o usar un LLM espera firma del laboratorio.

## Piezas

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
`reel:migraciones` (job de plataforma declarado, C7: único que usa `SUPABASE_DB_URL`), `reel:tras-restaurar` (job de
plataforma declarado, C7: tras restaurar una copia, vuelve a borrar lo de los consentimientos retirados después;
lee los retiros con `SUPABASE_SERVICE_ROLE_KEY` y no escribe en Supabase).

Solo local: el render necesita ffmpeg, Tesseract, OpenCV de Python y los modelos de `tools/dictado`. En producción
queda bloqueado (fase 16 del PRP-007).
