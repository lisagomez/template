# @tu-scope/clinica-dental

El núcleo de un portal del paciente para clínicas dentales: registro con consentimientos, agenda sin dobles reservas, avisos por correo y Telegram, un asistente que no diagnostica y una trazabilidad que la clínica puede auditar.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| **Cuestionario de registro** con Zod (el mismo esquema en el navegador y el servidor): mensajes humanos, celular de México, menor de 18 con los datos y el consentimiento de quien ejerce la patria potestad, sin campos de más | **Guardar el padecimiento sin consentimiento expreso**: sin él, el texto se descarta y el registro sigue (y se le dice a la persona) |
| **Consentimientos separados** (aviso, dato de salud, recordatorios, newsletter, Telegram), con versión del aviso; retirar es tan fácil como dar y tiene efecto (el de salud borra el texto) | Marcar ningún opt-in por defecto |
| **Agenda sobre las `Reservas` de `@tu-scope/calendario`**: sillones × duración por servicio, horario, festivos, aviso mínimo; **cero dobles reservas** bajo concurrencia (20 a la vez: gana uno por sillón) | Reimplementar la disponibilidad: el calendario se inyecta |
| **Avisos por puertos**: confirmación con `.ics` (RFC 5545), recordatorios 24 h y 2 h antes, newsletter **aparte** con `List-Unsubscribe` + `List-Unsubscribe-Post` de un clic (RFC 8058); Telegram con deep link de un solo uso y el reel por `sendVideo`; idempotentes | **Mandar nada real**: los adaptadores de Gmail y de la Bot API se niegan sin `CLINICA_C3_C4_FIRMADOS=1`; en el laboratorio todo va contra los simuladores |
| **Asistente**: urgencias por **regla** (6 señales con fuente), barreras de diagnóstico e inyección, enrutador sin LLM delante (el de `@tu-scope/bucle-voz`), cerebro inyectado con la base de SU clínica y cada frase revisada antes de mostrarse | **Diagnosticar, recetar, ni escribir**: no tiene herramientas; lo más que devuelve es una acción PROPUESTA que la persona confirma en la UI |
| **Guía de voz del registro** sin LLM: dice cada campo, propone lo que entendió y pide «sí, correcto»; solo envía con «sí, envíalo» | Pedir la contraseña ni los consentimientos por voz |
| **Contrato de eventos v1** (Zod estricto, seudónimos HMAC, sin PII ni texto libre) y **libro** encadenado con sha256 sobre JCS (RFC 8785), raíz Merkle (RFC 6962) y sello Ed25519: alterar, quitar, reordenar o reescribir se detecta y dice dónde | Poner datos personales en el libro, el dataLayer ni las métricas (probado con los valores sembrados) |
| **dataLayer** con consent mode v2 denegado por defecto y lista de permitidos (ni seudónimo ni categoría del servicio) | Cargar Google Tag Manager sin un ID válido y el consentimiento de analítica |
| **Capa semántica** (dbt + MetricFlow, `semantica/`): staging generado del contrato, convergencia libro = staging por tipo, métricas cuadradas contra un conteo directo; **unit economics** y **grafo de atención** con el origen de cada cifra | Fingir cifras reales: cada una dice si es medida, simulada, supuesta o compuesta |

## Casos de uso

- **El portal del paciente de una clínica** (registro, agenda, avisos, «Mis citas», chat y voz): la app del template,
  `src/features/clinica-dental`, sobre dos clínicas sintéticas (`/clinica/maguey`, `/clinica/colibri`).
- **El laboratorio de una clínica nueva**: declarar sus servicios, horario, sillones y supuestos en `src/clinicas.ts` y
  medir el embudo, los avisos y el asistente con pacientes sintéticos antes de tocar a uno real.
- **Auditar lo que pasó**: el libro verifica solo y la capa semántica cuadra cada cifra con el libro.
- **Horizonte** (no construido): la vista del personal, avisos por WhatsApp (sobre `@tu-scope/ventas-whatsapp`) y SMS,
  pagos, exponer el asistente por A2A.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`). `.` corre también en el navegador (sin `node:*`); `./servidor` necesita Node
  (cripto, disco).
- **Dependencias del sistema**: ninguna para el núcleo. La capa semántica pide Docker (Postgres efímero), `uv` y Python
  3.12 (dbt Core 1.12.5, dbt-postgres 1.11.0, dbt-metricflow 0.15.0, por `semantica/requirements.lock` con hashes).
- **CPU, GPU y memoria**: el núcleo no calcula nada pesado: la suite completa (92 pruebas, con Postgres en proceso por
  PGlite) corre en ~30 s en un Ryzen 7 5700G sin GPU (medido el 2026-10-16); la capa semántica, en ~40 s con el entorno
  ya creado. Memoria
  no medida aparte.
- **Servicios externos**: ninguno en el núcleo. Lo que habla con el mundo se inyecta: el calendario (`@tu-scope/calendario`),
  el correo (puerto `PuertoCorreo`: simulador o Gmail con gate), Telegram (`Transporte`: simulador o api.telegram.org con
  gate), el cerebro del asistente (cualquier API compatible con OpenAI; el template usa OpenRouter con modelo pineado).
- **Variables de entorno**: el núcleo no lee ninguna. El adaptador real exige `CLINICA_C3_C4_FIRMADOS` en el entorno que se
  le inyecta; la llave de seudónimos y las del sello las pone quien lo arma.
- **Almacenamiento**: el puerto `AlmacenPortal` (memoria o archivo en el laboratorio) y `AlmacenLibro` (JSONL que solo se
  agrega). Para producción, la migración `migraciones/propuesta-clinica-dental.sql` (RLS forzada, operador sin
  `bypassrls`, dato de salud en tabla aparte, exclusión contra la doble reserva), **validada en Postgres efímero y NO
  aplicada**.
- **Salida del perímetro (C4)**: el núcleo no hace red. Salen datos del paciente solo por los puertos que se le
  inyecten: el correo (su dirección y su cita), Telegram (su cita y el reel, si él inició el chat) y el cerebro (el texto
  de su pregunta y, solo si lo pide, su padecimiento). El libro, el dataLayer y las métricas no llevan PII. Qué
  proveedor y con qué decisión la toma el producto (AISIA del portal: `docs/goals/clinica-dental-aisia.md`).

## Instalar

```bash
npm run empaqueta clinica-dental     # desde la raíz del template: contrato + build + tarball + proyecto limpio
npm install <ruta>/tools/clinica-dental/tu-scope-clinica-dental-0.1.0.tgz
```

| Subpath | Qué trae |
|---|---|
| `.` | clínicas, contrato de eventos, cuestionario, dataLayer, agenda, asistente (urgencias, guardas, enrutador, prompts, guía de voz), unit economics y grafo |
| `./servidor` | todo lo anterior + seudónimos, libro (JCS, Merkle, sello), almacenes, canales (simuladores y adaptadores con gate) y `creaPortal` |

## Uso

```ts
import { creaPortal, creaLibro, creaSeudonimos, BuzonSimulado, TelegramSimulado, creaCanalTelegram, creaAgenda, reglasDe, AlmacenPortalEnMemoria, libroEnMemoria, CLINICAS } from '@tu-scope/clinica-dental/servidor';
import { Reservas } from '@tu-scope/calendario';

const portal = creaPortal({
  clinicas: CLINICAS, almacen: new AlmacenPortalEnMemoria(), libro: creaLibro({ almacen: libroEnMemoria(), reloj: Date.now }),
  agendas, correo: new BuzonSimulado(), telegram: (id) => creaCanalTelegram(sim.transporte(`token-${id}`)),
  seudonimos: creaSeudonimos(llave), reloj: Date.now, urlPortal: (id) => `https://portal/${id}`, urlBaja: (id, t) => `https://${id}.example/baja/${t}`, reel: async () => null,
});
await portal.registra({ clinica: 'maguey', usuario, entrada, visitante, via: 'escrito', canal: 'directo', segundos: 90 });
await portal.reserva({ clinica: 'maguey', usuario, servicio: 'limpieza', inicio, canales: ['correo'], newsletter: false, clave });
await portal.despacha();
```

El montaje completo (calendario en archivo, buzón y Telegram persistentes, reloj del laboratorio) es
`src/features/clinica-dental/services/servidor/runtime.ts` del template.

## Pruebas

```bash
npm --prefix tools/clinica-dental run prueba    # construye calendario y bucle-voz si faltan, luego la suite
node tools/clinica-dental/semantica/corre.mjs    # capa semántica sobre el libro del laboratorio
```
