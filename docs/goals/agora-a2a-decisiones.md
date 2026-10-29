# Ágora — reporte de decisiones del goal `agora-a2a`

> Lo que decidí construyendo Ágora y por qué. Todo es **corregible por el laboratorio**; nada de esto firma un CDC, un
> C3 ni una AISIA. Esas firmas las puso el laboratorio el 2026-10-29: el CDC en la bitácora, las entradas en el registro
> de riesgo, y el C3 y la AISIA en `agora-a2a-propuestas/`. Solo laboratorio y datos ficticios.
> Rama `agora/a2a`, sin push ni PR: los dos son del laboratorio.

## 1. Stack y dónde vive

| Pieza | Dónde | Por qué |
| --- | --- | --- |
| Núcleo `@tu-scope/agora` 0.1.0 (privado, sin publicar) | `tools/agora/` | La regla dura del spec («ninguno solo por la UI») pide que la **base** imponga cada control. El núcleo no importa React, Next ni Supabase: Postgres + `pg` 8.16.3 + `zod` 4.6.1, con versión exacta. |
| La base | PostgreSQL (`agora` con RLS **forzada** en cada tabla, `agora_priv` con las funciones) | Roles al estilo Supabase (`anon`, `authenticated`, `service_role`) más dos propios: `agora_agente` (la identidad la verifica la base con un token de tarea HMAC) y `agora_puerta` (solo sus funciones). `auth.uid()` es un *shim*: el día que viva en Supabase, la sesión sale de ahí y no de una cookie. |
| Pruebas | PGlite 0.5.8 dentro de `validate` (vía `prueba:tools`) y PostgreSQL 17.11 en Docker (`npm run agora:pg`) | PGlite no necesita Docker, así que el gate corre en cualquier máquina. La misma suite contra Postgres real es la evidencia de que no hay diferencias de motor. |
| Pantallas | `src/features/agora*` (7 módulos con su `enchufe.json`) y `src/app/(productos)/agora/*` | Montadas en `tools/capa` desde la primera pantalla: no hay interfaz de Ágora fuera de la ventana. |
| Composición | `productos/composiciones/agora.json` | Marca Ágora, asistente Atenea, acento `#2a5db0`; nada de Arbrain ni de Levy. |
| Laboratorio | `scripts/agora/` (`laboratorio.ts`, `dev.mjs`, `pg.ts`, `e2e-capa.ts`, `capturas.ts`, `mide-intenciones.ts`, `mira.ts`) | Contenedor `agora-pg-lab`, base `agora_lab`; el entorno se escribe en un archivo ignorado y solo se dice si está presente. |
| La Puerta A2A | `src/app/api/agora/a2a/[org]/route.ts` (cerrada: laboratorio y loopback) | Es superficie de entrada: se declara en `RUTAS_FUERA_DEL_BRIDGE` de `scripts/prueba-a2a.ts` con su motivo. Abrirla es firma del laboratorio (C3 + C4). |

## 2. El dinero

- **Compromisos al estilo encumbrance.** Presupuesto (versionado, solo por propuesta aprobada), **comprometido** (solo
  nace de una propuesta aprobada y aplicada), **ejercido** (solo con evidencia: UUID de CFDI, comprobante con sha256 o
  uso de modelo) y **disponible = presupuesto − comprometido vigente − ejercido sin compromiso**. Así el ejercido que
  consume un compromiso no se cuenta dos veces.
- **Tipo de cambio con fuente.** Banxico FIX (serie SF43718), **valores ficticios** del laboratorio, uno por día hábil.
  Cada fila lleva fuente, fecha, URL `https` y hora de publicación. Se usa el del día o el hábil anterior **hasta 5 días**;
  si no hay, el costo en MXN queda `null` (y se cuenta como «sin costo»), nunca cero ni un valor viejo.
- **El gasto de modelo se imputa a quien originó la llamada.** Si el mensaje entró por la Puerta, al socio externo; si
  no, al coordinador. Y a la categoría del hilo. Una llamada sin datos de uso es `null`, no cero.
- **Guardia de gasto antes de llamar** (`agora.puede_llamar_modelo`): sin cupo del agente o de la organización no se
  llama (falla cerrado). Aviso al 80 % también a Finanzas.
- **Póliza propuesta** con el contrato ERP-5B (`agora.exporta_poliza`), partida doble como restricción diferida, código
  agrupador del SAT (Anexo 24) y la huella sha256 del export. **Ágora no asienta.**

## 3. Propuestas, autonomía y freno

- **El texto canónico (JCS) y su sha256** viven en la propuesta y una restricción de la base los ata; la aprobación es
  una fila humana sobre ESA huella, según la matriz de la organización (dato, no código). La segregación está puesta
  por defecto; quitarla va por el freno.
- **A2 solo en lo reversible** (nombre, progreso, etiquetas, prioridad) y se deshace en 24 h. Ningún agente toca montos,
  fechas, responsables ni el libro.
- **El testigo del freno, en la base** (fase 7). El freno de la capa exige el clic humano en el navegador, pero un
  navegador no garantiza nada en el servidor. Por eso la conversación **atestigua** cada mensaje de la persona (la base
  guarda su huella y la hora de la base, nunca el texto), y cerrar el periodo, revocar, quitar la segregación o avisar
  a un tercero **gastan** un testigo: de esta persona, sin usar y de hace 15 minutos o menos. Quité las tres acciones
  del servidor que cerraban, revocaban o quitaban la segregación con una cita libre: no las usaba ninguna pantalla y eran
  una puerta lateral.
- **El vigía es A1** (propone, una persona decide), con 10 propuestas al día y sin modelo. El spec dice que «propone el
  seguimiento»; con A0 la base le negaba proponer.

## 4. La capa

| Ranura | La llena | Nota |
| --- | --- | --- |
| Explorador | `agora` | La jerarquía workspace › dominio › categoría, que también es el árbol de centros de costo |
| Lienzo | los 7 módulos | Tablero, buzón, costos, contabilidad, agentes y Puerta, métricas, alta |
| Panel | `agora` | «Espera tu clic» |
| Conversación | `agora-buzon` | El hilo de la categoría abierta va arriba del hilo de la capa; lo que se le dice a un agente es un mensaje del hilo |
| Plan | `calendario` (`tools/calendario`) | Las fechas que calendarizó el vigía y los cierres por hacer |
| Voz | `dictado` | Parakeet, Piper y Silero: locales. `datosSensibles: true` y `nube: []` |
| Memoria | la capa, por organización, en el navegador | Solo preferencias (vista, workspace y categoría abiertos); la conversación vive en la pestaña |
| Freno | la capa | Único; Ágora no trae otro |
| Primer arranque | la capa + `/agora/alta` | El alta de la organización: 5 pasos, una decisión cada uno, con la vía controlada para cambiarla |

- **Cambio a `tools/capa` (uno, genérico, en su propio commit `2561724`).** La ventana pinta el componente del módulo
  dueño de `explorador` y de `conversacion` (antes solo lo hacía con `panel`). No menciona a Ágora; sin módulo dueño,
  la ventana pinta exactamente lo de antes. 3 pruebas nuevas (36/36; sin el cambio, 2 caen). Desde ese commit
  `git diff --stat -- tools/capa` queda vacío.
- **Cambio al verificador de enchufes** (`scripts/capa/verifica-enchufes.mjs`). Cuando ningún enchufe declara la ruta,
  el dueño es la feature **más específica**. Con los submódulos de Ágora, quitarle el enchufe a `agora-agentes` pasaba
  sin verse porque `agora` lo tapaba. Ahora quitar cualquiera de los 30 enchufes se ve. Es un gate más estricto, y va
  en la propuesta de CDC.
- **Intenciones sin LLM, medidas como el corpus D de la capa** (`docs/goals/agora-a2a-evidencia/intenciones-*.json`):

  | Corpus | Cuándo | Acierto | Escrituras no pedidas | Irreversibles no pedidas |
  | --- | --- | --- | --- | --- |
  | 1 (63 frases, `edc531c`) | a ciegas | **58,7 %** | **3** | **1** |
  | 2 (62 frases, `c360499`) | a ciegas, después de la regla | **74,2 %** | 1 | 0 |
  | 1 | re-medido (ya no a ciegas) | 58,7 % | 0 | 0 |

  El corpus 1 destapó que el **nombre de un socio** decidía la acción: con «suspende a medios norte» de ejemplo,
  «transfiere 50 mil a medios norte» caía en suspender y «paga la factura de fletes del golfo» en **revocar**. El freno
  y la pregunta los habrían detenido, pero es un mal enrutamiento. Lo corregí con una **regla** y no frase por frase:
  ningún ejemplo de una intención de Ágora que escribe lleva un nombre propio. Una prueba estructural vigila la regla y
  cae si se revierte. La escritura que queda en el corpus 2 («reserva un vuelo a monterrey» → `calendario.reserva`) es
  del módulo compartido del calendario; en Ágora no tiene manejador y termina en «no está conectado aquí». La referencia
  de la capa es 71,6 % en su corpus D.
- **Memoria sin cifras:** la capa niega una clave que el enchufe no declara, y Ágora además niega un valor que parece
  monto (prueba de mutación: sin la guarda, la prueba cae).
- **Resumen:** solo los 4 conteos y el enlace que declara la composición, validados por la capa; se pinta en el inicio y
  no sale de la máquina.

## 5. Lo que la base enseñó (y ahora vigila)

1. **`security definer` + `current_user`**: dentro de una función definer, `current_user` es el dueño, así que
   `confiable()` daba siempre verdadero. `aplica_propuesta`, `topes_de`, las funciones de la Puerta, el vigía y
   `puede_llamar_modelo` decidían con él. Ahora deciden con `rol_que_llama()` / `llama_la_base()`, y una comprobación
   estructural recorre `pg_proc` para que ninguna definer vuelva a hacerlo (sabotajes S14 y S15).
2. **`if` con null no rechaza.** `not (falso or null)` es null y el `if` no lanza: una persona de otra organización
   aplicaba una propuesta ajena y leía topes ajenos. Ahora va con `coalesce(…, false)`. La MALO 4 pasaba por este hueco
   con otro motivo de rechazo, y la suite del vigía fue la que lo destapó.
3. **Parámetros que sombrean columnas** (`origen`, `clave`, `estado`): la plantilla abonaba a la cuenta equivocada
   (lo cazó la re-verificación independiente de la póliza). Ahora los parámetros llevan prefijo.

4. **`auth.uid()` lee un ajuste que cualquier sesión puede fijar.** Un agente que se ponía los claims de Paula era Paula
   para la RLS (lo encontró el **verificador independiente**). Todo pasa ahora por `agora_priv.uid()`, que solo devuelve
   la persona si la sesión es de persona, y una comprobación estructural impide volver a leer `auth.uid()` directo.
5. **La segregación y la matriz se apoyaban en lo que declaraba el agente** y en contar una firma para dos ranuras. La
   base deriva al solicitante del mensaje de origen citado (de una persona y del hilo de la misma categoría), exige que
   sea de la organización y busca una asignación de firmas a ranuras con personas distintas, sin dejar colgada una
   propuesta firmable. La clave de idempotencia es del autor: nadie hace que el coordinador adopte una propuesta ajena.
6. **Un script del laboratorio actuaba al importarse** y borró un contenedor (el del laboratorio de Ágora, con datos
   ficticios) al correrlo el verificador en otro árbol. Ahora leer el entorno no tiene efectos, el script solo actúa
   si se ejecuta y nunca borra un contenedor cuya clave no tiene. La prueba de regresión cae con la versión vieja.

Detalle de cada hallazgo y su estado: `agora-a2a-evidencia/verificacion-independiente.md`.

## 6. Lo que no se hizo (y es del laboratorio)

- Firmar el CDC, el C3, el C4/AISIA y las entradas del registro de riesgo: **hecho por el laboratorio el 2026-10-29**,
  después de construir las dos mitigaciones que faltaban (puntos 42 y 43 de «lo que podría estar mal»).
- Push, PR y merge; abrir la Puerta; conectar un espejo, el correo o un modelo real; asignar la clase de routing del
  coordinador (C8).
- Meter `agora:pg` (las suites contra Postgres real, con Docker) al padrón de gates: es un CDC. Se propone como inactivo
  con su motivo, como los demás que necesitan Docker.
- Exigir el mensaje de origen a TODA propuesta de agente (salvo el vigía) y un rol de conexión por tipo de principal
  sin superusuario: los dos endurecimientos que quedan del verificador (`lo-que-podria-estar-mal.md`, puntos 27 y 28).
