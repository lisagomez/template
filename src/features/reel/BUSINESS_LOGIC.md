# BUSINESS_LOGIC.md — Reel del celular para pymes

> **Hipótesis del 2026-10-02, sin clips reales todavía.** La firma va al pie y se vuelve a firmar
> tras el estreno con clips reales (fase 17 del PRP-007). Este contrato **consolida lo que el
> laboratorio ya firmó**: el qué y su evaluación de impacto están en
> `.claude/goals/pymes-marketing/propuesta-video.md`, firmada el 2026-09-27 («Sí, las 14
> recomendadas»), y el cómo en `.claude/PRPs/PRP-007-reel-del-celular.md`. Lo único que entra aquí
> **sin firma previa** es la tabla de respaldo, que viene de `.claude/goals/reel-pymes/propuesta-respaldo.md`
> (2026-09-27, nunca firmada): firmar este contrato la firma. Lo que ninguna fuente dice va marcado
> **[supuesto]** o **pendiente**. Todo lo medido es con clips **sintéticos**.
> Cubre `tools/reel`, `/reel`, `/cuenta` y `/api/reel`.

---

## 1. Problema de Negocio

**Dolor:** el video del dueño a cámara es el formato con más alcance para una pyme, pero editarlo
(cortar trabas y retomas, subtitular) le toma horas. Grabar en la tienda expone a clientes,
empleados, tickets y chats. Transcribir en la nube se lleva la voz de todos, y «aprobado» no deja
constancia: en la sala que sirvió de modelo, una página de otro origen aprobaba sin que nadie lo
viera (propuesta-video, «En cinco líneas»).
**Costo actual:** **pendiente, no medido.** «Horas» por reel es la estimación del PRP-007, no una
medición sobre un dueño real.

## 2. Solución

**Propuesta de valor:** el dueño graba con su celular y recibe un reel 9:16 cortado y subtitulado
con su marca, **sin exponer a nadie que no consintió**, y lo aprueba en su celular con su cuenta,
con constancia de quién aprobó qué versión y cuándo. **Lo publica él.** Un reel de 30 s cuesta
≈ 2-3 minutos de cómputo y $0 en servicios (propuesta-video §6).

**Flujo principal (Happy Path):**
1. El dueño entra con su cuenta y sube el clip vertical (15 a 60 s) con su marca, su catálogo y el
   diccionario del negocio.
2. El servidor lo re-codifica sin metadatos de ubicación, lo transcribe en local, propone cortes
   por reglas (silencios y retomas), pone subtítulos con su marca en la zona segura, coteja los
   precios contra su catálogo y corre la QA.
3. Si hay una cara sin consentimiento, un dato personal en cuadro, más voces que consentimientos,
   música de fondo o un precio que no coincide, el borrador **se bloquea** con el motivo y el
   segundo en que ocurre.
4. En la sala, desde el celular, marca «aquí corta» o «cambia este texto» en el segundo exacto
   (sale una versión nueva, que revoca lo aprobado) y aprueba: queda quién, cuándo, la versión y la
   huella del archivo que vio.
5. Lo descarga y lo publica él, a mano.

## 3. Usuario Objetivo

**Rol:** el **dueño de una pyme mexicana** que graba en su negocio (la panadería que enseña el pan
de muerto, la tienda de colchones que explica «3 cosas antes de comprar»). En el estreno, el propio
laboratorio con 2 o 3 clips suyos.
**Terceros afectados, no usuarios:** **empleados** (consentimiento escrito, libre y revocable; el
dueño no firma por ellos), **clientes y transeúntes** al fondo, **menores** (nunca), y quien aparece
en un ticket, un chat o un CFDI dentro del cuadro.
**Contexto:** de pie, en vertical, en la tienda y con su celular; aprueba desde el teléfono.
**Primer cliente real: pendiente.**

## 4. Arquitectura de Datos

**Input:** el clip del celular (contenedor de video no confiable, con metadatos), la marca, el
catálogo con precios, el diccionario del negocio y los consentimientos de quien sale o se oye.
**Output:** el máster 1080×1920, 30 fps, H.264 + AAC 48 kHz, −14 LUFS, determinista (misma entrada,
mismos bytes), con su hoja de cuadros; los bloqueos con su motivo; el registro de aprobación.

**Storage:** dos lugares, y el reparto es la mitad del control:
- **Supabase del template** (Auth + tablas con RLS por dueño, aplicadas por un job declarado y con
  el aislamiento medido entre dos cuentas): `profiles`, `reel_proyectos`, `reel_versiones`,
  `reel_aprobaciones`, `reel_marcas` y `reel_consentimientos`. Solo datos de la cuenta y del
  proyecto; aprobaciones y consentimientos son inmutables salvo revocar.
- **`REEL_DATOS` en el servidor**: el video, la transcripción, el máster y los documentos de
  consentimiento. **Nunca van a Supabase ni salen del servidor.**

**Retención** (firmada, respuesta 7): a los 30 días de aprobado se borran el bruto, su copia de
trabajo y la transcripción (`reel:retencion`, job de plataforma con reloj inyectado). Se conservan
el máster aprobado, el registro y los consentimientos. La ubicación se borra al entrar. «Borrar
proyecto» lo borra todo, en la cuenta y en el servidor.

### Respaldo — qué pierde ESTE producto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla ni en la del servidor (§4 del
> [índice de la raíz](../../../BUSINESS_LOGIC.md)), no se respalda.** El inventario completo, la
> regla para decidir criticidad y los gates de verificación están en
> **[`docs/FASE0-INFRAESTRUCTURA.md`](../../../docs/FASE0-INFRAESTRUCTURA.md) §9**. La tabla viene de
> la propuesta de respaldo del 2026-09-27 y se firma con este contrato.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del producto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Tablas del reel en Supabase (proyectos, versiones, aprobaciones, marcas, consentimientos) | **No**: quién aprobó qué versión y el estado de cada consentimiento son la constancia ante un reclamo | Crítica | Respaldo del proyecto Supabase. **El plan gratis no tiene respaldo automático: verificar el plan antes de prometer nada** |
| Máster aprobado, `master.json`, `registro.json` (`REEL_DATOS`) | **No**: es el archivo exacto que el dueño aprobó (su huella está en Supabase) | Crítica | Respaldo diario cifrado del almacén, **excluyendo lo que la retención borra** |
| Documentos de consentimiento (`REEL_DATOS/<dueño>/<proyecto>/consentimientos/`) | **No**: son de terceros | Crítica, **con borrado propagado** | El mismo respaldo; si alguien retira su consentimiento, se borra también de las copias |
| Bruto, copia normalizada, transcripción y cuadros | — | — | **No se respaldan**: datos de terceros sin aprobar, que la retención borra a los 30 días |

**Riesgo abierto:** si se respalda el bruto por error, la retención de 30 días deja de cumplirse en
la copia. Y propagar el retiro de un consentimiento a copias ya hechas no está construido.

**RPO / RTO:** los del servidor, en el §4 del índice de la raíz. Para GATE 3 falta una restauración
probada de punta a punta (tablas + almacén).

## 5. KPI de Éxito

**Métrica principal: pendiente.** Sale del estreno con clips reales (fase 17) y la fija el
laboratorio. La propuesta firmada promete ≈ 2-3 minutos de cómputo y $0 en servicios por reel de
30 s; el tiempo del dueño revisando **no está medido**.

Ya medido, con clips sintéticos (2026-09-27): ≈ 45-50 s de CPU por clip de 25 s; marcas por palabra
con mediana de 51 ms y p90 de 140 ms; misma huella en dos renders; las 6 trampas firmadas (cliente
al fondo, ticket con teléfono, precio que no coincide, clip horizontal, música ajena, dos
hablantes) bloquean o avisan lo que deben. La sincronía tiene un sesgo de −80 a −115 ms que se
calibra antes de usarla como candado.

## 6. Gobernanza (controles C4 y C7)

> Se llena SIEMPRE, aunque el proyecto sea chico. Plantilla completa en
> `.claude/gobernanza/plantillas/aisia.md`. La pregunta que responde esta sección no es
> *¿quién nos ataca?* sino **¿a quién dañamos si el sistema opera bien y se equivoca?**
> La evaluación completa es la §7 de `propuesta-video.md`, **firmada el 2026-09-27**; aquí va lo
> que la vuelve contrato.

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | Imagen y voz del dueño y de terceros (datos personales según la LFPDPPP; identificar a alguien con ellas las volvería biométricas y sensibles, y **no se hace**: se detectan caras, no se reconocen); lo que aparece en cuadro (tickets, chats, libretas con teléfonos, CFDI con RFC, placas); la ubicación del negocio en el fondo y en los metadatos. La lectura legal sigue **por verificar con asesoría legal**. |
| **Partes afectadas** | El dueño; empleados; clientes y transeúntes; menores; quien aparece en tickets y chats. |
| **Daño con el sistema operando bien** | Un cliente identificable publicado sin permiso; un teléfono en un ticket; un corte que cambia el sentido de lo que dijo alguien; un precio equivocado. |
| **Riesgos que ninguna firma autoriza** (límite de C5) | Se **rediseñan**, no se aceptan: **1.** caras sin consentimiento, desenfocadas por defecto y re-verificadas en el máster, o el clip se descarta; la sala no deja aprobar mientras haya caras sin cubrir; **2.** datos en pantalla, que bloquean hasta cubrirlos, con reporte enmascarado a 4 caracteres; **3.** la voz de terceros nunca va a un servicio remoto; **4.** nada de IA que genere o altere a personas reales (ni animar una foto, ni clonar la voz, ni avatares); **5.** un corte dentro del habla de otra persona se marca para revisión explícita: **construido el 2026-10-02** (bloquea hasta que el dueño confirma en la sala que el corte no le cambia el sentido; quitar entera su voz no bloquea, y si ninguna voz domina se revisan los cortes de todas). La otra mitad, guardar la transcripción íntegra con el consentimiento, **construida el 2026-10-02**: al aprobar con otra voz y consentimiento vigente, dura lo que la vigencia más larga y la borran el retiro o el job de retención al vencer. Más voces que consentimientos bloquea; un precio que no coincide bloquea. |
| **Salida del perímetro** | Nada sale del servidor. Transcripción remota, LLM sobre la transcripción y video generativo están **bloqueados hasta firma** (fases 11 a 13; los que cambien prompts o modelo, además, son CDC). |
| **Acciones irreversibles** | **Publicar**, y está **fuera** de la herramienta: lo hace siempre el dueño, a mano. Aprobar no publica. Borrar un proyecto es irreversible y lo pide el dueño. |
| **Vía de apelación humana** | El dueño marca cortes y cambios de texto, y cada versión nueva revoca lo aprobado. **Retirar un consentimiento** (construido el 2026-10-02: hasta entonces no había forma de registrarlo ni de retirarlo desde la app) borra su documento, revoca lo aprobado y vuelve a bloquear su voz y a desenfocar su cara; se avisa al dueño que lo baje de sus redes, porque lo publicado no se recupera. **Su voz y su imagen siguen en el clip original hasta borrar el proyecto**: de una grabación no se puede borrar a una persona, y se le dice. Si retirar debe borrar también el clip original lo **decide el dueño, con aviso** (decisión del laboratorio, 2026-10-02): puede seguir editando sin esa persona o borrar el proyecto. |
| **Aislamiento de datos** | RLS por dueño en toda tabla, medida contra la base real con dos cuentas; el servidor comprueba además el dueño. Ninguna ruta de la app usa `service_role`; `SUPABASE_DB_URL` solo la usa el job de migraciones declarado (C7). Aprobar exige sesión, `Origin` del mismo sitio y la huella exacta. **Brechas abiertas a propósito** (PRP-007, C3): el almacén local no está cifrado en reposo, y el límite de uso es por proceso, no por día. |

## 7. Especificación Técnica (Para el Agente)

### Tipo de proyecto

**Tipo:** herramienta + aplicación. El núcleo es `@tu-scope/reel` (0.1.0, en `tools/reel`: núcleo
TypeScript sin dependencias; ffmpeg, OpenCV, Tesseract y los modelos se inyectan desde `./node`); la
app del template lo consume en `/reel`, con cuentas por correo y contraseña. Usa
`tools/pymes-marketing` (`./video`, `./aprobacion`) y los motores de `tools/dictado` y `tools/voz`.
**Solo local:** el render en producción está bloqueado hasta la fase 16 (Chromium y ffmpeg en la
imagen).
**Cobro en línea: pendiente.**

### Features (Feature-First)

```
src/features/
├── reel/      # tus reels, subida, sala de aprobación en el celular, consentimientos (hecho)
└── auth/      # cuentas por correo y contraseña; el proxy protege solo /reel, /cuenta y /api/reel
```

### Stack confirmado

Golden Path del template (ver `CLAUDE.md`), con Supabase Auth acotado a las rutas del reel; motores
pineados con su huella y licencia en `tools/reel/LICENCIAS.md`.

### Próximos pasos

1. [ ] **Estreno con clips reales** (fase 17): el laboratorio graba 2 o 3 clips suyos y consiente;
   de ahí salen el KPI (§5), la recalibración de voces y la sincronía
2. [ ] Verificar el plan de Supabase antes de prometer respaldo, y cerrar **GATE 3** con una
   restauración probada (tablas + almacén)
3. [ ] Borrar los documentos de consentimientos vencidos (hoy solo vence la transcripción conservada) y
   propagar el retiro de un consentimiento a las copias de respaldo (§4)
4. [ ] Revisión legal (LFPDPPP y art. 87 de la LFDA) con asesoría
5. [ ] Cifrado en reposo del almacén y límite de uso por día (brechas de C3)
6. [ ] Fases bloqueadas (11 a 16), cada una con su firma: LLM sobre la transcripción, transcripción
   remota, video generativo, reducción de ruido, foto de producto y render en producción
7. [ ] Pedir el permiso escrito de las fuentes (respuesta 9): es una acción del laboratorio

---

**Firma:** pendiente del laboratorio.
