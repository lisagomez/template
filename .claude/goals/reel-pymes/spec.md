# Reel del celular para pymes — Spec

Compilado por `/goal-compiler` el 2026-09-27. Forma: **GRAFO** (cuentas y datos, motores locales,
video, privacidad, sala de aprobación y laboratorio son especialidades distintas; hay paralelismo
real y convergencia en el laboratorio). Lo que se pega en `/goal` es `goal.txt`, NO este archivo.
Grafo: `grafo.json`; plan de orquestación compilado de él: `plan.md` (se sigue, no se improvisa).

**De dónde sale**: la fase 7 del PRP-006 (reel del celular con voz o cara), desbloqueada el
2026-09-27 cuando el laboratorio firmó las 14 preguntas de
`.claude/goals/pymes-marketing/propuesta-video.md` §8, todas con su respuesta recomendada. Esa
propuesta es el QUÉ firmado (herramientas, flujo, AISIA, costos): **léela entera** y
`triaje-video.md` en la misma carpeta; este spec no la repite.

**Decisiones del laboratorio para este goal (2026-09-27):**
- **Empieza por `/add-login`**: la respuesta 8 exige aprobar con sesión autenticada.
- **Supabase en la nube**, proyecto nuevo del plan gratis que **crea el laboratorio** y cuyas llaves
  pone en el entorno. Ahí solo viven cuentas, registro de aprobación y **estado** de cada
  consentimiento. El video, la transcripción y el documento de consentimiento firmado se quedan en
  el servidor propio (respuesta 2).
- **Material de prueba sintético** para cerrar este goal: voz local (Piper es_MX de `tools/dictado`),
  escenas por código y, para las trampas de caras, imágenes con licencia incluida que permita ese
  uso. Los clips reales del laboratorio (que hace de dueño y consiente) son un **estreno aparte**,
  después: no bloquean la definición de hecho.

## MISION

Que el dueño de una pyme mexicana grabe con su celular lo que sabe hacer —la panadería sacando el
pan de muerto, «3 cosas antes de comprar tu colchón»— y reciba **un reel 9:16 terminado**: cortado
donde se trabó o repitió, con subtítulos de su marca que se leen sin sonido y no chocan con los
botones de la red, con los precios cotejados contra su catálogo, con tarjetas animadas de su
temporada, y **sin exponer a nadie que no consintió**: la cara de un cliente al fondo se desenfoca,
un ticket con un teléfono bloquea el borrador, una segunda voz se detecta. Lo revisa en su celular
con su cuenta, marca «aquí corta» o «cambia este texto» en el segundo exacto, aprueba, y queda
constancia de quién aprobó qué versión y cuándo. Lo publica él.

La fábrica completa alrededor:

1. **PRP-007** (`.claude/PRPs/`, sobre `prp-base.md`): fases con su estado —**firmada** (se construye)
   o **bloqueada** (quién firma y por qué)—, modelo de amenazas C3 de la superficie nueva (cuentas,
   subida de video, sala) y AISIA que aterriza la §7 de la propuesta.
2. **Cuentas con `/add-login`**, acotadas: correo y contraseña (Google OAuth solo si ya hay
   credenciales; si no, se declara fuera), `profiles`, RLS, `proxy.ts` que protege **solo** las
   rutas nuevas del reel y de la sala. Lo que ya existe (`/dictar` y su PWA con emparejamiento,
   `/laboratorio-voz`, `/laboratorio-pymes`, `/estudio`, `/historial`, `/ajustes`) sigue funcionando
   como hoy.
3. **Esquema del reel** en Supabase: proyectos, versiones, aprobaciones (quién, cuándo, huella SHA-256
   del archivo, versión) y estado de consentimientos (persona, alcance, vigencia, revocado, huella del
   documento guardado en el servidor), con RLS probada entre dos cuentas.
4. **Motores locales** instalados pineados (versión y huella), con su licencia, y **medidos**:
   transcripción con marcas por palabra (la propuesta §10.1 dice que no están medidas: es el primer
   caso), conteo de hablantes, **detección** de caras (nunca reconocimiento ni huellas biométricas)
   y lectura de pantalla para datos personales.
5. **Herramienta `reel-del-celular`** empaquetada (paquete nuevo en `tools/` o subpath de
   `tools/pymes-marketing`: tú decides y lo justificas con el empaquetador), núcleo TypeScript puro
   con lo pesado **inyectado** (contratos de la propuesta §2): ingesta que normaliza a 1080×1920 30 fps
   48 kHz y **borra metadatos** (ubicación GPS), transcripción, cortes por reglas (retomas, silencios,
   respiro en las fronteras de frase), subtítulos de marca dentro de la zona segura, cotejo de precios
   contra el catálogo (si no coinciden, bloquea), máster declarativo (una sola fuente de la que salen el
   máster y lo que ve la sala) y QA (hoja de cuadros, sincronía, −14 LUFS, 48 kHz, deriva).
6. **Controles de la AISIA** (propuesta §7) como código que bloquea: más caras o voces que
   consentimientos registrados → no se aprueba; caras sin consentimiento → desenfoque por defecto o se
   descarta el clip; datos en pantalla → bloqueo con reporte enmascarado a 4 caracteres; menores
   nunca; retención de 30 días tras aprobar para el bruto y la transcripción; «borrar proyecto»
   verificable; retirar un consentimiento borra de nuestras copias y avisa al dueño.
7. **Tarjetas animadas**: la versión video de cada pieza del calendario del estudio, sobre el video
   por código que ya existe (0.2.0), con las temporadas firmadas (respuesta 13).
8. **Sala de aprobación** en el celular con sesión: el borrador, marcar en el segundo exacto, aprobar
   o pedir cambio, registro, y cualquier cambio revoca. Aprobar ≠ publicar.
9. **Laboratorio** (`/laboratorio-pymes`, mismo molde): ≥5 casos por herramienta, con las 6 trampas
   firmadas (cliente al fondo sin consentimiento, ticket con teléfono en pantalla, precio que no
   coincide con el catálogo, clip horizontal, audio con música ajena, dos hablantes) y las que tú
   añadas; estado real, nada simulado; referencias versionadas.
10. **App y documentación**: el reel como pieza del calendario en `/estudio`; guía del dueño (cómo
    grabar, qué pasa con su video, cómo aprobar); **formato de consentimiento** en español
    («por verificar con asesoría legal», LFPDPPP y art. 87 de la LFDA); READMEs; y la **propuesta de
    respaldo** de lo nuevo.

## LIBERTAD TECNICA

Tú eliges arquitectura, librerías, motores y estrategia; lo que aparece aquí es sugerencia descartable
salvo RESTRICCIONES. Optimiza por el mejor resultado posible. Next.js 16 no es el que conoces: lee la
guía en `node_modules/next/dist/docs/` antes de tocar rutas o `proxy.ts`.

## INVESTIGA ANTES DE CONSTRUIR

- `propuesta-video.md` y `triaje-video.md` (el oficio de las fuentes, qué se conserva y qué no).
- `.claude/skills/add-login/SKILL.md` (lo ejecutas: es el Golden Path de cuentas del repo).
- `tools/dictado` (instalador pineado de modelos: Parakeet int8, Silero, WeSpeaker, Piper es_MX,
  ~750 MB en `~/.dictado/modelos`; **hoy no están instalados en esta máquina**) y `tools/voz` 0.5.0
  (contrato del transcriptor y diarización).
- `tools/pymes-marketing` 0.2.0 (`./video`, `./aprobacion`), `src/features/estudio-pymes`,
  `src/features/laboratorio-pymes` y `docs/SDD-generacion-de-contenido.md`.
- 2–3 referencias de detección de caras y lectura de pantalla **locales**, con licencia compatible y
  modelo pineado. Instalado en esta máquina el 2026-09-27 (paquetes de Ubuntu con versión fijada):
  Docker 29.1.3 + compose 2.40.3 + buildx 0.30.1 (el grupo `docker` aplica en sesiones nuevas; mientras,
  `sg docker -c '…'`), Tesseract 5.3.4 con `spa` (probado: lee un ticket sintético con acentos, teléfono
  y precio), OpenCV 4.6.0 de Python con `FaceDetectorYN` (el modelo YuNet NO viene: se pinea con su
  licencia) y ffmpeg. Las cascadas Haar no están empaquetadas.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

1. **PRP-007** escrito: ruta y tabla de fases pegadas (firmada / bloqueada, quién firma y por qué).
2. **Llaves de Supabase**: presencia enmascarada (presente/ausente y largo), **nunca el valor**. Si no
   están, te detienes en ese punto, pides al laboratorio que las ponga y no simulas nada.
3. **Cuentas**: capturas de Playwright de alta, entrada, salida y de una ruta protegida que redirige
   sin sesión; las rutas existentes siguen abriendo igual (captura o salida de prueba); y la prueba de
   RLS pegada: la cuenta B no lee ni escribe nada de la cuenta A.
4. **Motores**: versión, huella y licencia de cada uno pegadas; error medido de las marcas por palabra
   sobre material sintético.
5. **Reel** de un clip sintético: `ffprobe` pegado (h264 1080×1920 30 fps, AAC 48 kHz, 15–60 s),
   volumen integrado medido (−14 LUFS ±1), metadatos de ubicación antes y después de la ingesta,
   hoja de cuadros vista, subtítulos dentro de la zona segura, **misma huella en dos renders**.
6. **Laboratorio**: tabla de casos pegada (≥5 por herramienta, las 6 trampas firmadas incluidas) con
   su estado real y comparación contra referencia.
7. **Sala en el celular** (viewport móvil): capturas de entrar → borrador → marcar un corte en un
   segundo → aprobar → registro (quién, cuándo, huella, versión) → editar revoca; y la lista de
   peticiones de red durante la aprobación: ninguna saca video o transcripción del servidor.
8. **Retención y borrado**: «borrar proyecto» con listado antes y después; la regla de 30 días
   probada con reloj inyectado.
9. `npm run empaqueta <herramienta>` en verde, no publicado.
10. Guía del dueño, formato de consentimiento y READMEs, con su índice pegado; propuesta de respaldo.
11. `npm run validate` en verde **después del commit**; `grafo.json` con estados y evidencia.
12. Reporte: decisiones, formas en que podría estar mal (resueltas) y lo que sigue bloqueado.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && npm run prueba:laboratorio-pymes` y
`npm run empaqueta <herramienta>` tras cada cambio grande, con el output pegado. Al final,
`npm run validate` con todo commiteado. Si en el repo de trabajo `audita:secretos` cae por blobs de
**otra** rama (hoy `grafo-fase1-contrato`, PR #160), corre `validate` en un clon del scratchpad que
solo traiga tu rama, `main` y `golden-sets`, y dilo.

## RESTRICCIONES REALES

- **Candado**: se construye solo lo firmado. Nada de LLM, transcripción remota, video generativo, GSAP,
  render en producción (fase 10 del PRP-006), foto de producto generada, ni publicar, programar o
  subir a una red.
- **Perímetro**: video, audio, transcripción y documento de consentimiento no salen del servidor; a
  Supabase solo cuentas, registro de aprobación y estado de consentimientos. Render con la red
  bloqueada.
- **Secretos jamás en pantalla** (presencia enmascarada). `service_role` fuera de las superficies de
  negocio (C7): solo migraciones o jobs de plataforma declarados. RLS en toda tabla.
- **Migraciones no destructivas**; una destructiva pasa por gate humano.
- **Cuentas de prueba sin enviar correos** a direcciones reales: sin confirmación por correo en el
  proyecto de desarrollo, o alta por script de plataforma declarado (C7).
- **`/add-login` acotado**: no rompe rutas existentes; cada ruta de servidor nueva se declara en
  `RUTAS_FUERA_DEL_BRIDGE` de `scripts/prueba-a2a.ts` respondiendo RF-20.
- **Modelos locales** pineados por versión y huella, con su licencia en el repo o junto al modelo;
  nada copiado de god-animation, edicion-de-video, sfstudio ni GSAP; fuentes y recursos solo con
  licencia incluida.
- **Personas**: detección, nunca reconocimiento; menores nunca; nada que altere con IA a una persona
  real; material sintético para cerrar este goal.
- **Gobernanza**: no tocar skills, reglas, `AGENTS.md`, `settings`, `.mcp.json`. Las pruebas nuevas
  caben en gates existentes (`prueba:tools`, `prueba:laboratorio-pymes`); dar de alta un gate en
  `.claude/gates.json` es un CDC y se deja como propuesta firmable. `BUSINESS_LOGIC.md` (el del asesor,
  firmado) **no se edita**: el respaldo del reel va como propuesta, con RPO/RTO «desconocidos».
- Español de México; datos sintéticos; nada se publica ni se envía.
- **Rama propia** (`reel-pymes`), nunca `main`; sin push ni PR sin preguntar al laboratorio.
- **RED DE SEGURIDAD**: si tras 80 turnos no converges, detente y reporta el bloqueo y el estado del
  grafo.

## GRAFO DEL SISTEMA

Ver `grafo.json` y `plan.md`. Nodos: base existente → **PRP-007** → (cuentas ← proyecto Supabase del
laboratorio, manual) → esquema; PRP → motores → reel; PRP → tarjetas; reel + esquema → privacidad →
sala; todo converge en el **laboratorio** → app → docs → gate humano (estreno, asesoría legal,
respaldo, publicar). Lazos: candado, consentimiento, datos en pantalla, aislamiento (RLS), perímetro,
determinismo, retención y validate después del commit.

## ANTES DE LANZAR (fuera del goal)

El laboratorio crea el proyecto Supabase y pone en `.env.local` la URL y las llaves publicables (y la
de servicio solo si decide dar de alta cuentas de prueba por script). Sin eso, el goal se detiene en
su segunda fase y las pide.

**Hecho el 2026-09-27** (comprobado sin imprimir valores): `.env.local` ignorado por git, URL con forma
de proyecto, llave publicable `sb_publishable_…`, anónima con rol `anon` y de servicio con rol
`service_role` (sin prefijo `NEXT_PUBLIC_`), las dos del mismo proyecto que la URL; auth responde 200;
**confirmación por correo apagada** (`mailer_autoconfirm: true`) para que las altas de prueba no
envíen nada; Google desactivado (queda fuera).
