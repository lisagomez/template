# Portal del paciente para clínicas dentales (en el laboratorio, con pacientes sintéticos) — Spec

> Compilado con `/goal-compiler` el 2026-10-16. Rama `clinica/portal-paciente`, en el worktree
> `.claude/worktrees/clinica-dental`, desde `main` con el PR #268 ya mergeado (bucle-voz y el nivel `voz`).
>
> **Forma: GRAFO.** Hay contextos especializados con criterios de éxito distintos: las pantallas (capturas), los
> canales (outbox correcto e idempotente), el asistente (conducta y latencia con el LLM real) y la capa
> semántica (dbt + MetricFlow en Python, sobre Postgres efímero). Todos convergen en un contrato de eventos. Si
> se colapsan en un solo loop, se pierde justo lo que falla en silencio: un evento que la app emite y dbt no
> carga. La topología está en `docs/grafos/clinica-dental.json` (20 nodos, 35 aristas, 14 lazos). El plan
> se derivó con `grafo2plan.py`; la versión completa está en `docs/goals/clinica-dental-plan.md` y el resumen,
> en §GRAFO DEL SISTEMA.
>
> **Decidido por el laboratorio (2026-10-16):**
> 1. La rama sale de `main` después de mergear el PR #268: la voz y el chatbot se montan sobre `tools/bucle-voz`
>    y el nivel de routing `voz`, sin reconstruirlos.
> 2. **El cerebro se mide con el LLM real**, por OpenRouter, con el modelo pineado del nivel `voz` y un **tope
>    duro de US$1**. La clase de routing nueva y los prompts entran en la rama como CDC: nada se mergea sin la
>    firma del laboratorio.
> 3. Usuarios del goal: **el paciente** (la vista del personal de la clínica es horizonte).

## Cómo se leyó el encargo (interpretaciones; si alguna está mal, se corrige el spec, no el código)

- **«El A2A»** es el agente de la clínica que habla con el paciente. Se escribe detrás de un puerto para que
  exponerlo por el protocolo A2A (skill `add-a2a`) sea un cambio de borde. **Exponerlo NO entra**: es gate
  humano con C3 + C4.
- **«GTM»** es Google Tag Manager: un `dataLayer` con consent mode. Si se quería decir *go-to-market*, lo cubre
  el unit economics por canal (CAC por canal de adquisición). El reporte final dice cuál se construyó.
- **«Empresa»**, en el cuestionario, es la empresa del paciente para un convenio. Es opcional.
- **«Edad»** se pide como tal. Si es menor de 18, el registro pide los datos y el consentimiento de quien
  ejerce la patria potestad.
- **«Seleccionando la fecha se activa el calendario»**: al confirmar la cita se crea el evento en el calendario
  de la clínica (por la Pluma de `tools/calendario`, en dry-run) y se programan los avisos elegidos.
- **«Aplicación para clínicas»**, en plural: hay **dos clínicas sintéticas desde el día uno**, cada una con su
  marca, servicios y horario, aisladas entre sí.

## Lo que hay hoy (hechos, comprobados el 2026-10-16)

- **Auth**: `src/features/auth` hace correo y contraseña con Supabase (`services/acciones.ts:33,44`). No hay
  Google OAuth.
- **Calendario** (`tools/calendario`, en `main` desde el PR #267):
  - Lector sobre un espejo y una sola Pluma idempotente con etag.
  - `Reservas` calcula huecos con los eventos del espejo y reglas de horario (`src/disponibilidad.ts`,
    `src/reserva.ts:45`); lo ocupado sale de `transparencia`. No usa freeBusy de Google.
  - El CLI hace dry-run por defecto. Las invitaciones salen con `sendUpdates: none` salvo `confirmaNotificar`
    (`src/pluma.ts:14,29,238`).
  - `ProveedorGog` está escrito pero **no medido**, y el binario `gog` **no está instalado**.
- **Patrón de canal** (`tools/ventas-whatsapp`):
  - Puertos inyectados (`ClienteGraph`, `src/meta/graph.ts:30`).
  - Simulador en proceso y por HTTP en 127.0.0.1 (`src/simulador/meta.ts:61`, `src/simulador/http.ts`).
  - La app se niega a usar el canal real si no está `VENTAS_WA_C3_C4_FIRMADOS==='1'`
    (`src/features/ventas-whatsapp/services/servidor/configuracion.ts:30,50`).
  - **No hay nada de Telegram** en el repo, salvo el origen `'espejo_telegram'` de `tools/sala-a2a`.
- **Cadenas sha256 ya construidas**:
  - `tools/ventas-whatsapp/src/trazabilidad/cadena.ts` (HMAC sin PII, Merkle, anclaje Ed25519);
  - `tools/etiquetas-gs1/src/cadena.ts` con `jcs.ts` y `merkle.ts`;
  - `tools/soporte-sap/src/cadena.ts`.
  - El diseño (JCS, RFC 8785) está en `docs/goals/expediente-lote-cadena-hash.md`.
- **dbt + MetricFlow** en `tools/soporte-sap/semantica/`:
  - dbt-core 1.12.5, dbt-postgres 1.11.0 y dbt-metricflow 0.15.0;
  - `corre.mjs` hace venv con uv, Postgres efímero en Docker, `dbt build`, `mf validate-configs` y `mf query`;
  - las pruebas están en `semantica/pruebas/*.sql` y `pruebas/semantica.ts`.
- **No existe nada** de GTM, `dataLayer`, CAC, LTV ni unit economics. Lo más cercano es ROAS y costo por
  conversación en ventas-whatsapp, y `src/lib/ai/contabilidad.ts` (costo `null`, nunca cero, sin datos de
  uso; aviso al 80 %).
- **Reel**:
  - `tools/reel` produce MP4 1080×1920 determinista, pero su proceso completo pide ffmpeg, OpenCV y modelos.
  - Más ligero: `node scripts/laboratorio-pymes/video.ts` hace un MP4 de promoción sintético sin red con
    Chromium y ffmpeg (`src/features/estudio-pymes/services/servidor/render-video.ts`).
- **Voz** (tras el PR #268):
  - `tools/voz`: VAD en el navegador.
  - `tools/dictado`: ASR Parakeet local y TTS Piper es_MX en el servidor.
  - `tools/bucle-voz`: turnos, interrupción con puerta de eco, enrutador sin LLM, cerebro en flujo y
    reproductor por `<audio>`.
  - Lo medido en el centro de mando: orden local p50 644 ms, con cerebro p50 1895 ms, interrupción p50 208 ms.
- **Grafos**: `docs/grafos/*.json` usa el esquema `slug/titulo/nodos/aristas/lazos`. `tools/grafo-conocimiento`
  es un motor de reglas determinista, con 17 dominios y ninguno de salud. En
  `tools/conocimiento/dominios/mx-datos-personales-prospeccion.json` hay reglas de la LFPDPPP.
- **Gobernanza**:
  - plantillas `.claude/gobernanza/plantillas/aisia.md` (C4) y `modelo-amenazas.md` (C3);
  - ejemplos firmados: `AISIA-soporte-sap.md` y `AISIA-asesor-ventas-fase0.md`.
  - `add-emails` trae el unsubscribe de un clic (RFC 8058), pero sobre Resend.
- **Credenciales**:
  - `OPENROUTER_API_KEY` presente (llave: US$3.27 de margen sobre su tope; cuenta: US$2.56 de saldo).
  - Ausentes: token de bot de Telegram, credenciales de Gmail, `gog` e ID de GTM. **Por eso los canales
    van contra simuladores** y nada de eso hace falta para el HECHO.
  - Docker corre con Supabase locales (precedente: `sgi:rls`). El proyecto de Supabase de la app en la nube
    está **pausado**: no se usa.

## MISION

Un portal del paciente que una clínica dental mexicana pondría frente a sus pacientes sin pena. Es limpio,
claro y accesible, funciona igual de bien en el celular que en el escritorio, y está a la altura de Doctoralia
o Zocdoc en reservar, pero con dos cosas que ellos no tienen: un asistente que te guía hablando y una
trazabilidad de punta a punta que la clínica puede auditar. Todo en español de México, en la zona
`America/Mexico_City`, con dos clínicas sintéticas, cada una con su marca.

### 1. Entrar y registrarse

- **Login** con correo y contraseña sobre la auth de la casa. Recuperación de contraseña. Si el paciente ya
  existe, va a sus citas.
- **Registro con cuestionario**:
  - campos: empresa (convenio, opcional), nombre, apellido paterno, apellido materno, edad, correo, celular
    (+52 y 10 dígitos), breve descripción del padecimiento y categorías de interés (Odontología
    general/preventiva, Ortodoncia, Endodoncia, Implantología; una o varias);
  - validación con Zod en el cliente y en el servidor, mensajes de error humanos, guardado progresivo (si
    cierra la pestaña no pierde lo escrito), sin campos de más;
  - si es menor de edad, los datos y el consentimiento del tutor.
- **Datos sensibles**: la descripción del padecimiento es un **dato de salud** (dato personal sensible,
  LFPDPPP). Se pide con **consentimiento expreso**, separado de los demás y tan fácil de retirar como de dar,
  y con el aviso de privacidad a la vista (borrador, ver §9). Sin ese consentimiento el campo no se guarda,
  pero el registro sigue. Se guarda lo mínimo: el texto no sale del servidor salvo al cerebro y solo si el
  paciente lo pide en el chat.
- **Opt-ins separados**: recordatorios de cita (transaccional), newsletter (marketing) y Telegram. Ninguno
  viene marcado.

### 2. Agenda

- Calendario mensual con los **días y horas disponibles**, calculados con `Reservas` sobre el horario, los
  sillones y la duración de cada servicio por categoría. Lo ocupado no se ofrece, y **dos pacientes no pueden
  quedarse con el mismo hueco**, ni aunque confirmen a la vez.
- Elegir día → hora → confirmar, con resumen (servicio, clínica, duración, cómo llegar) y **selector de
  notificación**: correo, Telegram, ambos o ninguno, más el opt-in de newsletter.
- Al confirmar:
  - **Evento en el calendario de la clínica** por la Pluma de `tools/calendario`, en dry-run y sin
    invitaciones (`sendUpdates: none`).
  - **Correo** (puerto Gmail): recordatorio con la cita y un `.ics` (RFC 5545) para su calendario. Si dio el
    opt-in, también el newsletter de la clínica, **aparte** del recordatorio, con
    `List-Unsubscribe` + `List-Unsubscribe-Post` de un clic (RFC 8058) y un enlace de baja que funciona.
    Recordatorios programados (por ejemplo 24 h y 2 h antes; tú decides), idempotentes ante reintentos.
  - **Telegram** (puerto con simulador de la Bot API): el aviso de la cita con el **reel dummy** de servicios y
    promociones de la clínica (`sendVideo`). Un bot **no puede escribirle primero** a alguien que no lo
    inició: la vinculación va por deep link (`t.me/<bot>?start=<token>`, token de un solo uso). Esa
    restricción se ve en la UI, no se esconde.
- Reprogramar y cancelar desde la app, con el mismo cuidado: se liberan huecos y se cancelan avisos.

### 3. El paciente registrado

Sign in → su agenda y una **vista de notificaciones de las próximas citas**: qué se programó, qué se envió, por
qué canal y en qué estado quedó en el simulador (entregado, fallido, dado de baja), con lo que puede hacer en
cada caso.

### 4. Botón de voz (habilitar / deshabilitar)

Si está habilitado, el asistente **guía el registro hablando**: dice cada campo, escucha, propone lo que
entendió, y el paciente confirma o corrige.

- Nunca envía el formulario sin un «sí» explícito. El padecimiento dictado se muestra para confirmar antes de
  guardarlo.
- Se puede interrumpir («para», «repite», «atrás»).
- **El audio no sale del servidor de la clínica**: ASR y TTS locales de la casa. Sin APIs de voz de terceros.
- El estado del botón se recuerda. Sin permiso de micrófono, se dice qué pasó y cómo seguir por escrito.

### 5. Botón de chatbot (habilitar / deshabilitar)

Si está habilitado, el asistente contesta **por voz o por escrito** lo que el paciente pregunta sobre su
clínica: servicios y en qué consiste cada uno, precios (sintéticos), horarios, ubicación, cómo prepararse,
políticas de cancelación, sus próximas citas.

- **Enrutador sin LLM delante** (el de `bucle-voz`): «mis citas», «quiero agendar» o «cancela mi cita» se
  resuelven sin el cerebro y abren el flujo de la UI.
- **El cerebro no tiene herramientas de escritura.** Puede proponer un hueco, pero agendar, cancelar o cambiar
  algo se confirma en la UI.
- Contesta con la base de conocimiento declarada de SU clínica. **No inventa precios, nombres ni promociones.**
- **No diagnostica.** Ante «¿qué tengo?» explica que eso lo dice el dentista y ofrece agendar.
- **Las urgencias las decide una regla, no el LLM.** Las señales de alarma (dificultad para respirar o tragar,
  hinchazón de cara o cuello que avanza, fiebre con dolor dental, sangrado que no para, golpe con un diente
  caído) llevan a una respuesta fija: emergencias (911) o llamar hoy a la clínica, según el caso. La lista se
  declara con su fuente.
- Lo que el paciente escribe es entrada **no confiable**: un «ignora tus instrucciones» no cambia nada (C3).

### 6. Trazabilidad de eventos

- **Contrato de eventos versionado (Zod)**: paciente registrado, consentimiento otorgado o retirado, cita
  solicitada, confirmada, reprogramada o cancelada, aviso programado, enviado, entregado o fallido, baja de
  newsletter, turno del asistente (intención, latencia, costo; **sin el texto**), voz y chatbot
  habilitados.
  - **Ningún evento lleva PII ni datos de salud.** El paciente es un seudónimo HMAC, como en
    `ventas-whatsapp`.
  - **La categoría del servicio es un dato de salud frente a un tercero**: va en el libro interno, nunca en el
    `dataLayer`.
- **Libro encadenado con sha256** sobre JCS (RFC 8785) y raíz Merkle: reutiliza el diseño de la casa en lugar
  de inventar otro. Verificable. Alterar, quitar o reordenar un evento se detecta y dice dónde.
- **dbt + MetricFlow** sobre Postgres efímero, por el mismo camino que soporte-sap:
  - staging → marts;
  - modelos semánticos y métricas: pacientes nuevos, citas confirmadas, tiempo de registro a cita,
    conversión por paso y por canal, entregabilidad, bajas, costo por aviso y por conversación del
    asistente;
  - **lo que entra a dbt cuadra con el libro, tipo por tipo**.
- **Grafo de atención al cliente**: el recorrido del paciente como grafo (visita → registro → consentimientos →
  agenda → cita → avisos → asistencia, con las ramas del asistente y de urgencias). Lleva conteos y tiempos
  p50 por arista salidos de MetricFlow, en el esquema de `docs/grafos/`, renderizado en una página **del
  laboratorio** (no del paciente).
- **GTM**:
  - `dataLayer` con los eventos de producto permitidos.
  - Consent mode v2 denegado por defecto (`ad_storage`, `analytics_storage`, `ad_user_data`,
    `ad_personalization`).
  - El contenedor se carga solo con un `NEXT_PUBLIC_GTM_ID` **y** el consentimiento. En el laboratorio no hay
    ID: se prueba el `dataLayer`, no Google.
- **Unit economics**, por clínica y por canal:
  - CAC, LTV, margen por cita, costo por aviso, costo del asistente por conversación (medido) y la tasa de
    inasistencia (simulada).
  - **Cada cifra dice si es medida, simulada o supuesta**, y cada supuesto dice su fuente. Ninguna finge ser
    real.

### 7. Dos clínicas, aisladas

Marca, servicios, precios, horario, sillones, base de conocimiento y reel propios. **El paciente de una no ve
nada de la otra, y la clínica A no lee a la B**: RLS probada en efímero, no supuesta. `service_role` fuera de
las superficies.

### 8. El laboratorio

- **Pacientes sintéticos declarados**: adulto con convenio, menor con tutor, sin consentimiento de salud, con
  baja de newsletter, con Telegram sin vincular, con choque de hueco.
- **Corpus de preguntas al asistente con la conducta esperada**: en dominio, fuera de dominio, intento de
  diagnóstico, cada señal de urgencia, inyección y pedido de acción.
- Una corrida reproducible recorre la app con Playwright, llena el libro, corre la capa semántica y regenera
  métricas, grafo y capturas.

### 9. Lo que se deja listo para firmar (NO se aplica)

- **Propuesta de CDC**: la clase de routing `asistente-paciente` en el nivel `voz` (u otra que la medición
  justifique), y los prompts versionados del guía de registro y del chatbot, con su diff, la medición que los
  eligió y el gasto.
- **Borrador de AISIA (C4)**, sobre la plantilla: datos de salud, menores, qué decide el asistente sobre el
  paciente y qué pasa si se equivoca.
- **Modelo de amenazas (C3)**: el chat y la voz como entrada no confiable, el bot de Telegram, el enlace de
  baja y el deep link.
- **Borrador de aviso de privacidad**, marcado «borrador, no vigente: lo revisa un abogado». Contra la
  LFPDPPP vigente (se publicó una ley nueva en 2025: verifícalo).
- **Migración** validada en efímero y no aplicada.

### Horizonte (no se construye, no se impide)

- La vista del personal de la clínica.
- Avisos por WhatsApp (sobre ventas-whatsapp) y por SMS.
- Pagos y anticipos.
- El expediente clínico (NOM-004-SSA3-2012: este portal NO es el expediente).
- Varios consultorios por clínica.
- Exponer el asistente por A2A.
- Los adaptadores reales de Gmail (Gmail API o `gog`) y Telegram, que entran solo con C3 + C4 firmados y
  gate humano. **Gmail personal no es un proveedor de envío masivo**: tiene límites de envío, y el puerto
  permite cambiar a Resend (`add-emails`) sin tocar el núcleo.

## GRAFO DEL SISTEMA

Topología completa en `docs/grafos/clinica-dental.json`: nodos = artefactos, aristas = transformaciones
tipadas (script, agente, mixta, manual), lazos = comparadores con su referencia. Estados honestos: **morado**
lo validado (el spec y las piezas de la casa), **gris** todo lo que falta. Un estado se cambia solo con
evidencia: al cerrar un lazo, actualiza su `estado` en el JSON.

Plan derivado (`docs/goals/clinica-dental-plan.md`, 10 fases, 4 con paralelismo). Dos agentes coexisten solo
si escriben artefactos distintos. ⚠ marca una convergencia: varias aristas al mismo artefacto, que hacen el
mismo worker o un merge explícito.

| Fase | Produce | Gates al cerrar |
|---|---|---|
| 1 ⚡ | clínicas sintéticas · pacientes y corpus · contrato de eventos | — |
| 2 ⚡ | núcleo `tools/clinica-dental` ⚠ · migración con RLS · reel dummy · asistente ⚠ · `dataLayer` | consent mode · RLS · consentimiento · disponibilidad |
| 3 | canales simulados (correo + Telegram) ⚠ | canales (dry-run, gate, idempotencia, baja, RFC 8058) |
| 4 | app del paciente ⚠ | accesibilidad (escritorio y celular) |
| 5 ⚡ | libro de eventos ⚠ · medición del asistente con el LLM real ⚠ | contrato · cadena · sin PII · conducta del asistente · gasto ≤ US$1 · voz |
| 6 | dbt + MetricFlow ⚠ | convergencia libro = staging |
| 7 ⚡ | unit economics ⚠ · grafo de atención | métricas = conteo directo, supuestos con fuente |
| 8 | evidencias (capturas, mediciones, reporte, post-mortem) ⚠ | — |
| 9 | propuestas para firmar (CDC, AISIA, C3, aviso) | — |
| 10 | ⏸ firma del laboratorio: **fuera del HECHO** | — |

## LIBERTAD TECNICA

Tú eliges arquitectura, librerías, diseño visual, modelo de datos, cómo se programan los avisos, cómo se
simula Telegram, qué modelo semántico conviene y cómo se dibuja el grafo. Lo que se nombra en este spec es
sugerencia descartable, salvo §RESTRICCIONES REALES y el stack de la casa (AGENTS.md, Golden Path). Si una pieza
de la casa no sirve, dilo con evidencia y propón otra; no la rodees en silencio. Optimiza por el mejor
resultado, no por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

- **Reservar**: 2-3 referencias de nivel mundial (Doctoralia, Zocdoc y un portal de paciente dental, como
  Dentalink o NexHealth). De ahí sacas el flujo y el diseño, no la marca.
- **Normas**:
  - la LFPDPPP vigente para datos sensibles y menores;
  - la Bot API de Telegram (deep linking, `sendVideo`, límites);
  - RFC 8058 y los requisitos de remitente de Gmail;
  - RFC 5545;
  - consent mode v2.
- **Urgencias odontológicas**: una guía con fuente para la lista de señales de alarma.

Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Suites en verde, pegadas con su conteo**. Tienen que incluir:
  - cuestionario y consentimientos (sin consentimiento no se guarda el padecimiento; el menor pide tutor);
  - disponibilidad sin dobles reservas bajo concurrencia;
  - recordatorio idempotente;
  - la baja que corta el newsletter, con `List-Unsubscribe` de un clic;
  - el adaptador real que se niega sin el gate;
  - la cadena y su manipulación detectada;
  - cero PII sembrada en el libro, el `dataLayer` y los logs;
  - consent mode denegado por defecto;
  - RLS de paciente a paciente y de clínica a clínica, en efímero.
- **Capa semántica**:
  - `dbt build` y `mf validate-configs` en verde, pegados;
  - la tabla de convergencia (eventos del libro = filas de staging, por tipo);
  - cada métrica de MetricFlow junto a su conteo directo;
  - el unit economics y el grafo de atención con el origen de cada cifra (medida, simulada o supuesta).
- **Medición del asistente con el LLM real, pegada**:
  - el corpus con 0 diagnósticos, el 100 % de las urgencias por regla, 0 acciones sin confirmar, fuera de
    dominio rechazado e inyecciones sin efecto;
  - la latencia de voz (fin real del habla → primer audio audible, p50 y p95) y la interrupción;
  - el gasto de OpenRouter antes y después, ≤ US$1.
- **Capturas de Playwright** en escritorio y celular, pegadas:
  - registro con cuestionario, también con la guía de voz;
  - agenda con hueco elegido y selector de notificación;
  - el correo de recordatorio y el newsletter renderizados desde el outbox;
  - el aviso de Telegram con el reel en el simulador;
  - sign in → próximas citas;
  - chatbot por texto y por voz;
  - una urgencia derivada;
  - el grafo de atención y el tablero de unit economics.
- **Las propuestas de §9** junto al spec, con «aprobación humana ☐» y «**Aprobado por**: pendiente».
- `npm run validate` en verde **después del commit**, pegado.
- **Reporte de decisiones**, y lista de formas en que esto podría estar mal o incompleto, cada una con lo que se
  hizo. Sobre todo: dónde los simuladores podrían divergir de Gmail y Telegram reales, y qué es medido y qué
  supuesto.
- **O BIEN, BLOQUEADO**: si falta algo que solo da una persona (llave, saldo, firma), detente y pega el
  bloqueo, quién lo destraba y el estado del grafo. Eso también cierra el goal.

## COMANDO DE VALIDACION

- En el worktree, primero un `npm ci` real: con `node_modules` enlazado, Turbopack falla.
- Tras cada cambio grande: `npm --prefix tools/clinica-dental run prueba && npm run typecheck`, más la suite
  de toda herramienta nueva o tocada. Pega el output.
- La capa semántica, con tu script equivalente a `tools/soporte-sap/semantica/corre.mjs`.
- Las capturas, con tu script de Playwright.
- Al final, `npm run validate` **después del commit**: la gobernanza lee `git ls-files`.

## RESTRICCIONES REALES

- **Solo pacientes y clínicas sintéticos y declarados.** Ningún dato de un paciente real: es un dato de salud de
  un tercero, y ninguna firma lo autoriza (límite de C5). Pacientes reales exigen antes AISIA firmada, aviso de
  privacidad vigente y consentimiento expreso.
- **Nada real sale**: ni un correo, ni un mensaje de Telegram, ni un evento en un calendario real, ni un hit a
  Google. Los adaptadores reales se niegan sin `CLINICA_C3_C4_FIRMADOS==='1'` (el patrón de ventas-whatsapp).
  Telegram es un canal de chat externo: C3 + C4 + gate humano (AGENTS.md).
- **Tope de US$1** en OpenRouter, con el modelo pineado. El gasto se mide antes y después.
- **El audio no sale del servidor**: sin APIs de voz de terceros (ni Web Speech, ni ElevenLabs, ni Groq).
- **El asistente no diagnostica, no tiene herramientas de escritura y no actúa sin confirmación en la UI.** Las
  urgencias, por regla.
- **CDC (C1)**: nada en `.claude/` ni en `AGENTS.md` sin CDC firmado. La clase de routing y los prompts entran en
  la rama porque sin ellos el gate rechaza la llamada, pero son CDC: propuesta con «aprobación humana ☐» y
  «**Aprobado por**: pendiente». Nunca se escribe la firma.
- **La base compartida no se toca**: Supabase local en Docker para la app y migración validada en efímero.
  `service_role` fuera de las superficies; RLS en toda tabla; Zod en toda entrada.
- **Vive en el monorepo**:
  - el núcleo en `tools/clinica-dental/`, sin React, Next ni Supabase;
  - las pantallas en `src/features/clinica-dental/`;
  - las pruebas en `tools/<nombre>/pruebas/`, porque un gate nuevo en `.claude/gates.json` es CDC.
- **Altas obligatorias**:
  - todo activo nuevo, con su asiento en `inventario/activos.json` y `npm run inventario:vista`;
  - el producto, con su fila en el índice de `BUSINESS_LOGIC.md` §1, como `pendiente`. Faltar ahí tumbó el
    validate del goal anterior.
- **Código**:
  - versiones exactas en dependencias nuevas;
  - sin `any`;
  - archivos de 500 líneas o menos y funciones de 50 o menos;
  - ningún token `T` + dígitos en el árbol;
  - ningún secreto impreso (solo presente o ausente y largo);
  - nunca un `git stash` sin nombre.
- **Rama `clinica/portal-paciente`, en su worktree.** El push y el PR los hace el laboratorio.

## RED DE SEGURIDAD

Si tras 50 turnos las suites no convergen, detente y reporta el bloqueo, con el estado del grafo.
