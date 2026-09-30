# @tu-scope/asesor-ventas

El **cerebro de asesoría de ventas**: de una reunión diarizada saca estrategia. Determinista,
TypeScript puro, **CERO dependencias**, y **sin LLM** — nada sale de la máquina (C4).

## Qué hace

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
< 0.5 se ignora (marcado `[inaudible]` por el STT, nunca inventado). El resultado se cachea por
**contenido** (huella de segmentos, participantes y playbook), no solo por id: reutilizar un id
con otra transcripción da el análisis nuevo, no el anterior.

### Qué no hace

- No llama a ningún modelo de lenguaje ni sale a la red: el núcleo es de reglas (el porqué, en «Por qué sin LLM»).
- No transcribe ni reparte hablantes: recibe los turnos que ya producen `@tu-scope/voz` y `@tu-scope/dictado`.
- No afirma sin evidencia: sin segmento que lo sostenga no hay insight, y el score nunca va sin su desglose.

## Casos de uso

- **Un asesor de ventas, al salir de una reunión de discovery** con un prospecto: el `score` 0-100 con su desglose
  por 8 dimensiones y los huecos con la siguiente-mejor-pregunta para la próxima llamada.
- **Tras una demo, una negociación, una revisión técnica o un cierre** (`TipoReunion`): el playbook del tipo decide qué
  se busca, y las objeciones sin respuesta salen como riesgos con su mitigación.
- **Para el seguimiento**: los próximos pasos detectados como tareas con responsable y fecha textual, y el mapa de
  decisor / influenciador / usuario.
- **En un sector regulado**: las palabras del prospecto (un tercero) no salen de la máquina, que es lo que lo hace
  vendible ahí (C4).
- **Dentro del template**: el laboratorio de voz lo corre sobre reuniones diarizadas
  (`src/features/laboratorio-voz/services/asesor.ts`).

## Requerimientos de infraestructura

- **Runtime**: Node `>=20` (`engines`). Cero dependencias.
- **Dependencias del sistema**: ninguna. La entrada (turnos con hablante) la produce un transcriptor con diarización,
  como `dictado lote`, que trae las suyas.
- **CPU, GPU y memoria**: no medido. Sin modelos ni GPU: reglas en TypeScript.
- **Servicios externos**: ninguno.
- **Variables de entorno**: ninguna.
- **Almacenamiento**: nada en disco. El cache de análisis vive en la memoria del proceso, por huella del contenido.
- **Salida del perímetro (C4)**: nada sale de la máquina: sin LLM y sin red. Un enriquecimiento por LLM exigiría
  AISIA firmada y seudonimización o pesos autohospedados, y no vive en este núcleo.

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
