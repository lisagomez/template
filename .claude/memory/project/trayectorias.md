# Trayectorias — en qué quedamos (2026-09-14)

**Estado**: la spec 011 (trazas de ejecución de forma) está construida en la rama
`feat/trayectorias`, PR #100, con dos CDC promovidos por capa B en frío: la regla «Demostrar,
no citar» en `AGENTS.md` (21/21) y el bloque `arnes` del routing más el cableado de `autoresearch`
y `primer` a las trayectorias (21/21 tras repetir un caso contaminado). Todo registrado en la
bitácora; el detalle de cada tanda vive en `corridas.md` de la rama `golden-sets`.

## Lo que no se deduce del código

- **La capa B se corre con un corredor fuera del repo** (scratchpad de la sesión): sesión fría
  por caso con `claude -p`, modelo pineado, worktree limpio de la rama bajo prueba, herramientas
  acotadas y **sin historial de git ni MCP** en el sujeto; juez ciego que solo ve expectativa y
  salida. Cuesta ~18-23 USD y ~45 min por tanda de 21.
- **`git log --all` alcanza el corpus** desde cualquier worktree del repo: la sesión fría no lo
  encuentra leyendo archivos, pero sí leyendo el historial. Por eso el sujeto no lleva `git log`
  ni `git diff`. Propuesta pendiente: anotarlo en `GOBERNANZA.md` §3 (CDC aparte).
- **El arnés mata sus tareas en segundo plano por su propio umbral de memoria** aunque el
  sistema tenga 11 GB libres; una tanda larga se lanza desacoplada (`setsid nohup`).
- **La regla nueva funcionó**: el único rojo de la primera tanda (citar la regla en vez de
  correr el verificador) pasó a verde-plus en las dos tandas siguientes.
- **Costes medidos de la fábrica**: 22 sesiones históricas, 777 USD, mediana 8,25, máximo
  354,54 (la sesión de las specs 007-009). Fable 5.1 emite 2,4× tokens por llamada que Opus 5.

**Why:** cada tanda se paga y se tarda; repetir el montaje o volver a descubrir la fuga por
`git log` sería tirar eso.
**How to apply:** para un CDC de skill, correr la capa B con el corredor descrito; no juzgar
desde la sesión que hizo el cambio. Ver [[extractor-documental]] para el otro hilo abierto.
