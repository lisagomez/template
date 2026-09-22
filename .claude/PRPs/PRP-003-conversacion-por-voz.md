# PRP-003: Conversación por voz con el agente, sin comandos hablados

> **Estado**: APROBADO (plan aprobado por la dueña el 2026-09-22 en modo plan; ejecución por fases)
> **Fecha**: 2026-09-22
> **Proyecto**: SaaS Factory V4 (template) · `tools/dictado`
> **Spec**: [`.claude/specs/013-dictado/spec.md`](../specs/013-dictado/spec.md), enmendada el
> 2026-09-22 (RF-8, RF-10, RF-36 a RF-45): cierra el QUÉ y el fuera de alcance; este PRP no lo
> reescribe. Se apoya en [`012-voz`](../specs/012-voz/spec.md) (TAR-13 decidida aquí).
> **CDC aplicable**: **SÍ** en la Fase 3 (hook `Stop` en `.claude/settings.json` y el skill
> `~/.claude/skills/dictado/SKILL.md`): control C1 completo, con capa B en sesión limpia porque
> el hook cambia lo que la sesión vive. Las fases 0-2 no tocan skills, prompts ni configuración.

---

## Objetivo

Que la dueña converse por voz con el agente de Claude Code en el terminal como con una persona:
habla, calla y el turno se envía solo; el agente contesta y ella oye el primer párrafo; mientras
suena la voz el micrófono está callado; sigue hablando. Sin «dale enter» ni ningún comando dicho.

## Por Qué

| Problema | Solución |
|----------|----------|
| Para enviar hay que decir «dale enter»; en uso real se dice en medio y se sigue hablando, o se olvida | Envío automático al callar `envioMs` tras el último pegado, con el reloj cancelado si vuelve a hablar |
| El agente solo habla si se lo piden o si el modelo se acuerda de llamar `dictado di` | Hook `Stop` que manda el primer párrafo de cada respuesta al dictado, que lo dice |
| Con altavoces, el micrófono oye la voz sintética y la transcribe (sin cancelación de eco en WSLg) | Half-duplex: `dictar` es dueño del altavoz, cierra el micrófono antes del primer audio y lo reabre al terminar |

**Valor**: la conversación deja de ser un walkie-talkie con fórmula. Todo local; nada sale de la máquina.

## Qué

Los criterios salen de la spec 013 (RF-38 a RF-45) y de la medición.

### Criterios de éxito
- [ ] Envío por silencio con 0 falsos envíos para pausas ≤ 2 s en la medición A; `envioMs` por defecto fijado por esa medición (RF-38, RF-45).
- [ ] 0/10 fugas de la voz sintética al micrófono en la medición B; primer audio p50 < 300 ms; reapertura del micrófono p50 < 300 ms (RF-39, RF-40).
- [ ] Socket 127.0.0.1:47126 que solo acepta `di`, `calla` y `estado` con texto acotado y cierra lo demás (RF-41).
- [ ] Hook: con `dictar` parado o modo apagado, `exit 0` sin salida en < 100 ms; con modo activo, llega al socket el primer párrafo de prosa ≤ 350 caracteres (RF-42, RF-43).
- [ ] «dale enter», muletillas y el modo actual funcionan igual con la conversación apagada.
- [ ] `npm run prueba` en verde con las pruebas nuevas (sin Windows ni modelos); `npm run verifica:specs`; `npm run validate` sellado; `npm run empaqueta dictado` 0.2.0.
- [ ] En vivo con la dueña: habla, calla, se envía; oye el primer párrafo; el micrófono no transcribe la voz; sigue hablando.

### Comportamiento esperado
```
dictado escuchando en manos libres, ajuste conversacion=true
  → ella habla → 1 s de silencio → la frase se pega en la caja de Claude Code
  → envioMs sin voz nueva → Enter (si vuelve a hablar antes, el reloj se cancela)
  → Claude Code piensa y responde (segundos o minutos: pausas reales)
  → hook Stop → primer párrafo → socket 47126 → dictar cierra el micrófono → habla
  → termina → reinicia el detector → reabre el micrófono → ella sigue
```

---

## Contexto

### Referencias
- Plan detallado por fases (archivos, firmas, protocolo, pruebas, medición): el plan aprobado del 2026-09-22, resumido en el Blueprint de abajo.
- Lo que ya existe y se reutiliza: `tools/dictado/src/dictado.ts` (máquina de estados), `src/node/cli-dictar.ts` (ajustes en caliente, `micEnEspera`, tecla 47123, icono 47124), `src/ajustes.ts` (`ESQUEMA`), `src/node/habla.ts` (`sintetiza(texto, alTrozo)`: `false` corta sherpa, medido), `src/node/pildora.ts` (máquina sin reloj), `tools/voz` `PERFILES_DETECTOR`, la máquina pura de barge-in `src/features/laboratorio-voz/services/interrupcion.ts`, el precedente de CDC de un hook en `.claude/gobernanza/BITACORA-CDC.md` (2026-09-14).
- Contrato del hook `Stop` (verificado en la doc de Claude Code): stdin con `last_assistant_message`, `stop_reason`, `transcript_path`, `stop_hook_active`; síncrono; sin matcher.
- Vía descartada para este PRP y documentada en el plan: el grafo regulatorio de `hermes-os-a2a` con Hermes como cerebro. Es otro producto (PRP aparte con C3 + C4); la capa de voz de las fases 0-2 le sirve igual.

### Arquitectura (dentro de `tools/dictado`, contrato de empaquetado)
```
src/envio.ts                  máquina pura del envío por silencio
src/respuesta.ts              paraVoz(markdown): primer párrafo hablable
src/voces.ts                  VOCES pineadas (sale de cli-habla.ts)
src/node/conversacion.ts      une envío, hablante, micrófono y detector
src/node/conversacion-socket.ts  127.0.0.1:47126, protocolo por líneas
src/node/hablante.ts          voz + altavoz persistente, cola serial, calla()
src/node/cli-dictar-piezas.ts  lo que sale de cli-dictar.ts (682 → < 500 líneas)
scripts/habla-respuesta.mjs   lo que corre el hook
medicion/mide-conversacion.mjs  bloques A, B, B', C
```

### Modelo de datos
Sin tablas. Ajustes nuevos en `ajustes.json` (grupo «Conversar con el agente»): `conversacion` (false), `envioMs` (2000 provisional → medido), `vozAgente` (es_MX-claude-high), `velocidadVoz` (0,9), `micDuranteVoz` (cerrado). Protocolo del socket: `dictar <on|off> <estado>` al conectar; `di <base64>` | `calla` | `estado`; respuestas `ok` | `omitido <motivo>` | `hablando` | `hecho <ms> <ms>` | `cortado`.

---

## Gobernanza

### Modelo de amenazas (control C3)
- **Activos que toca**: la caja del agente (todo lo que entra por voz se envía solo), el altavoz (lo que el agente dice se oye en la sala), la configuración del arnés (`settings.json`).
- **Fronteras que cruza**: micrófono → texto → caja del agente (dato no confiable, sin remitente); hook → socket local (texto del agente, acotado).
- **Atacante relevante**: O1 inyección de requerimientos (alguien habla en la sala o suena un vídeo y el texto entra como si fuera de la dueña); O3 fatiga de aprobación (aprobar de oído); O4 denial-of-wallet (turnos que se envían solos).
- **Controles**: el envío solo actúa con el dictado escuchando y el modo encendido a mano por ella; lo irreversible sigue pasando por gate humano en el terminal, con el diff legible; el socket escucha solo en 127.0.0.1, tres palabras, texto acotado, sin ejecutar nada; el hook nunca bloquea (`exit 0`, `timeout: 5`). **Brecha abierta a propósito**: no hay allowlist por voz; la mitigación es que el modo se apaga con un toque y se ve en la píldora.

### Evaluación de impacto / AISIA (control C4)
- **Partes afectadas**: la dueña; quien esté en la sala (oye al agente, y su voz puede entrar al micrófono).
- **Daño posible con el sistema operando bien**: un envío prematuro por una pausa de pensamiento; una frase ajena enviada como propia.
- **Reversibilidad**: total en el terminal (lo enviado se ve y se corrige; nada se ejecuta sin gate humano). Nada sale de la máquina.
- **Decisión**: mitigar (medición A fija `envioMs`; `inicioHabla` cancela; modo a mano). Un cerebro externo (grafo/Hermes) queda fuera y exige su propio C3 + C4.

---

## Blueprint (Assembly Line)

### Fase S: Spec antes de código
**Objetivo**: spec 013 enmendada (RF-8, RF-10, RF-36..45, C4, fuera de alcance), tareas TAR-17b..21, TAR-13 de 012 decidida, este PRP en el repo.
**Validación**: `npm run verifica:specs` en verde.

### Fase 0: Hacer sitio
**Objetivo**: `cli-dictar.ts` bajo 500 líneas moviendo piezas a `cli-dictar-piezas.ts` sin cambiar comportamiento.
**Validación**: `npm run build && npm run prueba` igual que antes.

### Fase 1: Envío al terminar el turno
**Objetivo**: `src/envio.ts`, ajustes nuevos, `conversacion.ts` con `alEnviar`, contadores de trayectoria.
**Validación**: `pruebas/envio.ts` (reloj falso), `pruebas/ajustes.ts`; medición A fija `envioMs`.

### Fase 2: `dictar` habla y calla el micrófono
**Objetivo**: `hablante.ts`, `conversacion-socket.ts` (47126), `di` delega en `dictar`, half-duplex con trazas.
**Validación**: `pruebas/conversacion.ts`; medición B (0/10 fugas, latencias).

### Fase 3: Hook `Stop` y CDC
**Objetivo**: `paraVoz`, `habla-respuesta.mjs` + `.sh`, `settings.json` con el hook, skill actualizado.
**Validación**: `pruebas/respuesta.ts`, `pruebas/hook-habla.ts`; no-op demostrado; regresión A y B (sesión limpia); firma; entrada en `BITACORA-CDC.md`.

### Fase 4 (opcional, después): Barge-in con auriculares
**Objetivo**: `interrupcion.ts` en el núcleo de dictado; `micDuranteVoz: abierto` corta la voz al hablar encima.
**Validación**: medición B' (reacción p50 < 300 ms).

### Fase N: Validación final
- [ ] `npm run validate` sellado; `npm run empaqueta dictado` 0.2.0.
- [ ] En vivo con la dueña, con las trazas en `en-vivo.log`.
- [ ] README §12, SDD §6 fila (f) y cifras copiadas de la medición.

---

## 🧠 Aprendizajes

### 2026-09-22: «dale enter» en medio de la frase no hacía nada
- **Error**: el comando solo valía al final; en manos libres la dueña lo decía y seguía hablando.
- **Fix**: cuentan todas las apariciones (PR #142); la spec se enmendó después, y ese orden es el error de fondo: el QUÉ cambió en código antes que en la spec.
- **Aplicar en**: toda enmienda de comportamiento en dictado pasa primero por `013-dictado/spec.md`.

### 2026-09-22: «para el dictado» dentro de una frase dictada
- **Error**: el agente apagó el dictado porque la frase dictada terminaba así, y la dueña se quedó pulsando Ctrl derecho sin respuesta.
- **Fix**: solo se apaga si se pide en un mensaje aparte.
- **Aplicar en**: el hook y el modo conversación no interpretan órdenes de control dentro del texto dictado.

## Gotchas
- [ ] `cli-dictar.ts` tiene 682 líneas: Fase 0 antes de tocarlo.
- [ ] El hook `Stop` bloquea el siguiente turno hasta que sale: nunca esperar a que la voz suene.
- [ ] Sin cancelación de eco en WSLg: con altavoces, half-duplex obligatorio; barge-in solo con auriculares.
- [ ] TTS y STT en el mismo proceso: medir el motor con la voz cargada (B); si se degrada, `POST /sintetizar` del demonio.
- [ ] `voz` 0.5.0 va pineada por tarball: no se toca en este PRP.

## Anti-Patrones
- NO fijar `envioMs` a ojo: sale de la medición A.
- NO llamar `dictado di` a mano con el modo conversación activo (dos voces).
- NO editar `settings.json` ni el skill sin el CDC completo (control C1).
- NO mandar texto ni audio fuera de la máquina.
