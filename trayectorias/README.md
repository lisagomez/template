# Trayectorias — trazas de ejecución de la fábrica (spec 011)

Una **trayectoria** es la traza de FORMA de una ejecución: qué se pidió (como conteos), qué hizo,
qué costó, qué salió y si acertó. **Nunca contenido**: ni texto de un mensaje, ni un valor de un
documento, ni un nombre de archivo, ni un secreto, ni un identificador del corpus de regresión.
El verificador (`npm run verifica:trayectorias`, dentro de `validate`) lo exige archivo a archivo.
Eso es lo que permite versionar el dataset aquí, en git, sin filtrar a nadie (C4).

## Las tres líneas y cómo capturan

| Línea | Qué es una trayectoria | Cómo se captura |
|---|---|---|
| `fabrica` | Una sesión del arnés: **tarea** deducida de lo que hizo (`planificacion`, `implementacion`, `lectura`, `conversacion`), skills invocados (solo los que existen en `.claude/skills/`; los comandos del arnés como `/compact` o `/model` se cuentan aparte), herramientas por nombre, modelos, tokens con caché (deduplicados por mensaje), turnos, subagentes, errores, gates corridos y su resultado | Hook `SessionEnd` → `.claude/hooks/captura-trayectoria.sh` → `scripts/trayectorias/captura-sesion.mjs`. Históricas: `npm run trayectorias:captura -- --historicas ~/.claude/projects/<proyecto>` |
| `aplicacion` | Una llamada al modelo desde una feature: clase de tarea, modelo pineado, tokens, coste (`null` sin uso), duración, fallo | `conTrayectoria(registrador, emisor)` en `src/lib/ai/trayectorias.ts`, envolviendo el `Registrador` de contabilidad. La app decide dónde emite; `npm run trayectorias:ingesta -- --desde x.jsonl` las trae |
| `herramientas` | Una corrida de medición: documentos, páginas, vías, tiempos por etapa, campos, revisión humana, métricas (pág/min, p50/p95, CER, aciertos, correlación) | `medicion/*.mjs` escribe `trayectoria.json` junto a `resumen.json`; `npm run trayectorias:ingesta` la trae |

El hook en `.claude/settings.json` del repo es un **CDC** (cambia el arnés): el fragmento está en
`hooks.ejemplo.json`. Por máquina va en `.claude/settings.local.json`, sin CDC.

## El lazo, y dónde se corta a propósito

```
captura ─► datos/ ─► evalua (estructural, script) ─┐
                                                   ├─► informe por periodos ─► propuestas ─► ══ CDC (dueña) ══
           subagente o sesión fría (juicio, ciego) ─┘
```

- `npm run trayectorias:evalua`: criterios **estructurales** de `criterios.json`, sin modelo.
  Los criterios **de juicio** los responde un agente distinto del ejecutor que recibe solo las
  trayectorias y los criterios (protocolo ciego de C2); se cargan con `--veredicto RUTA`.
- `npm run trayectorias:informe [-- --corte AAAA-MM-DD]`: compara dos periodos por línea y actor.
  Los huecos no se suman como ceros; una regresión exige 3 por periodo y más del 20 %; con
  cobertura desigual se dice y no se marca. **La fábrica se compara por intensidad** (tokens de
  salida por llamada, ms por llamada, gates rojos por gate corrido, errores por herramienta), no
  por totales de sesión: el primer informe (2026-09-13) marcó cuatro «regresiones» que solo
  decían que las sesiones del segundo periodo eran más largas.
- `npm run trayectorias:propuestas`: redacta propuestas con la señal, el destino y las
  trayectorias que las sostienen. **No aplica nada.** Un skill, una regla, un prompt, el routing
  o el arnés solo cambian por CDC con firma. Automejorado no es autoaprobado.

## Carpetas

- `datos/<linea>/<AAAA-MM>/<id>.json` — el almacén, versionado.
- `criterios.json` — 3 a 6 criterios binarios y ortogonales por línea.
- `evaluaciones/` — `<fecha>-estructural.json` y `<fecha>-juicio.json`.
- `informes/`, `propuestas/` — generados; el verificador también los vigila.

Lo crudo (transcripts, resúmenes de medición, lecturas) se queda fuera de git.
