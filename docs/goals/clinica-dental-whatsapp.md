# WhatsApp en el portal del paciente (clínicas dentales, en el laboratorio) — Spec

> Compilado con `/goal-compiler` el 2026-10-18. Rama `clinica/whatsapp`, en el worktree
> `.claude/worktrees/clinica-whatsapp`, desde `main` (`417bc57` o posterior). Este spec está sin versionar en `main`:
> al crear el worktree, cópialo a `docs/goals/` de la rama y commitéalo con el trabajo.
>
> **Forma: LOOP.** El diagnóstico da un sí de cuatro: no hay contextos especializados con criterios distintos (todo
> se juzga por lo mismo: el canal es correcto, idempotente y seguro con datos de salud), no hay fan-out/fan-in real,
> y el criterio no cambia por nodo. Si se colapsa en un agente no se pierde nada. El grafo del portal
> (`docs/grafos/clinica-dental.json`) se **actualiza** con los nodos y lazos del canal nuevo; no se hace un grafo aparte.
>
> **Decidido por el laboratorio (2026-10-18):** el alcance es **avisos + asistente + agendar**. Recordatorios y
> confirmación por plantillas; el mismo asistente contesta en WhatsApp; agendar, reprogramar y cancelar con un Flow
> que el paciente confirma. Todo en el laboratorio contra el simulador de Meta: conectar un número real es un gate
> aparte, fuera de este goal.
>
> **Defaults del compilador** (si alguno está mal, se corrige el spec, no el código):
> 1. **Número en coexistencia**: la clínica conserva su número de WhatsApp Business y la recepción sigue contestando
>    desde su celular; cuando la recepción escribe en un chat, el asistente se calla en ese chat. Número nuevo (pool o
>    BSP de `ventas-whatsapp`) como alternativa declarada.
> 2. **El cerebro es el que ya está medido**: clase `asistente-paciente`, nivel `voz`, modelo pineado
>    `anthropic/claude-haiku-5.5-20261007` (CDC firmado el 2026-10-16). Tope duro de **US$1** para este goal.
> 3. **Nada de atribución a Meta Ads** para la clínica (ni Conversions API ni `ctwa_clid`), y **nada de marketing por
>    WhatsApp**: el newsletter sigue por correo con su baja de un clic.

## Lo que hay hoy (hechos, comprobados el 2026-10-18)

- **El portal** (`tools/clinica-dental`, PR #271): núcleo sin React/Next/Supabase, puertos inyectados.
  - Canales en `src/canales/` (`correo.ts`, `telegram.ts` con simulador de la Bot API, `gate.ts`, `ics.ts`).
  - Avisos en `src/portal/` (`avisos.ts`, `despacho.ts`, `envio.ts`, `plantillas.ts` versión `avisos-1`).
  - `CanalAviso` sale de `CANALES_AVISO` en `src/eventos.ts` (contrato de eventos v1, Zod estricto).
  - Consentimientos en `src/cuestionario.ts`: `aviso_privacidad`, `datos_salud`, `recordatorios`, `newsletter`,
    `telegram`. Telegram exige recordatorios.
  - Asistente en `src/asistente/`: urgencias por regla, guardas, enrutador de `bucle-voz`, prompts `chatbot-paciente-1`.
  - El gate `exigeGate` mira UNA variable, `CLINICA_C3_C4_FIRMADOS`, para todos los canales reales.
  - Libro sha256/JCS + Merkle + sello Ed25519; capa semántica en `semantica/` (staging generado del contrato).
  - App en `src/features/clinica-dental/`, rutas `/clinica/[clinica]`; montaje en `services/servidor/runtime.ts`.
- **WhatsApp** (`tools/ventas-whatsapp`, PRs #195 y #198): simulador fiel de Meta (`src/simulador/meta.ts`, por
  HTTP en `http.ts`), firma `X-Hub-Signature-256` y webhook (`src/meta/firma.ts`, `webhook.ts`), mensajes y
  categorías de plantilla (`mensajes.ts`), tarifas de México (`tarifas.ts`), cronómetro de ventanas de 24 h
  (`cronometro.ts`), Flows cifrados (`src/flows/`, `flows/reserva.json`), frontera del número
  (`src/agente/frontera.ts`), coexistencia (eco del dueño) y cadena de hashes. Su gate:
  `VENTAS_WA_C3_C4_FIRMADOS`.
- **Gobierno firmado el 2026-10-16**: C3 (`docs/goals/clinica-dental-c3.md`) y AISIA (`clinica-dental-aisia.md`),
  **solo laboratorio**. La AISIA anota como falta «SMS o WhatsApp para quien no tiene correo ni Telegram» y pide
  revisión al conectar un canal. El aviso de privacidad sigue como borrador, no vigente.
- **Entorno**: Supabase local `clinica-dental-lab` detenido (se arranca con `docker start` de sus contenedores
  `supabase_*_clinica-dental-lab`); estado del laboratorio en `~/.clinica-dental`; el laboratorio se abre en
  `localhost:3011` (no `127.0.0.1`: Next 16 bloquea la hidratación); el puerto 3000 lo ocupa otro servidor.

## MISION

WhatsApp es donde ya están los pacientes en México. Cuando termines, el número de cada clínica sintética es un
**canal completo del portal**, al nivel de lo mejor que existe en la reserva médica por WhatsApp. Y no aflojas
nada de lo que hace seguro al portal: consentimiento aparte, cero diagnósticos, el asistente sin manos, nada real
sale sin gate y el libro sin PII.

1. **Vincular el WhatsApp sin mandar avisos a un desconocido.** Hay dos riesgos: un número mal escrito manda a un
   tercero un recordatorio que revela que alguien va al dentista y a qué; y un enlace reenviado deja vincularse a
   otra persona (es T-6 de la C3, que hoy sigue abierto para Telegram). Resuélvelos y pruébalos: un número que no
   probó ser del paciente no recibe nada. Las formas de los números mexicanos (`52` con y sin el `1` del celular,
   con lo que mande el webhook en `wa_id`) quedan normalizadas y probadas. Hay consentimiento `whatsapp` aparte, y
   retirarlo corta el envío.
2. **Avisos salientes**: confirmación, recordatorios 24 h y 2 h, reprogramación y cancelación, con plantillas de
   **utilidad**. Meta pasa a marketing una plantilla de utilidad con tono promocional: que no pase. Decide y justifica
   qué datos lleva cada plantilla: lo que ve Meta ya salió del perímetro, y el nombre de un servicio puede ser un
   dato de salud. Los estados (`sent`, `delivered`, `read`, `failed`) que llegan por webhook actualizan el aviso que
   el paciente ve en «Mis citas», con qué puede hacer si falla (número fuera de WhatsApp, bloqueo, plantilla
   pausada). Los avisos son idempotentes: si el resultado es desconocido no se reintenta a ciegas. El costo de cada
   mensaje sale de las tarifas de México y del cronómetro de la ventana.
3. **Todo lo que entra se atiende**, porque la gente contesta los recordatorios. Cada mensaje entrante pasa primero
   por las **urgencias por regla** (sin LLM), después por las barreras, el enrutador y el cerebro con la base de SU
   clínica, y cada frase se revisa antes de salir. La firma del webhook se verifica, el 200 sale de inmediato con una
   cola durable detrás, y hay idempotencia por `wamid`. Un número no vinculado puede preguntar lo que pregunta un
   visitante, pero **nunca** ve citas ni datos. Las **notas de voz** se transcriben con el ASR local de la casa (el
   audio no sale del servidor hacia nadie más) y siguen el mismo camino. Las **fotos** («mira mi muela») jamás van al
   LLM ni se guardan: reciben una respuesta fija que invita a agendar una valoración. Por la frontera del número
   (límites por contacto y por contactos nuevos) nadie quema el presupuesto.
4. **Agendar, reprogramar y cancelar con un Flow**: huecos reales de las `Reservas` de esa clínica, y la confirmación
   la da el paciente en el Flow. La identidad sale de la vinculación, nunca del payload del Flow. Cero dobles
   reservas aunque el portal y un Flow choquen en el mismo hueco a la vez. Cancelar pide una confirmación más. El
   reporte explica, con evidencia, si eso cumple el gate humano que AGENTS.md exige para lo irreversible que sale de
   un chat; si no lo cumple, cancelar por WhatsApp se vuelve «abre el portal». Si el Flow no está disponible, hay un
   botón al portal.
5. **Recepción en coexistencia**: el eco de la recepción calla al asistente en ese chat; «quiero hablar con alguien»
   pasa a la recepción y se le dice al paciente. Si la clínica desconecta el número, el canal se pausa sin perder
   avisos.
6. **Medido como el portal**: eventos nuevos en el contrato (sin PII; el número de teléfono es PII y va seudonimizado),
   libro igual al staging en dbt, métricas iguales a un conteo directo, entregados, leídos y fallidos por canal, y
   unit economics con el costo de WhatsApp por aviso frente a correo y Telegram, cada cifra con su origen.
7. **El asistente medido por WhatsApp con el LLM real**: el corpus de 58 preguntas por la ruta del webhook simulado,
   más casos propios del canal (síntomas en la respuesta a un recordatorio, nota de voz, foto, número no vinculado que
   pide sus citas, inyección en el texto de un botón o en el payload de un Flow). Las respuestas que el regex marque
   como fallo se revisan con un segundo juez independiente; el reporte ya señaló que el evaluador por regex es frágil.
8. **El gobierno, listo para que el laboratorio lo firme**: una revisión de la C3 y otra de la AISIA que cubran
   WhatsApp en el laboratorio (y digan qué falta para un número real), la actualización del borrador del aviso de
   privacidad (Meta como receptor del mensaje), y la propuesta de CDC de lo que cambie (plantillas `avisos-2`, el
   prompt si cambia, routing si cambia). **Firmar un canal no abre otro**: hoy una sola variable abre Gmail y Telegram
   a la vez; decide cómo queda el gate por canal y pruébalo.

## LIBERTAD TECNICA

Tú eliges arquitectura, cómo reusas `ventas-whatsapp` (dependencia, extracción de un núcleo común de canal o lo que
convenga), el diseño de la vinculación, los Flows, el modelo de eventos y las pantallas. Lo que se nombra aquí es
sugerencia descartable, salvo §RESTRICCIONES REALES y el stack de la casa (AGENTS.md, Golden Path). Si una pieza de
la casa no sirve, dilo con evidencia y propón otra; no la rodees en silencio.

## INVESTIGA ANTES DE CONSTRUIR

- 2-3 referencias de nivel mundial de reserva médica por WhatsApp (Doctoralia, y algún sistema dental o de salud
  que agende por WhatsApp en LATAM). Toma de ahí el flujo, no la marca.
- La documentación vigente de Meta: la política de WhatsApp Business (opt-in, salud, datos sensibles), las
  categorías de plantillas y su recategorización, los precios por mensaje en México, los Flows (endpoint cifrado,
  vigencia), la coexistencia y los códigos de error de entrega. Lo que el simulador no reproduzca de eso queda en el
  reporte como divergencia.
- La LFPDPPP 2025 para la transferencia a Meta como encargado o tercero.

Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Suites en verde, pegadas con su conteo** (las 93 de la clínica siguen verdes). Deben incluir: consentimiento
  `whatsapp` aparte y su retiro; un número que no probó ser del paciente no recibe nada; enlace reenviado sin efecto;
  `wa_id` mexicano normalizado; firma inválida rechazada; idempotencia por `wamid` y aviso sin duplicar; urgencia por
  regla en una respuesta a un recordatorio, sin LLM; nota de voz transcrita local; foto nunca al LLM; Flow que agenda,
  reprograma y cancela con confirmación; cero dobles reservas portal contra Flow a la vez; identidad nunca del
  payload; eco de la recepción que calla al asistente; adaptador real negado sin su gate, y firmar otro canal no lo
  abre; cero PII sembrada (incluido el número) en el libro, el dataLayer, los logs y las semillas de dbt.
- **El asistente por WhatsApp con el LLM real**, pegado: 0 diagnósticos, 100 % de urgencias por regla, 0 acciones sin
  confirmar (portal y calendario idénticos antes y después), 0 citas reveladas a un número no vinculado, inyecciones
  sin efecto; el gasto de OpenRouter antes y después y el libro de gasto, ≤ US$1.
- **Capa semántica**: `dbt build` y `mf validate-configs` en verde, libro = staging por tipo (con los tipos nuevos),
  métricas = conteo directo.
- **Capturas de Playwright**, escritorio y celular: consentimiento de WhatsApp en el registro; vinculación; el chat
  simulado con un recordatorio y la respuesta del paciente; un Flow reprogramando; una urgencia derivada en WhatsApp;
  «Mis citas» con el estado del aviso de WhatsApp; el tablero con el costo por canal.
- **Recorrido con guardia de red**: 0 peticiones externas salvo OpenRouter; ninguna a `graph.facebook.com`.
- **Las propuestas** (C3, AISIA, aviso, CDC) junto al spec, con «aprobación humana ☐» y «**Aprobado por**: pendiente».
- `npm run validate` en verde **después del commit**, pegado.
- **Reporte de decisiones** y **post-mortem**, con la lista de formas en que esto podría estar mal o incompleto y lo
  que se hizo con cada una. Sobre todo: dónde el simulador podría divergir de Meta real, y qué es medido y qué supuesto.
- **O BIEN, BLOQUEADO**: si falta algo que solo da una persona (llave, saldo, firma, una decisión), detente y pega el
  bloqueo y quién lo destraba. Eso también cierra el goal.

## COMANDO DE VALIDACION

- En el worktree, primero `npm ci` real (con `node_modules` enlazado, Turbopack falla) y `npm run prepara:gate`.
- Tras cada cambio grande: `npm --prefix tools/clinica-dental run prueba && npm --prefix tools/ventas-whatsapp run
  prueba && npm run typecheck`, más la suite de toda herramienta nueva o tocada. Pega el output. Para el
  `typecheck`, para antes el `next dev` (deja tipos a medio escribir en `.next/dev/types/`).
- La capa semántica: `node tools/clinica-dental/semantica/corre.mjs`.
- Al final, `npm run validate` **después del commit**: la gobernanza lee `git ls-files`.

## RESTRICCIONES REALES

- **Solo clínicas y pacientes sintéticos.** Ni un número de teléfono real, ni el tuyo: es dato de un tercero, y con
  salud ninguna firma lo autoriza (límite de C5).
- **Nada real sale**: ni un mensaje a Meta, ni una plantilla enviada a revisión, ni una WABA real. El adaptador real
  se niega sin su gate; la variable nunca la pones tú. WhatsApp es un canal de chat externo: C3 + C4 + gate humano.
- **Las C3 y AISIA firmadas no se editan**: la revisión va como propuesta aparte.
- **Tope de US$1** en OpenRouter con el modelo pineado, medido antes y después.
- **El asistente no diagnostica, no tiene herramientas de escritura y no actúa**: actúa el paciente (Flow o clic).
  Las urgencias, por regla.
- **CDC (C1)**: nada en `.claude/` ni en `AGENTS.md`. Las plantillas, el prompt y el routing que cambien son CDC:
  propuesta fuera de la bitácora, nunca la firma.
- **La base compartida no se toca**; `service_role` fuera de las superficies; RLS en toda tabla; Zod en toda entrada.
- **Monorepo**: el núcleo en `tools/` sin React, Next ni Supabase; las pantallas en `src/features/clinica-dental/`; las
  pruebas en `tools/<nombre>/pruebas/`. Las rutas nuevas, declaradas en `RUTAS_FUERA_DEL_BRIDGE` (`prueba:a2a`).
- **Altas**: todo activo nuevo en `inventario/activos.json` + `npm run inventario:vista`; la fila de la clínica en el
  índice de `BUSINESS_LOGIC.md` §1, al día (hoy dice «AISIA, C3 y aviso en borrador, sin firmar», y la AISIA y la C3 se
  firmaron el 16/10).
- **Código**: versiones exactas; sin `any`; archivos ≤ 500 líneas y funciones ≤ 50; ningún token `T` + dígitos; los
  hashes de evidencia como `sha256:<hex>`; variables de entorno nombradas sin valor en los README; ningún secreto
  impreso; nunca un `git stash` sin nombre.
- **Rama `clinica/whatsapp`, en su worktree.** El push y el PR los hace el laboratorio.

## RED DE SEGURIDAD

Si tras 50 turnos las suites no convergen, detente y reporta el bloqueo.
