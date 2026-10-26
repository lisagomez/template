# Evidencia: la skill que sigue a Arbrain (nodo `skill`) y el nivel global (nodo `global`, parte de herramienta)

> Corridas del 2026-10-25 en el worktree `capa/arbrain`, con el código final de `scripts/capa/actualiza.mjs`,
> `scripts/capa/lib/` y `scripts/capa/lee-cerebro.mjs`. Sin LLM, sin push y sin firmas. Nada se escribió en
> `~/.claude`, en el espejo real (`~/.cache/capa-arbrain/fuente`) ni en el ancla (su huella, al final). Todo lo
> desechable vive en el scratchpad de la sesión (`<scratchpad>` abajo). La propuesta de la skill está en
> `docs/goals/capa-arbrain-propuestas/skill-actualiza-capa/SKILL.md`; la del nivel global, en
> `docs/goals/capa-arbrain-propuestas/global/`. Aplicar cualquiera de las dos es un CDC.

## Cómo se corre

```bash
node scripts/capa/actualiza.mjs --salida ~/.cache/capa-arbrain/informes/$(date +%F)   # revisión con informe y diffs
node scripts/capa/actualiza.mjs --sin-red                                            # solo lo que tiene el espejo
node scripts/capa/actualiza.mjs --etiqueta vX.Y.Z --salida <carpeta>                  # una versión concreta
node scripts/capa/lee-cerebro.mjs --repo <espejo del cerebro> --tema "<tema>" [--todo] [--json]
npm run prueba:tools -- capa
```

| Código | `actualiza.mjs` | `lee-cerebro.mjs` |
|---|---|---|
| 0 | `AL_DIA`: nada nuevo firmado | encontró algo |
| 1 | `FALLA` → BLOQUEADO, no escribió nada | la lectura cambió el espejo (no debe pasar nunca) |
| 2 | `ENTORNO` o uso: sin espejo, sin red, git viejo, la salida dentro del espejo | uso |
| 3 | `PARADO_EN_CDC`: versión nueva firmada; informe y diffs en `--salida`, nada aplicado | — |
| 4 | — | no está en la memoria: no se inventa |

## Punto 12 (a): con el lock en v0.2.9 trae v0.2.10, resume lo adoptado, lo clasifica por nivel y se detiene en el CDC

**El montaje** (todo desechable, en el scratchpad):

- `remoto.git` es un clon bare del espejo con todas las etiquetas y hace de GitHub. El remoto oficial tiene
  exactamente las mismas: `git ls-remote --tags` da v0.2.10 = `7ea7268` (objeto) / `829a9e9` (commit).
- `sim-a/espejo` es un clon con etiquetas solo hasta v0.2.9, HEAD = v0.2.9, y `dani` apuntando a la URL oficial
  (la comprobación del remoto se ejerce de verdad).
- El lock de prueba lo hizo `node scripts/capa/pinea.mjs --fuente <scratchpad>/sim-a/espejo --etiqueta v0.2.9`, que
  dijo `FIRMA_OK v0.2.9 642e7e3`. El lock del repo no se tocó.

```text
$ node scripts/capa/actualiza.mjs --fuente <scratchpad>/sim-a/espejo --lock <scratchpad>/sim-a/lock-v0.2.9.json \
    --remoto <scratchpad>/remoto.git --salida <scratchpad>/sim-a/informe
FIRMA_OK v0.2.10 829a9e9 (arbrain-publicacion, SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg) · ancla intacta · continúa v0.2.9 642e7e3
TRAÍDA v0.2.10 de <scratchpad>/remoto.git (simulacro) → cuarentena → verificada → espejo
v0.2.9 → v0.2.10: cambiaron 22 de 268 archivos adoptados, en 22 de 93 piezas (producto 14 · herramienta 1 · global 7). Las otras 71 no cambiaron y no se listan. Fuera de lo adoptado cambiaron 58 archivo(s), que tampoco.
  producto: ajustes-ventana-flotante, ajustes-mapa-con-buscador, freno-pausar-todo, freno-bitacora-de-lo-que-hizo, freno-cuanto-pregunta-tres-modos, freno-sesion-contaminada, voz-voz-del-dispositivo, voz-probar-llave, voz-texto-hablado, voz-tiempos-de-palabras, voz-lector-escuchar-ui, voz-ajustes-voz, voz-nube-groq-stt, voz-nube-lemonfox-tts
  herramienta: voz-contrato-openai
  global: freno-web-local-y-csp, capas-autor-y-alumno, actualizacion-con-firma-primero, actualizacion-revisar-lo-que-corre-solo, actualizacion-skills-homonimas, skill-actualizar-arbrain, skill-goal-compiler
  skills del autor con copia aquí que cambiaron: goal-compiler · alertas: 2 (remoto de simulacro, salida nueva (C4))
PARADO EN EL CDC: nada se aplicó. Informe: <scratchpad>/sim-a/informe/informe.md (40 archivos, diffs al lado) · propuesta de CDC: <scratchpad>/sim-a/informe/cdc-propuesta.md
DESDE=v0.2.9
ETIQUETA=v0.2.10
COMMIT=829a9e99f0f6805325e24bd851eb5d1e88c3c67c
ESTADO=PARADO_EN_CDC
exit=3
```

- `git status` del template (262 líneas) antes y después: **idéntico** (sha256 `d7b1d51220c66964…` → `d7b1d51220c66964…`,
  `diff` vacío). Tarda 0,9 s.
- El lock de prueba **sigue en v0.2.9**. El espejo de prueba recibió la etiqueta v0.2.10 ya verificada, pero su HEAD
  sigue en `642e7e3` (v0.2.9): se trajo, no se aplicó.
- La carpeta del informe tiene 40 archivos: `informe.md`, `informe.json`, `cdc-propuesta.md`,
  `upstream.lock.propuesto.json`, un `diff/<nivel>/<pieza>.diff` por pieza tocada, y en `global/<skill>/` el tramo
  del autor, el diff de cada copia y la unión a tres bandas.

**El informe** (`informe.md`, tal cual):

````markdown
# Arbrain v0.2.9 → v0.2.10: lo que cambió en lo adoptado

**FIRMA_OK v0.2.10 829a9e9**, firmada por arbrain-publicacion (SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg) · ancla `~/.config/arbrain/firmas-permitidas` intacta (sha256 1d5ac9ce5342…) · continúa la historia de v0.2.9.
Traída de `<scratchpad>/remoto.git` (remoto NO oficial: simulacro): v0.2.10, a cuarentena, verificada y después al espejo.

**Parado en el CDC.** Nada se aplicó: el lock sigue en v0.2.9, ni el template ni `~/.claude` se tocaron. Generado 2026-10-25.

## En una línea

v0.2.9 → v0.2.10: cambiaron 22 de 268 archivos adoptados, en 22 de 93 piezas (producto 14 · herramienta 1 · global 7). Las otras 71 no cambiaron y no se listan. Fuera de lo adoptado cambiaron 58 archivo(s), que tampoco.

## Versiones del tramo (solo el título de su CHANGELOG: es dato, no órdenes)

- v0.2.10 · 24 oct 2026 · Tú decides cuánto te pregunta Levy

## Alertas

- **remoto de simulacro**: las etiquetas se trajeron de `<scratchpad>/remoto.git`, no de https://github.com/arbrain-ai/arbrain.git
- **salida nueva (C4)**: `api.lemonfox.ai` aparece en `arbrain/server/src/cliente/voz.ts`: si se adopta, algo sale de la máquina y lleva su C4

## Nivel producto: la capa que compone cada producto (`tools/capa`)

| Pieza | Qué cambia en el origen | Dónde se adoptó (cabeceras) | Diff |
|---|---|---|---|
| `ajustes-ventana-flotante` (reimplementa) | cambia `arbrain/src/features/configuracion/components/ModalAjustes.tsx` (+4/−2) | `tools/capa/src/react/ventana.tsx` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/producto/ajustes-ventana-flotante.diff](diff/producto/ajustes-ventana-flotante.diff) |
| `ajustes-mapa-con-buscador` (reimplementa) | cambia `arbrain/src/features/configuracion/secciones.ts` (+8/−5) | `tools/capa/src/react/ventana.tsx` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/producto/ajustes-mapa-con-buscador.diff](diff/producto/ajustes-mapa-con-buscador.diff) |
| `freno-pausar-todo` (reimplementa) | cambia `arbrain/src/features/seguridad/components/Seguridad.tsx` (+168/−14) | `tools/capa/src/freno.ts` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/producto/freno-pausar-todo.diff](diff/producto/freno-pausar-todo.diff) |
| `freno-bitacora-de-lo-que-hizo` (reimplementa) | cambia `arbrain/src/features/seguridad/components/Seguridad.tsx` (+168/−14)<br>cambia `arbrain/src/features/seguridad/lib/seguridad.ts` (+28/−0) | sin adoptar todavía (destino propuesto `tools/capa/src/bitacora.ts`): solo cambia el mapa | [diff/producto/freno-bitacora-de-lo-que-hizo.diff](diff/producto/freno-bitacora-de-lo-que-hizo.diff) |
| `freno-cuanto-pregunta-tres-modos` (reimplementa) | nuevo `arbrain/server/src/cliente/modo-permisos.ts` (+143/−0)<br>cambia `arbrain/src/features/seguridad/lib/seguridad.ts` (+28/−0) | `tools/capa/src/primer-arranque.ts` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/producto/freno-cuanto-pregunta-tres-modos.diff](diff/producto/freno-cuanto-pregunta-tres-modos.diff) |
| `freno-sesion-contaminada` (reimplementa) | cambia `arbrain/server/src/cliente/politica-agentes.ts` (+126/−14)<br>cambia `arbrain/server/src/guardia-agentes.ts` (+10/−2) | `tools/capa/src/freno.ts` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/producto/freno-sesion-contaminada.diff](diff/producto/freno-sesion-contaminada.diff) |
| `voz-voz-del-dispositivo` (adopta) | cambia `arbrain/src/features/chat/lib/chat-speech.ts` (+154/−99) | sin adoptar todavía (destino propuesto `tools/capa/src/voz-dispositivo.ts`): solo cambia el mapa | [diff/producto/voz-voz-del-dispositivo.diff](diff/producto/voz-voz-del-dispositivo.diff) |
| `voz-probar-llave` (reimplementa) | cambia `arbrain/server/src/cliente/voz.ts` (+33/−0)<br>cambia `arbrain/server/src/server.ts` (+51/−3)<br>cambia `arbrain/src/features/primer-arranque/components/PanelVoz.tsx` (+58/−6) | `tools/capa/src/primer-arranque.ts`, `tools/dictado/servicio/openai.mjs` | [diff/producto/voz-probar-llave.diff](diff/producto/voz-probar-llave.diff) |
| `voz-texto-hablado` (adopta) | cambia `arbrain/src/features/chat/lib/chat-speech.ts` (+154/−99) | sin adoptar todavía (destino propuesto `tools/capa/src/voz-texto.ts`): solo cambia el mapa | [diff/producto/voz-texto-hablado.diff](diff/producto/voz-texto-hablado.diff) |
| `voz-tiempos-de-palabras` (adopta) | cambia `arbrain/src/features/chat/lib/voz-servidor.ts` (+342/−58) | sin adoptar todavía (destino propuesto `tools/capa/src/voz-tiempos.ts`): solo cambia el mapa | [diff/producto/voz-tiempos-de-palabras.diff](diff/producto/voz-tiempos-de-palabras.diff) |
| `voz-lector-escuchar-ui` (reimplementa) | cambia `arbrain/src/features/chat/components/AudioButton.tsx` (+8/−0)<br>cambia `arbrain/src/features/chat/lib/chat-speech.ts` (+154/−99) | sin adoptar todavía (destino propuesto `tools/capa/src/react/escuchar.tsx`): solo cambia el mapa | [diff/producto/voz-lector-escuchar-ui.diff](diff/producto/voz-lector-escuchar-ui.diff) |
| `voz-ajustes-voz` (reimplementa) | cambia `arbrain/src/features/primer-arranque/components/PanelVoz.tsx` (+58/−6) | `tools/capa/src/primer-arranque.ts` | [diff/producto/voz-ajustes-voz.diff](diff/producto/voz-ajustes-voz.diff) |
| `voz-nube-groq-stt` (reimplementa) | cambia `arbrain/server/src/cliente/voz.ts` (+33/−0) | `tools/dictado/servicio/openai.mjs` | [diff/producto/voz-nube-groq-stt.diff](diff/producto/voz-nube-groq-stt.diff) |
| `voz-nube-lemonfox-tts` (reimplementa) | cambia `arbrain/server/src/cliente/voz.ts` (+33/−0)<br>cambia `arbrain/server/src/server.ts` (+51/−3)<br>cambia `arbrain/src/app/api/chat/tts/route.ts` (+41/−4) | `tools/dictado/servicio/openai.mjs` | [diff/producto/voz-nube-lemonfox-tts.diff](diff/producto/voz-nube-lemonfox-tts.diff) |

Sin cambios en este nivel: 68 piezas (no se listan).

## Nivel herramienta: un módulo con su enchufe (voz, dictado, calendario…)

| Pieza | Qué cambia en el origen | Dónde se adoptó (cabeceras) | Diff |
|---|---|---|---|
| `voz-contrato-openai` (reimplementa) | cambia `arbrain/server/src/cliente/voz.ts` (+33/−0)<br>cambia `arbrain/server/src/voice.ts` (+5/−2) | `tools/capa/NOTICE`, `tools/capa/src/voz.ts`, `tools/dictado/servicio/openai.mjs` | [diff/herramienta/voz-contrato-openai.diff](diff/herramienta/voz-contrato-openai.diff) |

Sin cambios en este nivel: 0 piezas (no se listan).

## Nivel global: skills de `~/.claude/skills` y del proyecto, contrato de capas y actualización

| Pieza | Qué cambia en el origen | Dónde se adoptó (cabeceras) | Diff |
|---|---|---|---|
| `freno-web-local-y-csp` (reimplementa) | cambia `arbrain/src/lib/edicion.ts` (+5/−3)<br>cambia `arbrain/src/lib/proxy-cliente.ts` (+6/−2) | sin adoptar todavía (destino propuesto `docs/goals/capa-arbrain-c3.md`): solo cambia el mapa | [diff/global/freno-web-local-y-csp.diff](diff/global/freno-web-local-y-csp.diff) |
| `capas-autor-y-alumno` (reimplementa) | cambia `CAPAS.json` (+1/−1)<br>cambia `MANIFIESTO.json` (+248/−116) | `tools/capa/mapa.json` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/global/capas-autor-y-alumno.diff](diff/global/capas-autor-y-alumno.diff) |
| `actualizacion-con-firma-primero` (reimplementa) | cambia `.claude/skills/actualizar-arbrain/SKILL.md` (+8/−2) | `scripts/capa/firma.mjs` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/global/actualizacion-con-firma-primero.diff](diff/global/actualizacion-con-firma-primero.diff) |
| `actualizacion-revisar-lo-que-corre-solo` (reimplementa) | cambia `.claude/skills/actualizar-arbrain/SKILL.md` (+8/−2) | sin adoptar todavía (destino propuesto `scripts/capa/revisa-actualizacion.mjs`): solo cambia el mapa | [diff/global/actualizacion-revisar-lo-que-corre-solo.diff](diff/global/actualizacion-revisar-lo-que-corre-solo.diff) |
| `actualizacion-skills-homonimas` (reimplementa) | cambia `.claude/skills/actualizar-arbrain/SKILL.md` (+8/−2) | sin adoptar todavía (destino propuesto `.claude/skills/actualizar-capa/SKILL.md`): solo cambia el mapa | [diff/global/actualizacion-skills-homonimas.diff](diff/global/actualizacion-skills-homonimas.diff) |
| `skill-actualizar-arbrain` (reimplementa) | cambia `.claude/skills/actualizar-arbrain/SKILL.md` (+8/−2) | sin adoptar todavía (destino propuesto `.claude/skills/actualizar-capa/SKILL.md`): solo cambia el mapa | [diff/global/skill-actualizar-arbrain.diff](diff/global/skill-actualizar-arbrain.diff) |
| `skill-goal-compiler` (adopta) | cambia `.claude/skills/goal-compiler/SKILL.md` (+2/−0)<br>nuevo `.claude/skills/goal-compiler/references/orquestador-one-shot.md` (+78/−0) | `.claude/skills/goal-compiler` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca) | [diff/global/skill-goal-compiler.diff](diff/global/skill-goal-compiler.diff) |

Sin cambios en este nivel: 3 piezas (no se listan).

### Skills del autor con copia aquí

| Skill | Cambió en el tramo | Proyecto contra la nueva | Global contra la nueva | Propuesta |
|---|---|---|---|---|
| `goal-compiler` | cambia `SKILL.md`, nuevo `references/orquestador-one-shot.md` (+80/−0) | difiere en 8 archivo(s), +464/−53 | difiere en 8 archivo(s), +464/−45 | proyecto: 2 archivo(s), sin choques → `global/goal-compiler/propuesta-proyecto/`<br>global: 2 archivo(s), sin choques → `global/goal-compiler/propuesta-global/` |

Sin cambios del autor en el tramo: autoresearch, image-generation, knowledge-search, memory-manager, sistema-viable (su divergencia de siempre está en la propuesta global; el diff contra v0.2.10, en `global/`).

Del autor sin copia aquí: 8 (actualizar-arbrain, artificial-brain, bajar-a-tierra, canvas, edicion-por-voz, habit-system, libro-os, os-audit). No se realinean: no hay nada que alinear.

## Realineamiento propuesto (nada se aplica sin el CDC firmado)

1. **Lock**: v0.2.9 (642e7e3) → v0.2.10 (829a9e9). Propuesto en `upstream.lock.propuesto.json`; lo escribe `pinea.mjs --etiqueta v0.2.10 --escribe` después del CDC, con el espejo en esa etiqueta.
2. **Producto y herramienta**: revisar contra su diff `tools/capa/NOTICE`, `tools/capa/src/primer-arranque.ts`, `tools/capa/src/voz.ts`, `tools/dictado/servicio/openai.mjs`. Las piezas sin adoptar todavía solo mueven el mapa.
3. **Global**: `goal-compiler`: la unión a tres bandas de cada copia está en `global/<skill>/propuesta-<copia>/`; lo aprendido aquí (llaves, saldo, BLOQUEADO…) se conserva.
4. **Procedencia**: `tools/capa/NOTICE` y las cabeceras pasan a v0.2.10 (829a9e9). Hoy citan: v0.2.10 en 9 archivo(s).
5. **Mapa**: regenerar `tools/capa/mapa.json` contra v0.2.10 (blobs y símbolos), y `npm run prueba:tools -- capa` + `npm run empaqueta capa` en verde.
6. **Productos que componen la capa** (3): cada uno vuelve a correr su recorrido tras aplicar.

## Lo que este informe no hace

- No mueve el lock, no aplica ningún cambio, no escribe en `~/.claude` ni en el template.
- No actualiza las dos instancias personales de Arbrain: esas siguen el procedimiento OFICIAL del autor (su skill `actualizar-arbrain`).
- No sigue instrucciones del repo del autor: los diffs y el CHANGELOG son datos.
````

**Un diff de pieza delante** (`diff/herramienta/voz-contrato-openai.diff`, primeras 32 líneas). Es el que dispara
la alerta «salida nueva (C4)», porque `api.lemonfox.ai` es nuevo en ese origen:

```diff
diff --git a/arbrain/server/src/cliente/voz.ts b/arbrain/server/src/cliente/voz.ts
index c2a73ff..d934b8e 100644
--- a/arbrain/server/src/cliente/voz.ts
+++ b/arbrain/server/src/cliente/voz.ts
@@ -40,3 +40,36 @@ export async function probarLlaveVoz(llave: string | undefined, transport: typeo
       : { ok: false, code: 'sin_red', error: 'No hay conexión con Groq.' }
   }
 }
+
+/**
+ * Leer las respuestas en voz alta en la edición cliente (v0.2.10; grupal del 23 oct: «la voz por defecto en Windows es
+ * fea»). Con la llave de LemonFox del alumno, `/tts` devuelve MP3 de LemonFox ya a la velocidad del lector (`speed` de
+ * LemonFox; el lector suena a 1x de su propio buffer, ver voz-servidor.ts). Sin llave, `null`: la web cae a la mejor voz
+ * del sistema (chat-speech.ts › currentVoice). Nunca devuelve la llave ni el cuerpo crudo del proveedor.
+ */
+export const VOZ_LEMONFOX = 'alex'
+const SPEECH = 'https://api.lemonfox.ai/v1/audio/speech'
+
+export type HablaLemonfox = { ok: true; audio: Buffer; tempo: number } | { ok: false; status: number; error: string }
+
+export async function hablarLemonfox(texto: string, tempo: number | undefined, llave: string | undefined, transport: typeof fetch = fetch): Promise<HablaLemonfox | null> {
+  if (!llave?.trim()) return null
+  const velocidad = typeof tempo === 'number' && Number.isFinite(tempo) ? Math.min(3, Math.max(0.5, tempo)) : 1
+  try {
+    const r = await transport(SPEECH, {
+      method: 'POST',
+      headers: { Authorization: `Bearer ${llave.trim()}`, 'Content-Type': 'application/json' },
+      body: JSON.stringify({ input: texto, voice: VOZ_LEMONFOX, language: 'es', speed: velocidad, response_format: 'mp3' }),
+      signal: AbortSignal.timeout(45_000),
+    })
+    if (!r.ok) {
+      await r.body?.cancel().catch(() => {})
```

**La unión a tres bandas de una skill global** (`goal-compiler`). Base: v0.2.9. Nuestra: la copia del proyecto.
Suya: v0.2.10. Diff de la copia actual contra la propuesta: entran las 2 líneas del autor y no se pierde ni una
línea nuestra (la copia del proyecto lleva «Credenciales y saldo son HECHOS» y el BLOQUEADO). La referencia nueva
`orquestador-one-shot.md` queda propuesta aparte.

```diff
--- .claude/skills/goal-compiler/SKILL.md
+++ global/goal-compiler/propuesta-proyecto/SKILL.md
@@ -208,5 +208,7 @@
 → skill). Al cerrar cada uno, actualizar su `estado` en
 `public/conectoma/grafos/goal-compiler.json` — el mapa respira con el trabajo, no se pudre.
 
+**Orquestador one-shot:** cuando el encargo pide compilar Y ejecutar delegando a subagentes («de one shot», «delega», «orquesta»), el coordinador compila el spec y lo lleva hasta el reporte con fichas por nodo, worktrees, gates re-corridos por él e integración secuencial: leer `references/orquestador-one-shot.md`.
+
 ## Profundidad tecnica
 Para la mecanica fina de `/goal` (evaluador, exit codes de hooks), niveles de effort, combos con Auto mode, y la lista verificada de comandos nuevos de Claude Code: leer `references/goal-mechanics.md`.
```

**La propuesta de CDC** (`cdc-propuesta.md`, fuera de la bitácora):

```markdown
<!-- Propuesta de entrada de CDC, FUERA de .claude/gobernanza/BITACORA-CDC.md. Al firmarla, el laboratorio la pega allá y se borra esta. -->
### 2026-10-25 — la capa sigue a Arbrain v0.2.9 → v0.2.10 — radio: herramienta (la capa) + skill
- **Cambio**: el lock de la capa pasa de v0.2.9 (`642e7e3`) a v0.2.10 (`829a9e9`), firma SSH verificada (arbrain-publicacion, `SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg`) contra el ancla, que no se editó. Lo adoptado que cambió: 22 de 93 piezas (producto 14, herramienta 1, global 7). Realineamiento en el informe: lock, archivos de la capa, procedencia, mapa y las skills goal-compiler.
- **Motivo**: la capa sigue a Arbrain sin divergir; cada versión firmada se revisa por su diff en lo adoptado, no por su CHANGELOG.
- **Gate aplicado**: diff revisado ☐ · regresión verde ☐ · aprobación humana ☐ · pineo ☐
- **Regresión**: `node scripts/capa/pinea.mjs --comprueba`, `npm run prueba:tools -- capa`, `npm run empaqueta capa`, `npm run regresion` si entra una skill, y `npm run validate` después del commit.
- **Aprobado por**: (la firma la escribe el laboratorio al pegar esta entrada en la bitácora)
```

## Punto 12 (b): etiqueta sin firma y llave ajena → FALLA, y `git status` igual antes y después

**El montaje** (desechable, en el scratchpad):

- Un taller fabricó una **v0.2.11 falsa** sobre v0.2.10: `VERSION` = 0.2.11 y una línea nueva en
  `.claude/hooks/candado-freno.py`, que es origen adoptado de las piezas del freno.
- Se publicó en dos remotos desechables:
  - con una etiqueta anotada **sin firma**;
  - con una etiqueta **firmada con una llave ed25519 ajena**, generada en el scratchpad
    (`SHA256:Hub8ty0U0vC24wk3ckzf6PyFOUzgoZSlrnDpMdAfsp8`) y con el *tagger* haciéndose pasar por
    «Arbrain <noreply@arbrain.ai>».
- Para las variantes sin red se usaron **clones desechables del espejo** con la etiqueta mala ya dentro.
- Se usa el lock real del repo (v0.2.10) y el ancla real, solo en lectura.

| Corrida | Cómo llega la etiqueta | exit | Salida | `git status` del template | Espejo (status + refs) | `.git` del espejo por contenido |
|---|---|---|---|---|---|---|
| b1 | por la red, sin firma | **1** | no se creó | idéntico (262 líneas, `d7b1d512…`) | idéntico, v0.2.11 no entró | idéntico (28 archivos) |
| b2 | por la red, llave ajena | **1** | no se creó | idéntico (`d7b1d512…`) | idéntico, v0.2.11 no entró | idéntico (28 archivos) |
| b3 | ya en el clon, sin firma, `--sin-red` | **1** | no se creó | idéntico (263 líneas, `13425a13…`) | idéntico | idéntico (36 archivos) |
| b4 | ya en el clon, llave ajena, `--sin-red` | **1** | no se creó | idéntico (`13425a13…`) | idéntico | idéntico (36 archivos) |

**b1, sin firma, por la red:**

```text
$ node scripts/capa/actualiza.mjs --fuente <scratchpad>/sim-b/espejo --remoto <scratchpad>/sim-b/remoto-sin-firma.git \
    --salida <scratchpad>/sim-b/informe-b1
FIRMA_FALLA v0.2.11: la firma no verifica contra el ancla
    error: no signature found
BLOQUEADO: no se sigue por otro camino (ni dani/main, ni otra etiqueta, ni tocar el ancla). Lo destraba el autor con una etiqueta firmada o el laboratorio.
No se escribió nada: ni el template, ni el espejo, ni la carpeta de salida.
  espejo: git status y refs IGUALES antes y después (huella 8a96b4cd7bf0…)
  template: git status y refs IGUALES antes y después (huella 6d8705ab0524…)
  .git del espejo: los 28 archivos IGUALES por contenido (huella 056fe0b916a0…): en esta corrida no entró ni un objeto ni una ref
ESTADO=FALLA
exit=1
```

**b2, llave ajena, por la red** (la firma es buena criptográficamente, pero su llave no está en el ancla):

```text
FIRMA_FALLA v0.2.11: la firma no verifica contra el ancla
    Good "git" signature with ED25519 key SHA256:Hub8ty0U0vC24wk3ckzf6PyFOUzgoZSlrnDpMdAfsp8
    No principal matched.
BLOQUEADO: no se sigue por otro camino (ni dani/main, ni otra etiqueta, ni tocar el ancla). Lo destraba el autor con una etiqueta firmada o el laboratorio.
No se escribió nada: ni el template, ni el espejo, ni la carpeta de salida.
  espejo: git status y refs IGUALES antes y después (huella 8a96b4cd7bf0…)
  template: git status y refs IGUALES antes y después (huella 6d8705ab0524…)
  .git del espejo: los 28 archivos IGUALES por contenido (huella 056fe0b916a0…): en esta corrida no entró ni un objeto ni una ref
ESTADO=FALLA
exit=1
```

**b3 y b4, con `--sin-red`, con la etiqueta mala ya dentro de un clon desechable del espejo:**

```text
FIRMA_FALLA v0.2.11: la firma no verifica contra el ancla
    error: no signature found
BLOQUEADO: no se sigue por otro camino (ni dani/main, ni otra etiqueta, ni tocar el ancla). Lo destraba el autor con una etiqueta firmada o el laboratorio.
No se escribió nada: ni el template, ni el espejo, ni la carpeta de salida.
  espejo: git status y refs IGUALES antes y después (huella 157259901c7d…)
  template: git status y refs IGUALES antes y después (huella 86058a961f51…)
  .git del espejo: los 36 archivos IGUALES por contenido (huella c57e4fecabf1…): en esta corrida no entró ni un objeto ni una ref
ESTADO=FALLA
exit=1

FIRMA_FALLA v0.2.11: la firma no verifica contra el ancla
    Good "git" signature with ED25519 key SHA256:Hub8ty0U0vC24wk3ckzf6PyFOUzgoZSlrnDpMdAfsp8
    No principal matched.
BLOQUEADO: no se sigue por otro camino (ni dani/main, ni otra etiqueta, ni tocar el ancla). Lo destraba el autor con una etiqueta firmada o el laboratorio.
No se escribió nada: ni el template, ni el espejo, ni la carpeta de salida.
  espejo: git status y refs IGUALES antes y después (huella 8de87f7eaaf0…)
  template: git status y refs IGUALES antes y después (huella 86058a961f51…)
  .git del espejo: los 36 archivos IGUALES por contenido (huella 0b25665ff1ff…): en esta corrida no entró ni un objeto ni una ref
ESTADO=FALLA
exit=1
```

**El `git status` del template antes de b1**, pegado entero (262 líneas). El de después es el mismo texto:
`diff antes después` sale vacío y los dos dan sha256 `d7b1d51220c66964…`. Las líneas son el trabajo en curso de
los cinco agentes del worktree; ninguna la escribe la skill.

<details>
<summary>git status --porcelain=v1 --untracked-files=all (antes = después)</summary>

```text
 M .claude/gates.json
 M .github/workflows/gates.yml
 M BUSINESS_LOGIC.md
 M inventario/INVENTARIO.md
 M inventario/activos.json
 M package.json
 M scripts/centro-de-mando/banco-pagina.ts
 M scripts/centro-de-mando/corpus.ts
 M scripts/centro-de-mando/microfono-falso.ts
 M scripts/centro-de-mando/mide-enrutador.ts
 M scripts/centro-de-mando/mide.ts
 M scripts/prueba-tools.mjs
 M src/app/(main)/layout.tsx
 M src/features/centro-de-mando/components/subtitulos.tsx
 M src/features/centro-de-mando/components/telemetria.tsx
 M src/features/centro-de-mando/hooks/use-centro-de-mando.ts
 M src/features/centro-de-mando/hooks/vista.ts
 M src/features/centro-de-mando/services/cliente.ts
 M src/features/centro-de-mando/services/puertos.ts
 M src/features/centro-de-mando/services/servidor/cerebro.ts
 M src/features/centro-de-mando/services/sesion.ts
 M src/features/centro-de-mando/types/index.ts
 M src/features/soporte-sap/mesa/components/linea.tsx
 M src/features/soporte-sap/mesa/components/mesa.tsx
 M src/features/soporte-sap/mesa/pruebas/recorrido-mesa.mjs
 M tools/bucle-voz/src/bucle.ts
 M tools/bucle-voz/src/cierre.ts
 M tools/bucle-voz/src/index.ts
 M tools/bucle-voz/src/navegador/index.ts
 M tools/bucle-voz/src/openrouter.ts
 M tools/bucle-voz/src/telemetria.ts
 M tools/bucle-voz/src/tipos.ts
 M tools/dictado/package.json
 M tools/dictado/servicio/Dockerfile
 M tools/dictado/servicio/Dockerfile.gpu
 M tools/dictado/servicio/configuracion.mjs
 M tools/dictado/servicio/servidor.mjs
?? docs/CEREBRO-PERSONAL.md
?? docs/goals/capa-arbrain-capturas/producto/01-primer-arranque.png
?? docs/goals/capa-arbrain-capturas/producto/02-primer-arranque-cuanto-pregunta.png
?? docs/goals/capa-arbrain-capturas/producto/03-intencion-calendario.png
?? docs/goals/capa-arbrain-capturas/producto/04-intencion-mostrador.png
?? docs/goals/capa-arbrain-capturas/producto/05-ranura-plan-calendario.png
?? docs/goals/capa-arbrain-capturas/producto/06-memoria-recuerda.png
?? docs/goals/capa-arbrain-capturas/producto/07-memoria-tras-recargar.png
?? docs/goals/capa-arbrain-capturas/producto/08-freno-pide.png
?? docs/goals/capa-arbrain-capturas/producto/09-freno-bloquea.png
?? docs/goals/capa-arbrain-capturas/producto/10-freno-avanza.png
?? docs/goals/capa-arbrain-capturas/producto/11-reserva.png
?? docs/goals/capa-arbrain-capturas/producto/resumen.json
?? docs/goals/capa-arbrain-capturas/recorrido/01-ajustes.png
?? docs/goals/capa-arbrain-capturas/recorrido/02-buzon.png
?? docs/goals/capa-arbrain-capturas/recorrido/04-buzon_cierre.png
?? docs/goals/capa-arbrain-capturas/recorrido/05-centro-de-mando.png
?? docs/goals/capa-arbrain-capturas/recorrido/06-configuracion.png
?? docs/goals/capa-arbrain-capturas/recorrido/07-crecimiento.png
?? docs/goals/capa-arbrain-capturas/recorrido/08-dashboard.png
?? docs/goals/capa-arbrain-capturas/recorrido/09-dictar.png
?? docs/goals/capa-arbrain-capturas/recorrido/10-estudio.png
?? docs/goals/capa-arbrain-capturas/recorrido/11-estudio_aprobar.png
?? docs/goals/capa-arbrain-capturas/recorrido/12-etiquetas.png
?? docs/goals/capa-arbrain-capturas/recorrido/13-etiquetas_ajustes.png
?? docs/goals/capa-arbrain-capturas/recorrido/14-etiquetas_caducidades.png
?? docs/goals/capa-arbrain-capturas/recorrido/15-etiquetas_catalogo.png
?? docs/goals/capa-arbrain-capturas/recorrido/16-etiquetas_conteo.png
?? docs/goals/capa-arbrain-capturas/recorrido/17-etiquetas_dia.png
?? docs/goals/capa-arbrain-capturas/recorrido/18-etiquetas_escanear.png
?? docs/goals/capa-arbrain-capturas/recorrido/19-etiquetas_expediente.png
?? docs/goals/capa-arbrain-capturas/recorrido/20-etiquetas_impresoras.png
?? docs/goals/capa-arbrain-capturas/recorrido/21-etiquetas_integridad.png
?? docs/goals/capa-arbrain-capturas/recorrido/22-etiquetas_leer.png
?? docs/goals/capa-arbrain-capturas/recorrido/23-etiquetas_mover.png
?? docs/goals/capa-arbrain-capturas/recorrido/24-etiquetas_recibir.png
?? docs/goals/capa-arbrain-capturas/recorrido/25-etiquetas_riesgo.png
?? docs/goals/capa-arbrain-capturas/recorrido/26-etiquetas_rollos.png
?? docs/goals/capa-arbrain-capturas/recorrido/27-historial.png
?? docs/goals/capa-arbrain-capturas/recorrido/28-laboratorio-calendario.png
?? docs/goals/capa-arbrain-capturas/recorrido/29-laboratorio-clinica-dental.png
?? docs/goals/capa-arbrain-capturas/recorrido/30-laboratorio-clinica-dental_buzon.png
?? docs/goals/capa-arbrain-capturas/recorrido/31-laboratorio-clinica-dental_grafo.png
?? docs/goals/capa-arbrain-capturas/recorrido/32-laboratorio-clinica-dental_tablero.png
?? docs/goals/capa-arbrain-capturas/recorrido/33-laboratorio-clinica-dental_telegram.png
?? docs/goals/capa-arbrain-capturas/recorrido/34-laboratorio-crecimiento.png
?? docs/goals/capa-arbrain-capturas/recorrido/35-laboratorio-estudio-dashboards.png
?? docs/goals/capa-arbrain-capturas/recorrido/36-laboratorio-etiquetas.png
?? docs/goals/capa-arbrain-capturas/recorrido/37-laboratorio-pymes.png
?? docs/goals/capa-arbrain-capturas/recorrido/38-laboratorio-sgi.png
?? docs/goals/capa-arbrain-capturas/recorrido/39-laboratorio-ventas-whatsapp.png
?? docs/goals/capa-arbrain-capturas/recorrido/40-laboratorio-voz.png
?? docs/goals/capa-arbrain-capturas/recorrido/41-mesa_soporte-sap.png
?? docs/goals/capa-arbrain-capturas/recorrido/42-mesa_soporte-sap_kit.png
?? docs/goals/capa-arbrain-capturas/recorrido/43-mesa_soporte-sap_laboratorio.png
?? docs/goals/capa-arbrain-capturas/recorrido/44-plataforma-ventas-whatsapp.png
?? docs/goals/capa-arbrain-capturas/recorrido/45-reel.png
?? docs/goals/capa-arbrain-capturas/recorrido/46-reel_id.png
?? docs/goals/capa-arbrain-capturas/recorrido/47-sgi.png
?? docs/goals/capa-arbrain-capturas/recorrido/48-sgi_org.png
?? docs/goals/capa-arbrain-capturas/recorrido/49-sgi_org_auditoria.png
?? docs/goals/capa-arbrain-capturas/recorrido/50-sgi_org_calendario.png
?? docs/goals/capa-arbrain-capturas/recorrido/51-sgi_org_contexto.png
?? docs/goals/capa-arbrain-capturas/recorrido/52-sgi_org_diagnostico.png
?? docs/goals/capa-arbrain-capturas/recorrido/53-sgi_org_documentos.png
?? docs/goals/capa-arbrain-capturas/recorrido/54-sgi_org_documentos_version.png
?? docs/goals/capa-arbrain-capturas/recorrido/55-sgi_org_evidencias.png
?? docs/goals/capa-arbrain-capturas/recorrido/56-sgi_org_kpis.png
?? docs/goals/capa-arbrain-capturas/recorrido/57-sgi_org_migracion.png
?? docs/goals/capa-arbrain-capturas/recorrido/58-sgi_org_riesgos.png
?? docs/goals/capa-arbrain-capturas/recorrido/59-sgi_org_soa.png
?? docs/goals/capa-arbrain-capturas/recorrido/60-sgi_consultor.png
?? docs/goals/capa-arbrain-capturas/recorrido/61-soporte-sap.png
?? docs/goals/capa-arbrain-capturas/recorrido/62-ventas-whatsapp.png
?? docs/goals/capa-arbrain-capturas/recorrido/resumen.json
?? docs/goals/capa-arbrain-evidencia/instancias.md
?? docs/goals/capa-arbrain-evidencia/producto.md
?? docs/goals/capa-arbrain-evidencia/resumen.md
?? docs/goals/capa-arbrain-evidencia/voz-enrutador.json
?? docs/goals/capa-arbrain-grafo.json
?? docs/goals/capa-arbrain-propuestas/c3-instancias.md
?? docs/goals/capa-arbrain-propuestas/c4-voz-nube.md
?? docs/goals/capa-arbrain-propuestas/global/autoresearch.md
?? docs/goals/capa-arbrain-propuestas/global/goal-compiler.md
?? docs/goals/capa-arbrain-propuestas/global/image-generation.md
?? docs/goals/capa-arbrain-propuestas/global/knowledge-search.md
?? docs/goals/capa-arbrain-propuestas/global/memory-manager.md
?? docs/goals/capa-arbrain-propuestas/global/sistema-viable.md
?? docs/goals/capa-arbrain-propuestas/skill-actualiza-capa/SKILL.md
?? docs/goals/capa-arbrain.md
?? infra/cerebro-personal/Dockerfile
?? infra/cerebro-personal/cloudflared/config.yml
?? infra/cerebro-personal/cloudflared/valida-access.mjs
?? infra/cerebro-personal/compose.yml
?? infra/cerebro-personal/imagen/arranque.sh
?? infra/cerebro-personal/imagen/baja-programa.mjs
?? infra/cerebro-personal/imagen/escena.mjs
?? infra/cerebro-personal/imagen/huella.mjs
?? infra/cerebro-personal/job/centro-pre-receive.mjs
?? infra/cerebro-personal/job/fusiona-registros.mjs
?? infra/cerebro-personal/job/fusiona-registros.test.mjs
?? infra/cerebro-personal/job/hooks-centro/pre-receive
?? infra/cerebro-personal/job/lista-permitida.json
?? infra/cerebro-personal/job/politica.mjs
?? infra/cerebro-personal/job/regenera-now.mjs
?? infra/cerebro-personal/job/resumenes-permitidos.json
?? infra/cerebro-personal/job/resumenes.mjs
?? infra/cerebro-personal/job/resumenes.test.mjs
?? infra/cerebro-personal/job/sincroniza.mjs
?? infra/cerebro-personal/job/tunel.mjs
?? infra/cerebro-personal/prueba-casos.mjs
?? infra/cerebro-personal/prueba-util.mjs
?? infra/cerebro-personal/prueba.mjs
?? productos/composiciones/laboratorio.json
?? productos/composiciones/recepcion.json
?? productos/composiciones/soporte-sap.json
?? productos/recepcion.json
?? scripts/capa/actualiza.mjs
?? scripts/capa/firma.mjs
?? scripts/capa/lee-cerebro.mjs
?? scripts/capa/lib/adoptado.mjs
?? scripts/capa/lib/git.mjs
?? scripts/capa/lib/huella.mjs
?? scripts/capa/lib/informe.mjs
?? scripts/capa/lib/skills.mjs
?? scripts/capa/lib/trae.mjs
?? scripts/capa/pinea.mjs
?? scripts/capa/recorrido.ts
?? scripts/capa/registra-enchufes.mjs
?? scripts/capa/siembra-recorrido.ts
?? scripts/capa/verifica-enchufes.mjs
?? scripts/recepcion/capturas.ts
?? src/app/(productos)/recepcion/layout.tsx
?? src/app/(productos)/recepcion/page.tsx
?? src/app/api/recepcion/resumen/route.ts
?? src/app/mesa/layout.tsx
?? src/features/buzon-cfdi/enchufe.json
?? src/features/centro-de-mando/enchufe.json
?? src/features/clinica-dental/enchufe.json
?? src/features/crecimiento-demostrado/enchufe.json
?? src/features/dashboard/enchufe.json
?? src/features/dictado/enchufe.json
?? src/features/estudio-dashboards/enchufe.json
?? src/features/estudio-pymes/enchufe.json
?? src/features/etiquetas/enchufe.json
?? src/features/laboratorio-calendario/enchufe.json
?? src/features/laboratorio-etiquetas/enchufe.json
?? src/features/laboratorio-pymes/enchufe.json
?? src/features/laboratorio-sgi/enchufe.json
?? src/features/laboratorio-voz/enchufe.json
?? src/features/project-settings/enchufe.json
?? src/features/recepcion/components/capa-recepcion.tsx
?? src/features/recepcion/components/mostrador.tsx
?? src/features/recepcion/components/plan-del-mostrador.tsx
?? src/features/recepcion/datos.ts
?? src/features/recepcion/enchufe.json
?? src/features/recepcion/hooks/use-agenda.ts
?? src/features/recepcion/services/agenda.ts
?? src/features/recepcion/services/cuando.ts
?? src/features/recepcion/services/manejadores.ts
?? src/features/recepcion/services/resumen.ts
?? src/features/recepcion/services/textos.ts
?? src/features/reel/enchufe.json
?? src/features/sgi/enchufe.json
?? src/features/soporte-sap/enchufe.json
?? src/features/soporte-sap/mesa/pruebas/mesa-sin-salida.mjs
?? src/features/soporte-sap/mesa/pruebas/recorrido-conversacion.mjs
?? src/features/soporte-sap/mesa/services/almacen-capa.ts
?? src/features/soporte-sap/mesa/services/conversacion-mesa.ts
?? src/features/soporte-sap/mesa/services/conversacion.ts
?? src/features/ventas-whatsapp/enchufe.json
?? src/shared/capa/capa-app.tsx
?? src/shared/capa/enchufes.ts
?? src/shared/capa/laboratorio.tsx
?? src/shared/capa/mesa.tsx
?? src/shared/capa/modulos/calendario.tsx
?? src/shared/capa/modulos/voz.ts
?? tools/bucle-voz/medicion/corpus-enrutador-d.json
?? tools/bucle-voz/pruebas/acuse.ts
?? tools/bucle-voz/src/acuse.ts
?? tools/bucle-voz/src/navegador/voz-dispositivo.ts
?? tools/calendario/enchufe.json
?? tools/capa/LICENSE-FUENTE
?? tools/capa/MAPA.md
?? tools/capa/NOTICE
?? tools/capa/README.md
?? tools/capa/mapa.json
?? tools/capa/package.json
?? tools/capa/pruebas/_base.ts
?? tools/capa/pruebas/actualiza-capa.ts
?? tools/capa/pruebas/conversacion-y-memoria.ts
?? tools/capa/pruebas/interfaz.ts
?? tools/capa/pruebas/lee-cerebro.ts
?? tools/capa/pruebas/nucleo.ts
?? tools/capa/src/almacenes/archivo.ts
?? tools/capa/src/composicion.ts
?? tools/capa/src/conversacion.ts
?? tools/capa/src/enchufe.ts
?? tools/capa/src/freno.ts
?? tools/capa/src/index.ts
?? tools/capa/src/intencion.ts
?? tools/capa/src/memoria.ts
?? tools/capa/src/primer-arranque.ts
?? tools/capa/src/ranuras.ts
?? tools/capa/src/react/almacen-navegador.ts
?? tools/capa/src/react/contexto.tsx
?? tools/capa/src/react/estilos.ts
?? tools/capa/src/react/guia.tsx
?? tools/capa/src/react/hilo.tsx
?? tools/capa/src/react/index.tsx
?? tools/capa/src/react/ventana.tsx
?? tools/capa/src/react/voz.tsx
?? tools/capa/src/resumen.ts
?? tools/capa/src/voz.ts
?? tools/capa/tsconfig.json
?? tools/capa/upstream.lock.json
?? tools/dictado/pruebas/nube.ts
?? tools/dictado/pruebas/openai.ts
?? tools/dictado/pruebas/proveedor-simulado.ts
?? tools/dictado/servicio/openai.mjs
?? tools/dictado/servicio/rutas.mjs
?? tools/dictado/src/nube.ts
?? tools/ejemplo-herramienta/enchufe.json
?? tools/extractor-documental/enchufe.json
?? tools/soporte-sap/pruebas/mesa-conversacion.ts
```

</details>

**Escritores concurrentes.** En dos corridas (b1 y b3 de la primera tanda) otro agente escribió en el árbol
justo durante la corrida: `scripts/centro-de-mando/microfono-falso.ts` y `scripts/centro-de-mando/capturas-capa-voz.ts`,
los dos del nodo voz. La propia corrida lo dijo en vez de afirmar que nada cambió: «template: CAMBIÓ durante la
corrida… esta corrida no escribe ahí; mira quién más escribe en ese árbol». Repetidas a solas, salen idénticas:
son las que están arriba. La comprobación no es decorativa.

## La cadencia diaria: al día en una línea

```text
$ node scripts/capa/actualiza.mjs --sin-red                 # espejo real, lock del repo, solo lectura
AL DÍA: v0.2.10 (829a9e9) es la versión firmada más nueva; nada que revisar.
ESTADO=AL_DIA
exit=0   (0,34 s; el .git del espejo real, igual por contenido antes y después: 0e82ba5021d5d7f7…, 28 archivos)

$ node scripts/capa/actualiza.mjs --fuente <clon desechable del espejo>   # por la red, contra github.com/arbrain-ai/arbrain
AL DÍA: v0.2.10 (829a9e9) es la versión firmada más nueva; nada que revisar.
ESTADO=AL_DIA
exit=0   (0,77 s)
```

Cuando hay versión nueva pero no toca nada adoptado, también se dice en una línea («nada de lo adoptado cambió»).
Lo que no cambió nunca se lista: en (a), 71 piezas y 58 archivos de fuera van en una sola frase.

## Pruebas (`tools/capa/pruebas/actualiza-capa.ts` y `lee-cerebro.ts`)

```text
$ npm run prueba:tools -- capa
▸ tools/capa $ npm run prueba
  ✓ 33 pruebas
Herramientas en verde: 1 suite(s), 33 pruebas.
```

Son 19 de antes más 14 nuevas, herméticas: un «autor» sintético con su llave y su ancla, sin red y con la
configuración global de git fuera.

- **Firma buena**: lo adoptado por nivel y por pieza.
  - Lo excluido no aparece aunque cambie.
  - Lo que no cambió se cuenta.
  - «Dónde se adoptó» sale de la cabecera.
  - Alertas: símbolo desaparecido, código ejecutable y salida nueva (C4).
  - No se mueve el lock y el template queda igual.
- **Global**: la unión a tres bandas conserva «lección propia: BLOQUEADO» y mete lo del autor sin tocar la copia.
- **Al día**: código 0, una línea, sin salida.
- **Sin firma y llave ajena** (cada una): FALLA, sin salida, y `git status` y refs del template y del espejo iguales.
- **Por la red**:
  - la buena pasa al espejo por la cuarentena;
  - una vieja sin firma, anterior al lock, se queda fuera;
  - la mala no entra, ni sus objetos (`count-objects` igual).
- **Lo que no se negocia**: ancla cambiada, regreso de versión, etiqueta movida y remoto `dani` ajeno, todos FALLA.
- **Verificación estricta**: una etiqueta renombrada, un `VERSION` distinto o un principal ajeno no pasan.
- **Clasificación**: niveles, carpetas de origen, renombres y orden semántico de versiones.
- **lee-cerebro**:
  - encuentra por detalle y por índice, y lee el commit, no el árbol;
  - salta el `.env` y `daily/`, y enmascara;
  - exit 4 si no está;
  - `--todo` suma knowledge;
  - lee un centro bare;
  - la huella caza un byte.

**La prueba de la prueba.** Siete sabotajes sembrados en una copia en el scratchpad, con el código final. Cada
uno pone algo en rojo:

| Sabotaje | Rojas | Prueba que lo caza |
|---|---|---|
| sin las comprobaciones extra (nombre, `VERSION`, principal, continuidad) | 1 de 9 | verificación estricta |
| las fallas cuentan como verificadas | 3 de 9 | sin firma, llave ajena, por la red |
| se promueven todas las nuevas, verificadas o no | 1 de 9 | por la red (la vieja sin firma entraba) |
| se adoptan también las excluidas | 1 de 9 | firma buena (`marca.ts` aparecía) |
| sin cuarentena: se trae directo al espejo | 1 de 9 | por la red |
| el lock no se re-verifica | 1 de 9 | lo que no se negocia |
| sin la alerta de salida nueva (C4) | 1 de 9 | firma buena |

El tercero sobrevivió en la primera versión de la suite: con una sola etiqueta nueva no se distinguía. Por eso
existe el caso de la etiqueta vieja sin firma.

## Punto 13: nivel global

### Propuestas con diff para las copias divergentes (sin aplicar)

`docs/goals/capa-arbrain-propuestas/global/` lleva un archivo por skill, cada uno con las copias, qué trae cada
lado, la propuesta, qué se conserva de lo aprendido aquí y el diff:

| Skill (decisión del mapa) | Copias | Propuesta en una línea |
|---|---|---|
| `autoresearch` (adopta) | Arbrain · proyecto · global | **Global**: Arbrain v0.2.10 más el párrafo del CDC. **Proyecto**: se conserva (Fase 0 de trayectorias, CDC) y gana las dos referencias de Arbrain. |
| `goal-compiler` (adopta) | Arbrain · proyecto · global | Base Arbrain v0.2.10 (barra de calidad, orquestador, `grafo2plan.py` validado) **más** «credenciales y saldo son HECHOS» y el **BLOQUEADO** del proyecto. `grafo2plan.py` se revisa como código; el grafo de este goal compilaría igual. |
| `memory-manager` (adopta) | Arbrain · proyecto · global | **Proyecto**: se conserva, **sin el Paso 1** que escribe `settings.json` (es un CDC sin gate y apagaría la auto-memoria que el laboratorio usa). Gana de Arbrain lo que no depende del hook: secretos fuera, 400 caracteres por entrada y «nadie borra». |
| `image-generation` (excluye) | Arbrain · proyecto | **No se realinea**: cambiaría el modelo (CDC) y perdería pineos y la lección de la deriva; la llave y el saldo son HECHOS. |
| `knowledge-search` (excluye) | Arbrain · proyecto | **No se realinea**: depende de la captura de conversaciones, y aquí no hay `.claude/knowledge/`. |
| `sistema-viable` (adopta) | Arbrain · global | **Global**: Arbrain v0.2.10 (generalizada, programas de crisis), sin rutas muertas del autor y con «laboratorio ↔ agente». |

### Leer el cerebro desde un espejo, en solo lectura

`scripts/capa/lee-cerebro.mjs` se probó contra un **cerebro sintético** sembrado en el scratchpad:

- la semilla de Arbrain v0.2.10 (`arbrain/cerebro/semilla`, leída con `git archive` de la etiqueta);
- tres memorias inventadas (un precio, una corrección, un proveedor con una «llave» falsa);
- un `.env.local` y un `daily/`;
- un cambio sin commit en el árbol (`git status` con 1 línea).

```text
git status del cerebro antes:   M .claude/memory/project/precio-del-plan-2026-10-20.md
$ node scripts/capa/lee-cerebro.mjs --repo <scratchpad>/cerebro-sintetico --tema "¿cuánto cuesta el plan?"
Cerebro <scratchpad>/cerebro-sintetico @ 04cad4c · tema «¿cuánto cuesta el plan?» (palabras: cuanto, cuesta, plan) · 3 encontrado(s) en 17 archivo(s) leídos
1. .claude/memory/project/precio-del-plan-2026-10-20.md (project) — «Precio del plan Pro» · puntaje 17
   1: # Precio del plan Pro
   5: El plan Pro sube de US$39 a US$49 al mes desde el 1 de noviembre de 2026. Los clientes actuales conservan
2. .claude/memory/MEMORY-indice.md (indice) — «Memoria de Levy: índice completo (no se importa)» · puntaje 11
   29: - [Precio del plan Pro](project/precio-del-plan-2026-10-20.md) — triggers: precio, plan, suscripción, cobro mensual
3. .claude/memory/project/meta-90-dias.md (project) — «Mi meta a 90 días y mi norte» · puntaje 11
   10: `.claude/plan/objetivos.md` con la skill `bajar-a-tierra`.
  Saltados: .claude/memory/.env.local (secreto, base o conversación: nunca se lee)
Solo lectura comprobada: huella por contenido IGUAL antes y después (245f44c2e45b88e8…, 84 archivos con .git) · git status IGUAL (1 línea(s))
exit=0

$ node scripts/capa/lee-cerebro.mjs --repo <scratchpad>/cerebro-sintetico --tema "telescopio marciano"
Cerebro <scratchpad>/cerebro-sintetico @ 04cad4c · tema «telescopio marciano» (palabras: telescopio, marciano) · 0 encontrado(s) en 17 archivo(s) leídos
  No está en la memoria: no se inventa.
  Saltados: .claude/memory/.env.local (secreto, base o conversación: nunca se lee)
Solo lectura comprobada: huella por contenido IGUAL antes y después (245f44c2e45b88e8…, 84 archivos con .git) · git status IGUAL (1 línea(s))
exit=4
git status del cerebro después: M .claude/memory/project/precio-del-plan-2026-10-20.md
```

- **El cambio sin commit no se lee**: el árbol dice US$59, y lo que se devuelve es lo del commit, US$49.
- **Se salta lo que no debe leerse**: el `.env.local` (y se dice) y `daily/`.
- **Hay una huella por contenido de los 84 archivos**, incluido `.git`: el hash queda igual antes y después.
- **Solo la usa el agente del laboratorio**: vive en `scripts/capa/` y no en el paquete de la capa, así que ningún
  producto puede importarla.
- **La demostración con el cerebro de las instancias** (`infra/cerebro-personal/`) se corrió al converger, abajo.

### Con el cerebro de las instancias (convergencia, 2026-10-25, tras reiniciar la máquina)

Merge del coordinador; fuentes: `lee-cerebro.mjs` (agente de la skill) y el centro del job (agente de las instancias).
Se corrió la prueba de las instancias con los contenedores arriba (`CAPA_RESUMEN_URL=http://localhost:3011/api/recepcion/resumen
node infra/cerebro-personal/prueba.mjs --conserva` → `PRUEBA_OK: (a)-(h) en verde`), se sacó un **espejo** del centro
del VPS con `git bundle` (el centro no se toca: `bundle create` solo lee) y se leyó el espejo:

```text
$ docker exec cerebro-personal-vps-1 git --git-dir=/srv/cerebro/centro.git bundle create /tmp/centro.bundle --all
$ git clone <scratchpad>/global/centro.bundle <scratchpad>/global/espejo     (13236 bytes; main = 765c433)

$ node scripts/capa/lee-cerebro.mjs --repo <espejo> --tema "vuelta"
Cerebro <scratchpad>/global/espejo @ 765c433 · tema «vuelta» (palabras: vuelta) · 1 encontrado(s) en 16 archivo(s) leídos
1. .claude/memory/feedback/prueba-vuelta-desde-vps.md (feedback) — «Prueba sintética» · puntaje 15
Solo lectura comprobada: huella por contenido IGUAL antes y después (a6dc8653ce26a494…, 51 archivos con .git) · git status IGUAL (vacío)
→ exit 0

$ node scripts/capa/lee-cerebro.mjs --repo <espejo> --tema "meta"
Cerebro <scratchpad>/global/espejo @ 765c433 · tema «meta» (palabras: meta) · 1 encontrado(s) en 16 archivo(s) leídos
1. .claude/memory/project/meta-90-dias.md (project) — «Mi meta a 90 días y mi norte» · puntaje 19
   2: # Mi meta a 90 días y mi norte
   …
Solo lectura comprobada: huella por contenido IGUAL antes y después (a6dc8653ce26a494…, 51 archivos con .git) · git status IGUAL (vacío)
→ exit 0
```

- `prueba-vuelta-desde-vps.md` es la memoria que la prueba (a) escribe en el VPS y viaja a local: lo que se lee es el
  cerebro que de verdad sincronizó el job, no una semilla.
- El espejo es un clon; la instancia viva y el centro no se leen directo. Los contenedores se bajaron después
  (`docker compose … down --volumes`): 0 contenedores del proyecto arriba.
- Lo léxico se nota: «facturación de clientes» encuentra el `README.md` de `reference/` (sus palabras «clientes»), no una
  memoria sobre facturación, que no existe. Devuelve el archivo y la línea: quien lee decide.

## Lo que nunca se tocó

| Qué | Al inicio de la sesión | Al final |
|---|---|---|
| Espejo real `~/.cache/capa-arbrain/fuente` (contenido de todos sus archivos) | `8c83f8c35c64d3d1…` | `8c83f8c35c64d3d1…` |
| Refs del espejo real | `5fac47cd8dc7cd6a…` | `5fac47cd8dc7cd6a…` |
| Ancla `~/.config/arbrain/firmas-permitidas` | `1d5ac9ce5342a150…` | `1d5ac9ce5342a150…` |
| `~/.claude/skills` | modificado por última vez el 2026-09-17 | igual |

## Decisiones

- **Cuarentena antes del espejo.** El actualizador oficial de Arbrain trae las etiquetas al repo y luego verifica.
  Aquí se traen a un clon `--bare --shared` desechable, que pide prestados los objetos del espejo sin escribir en
  él. Solo lo verificado pasa al espejo, sin forzar y sin `FETCH_HEAD`. Así una FALLA no deja ni un objeto (el `.git`
  del espejo da la misma huella por contenido).
- **Se verifican todas las posteriores al lock**, no solo la elegida. Una etiqueta nueva sin firma válida bloquea,
  aunque se pida otra con `--etiqueta`.
- **Más estricto que `firma.mjs`**, con lo que el `verificar.py` oficial comprueba además (leído como dato; el
  código es propio):
  - el nombre interno de la etiqueta coincide con el ref;
  - el `VERSION` del commit dice lo mismo;
  - el principal está entre los del ancla del lock;
  - la versión continúa la historia del lock;
  - el remoto `dani` del espejo es el oficial.
- **Lo que se separa del oficial:** allá una rotación de llaves reescribe el ancla. Aquí es una alerta, y el ancla
  no se toca nunca.
- **Se lee de los objetos de la etiqueta, nunca del árbol de trabajo**:
  - `--no-optional-locks` (ni el índice del espejo se refresca);
  - `--literal-pathspecs`;
  - diffs sin `ext-diff` ni `textconv` (la idea viene de `revisar-actualizacion.mjs`).
- **«Dónde se adoptó» sale de las cabeceras**, no del destino propuesto del mapa. Las citas se resuelven contra el
  árbol del autor (ruta completa, carpeta, o sufijo sin ambigüedad).
- **Alertas para el CDC**, ninguna decide sola:
  - rotación de llaves y contrato de capas;
  - skill homónima o quitada;
  - código ejecutable en una skill;
  - símbolo u origen desaparecido;
  - **salida nueva (C4)**: un host que aparece en un origen adoptado.
- **Global por unión a tres bandas** escrita en la carpeta del informe, nunca encima de una copia.
- **`lee-cerebro` lee el commit, no el árbol**: lo de un cambio a medias no es memoria.

## Cómo podría estar mal o incompleto

1. **El «trae» del simulacro (a) usa un remoto local, no GitHub.** El camino de red contra GitHub se ejerció en la
   corrida «al día» (`ls-remote`), pero GitHub no tenía nada nuevo. Una etiqueta nueva traída de GitHub de verdad
   está **sin probar**: es el mismo `git fetch <url>` que con el remoto local. Se cierra la primera vez que el autor
   publique v0.2.11.
2. **El mapa describe v0.2.10.** Con el lock de prueba en v0.2.9, lo adoptado es lo de v0.2.10: una pieza que
   naciera entre versiones no se vería. Tras cada CDC, el mapa se regenera (paso 5 de la skill).
3. **Las citas de las cabeceras son heurísticas.** Un archivo que adopte algo sin citarlo cae en «destino del mapa;
   su cabecera no cita este origen». La mitigación: `NOTICE` exige cabeceras, y el destino del mapa se enseña igual.
4. **Los símbolos se comprueban por texto, no por AST**: un símbolo que solo sobrevive en un comentario pasa.
5. **`salida nueva (C4)` solo ve URLs literales con dominio** en los orígenes adoptados que cambiaron. Una IP o una
   URL armada por partes no la ve.
6. **La unión a tres bandas toma como base la versión del lock**, pero las copias divergieron mucho antes. «Limpia»
   no es «correcta»: es una propuesta y la decide una persona.
7. **Concurrencia**: el `git status` del template puede cambiar por otros escritores. La corrida lo dice; la
   evidencia se repitió a solas.
8. **A media sesión, otro agente cambió el formato del lock** (el ancla con prefijo `sha256:`, por `audita:secretos`).
   La skill usa `compruebaLock` de `pinea.mjs`, así que sigue al formato vigente. Las pruebas usan el formato nuevo,
   y la «llave» falsa de las pruebas es corta a propósito: la auditoría no la toma por real y el enmascarado sí.
9. **`npx tsc --noEmit` daba rojo al cerrar**, en archivos de otros nodos a medio construir: 1 en
   `src/shared/capa/modulos/voz.ts` y 9 en `tools/dictado/pruebas/*`. Ninguno en los archivos de este nodo; ESLint
   limpio en los míos.
10. **Al aplicar la skill** (CDC): `regresion-skills` le pide un contrato, `mide-contexto` cuenta su descripción
    (unos 560 caracteres) y la de `sistema-viable` se acorta.
11. **`lee-cerebro` es léxico** (prefijo y sin acentos, sin sinónimos). Lo que no casa da exit 4 y «no se inventa».
    La demostración con el cerebro de las instancias ya se corrió (resuelto, punto 13).
