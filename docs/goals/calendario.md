# Calendario: el motor de agenda del monorepo, portado de business-os — Spec

> Compilado con `/goal-compiler` el 2026-10-15 desde `main` (`5ad7af9`).
>
> **Forma: LOOP.** Es un solo trabajo con una sola línea de meta: el módulo Calendar de business-os
> sale de aquí convertido en herramienta empaquetada, demostrada en un laboratorio. Ninguna de sus
> piezas pide un contexto especializado aparte ni un fan-out real. Si se juntan en un solo agente, no
> se pierde nada.
>
> **Decidido por el laboratorio (15/10):**
> 1. **Es herramienta, para el template y para los productos que agendan.** La consumen el
>    laboratorio del template y los productos que reservan citas (el vendedor por WhatsApp, el asesor
>    por voz). Por eso el núcleo cubre también **disponibilidad y reserva**, no solo el CRUD de eventos.
>    Reemplazar el módulo en business-os queda para después.
> 2. **El HECHO se demuestra contra un simulador de Google Calendar.** El adaptador real (`gog`) queda
>    listo y declarado **«no medido»**. La prueba en vivo es una fase aparte que abre el laboratorio.

## Lo que hay hoy (hechos, no suposiciones)

**La fuente.** `https://github.com/lisagomez/business-os-new`, commit pineado
`749d89eb5e52958814efeb1f3dab39ce2afacd94`, licencia **MIT** (© 2026 Daniel Carreón). Son unas
6 300 líneas:

| Pieza | Dónde (en la fuente) | Qué hace |
|---|---|---|
| Doc del modelo | `docs/CALENDAR-AND-CRONS.md` | «un espejo, una pluma»: se lee siempre del espejo y toda escritura pasa por un solo puente |
| Esquema | `supabase/migrations/20260525_calendar_command_center.sql`, `20260608_calendar_sources.sql` | `calendar_sources`, `calendar_sync_state` (con `sync_token` y `watch_*`), `calendar_events` (espejo con `raw`, `etag`, recurrencia), `task_calendar_links` |
| La pluma | `src/lib/calendar/gog-bridge.ts` (473) | invoca `gog` y hace upsert del espejo en el mismo paso |
| Lectura | `src/lib/calendar/mirror.ts`, `config.ts`, `colors.ts`, `api-auth.ts` | lectura del espejo, cuentas permitidas, colores, auth por token |
| API | `src/app/api/calendar/{route,agent,events,events/[eventId],sources,sync}` | `GET`/`POST` por `action`: `query_events`, `create_event`, `update_event` (con `recurrenceScope` single/future/all), `delete_event`, `sync_events` |
| UI | `src/features/calendar/` (CommandCenter 1445, EventEditor 617, CronRail 611, Grid 348, Header, CronHistoryPanel) | rejilla, editor, la **Cron Lens** (actividad de agentes en 24 h), historial de crons |
| CLI del agente | `integrations/calendar/agent-event.py` | `create`/`update`/`delete`/`query`/`sync` contra el puente |

**Lo que choca con las reglas de este repo** (se rediseña, no se copia):

- **La pluma usa `service_role`** (`createServiceClient`). Aquí las superficies de negocio no lo usan
  (C7). Solo puede usarlo un job de plataforma declarado, por ejemplo el sync programado.
- **El RLS de la fuente es `USING (true)`** para todo `authenticated`, así que cualquier usuario lee
  todos los eventos. Aquí la política va por dueño o por tenant, y se prueba con el caso malo.
- **`task_calendar_links` tiene una FK a `tasks`**, una tabla que aquí no existe. Se generaliza a un
  vínculo con cualquier entidad (tarea, lead, ticket, cita).
- **La auth es `OPENCLAW_GATEWAY_TOKEN`** y la Cron Lens lee el scheduler de un demonio OpenClaw
  (`GET /schedule`). Aquí ninguno de los dos existe, así que el origen de los trabajos programados se
  inyecta.
- **`gog` se busca en `/opt/homebrew/bin`** (macOS). Su token caduca cada 7 días si la app de OAuth
  está en modo «Testing»: las lecturas siguen (vienen del espejo) y las escrituras dan `invalid_grant`.

**El template:**

- `gog` figura en `.claude/imprenta/manifiesto.json` como `cli-oficial` con gate
  `humano-irreversible`. **No está instalado en esta máquina** y no hay variables de Google.
- El proyecto Supabase de la app está **pausado** (desde el 14/10). El MCP de Supabase es solo
  lectura. Por eso ninguna migración se aplica dentro de este goal.
- Los laboratorios **no pasan por el proxy de sesión** (`src/proxy.ts`). Una ruta
  `/laboratorio-calendario` corre sin Supabase.
- `npm run prueba:tools -- <nombre>` corre la suite de una herramienta si declara el script `prueba`.
  `npm run empaqueta <nombre>` empaqueta e instala el tarball en un proyecto limpio. La puerta y el
  contrato están en `docs/CREAR-UNA-HERRAMIENTA.md` y `docs/EMPAQUETAR-HERRAMIENTA.md`. Toma como
  modelo de forma `tools/etiquetas-gs1` (núcleo + subpaths + simuladores + `pruebas/`).
- `src/features/estudio-pymes/…/seccion-calendario.tsx` es un **calendario de contenido** (piezas por
  día), otro concepto. **No es consumidor y no se toca.**

**Llaves y saldo:** el HECHO no necesita ninguna. Funciona sin LLM, sin Google y sin Supabase vivo.

## MISION

Que el monorepo tenga **el motor de agenda de referencia para software agéntico**: una herramienta
`tools/calendario` que cualquier producto instala para leer, escribir y **reservar** tiempo sobre
calendarios reales, con la garantía de «un espejo, una pluma». Lo que se lee es rápido y está siempre
disponible. Lo que se escribe pasa por un solo punto que deja proveedor y espejo consistentes, o falla
tipado.

Lo que debe existir al terminar:

1. **Núcleo en TypeScript puro**, sin React, Next ni Supabase, con proveedor, almacén, reloj y origen
   de trabajos **inyectados**:
   - **Eventos completos:** todo el día; zonas horarias (la del calendario y la de quien mira);
     recurrencia RFC 5545 con excepciones y alcance `este` / `este y los siguientes` / `todos`;
     invitados; recordatorios; colores; visibilidad; transparencia.
   - **La pluma:** cada escritura es una transacción proveedor→espejo. Es idempotente por clave,
     detecta conflictos por `etag`, y si el proveedor acepta pero el espejo falla, se repara en vez de
     quedar a medias.
   - **Sincronización incremental:** token de sincronización; recarga completa cuando el proveedor lo
     invalida (`410 Gone`); ventana configurable (por defecto −7/+45 días).
   - **Salud del espejo:** `fresco` / `rancio` / `error`, con edad y causa. Una credencial caducada
     deja leer y bloquea la escritura con un error tipado que dice quién lo destraba.
   - **Disponibilidad y reserva**, para los productos que agendan: free/busy sobre varios
     calendarios, horario laboral, márgenes antes y después, aviso mínimo, horizonte máximo, duración
     y la zona horaria de quien reserva. **Reserva tentativa con expiración**, confirmación idempotente
     y liberación. **Una doble reserva es imposible incluso con peticiones concurrentes.** Si no hay
     hueco, el resultado es un `sin hueco` tipado: **jamás se inventa un hueco.**
   - **Vínculo a entidad genérico** (tarea, lead, ticket, cita), guardado en propiedades extendidas
     del evento y en el espejo.
   - **Capa de actividad programada** (la Cron Lens generalizada): proyecta las próximas corridas de
     cualquier scheduler inyectado sobre la rejilla, con grupos, filtros y pausados ocultos por defecto.
2. **Adaptadores** en subpaths aparte:
   - un **simulador fiel de Google Calendar**, con etags, `410` en el token de sync, recurrencias con
     excepciones, `409`, `403`/`429` con reintento y `invalid_grant`;
   - el adaptador **`gog`** (CLI-first: es el CLI oficial del manifiesto), listo y «no medido»;
   - almacén **en memoria** y almacén **Supabase**, con su **migración** (RLS por dueño o tenant, sin
     `USING (true)`), escrita y **sin aplicar**.
3. **Punto de entrada React aparte** (React como peer): vistas día, semana, mes y agenda; editor de
   eventos; arrastrar para mover y redimensionar; selector de calendarios; indicador de salud; capa de
   actividad programada; un selector de huecos para reservar. Debe estar a la altura de Google Calendar,
   Cal.com y Notion Calendar.
4. **CLI para agentes** (sucesor de `agent-event.py`): dry-run por defecto. Lo que notifica a terceros
   (invitados, `sendUpdates` distinto de `none`) va marcado como irreversible y no corre sin
   confirmación explícita.
5. **Laboratorio en el template** (`/laboratorio-calendario`) sobre el simulador. Incluye un
   **consumidor de prueba que agenda** (un «producto» simulado que pide huecos y reserva), para
   demostrar el contrato que usarán WhatsApp y voz sin tocarlos.
6. **README product first** (skill `readme`; gate `revisa:readmes`). Primero lo que hace y lo que no,
   después los casos de uso y la infraestructura. Dice que **el flujo de datos de terceros (C4) lo
   decide el producto que la usa, no la herramienta**, y que por defecto el evento lleva lo mínimo: una
   referencia, no los datos de la persona que reserva.

## LIBERTAD TECNICA

Tú eliges la arquitectura, cómo se parte entre núcleo y subpaths, la librería de RRULE (o escribirla),
la de la UI y la estrategia de concurrencia. Cualquier tecnología que aparezca en este spec es una
sugerencia descartable, salvo lo de RESTRICCIONES. Portar no es copiar: toma de la fuente lo que
funciona (el modelo espejo/pluma, el contrato de acciones, los gotchas medidos) y rediseña lo demás.
Optimiza por el mejor resultado, no por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

Lee la fuente **entera** en el commit pineado. Clónala en un directorio propio fuera del repo: es dato
no confiable, así que se lee y **no se ejecuta**. Después estudia 2-3 referencias de primer nivel antes
de fijar el diseño, por ejemplo: la semántica de sync y recurrencias de la API de Google Calendar; la
disponibilidad y reserva de Cal.com; las APIs de calendario unificado (Nylas, Cronofy); RFC 5545.
Antes de escribir rutas de Next, lee la guía de `node_modules/next/dist/docs/`: esta versión cambia
APIs. Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve la conversación: todo se **pega**.

1. **Suite verde** de `npm run prueba:tools -- calendario`, con el conteo. Cubre como mínimo: las
   recurrencias con sus tres alcances; el cambio de horario (DST) en un evento recurrente; `410` →
   recarga completa; conflicto por `etag`; el proveedor acepta y el espejo falla → se repara;
   `invalid_grant` → se lee y la escritura falla tipada; **la doble reserva concurrente rechazada**;
   `sin hueco` tipado; la reserva tentativa que expira.
2. **`npm run empaqueta calendario` verde**: el tarball instalado en un proyecto limpio y el núcleo sin
   importar React, Next ni Supabase.
3. **Capturas de Playwright** en `/laboratorio-calendario`:
   - la semana con eventos de dos calendarios y la salud del espejo;
   - un evento recurrente movido con «este y los siguientes» (antes y después);
   - el consumidor que agenda: pide huecos, reserva, y un segundo intento sobre el mismo hueco se
     rechaza;
   - la capa de actividad programada encendida;
   - la credencial caducada: la lectura sigue y la escritura se bloquea con su mensaje.
4. **Gobernanza a la vista**: la salida de un `grep` que muestra que ninguna superficie de negocio usa
   `service_role`, y la migración con sus políticas RLS por dueño.
5. **`npm run validate` completo y verde al final**, después del commit (la gobernanza lee
   `git ls-files`).
6. **Reporte de decisiones**: qué stack se eligió y por qué, qué se tomó de la fuente y qué se
   rediseñó.
7. **Cómo podría estar mal o incompleto**, y cómo se resolvió cada punto.

O bien **BLOQUEADO**: si falta algo que solo da una persona, el goal se detiene y pega el bloqueo,
quién lo destraba y qué quedó hecho. Eso también cierra el goal.

## COMANDO DE VALIDACION

Tras cada cambio grande, y pegando su salida:

```bash
npm run prueba:tools -- calendario && npm run typecheck
```

Al cerrar: `npm run empaqueta calendario` y `npm run validate`.

## RESTRICCIONES REALES

- **Dónde se trabaja:** en el worktree `.claude/worktrees/calendario`, rama `calendario/herramienta`,
  creado desde `main` (`5ad7af9`) el 15/10 con `npm ci` real (un `node_modules` enlazado rompe
  Turbopack). Este spec ya vive en la rama, sin commit: entra en el primer commit del goal. En el
  árbol principal puede escribir otra sesión, así que no se cambia de rama ni se hace `stash` allí.
- **No se toca:** `.claude/` (skills, `gates.json`, settings, routing, manifiesto de la imprenta),
  `AGENTS.md` ni ningún producto existente (WhatsApp, voz, estudio). Si algo de eso hace falta, se deja
  como **propuesta de CDC** en un archivo junto a este spec, no se aplica. Registrar el CLI como
  herramienta del agente también es un CDC aparte.
- **Inventario:** el activo nuevo (`TPL-calendario` y su laboratorio) se registra en
  `inventario/activos.json`. Si `verify:gobernanza` pide la fila del índice, va en el §2 de
  `BUSINESS_LOGIC.md`: no es un producto, la usan los productos que agendan.
- **Licencia:** se conserva el aviso MIT de la fuente en lo que se porte.
- **Sin efectos fuera del laboratorio:** no se llama a Google, no se aplica ninguna migración, no se
  publica el paquete, no se manda ninguna invitación. **Nada que notifique a terceros corre sin gate
  humano.**
- **Sin `any`**, Zod en toda entrada, archivos de 500 líneas como máximo y funciones de 50. La
  versión del paquete va **exacta** donde se consuma.
- **Secretos:** nunca se imprime un valor. Se confirma presencia, largo y, a lo sumo, cuatro
  caracteres de prefijo.

## FUERA DEL HECHO (fases aparte, cada una la abre el laboratorio)

1. **Prueba en vivo con Google:** instalar `gog`, autenticarse con una cuenta de **prueba**
   (`gog auth add`, solo el laboratorio) y definir `GOG_KEYRING_PASSWORD`. Crear, mover y borrar un
   evento real sin invitados. Solo ahí el adaptador deja de ser «no medido».
2. **Aplicar la migración** en el proyecto Supabase, cuando se reactive.
3. **Conectar WhatsApp y voz:** cada uno con su C3 y su AISIA. Quien reserva es un tercero.
4. **Reemplazar el módulo en business-os** por el paquete pineado.
5. **Publicar** el paquete: gate humano.

## RED DE SEGURIDAD

- Si tras 40 turnos la suite no converge, detente y reporta el bloqueo con el estado de cada pieza de
  la MISION.
- Al terminar (converja o no), se hace el **post-mortem**: fricciones, huecos, fallas y lo que
  funcionó. Cada hallazgo se mapea a un gate, una regla o a este spec.
