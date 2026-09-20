# @tu-scope/asesor-ventas

El **cerebro de asesoría de ventas**: de una reunión diarizada saca estrategia. Determinista,
TypeScript puro, **CERO dependencias**, y **sin LLM** — nada sale de la máquina (C4).

Entra una `Reunion` + `Transcripcion` (turnos `Segmento[]` con hablante, texto y confianza —
exactamente lo que producen `@tu-scope/voz` y `@tu-scope/dictado`). Sale un `AnalisisReunion`:

| Salida | Qué es |
|---|---|
| `insights[]` | pains, objeciones, señales de compra, presupuesto, urgencia… **cada uno cita su evidencia** (segmento). Sin evidencia no hay insight. |
| `score` | `ScoreDiscovery` 0-100 con desglose por 8 dimensiones, huecos con la siguiente-mejor-pregunta, y conducta (ratio de habla, preguntas abiertas). Nunca se muestra sin su desglose. |
| `acciones[]` | próximos pasos detectados → tareas con responsable y fecha textual. |
| `riesgos[]` | proceso desconocido, sin presupuesto, objeción sin respuesta, discovery incompleto… con mitigación. |
| `stakeholders[]` | mapa decisor / influenciador / usuario. |

Regla de oro: **mismo input → mismo output → mismo porqué.** No adivina: un turno con confianza
< 0.5 se ignora (marcado `[inaudible]` por el STT, nunca inventado).

## Uso

```ts
import { analizarReunion, playbookPorTipo } from '@tu-scope/asesor-ventas';

const pb = playbookPorTipo(reunion.tipoReunion);      // discovery | demo | negociacion | ...
const analisis = analizarReunion(reunion, transcripcion, pb);

console.log(analisis.score.total, '/100');
for (const h of analisis.score.huecos) console.log('preguntar:', h.preguntaSugerida);
```

La `Transcripcion` se arma con la salida de `@tu-scope/dictado` (`dictado lote` da turnos
diarizados: hablante + texto + tiempos); el `hablante` debe coincidir con un `Participante`
para que el motor sepa qué es del cliente y qué del asesor.

## Por qué sin LLM (y qué viene después)

El transcript contiene las palabras del **prospecto** (un tercero). Mandarlo a un LLM alojado
es un riesgo infirmable (C4/C5): ninguna firma lo autoriza. Por eso el núcleo es **de reglas**
y no llama a ningún modelo — es lo que hace vendible el producto a sectores regulados. Un
enriquecimiento por LLM es una capa posterior, detrás de una AISIA firmada y con seudonimización
o pesos auto-hospedados; **no** vive en este núcleo.

Origen: el motor está adaptado de `hermes-os-a2a` (`features/insights/engine`), hecho núcleo
reutilizable y sin dependencias.

## Instalar

```bash
npm install <ruta>/tools/asesor-ventas/tu-scope-asesor-ventas-0.1.0.tgz
```

## Comandos

```bash
npm run build    # tsc → dist/
npm run prueba   # node --test pruebas/*.ts (sin red, sin modelos)
```
