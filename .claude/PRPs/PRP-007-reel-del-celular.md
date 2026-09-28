# PRP-007: Reel del celular para pymes (cuentas, reel, privacidad, tarjetas y sala de aprobación)

> **Estado**: FASES FIRMADAS COMPLETADAS (2026-09-27) — las bloqueadas (11–16) esperan firma; el estreno (17) es del laboratorio
> **Fecha**: 2026-09-27
> **Proyecto**: línea pymes (`tools/`, `/estudio`, `/laboratorio-pymes`)
> **Spec**: `.claude/goals/reel-pymes/spec.md` (goal compilado; grafo y plan en la misma carpeta). El QUÉ
> firmado es `.claude/goals/pymes-marketing/propuesta-video.md` (14 preguntas del §8, firmadas por el
> laboratorio el 2026-09-27 con la respuesta recomendada). Este PRP lo aterriza; no lo re-litiga.
> **CDC aplicable**: **no** — no cambia modelo, skill, prompt del arnés, plantilla ni el padrón de gates.
> Las fases bloqueadas que lo cambiarían (LLM sobre la transcripción) son CDC al desbloquearse.
> **Aprobación**: el laboratorio pidió construir en el mismo goal, empezando por `/add-login`. El
> **candado** decide qué se construye: solo lo firmado.

---

## Objetivo

Que el dueño de una pyme grabe con su celular y reciba un reel 9:16 cortado y subtitulado con su marca,
sin exponer a nadie que no consintió, y lo apruebe en su celular con su cuenta, con constancia de quién
aprobó qué versión y cuándo. Lo publica él.

## Por Qué

| Problema | Solución |
|----------|----------|
| El video del dueño a cámara es el formato que más alcance tiene, pero editarlo (cortar trabas, subtitular) le toma horas | Cortes por reglas y subtítulos de su marca, locales y en minutos |
| Grabar en la tienda expone a clientes, empleados, tickets y chats | Detección de caras y lectura de pantalla que **bloquean** hasta cubrir; consentimiento por persona |
| La transcripción en la nube se lleva la voz de todos | Todo local (Parakeet), $0 en servicios |
| «Aprobado» sin constancia; una aprobación falsificable desde otro origen | Sesión autenticada, registro (quién, cuándo, huella SHA-256, versión), cualquier cambio revoca |

**Valor de negocio**: un reel de 30 s en ≈ 2–3 min de cómputo y $0 en servicios (propuesta §6), con la
responsabilidad sobre terceros resuelta en el diseño y no en la buena voluntad.

## Qué

### Criterios de Éxito
- [x] Cuentas: alta, entrada y salida por correo y contraseña; las rutas del reel exigen sesión; las rutas que ya existían no cambian.
- [x] RLS en toda tabla nueva; la cuenta B no lee ni escribe nada de la cuenta A (prueba contra la base real).
- [x] Motores locales con versión, huella y licencia; error de las marcas por palabra medido.
- [x] Reel de un clip sintético: 1080×1920, 30 fps, H.264 + AAC 48 kHz, −14 LUFS ±1, sin metadatos de ubicación, subtítulos en zona segura, misma huella en dos renders.
- [x] Las 6 trampas firmadas bloquean o avisan lo que deben (laboratorio, ≥5 casos por herramienta).
- [x] Sala en el celular: marcar en el segundo exacto, aprobar, registro, revocar al editar; ninguna petición saca video o transcripción del servidor.
- [x] Retención de 30 días y «borrar proyecto» verificables.
- [x] Guía del dueño, formato de consentimiento y READMEs; `npm run validate` en verde después del commit.

### Comportamiento Esperado
El dueño entra con su cuenta, sube el clip que grabó; el servidor lo normaliza, le borra la ubicación, lo
transcribe en local, propone cortes, pone subtítulos con su marca, coteja precios contra su catálogo y
corre la QA. Si hay una cara sin consentimiento, un ticket con teléfono o una segunda voz, el borrador
queda bloqueado con el motivo. Cuando pasa, lo ve en su celular, marca «aquí corta» en el segundo 7,
aprueba, y queda el registro. Lo descarga y lo publica él.

---

## Contexto

### Referencias
- `.claude/goals/pymes-marketing/propuesta-video.md` (§1–§10) y `triaje-video.md` — el QUÉ y el oficio.
- `.claude/skills/add-login/SKILL.md` — cuentas (Golden Path), acotado a las rutas del reel.
- `tools/pymes-marketing` 0.2.0 (`./video`, `./aprobacion`, `./contenido`) — render determinista y huella.
- `tools/dictado` (pesos pineados en `src/node/pesos.ts`) y `tools/voz` 0.5.0 — transcriptor y diarización.
- `docs/SDD-generacion-de-contenido.md` — zonas seguras y formatos.

### Arquitectura Propuesta
```
tools/reel/                         (paquete nuevo @tu-scope/reel: núcleo TS puro, lo pesado se inyecta)
  src/  tipos · cortes · subtitulos · precios · privacidad · retencion · master · qa
  src/node/  adaptadores: ffmpeg, transcriptor sherpa, hablantes, caras (OpenCV YuNet), pantalla (Tesseract)
supabase/migrations/                profiles (add-login) + reel_proyectos, reel_versiones, reel_aprobaciones,
                                    reel_consentimientos — RLS por dueño
src/lib/supabase/proxy.ts + proxy.ts  sesión; protege solo /reel y /cuenta
src/app/(auth)/…                    entrar, crear cuenta, salir
src/features/reel/                  subida, borrador, sala de aprobación (celular)
src/app/api/reel/…                  subir, procesar, archivo, aprobar (sesión + Origin + Zod)
src/features/laboratorio-pymes/     casos de reel, privacidad, tarjetas y sala
```

### Modelo de Datos
Ver `supabase/migrations/*_reel.sql`. En Supabase solo: proyecto (dueño, título, estado, fechas de
borrado), versión (huella del máster, número), aprobación (quién, cuándo, huella, versión, vigente) y
consentimiento (persona por alias, alcance, vigencia, revocado, huella del documento). **El video, la
transcripción y el documento de consentimiento viven en el servidor** (`REEL_DATOS`), nunca en Supabase.
Respaldo: propuesta aparte (el `BUSINESS_LOGIC.md` firmado no se edita); RPO/RTO desconocidos.

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*
- **Activos**: la cara y la voz de terceros en los clips; los tickets y chats que salen en cuadro; el
  registro de aprobación (el nombre del dueño en redes); las cuentas.
- **Fronteras**: el archivo que sube el celular (contenedor de video no confiable, con metadatos); el
  formulario de cuentas; la sala (peticiones que aprueban); el texto transcrito que se vuelve subtítulo.
- **Atacante relevante**: O1 (texto dicho o escrito en cuadro que se vuelve marcado en el subtítulo),
  O3 (aprobar a ciegas una versión distinta), O4 (subir videos enormes o muchos para gastar CPU),
  aprobación falsificada desde otro origen (lo que la sonda encontró en sfstudio), acceso a proyectos
  ajenos cambiando un id.
- **Controles**: subida solo con sesión, tamaño y duración acotados, un proceso a la vez por dueño; el
  archivo se re-codifica (nunca se sirve el original) y se le quitan metadatos; ids UUID y rutas del
  almacén derivadas del id, nunca del cliente; aprobar exige sesión, `Origin` del mismo sitio y la
  huella exacta; RLS por dueño y comprobación del dueño en el servidor; subtítulos escapados; secretos
  enmascarados. **Brechas abiertas a propósito**: el almacén local no está cifrado en reposo; el límite
  de uso es por proceso y no por día; el render corre solo en local (fase 10 del PRP-006).

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*
La AISIA completa es la §7 de `propuesta-video.md`, firmada. Aquí, lo que la vuelve código:
- **Partes afectadas**: el dueño; empleados (consentimiento escrito, libre y revocable; el dueño no firma
  por ellos); clientes y transeúntes; menores (nunca); quien aparece en tickets y chats.
- **Daño posible con el sistema operando bien**: un cliente identificable publicado sin permiso; un
  teléfono en un ticket; un corte que cambia el sentido de lo que dijo alguien; un precio equivocado.
- **Reversibilidad**: total hasta publicar; publicar es del dueño y es irreversible.
- **Decisión**: **rediseñar** lo que no se puede firmar — caras sin consentimiento se desenfocan por
  defecto o bloquean; datos en pantalla bloquean hasta cubrir (reporte enmascarado a 4 caracteres); más
  voces que consentimientos bloquea; nada de IA sobre personas; precio que no coincide bloquea.

---

## Blueprint (Assembly Line)

| # | Fase | Estado | Quién firma / por qué |
|---|---|---|---|
| 1 | Este PRP con candado | **firmada · hecha** | respuestas 1–14 |
| 2 | Cuentas con `/add-login` acotado (correo y contraseña; Google fuera: sin credenciales) | **firmada · hecha** | respuesta 8 (aprobar con sesión autenticada) |
| 3 | Esquema del reel con RLS probada entre dos cuentas | **firmada · hecha** | respuestas 7 y 8 |
| 4 | Motores locales pineados y medidos (transcripción, hablantes, caras, pantalla) | **firmada · hecha** | respuestas 2 y 3 |
| 5 | Herramienta `reel` (ingesta sin metadatos, cortes por reglas, subtítulos, cotejo de precios, máster, QA) | **firmada · hecha** | respuestas 1, 3, 4 (v1 por reglas), 11, 12 |
| 6 | Controles de la AISIA (caras, pantalla, voces, consentimientos, retención, borrar proyecto) | **firmada · hecha** | respuestas 6 y 7 |
| 7 | Tarjetas animadas desde el calendario (sin fotos de producto) | **firmada · hecha** | respuestas 1, 10 y 13 |
| 8 | Sala de aprobación en el celular | **firmada · hecha** | respuesta 8 |
| 9 | Laboratorio y app | **firmada · hecha** | respuesta 14 |
| 10 | Guía del dueño, formato de consentimiento, READMEs, propuesta de respaldo, validación | **firmada · hecha** | — |
| 11 | LLM sobre la transcripción (proponer cortes y frases) | **BLOQUEADA** | el laboratorio: firma C4 + CDC por los prompts (respuesta 4) |
| 12 | Transcripción remota | **BLOQUEADA** | el laboratorio; y solo clips de un hablante (respuesta 3) |
| 13 | Video generativo | **BLOQUEADA** | el laboratorio, con tope (respuesta 5) |
| 14 | Reducción de ruido (DeepFilterNet o `afftdn`) | **BLOQUEADA** | el laboratorio: la propuesta la condiciona a firma |
| 15 | Foto de producto dentro del video | **BLOQUEADA** | el laboratorio (PRP-006 fase 8) |
| 16 | Render y despliegue en producción | **BLOQUEADA** | el laboratorio: Chromium y ffmpeg en la imagen (PRP-006 fase 10) |
| 17 | Estreno con clips reales | **manual** | el laboratorio graba 2–3 clips suyos y consiente |
| 18 | Publicar, programar, conectar redes | **FUERA** | siempre el dueño, a mano |

### Fase 2: Cuentas
**Validación**: capturas de alta, entrada, salida y ruta protegida; rutas existentes intactas.

### Fase 3: Esquema
**Validación**: migraciones aplicadas con un script declarado (C7); prueba de RLS con dos cuentas reales.

### Fases 4–8: Motores, reel, privacidad, tarjetas y sala
**Validación**: `ffprobe`, `ebur128`, hoja de cuadros, doble render, casos del laboratorio, capturas.

### Fase 10: Validación final
- [x] `npm run validate` pasa con todo commiteado
- [x] Playwright confirma cuentas, sala y reel
- [x] Criterios de éxito cumplidos

---

## 🧠 Aprendizajes

Todos medidos en el laboratorio o en el recorrido con Playwright; cada uno quedó con su caso de regresión.

### 2026-09-27: una frase repetida en otra no es retoma
- **Error**: «el pan de» en dos frases distintas se leyó como retoma y se cortó media frase (y después, con dos
  palabras en medio, otra vez).
- **Fix**: la retoma empieza donde acaba la toma repetida (≤ 2 palabras en medio) y al INICIO de una frase.
  Casos `reel-4` y prueba del paquete.

### 2026-09-27: el transcriptor trunca y el cotejo de precios lo perdía
- **Error**: «pan de muer cuesta 45 pesos» no se emparejaba con «pan de muerto»: quedaba en aviso.
- **Fix**: palabras iguales si una es prefijo de la otra desde 4 letras.

### 2026-09-27: turnos largos esconden a la segunda voz
- **Error**: con turnos por huecos de 0.35 s, la segunda voz quedaba dentro del turno del dueño: 1 voz contada.
- **Fix**: turnos cortados en el final de frase y a los 4 s; umbral 0.6, sin vectores de turnos < 1.8 s, voz ≥ 2 s
  (calibrado con voces sintéticas: 0.27–0.36 misma voz, 0.82 otra; recalibrar en el estreno). Caso `priv-3`.

### 2026-09-27: la trampa de música no tenía música, y la regla era demasiado exigente
- **Error**: `sine` de ffmpeg ya sale a −18 dB; con `volume=0.06` la música quedó en −45.5 dB (bajo el umbral). Con
  música audible, la regla de 1.5 s de pausas la dejaba pasar en un clip con pocas pausas.
- **Fix**: música a nivel realista y regla «más de la mitad de las pausas y ≥ 0.5 s». Solo energía: un ruido fuerte
  también la dispara (se declara). Caso `priv-4`.

### 2026-09-27: la retención dejaba una copia completa del video
- **Error**: con el reloj inyectado, el día 30 sobrevivían `normalizado.mov` (copia del original) y `resultado.json`
  (lleva la transcripción).
- **Fix**: se borran; prueba de regresión en el paquete.

### 2026-09-27: una columna generada con `+ interval` no es inmutable
- **Error**: `aprobado_en + interval '30 days'` como columna generada: Postgres la rechaza (42P17) al aplicar el SQL.
- **Fix**: sin columna generada; la fecha la calcula el job de retención.

### 2026-09-27: `src=""` en un `<video>` da dos errores de consola
- **Error**: casos con solo hoja de cuadros pintaban `<video src="">`: aviso de React y desajuste de hidratación.
- **Fix**: sin `src` vacío. Y los emojis de los botones salían como cuadros en Chromium sin fuente de emoji: texto.

### 2026-09-27: una prueba que ningún gate corre
- **Hecho**: `verifica:gates` marcó `scripts/reel/prueba-rls.ts` como huérfana. Necesita red y crea cuentas: no cabe
  en `validate`. Se volvió medición (`mide-aislamiento.ts` → `rls.json` → caso `sala-7` en `validate`) y el gate
  inactivo con motivo queda propuesto para firma (`.claude/goals/reel-pymes/propuesta-cdc-gate.md`).

## Gotchas
- [ ] Next.js 16: `proxy.ts` (no `middleware.ts`) y `getUser()` en el servidor, nunca `getSession()`.
- [ ] Las llaves de migración (`SUPABASE_DB_URL`) solo las toca el script de migración; nunca una superficie.
- [ ] OpenCV 4.6 de Ubuntu: el modelo YuNet que carga es el de 2022; el de 2023 pide OpenCV ≥ 4.8.
- [ ] El sesgo de −80 a −115 ms de la sincronía medida (propuesta §3) se calibra antes de usarlo como candado.

## Anti-Patrones
- Reconocer caras o guardar huellas biométricas; generar o alterar personas con IA.
- Mandar video, audio o transcripción fuera del servidor.
- Usar `service_role` en una ruta de la app.
- Copiar código de god-animation, edicion-de-video o sfstudio, o usar GSAP.
- Publicar o programar desde la app.

## 🎯 Stack
Next.js 16 + React 19 + TypeScript + Tailwind 3.4 · Supabase (Auth + DB + RLS) · Zod · Zustand ·
ffmpeg · sherpa-onnx (Parakeet, WeSpeaker, Piper) · OpenCV (YuNet) · Tesseract · Playwright.
