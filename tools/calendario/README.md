# @tu-scope/calendario

Agenda para software agéntico: se lee al instante de un espejo y se escribe por un solo punto que deja Google y el espejo de acuerdo, o falla diciendo por qué y quién lo destraba.

## Qué hace

- **Lee siempre de un espejo** (memoria, archivo o Supabase): rápido, sin red, y con su **salud** a la vista —`fresco`, `rancio` o `error`, con edad, causa y quién lo destraba—. Si la credencial de Google caduca, se sigue leyendo y la escritura se bloquea.
- **Escribe por una sola pluma**: cada alta, cambio o baja va a Google y al espejo en el mismo paso. Es **idempotente por clave** (un reintento no duplica), detecta cambios ajenos por **etag** en vez de pisarlos, reintenta los 429, y si Google aceptó pero el espejo falló, **repara** en lugar de quedar a medias.
- **Series recurrentes de verdad** (RFC 5545, con excepciones): mover o borrar **este**, **este y los siguientes** o **todos**, en hora local (el horario de verano no corre la junta de las 9:00). Partir una serie que falla a medias se **deshace sola**.
- **Sincroniza** incremental con token, y completa cuando Google invalida el token (410). Solo poda el espejo si el listado llegó **completo**.
- **Disponibilidad y reserva** para los productos que agendan: huecos según horario, duración, intervalo, márgenes, aviso mínimo, horizonte, fechas bloqueadas y tope por día; reserva tentativa que **caduca sola**, confirmación y liberación. **La doble reserva es imposible**, también con peticiones simultáneas. Si no hay hueco, devuelve `sin-hueco` con su motivo: **jamás inventa uno**.
- **Capa de actividad programada**: proyecta sobre la rejilla las próximas corridas de cualquier scheduler (cron de 5 campos, con zona y DST).
- **UI de React aparte** (día, semana, mes, agenda; arrastrar, estirar, editor con alcance, selector de huecos, indicador de salud) y un **CLI para agentes** que por defecto solo muestra el plan.

### Qué no hace

- **No manda correos a nadie por su cuenta.** Notificar a invitados es irreversible: exige `confirmaNotificar` (en la UI, una segunda casilla; en el CLI, `--confirmo-notificar`). Por defecto, `sendUpdates: none`.
- **No decide qué datos de una persona salen hacia Google.** La reserva guarda una **referencia** opaca, no el nombre ni el teléfono de quien reserva; qué más se escribe en el evento lo decide el producto que consume, con su evaluación de impacto (C4).
- **No aplica migraciones ni usa `service_role`.** El almacén de Supabase trabaja con la sesión del usuario y RLS por dueño; aplicar `migraciones/` es un gate humano.
- **No está medido contra Google real.** El adaptador `gog` está escrito y probado con un `gog` falso, pero nunca corrió contra Google: es **«no medido»** hasta la prueba en vivo con una cuenta de prueba.
- **No tiene una interfaz propia de sincronización programada**: el refresco periódico lo agenda quien la usa (un cron que llame a `sincroniza`).

## Casos de uso

- **Un producto que agenda** (el vendedor por WhatsApp, el asesor por voz) cuando un cliente pide cita: le ofrece huecos reales en **la zona del cliente**, aparta uno mientras confirma y lo agenda sin que otro cliente pueda tomar el mismo hueco.
- **Un agente** que necesita poner, mover o quitar algo en la agenda: lo hace por el CLI o por la pluma, en dry-run primero, sin dejar el espejo desfasado (la regla dura de la fuente: nunca escribir a Google por fuera de la pluma).
- **Quien opera un negocio** y mira su semana: ve la agenda al instante aunque Google no responda, sabe desde cuándo está rancia y qué hacer si la credencial caducó.
- **Quien supervisa automatizaciones**: ve en la misma rejilla cuándo corre cada trabajo programado (la «Cron Lens» de la fuente), sin atarla a un demonio concreto.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines.node`). El núcleo y la UI corren también en el navegador.
- **Dependencias del sistema**: ninguna para el núcleo, el simulador y los almacenes. El adaptador `./gog` necesita el CLI `gog` instalado y autenticado (no medido); React `^19` solo para `./react` (peer opcional).
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: ninguno para el núcleo. Con `./gog`, Google Calendar (por `gog`); con `./almacenes/supabase`, un proyecto Supabase con `migraciones/0001_calendario.sql` aplicada.
- **Variables de entorno**: `GOG_KEYRING_PASSWORD` (la exige `./gog/proceso` para abrir el llavero de `gog`; solo se comprueba que existe), `GOG_BIN` (opcional, ruta del binario) y `CALENDARIO_CUENTA` (opcional, cuenta por defecto del CLI).
- **Almacenamiento**: el que se inyecte. En memoria, nada. `./almacenes/archivo` escribe un JSON (el CLI usa `.calendario-espejo.json`; se borra borrando el archivo). `./almacenes/supabase` escribe en las tablas `calendario_*` de la migración, una fila por dueño.
- **Salida del perímetro (C4)**: el núcleo no saca nada de la máquina. Con `./gog`, los eventos (título, descripción, lugar, invitados) van a Google Calendar de la cuenta configurada: esa decisión de flujo de datos es del **producto que consume**, no de esta herramienta. El laboratorio no saca nada del navegador.

## Instalar

```bash
npm run empaqueta calendario        # construye, prueba el contrato e instala el tarball en un proyecto limpio
npm install /ruta/a/tools/calendario/tu-scope-calendario-0.1.0.tgz
```

En el consumidor, la versión va **exacta** (`"@tu-scope/calendario": "0.1.0"`), nunca `^` ni `latest`.

## Uso

```ts
import { Pluma, Lector, Reservas, sincroniza } from '@tu-scope/calendario'
import { SimuladorGoogle } from '@tu-scope/calendario/simulador'   // o ProveedorGog desde './gog'
import { AlmacenEnMemoria } from '@tu-scope/calendario/almacenes/memoria'

const proveedor = new SimuladorGoogle()
const almacen = new AlmacenEnMemoria()
const pluma = new Pluma({ proveedor, almacen })
const lector = new Lector({ almacen })
const ref = { cuenta: 'agenda@negocio.mx', calendario: 'trabajo' }

await sincroniza({ proveedor, almacen }, ref)
await pluma.crea(ref, { titulo: 'Revisión', inicio: '2026-10-20T17:00:00Z', fin: '2026-10-20T18:00:00Z', zona: 'America/Mexico_City' }, { clave: 'revision-20' })
const { instancias, salud } = await lector.consulta({ calendarios: [ref], desde, hasta, zona: 'America/Mexico_City' })

const reservas = new Reservas({ almacen, pluma, lector, recurso: ref, reglas: { zona: 'America/Mexico_City', horario: [{ dia: 1, desde: '09:00', hasta: '14:00' }], duracionMin: 45 } })
const huecos = await reservas.huecos()                                   // { tipo: 'huecos', … } | { tipo: 'sin-hueco', motivo }
const t = await reservas.tentativa({ inicio: huecos.huecos[0].inicio, referencia: 'conv-42', clave: 'conv-42:1' })
if (t.ok) await reservas.confirma(t.reserva.id, { titulo: 'Cita · ref conv-42', clave: 'conv-42:confirma' })
```

| Subpath | Qué trae |
|---|---|
| `.` | núcleo puro: tipos (Zod), tiempo/DST, recurrencias, pluma, sincronización, salud, lector, disponibilidad, reservas, actividad, vistas |
| `./simulador` | `SimuladorGoogle`: el contrato de Google (etags, 409, 410, 412, 429, `invalid_grant`, paginas, excepciones) y su registro de notificaciones |
| `./gog`, `./gog/proceso` | `ProveedorGog` (no medido) y la ejecución real de `gog` por `execFile` |
| `./almacenes/memoria`, `./almacenes/archivo`, `./almacenes/supabase` | el espejo en memoria, en un JSON, o en Supabase por RPC con RLS |
| `./react` | `Agenda`, `EditorDeEvento`, `SelectorDeHuecos`, `IndicadorDeSalud`, `EstilosCalendario` (`'use client'`, CSS propio con prefijo `cal-`) |

**CLI** (`calendario`, dry-run por defecto; `--aplica` para escribir):

```bash
calendario crea --cuenta agenda@negocio.mx --calendario trabajo --titulo "Revisión" \
  --inicio 2026-10-20T17:00:00Z --fin 2026-10-20T18:00:00Z --zona America/Mexico_City   # imprime el plan, ya validado
calendario consulta --calendario trabajo --desde 2026-10-19T00:00:00Z --hasta 2026-10-26T00:00:00Z
calendario sincroniza --calendario trabajo --aplica
```

Salidas: `0` bien, `2` entrada inválida o gate (p. ej. notificar sin `--confirmo-notificar`), `1` el proveedor falló.
Los planes de `crea` y `actualiza` pasan por la misma validación que la escritura: un evento que se rechazaría sale con `2` ya en el dry-run. El de `actualiza` lee el evento del espejo (no del proveedor), así que sin sincronizar antes no hay plan (`no-encontrado`), y cuenta como irreversible lo que notificaría a los invitados que el evento ya tiene. Para planear desde código: `validaEntrada(entrada)` y `planeaActualiza(almacen, inst, cambios, alcance)`.

## Cómo está hecho

Un espejo, una pluma (el modelo de `business-os`): **se lee siempre del espejo; se escribe solo por la pluma**. La pluma anota una *intención* antes de tocar Google; si Google acepta y el espejo falla, la escritura no se repite y `repara()` relee lo afectado (o lo cierra una sincronización completa, con un proveedor que no lee por id, como `gog`).

Lo que se rediseñó respecto a la fuente, y por qué:

- La fuente **tragaba los errores del espejo** (`best effort`): quedaba rancio sin aviso. Aquí queda `pendiente`, se ve en la salud y se repara.
- La fuente **cortaba el listado en 250 y luego podaba**: con más eventos en la ventana, borraba del espejo eventos que existían. Aquí solo se poda con un listado completo.
- La clave del espejo era `(google_event_id, account_type)`: dos cuentas del mismo tipo chocaban. Aquí es `(dueño, cuenta, calendario, id)`.
- El espejo guardaba un resumen; aquí guarda el evento entero (recurrencia, invitados, vínculos) y las series se expanden sin red.
- Las políticas RLS eran `USING (true)` y la pluma usaba `service_role`. Aquí RLS va por dueño y todo pasa por funciones `SECURITY INVOKER` con la sesión del usuario (C7).
- `task_calendar_links` (FK a `tasks`) es ahora un **vínculo** genérico (`tipo` + `id`); `mc_task_id` se sigue leyendo como `tarea`.
- La «Cron Lens» leía un demonio concreto; ahora el origen de trabajos se inyecta.

## Pruebas

```bash
npm run prueba        # en tools/calendario: build + node --test pruebas/*.ts
```

Cubren: DST (salto y regreso), RRULE (BYDAY con ordinal, BYSETPOS, BYMONTHDAY negativo, EXDATE, COUNT/UNTIL) y rechazo de lo no soportado; idempotencia, 409, reparación del espejo, etag, 429, `invalid_grant`, gate de notificación y los tres alcances con compensación; sincronización incremental, paginada, 410 y listado incompleto; huecos (márgenes, aviso, horizonte, tope, DST), `sin-hueco` tipado, **25 reservas simultáneas → 1**, caducidad, confirmación sin datos personales y que confirmar vuelve a mirar el espejo (si algo se agendó en el hueco apartado, `ocupado` en vez de escribir encima); cron y vistas; que el núcleo no importe más que `zod`; el adaptador `gog` con un `gog` falso; el CLI (dry-run de `crea` y `actualiza` validado como la escritura, gate, y que `--notificar`, `--alcance`, las fechas o una cuenta vacía fuera de lo válido salen con `2` en vez de colarse); y **la migración en Postgres real (PGlite)**: RLS por dueño probado con el caso malo, `anon` sin acceso y reserva atómica por restricción de exclusión.

El recorrido de la UI en el laboratorio del template: `node scripts/calendario/recorrido.ts --base http://localhost:<puerto>` sobre `/laboratorio-calendario`.

## Licencia

Porta el módulo Calendar de `lisagomez/business-os-new` (commit `749d89e`), con licencia MIT: el aviso va en `LICENSE-FUENTE` y viaja en el paquete.

## Cambios

- **0.1.0** (2026-10-15): primera versión. Proveedores: simulador (medido) y `gog` (no medido). Almacenes: memoria, archivo y Supabase (medido en PGlite, sin aplicar en un proyecto real).
