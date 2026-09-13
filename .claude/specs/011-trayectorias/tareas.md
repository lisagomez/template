# Tareas 011 — Trayectorias

> Orden por fases del grafo. Cada tarea cierra con evidencia pegada en la sesión (2026-09-13).

## Fase 1 — Spec
- [x] **TAR-1 · Spec, plan y tareas.** `npm run verifica:specs`: 100/100.

## Fase 2 — Formato
- [x] **TAR-2 · Formato común y verificador** (`scripts/trayectorias/formato.mjs`, `verifica.mjs`,
      `scripts/prueba-trayectorias.ts`): claves cerradas por nivel, cadenas de 80 caracteres sin
      saltos, y rechazo de RFC, CURP, correo, clave de API, JWT, clave AWS, variable con valor, ruta
      de máquina e identificador de caso (`T` + 1-2 dígitos). Coste `null` sin uso, nunca cero.
      Pruebas 8/8. `verifica:trayectorias` y `prueba:trayectorias` dentro de `validate` (README
      actualizado: 15 pasos; gobernanza 152/152).

## Fase 3 — Capturas (en paralelo)
- [x] **TAR-3 · Captura de la fábrica** (`captura-sesion.mjs`, hook `.claude/hooks/captura-trayectoria.sh`):
      21 transcripts históricos convertidos (tabla pegada en sesión: skills, herramientas, llamadas,
      tokens de salida y caché, gates, errores); uso deduplicado por id de mensaje. Hook `SessionEnd`
      cableado en `settings.local.json` (por máquina, sin CDC) y probado con una sesión nueva real
      (`claude -p` con Haiku): apareció `fabrica-cfae124e` sola, con 2 llamadas y tokens contados.
      Cablearlo en `settings.json` del repo queda como CDC pendiente (`trayectorias/hooks.ejemplo.json`).
      **Corregido tras el evaluador ciego (`/goal corrige`)**: los comandos del arnés (`/compact`,
      `/model`, `/goal`…) ya no se cuentan como skills (solo lo que existe en `.claude/skills/`);
      cada sesión lleva `actor.tarea` deducida de lo que hizo; y `acciones.ediciones` cuenta también
      las escrituras hechas desde Bash (`sed -i`, heredocs, `write_text`), que la segunda pasada
      ciega cazó: 6 de 8 «no» eran sesiones etiquetadas «lectura» que arreglaban código por Bash.
      Tras la corrección: 20 sesiones `implementacion`, 1 `lectura`, 1 `conversacion`.
- [x] **TAR-4 · Captura de la aplicación** (`src/lib/ai/trayectorias.ts`): `conTrayectoria` envuelve
      el `Registrador`; prueba con registrador falso: cada llamada emite trayectoria válida, sin uso
      va con coste `null` y cobertura incompleta, y el resumen sigue declarando filas sin costo.
- [x] **TAR-5 · Captura de herramientas**: `medicion/servicio.mjs` escribe `trayectoria.json`; corrida
      real (33 páginas, 227,8 pág/min vía motor, p95 1765 ms, 609 campos, 44 a revisión) ingestada.

## Fase 4 — Almacén
- [x] **TAR-6 · Ingesta y almacén**: `trayectorias/datos/<linea>/<mes>/` con 22 de fábrica, 3 de
      aplicación y 1 de herramientas; lo crudo (transcripts, resúmenes) fuera de git.

## Fase 5 — Evaluador
- [x] **TAR-7 · Criterios y evaluador**: `criterios.json` con 3 a 6 criterios binarios por línea;
      `evalua.mjs` calcula los estructurales (fábrica: gate corrido 18/22, sin gate rojo 13/22,
      errores acotados 20/22, caché aprovechado 22/22); un **subagente ciego** que solo vio
      `datos/` y `criterios.json` juzgó las 26 (`proporcion_sana` 16 sí / 6 no) y su veredicto se
      guardó con `--veredicto`. Primera pasada: 5 de los 6 «no» eran sesiones sin skill, que el
      criterio no podía juzgar → se añadió `actor.tarea`. Segunda pasada (con `tarea`): 14 sí / 8 no
      en `proporcion_sana`, y el evaluador cazó que la tarea no veía las ediciones por Bash → se
      añadió `acciones.ediciones`. Cada pasada cambió el formato: el lazo de plasticidad funciona.
      Una tercera pasada con el formato final queda lanzada; su veredicto entra como commit aparte.

## Fase 6 — Informe
- [x] **TAR-8 · Informe** (`informe.mjs`, corte por mediana 2026-08-29): por línea y actor, con el
      agregado «(todas)» para que haya base; huecos contados, cobertura desigual declarada.
      **Corregido**: el primer informe comparaba totales por sesión y marcó +237 % de tokens y
      +287 % de duración, que solo decían que las sesiones del segundo periodo eran más largas.
      Ahora la fábrica se compara por intensidad: tokens de salida por llamada +51 %, ms por
      llamada +24 %, errores por herramienta +47 %, y gates rojos por gate corrido **−27 %** (mejora;
      en implementación −95 %).

## Fase 7 — Propuestas
- [x] **TAR-9 · Propuestas** (`propuestas.mjs` → `trayectorias/propuestas/2026-09-13.md`): seis
      propuestas por regresiones de intensidad (salida por llamada, ms por llamada, errores por
      herramienta, gates rojos en lectura), cada una con destino, fuente y «exige CDC»; la lectura
      honesta es «buscar la causa entre periodos», no tocar un skill.
      **Ninguna aplicada**: diff vacío en `AGENTS.md`, skills, routing, `settings.json` y `.mcp.json`;
      entrada en `BITACORA-CDC.md` con aprobación pendiente.
- [x] **TAR-10 · Gates**: `npm run validate` sellado con los pasos nuevos; `verify:gobernanza` 152/152.
