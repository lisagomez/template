# @tu-scope/grafo-conocimiento

Motor de reglas de la **spec 004**: responde una pregunta con un veredicto acotado,
`categoría (keywords + exclusiones) → regla → veredicto`, calculado **siempre** por un motor
determinista. Cuando no hay regla, lo dice con una forma que no se puede confundir con una
respuesta.

> **Estado: Fase 6 de PRP-005.** Contrato, selección de dominios, motor en paridad con el de Hermes,
> gate de siembra (`./gate`) y capa de lenguaje natural (`./lenguaje`). Empaquetado y probado en un proyecto
> limpio. Aviso de versión probado (Fase 7). Pendiente: el enrutado desde `AGENTS.md` (Fase 8, CDC). Plan:
> `.claude/PRPs/PRP-005-grafo-de-conocimiento-al-golden-path.md`.

```ts
import conocimiento from '@tu-scope/conocimiento'
import { evaluaSeguro, seleccionaDominios, validaConocimiento } from '@tu-scope/grafo-conocimiento'

const mio = seleccionaDominios(validaConocimiento(conocimiento).conocimiento!, ['mx-drones-de-reparto'])
const r = evaluaSeguro(mio, {
  contexto: { jurisdiccion: 'MX', dimension: 'regulatorio', regimen: 'GENERAL', fecha: '2026-09-27' },
  conceptos: [{ descripcion: 'reparto de paquetes con dron' }],
})
// r.conceptos[0].motivo: 'regla' | 'sin_regla' | 'conflicto' | 'tope_excedido'. Solo 'regla' trae veredicto.
// Si el conocimiento o la pregunta no tienen forma: { tipo, detalle }, que no admite veredicto.
```

## El motor (`src/motor.ts`)

Es el port del motor de Hermes (`evaluador.py`, corte `97d9f9e`): clasificación por la keyword
más larga, sin acentos y con frontera de palabra; exclusiones; vigencia a la **fecha del hecho**;
regla rectora; conflicto; tope. Lo que decide distinto, a propósito y declarado:

- **fail-safe tipado**: sin regla, en conflicto o sobre el tope, `veredicto: null`;
- **empates por clave**, no por el orden de llegada;
- **régimen obligatorio**;
- **`fecha_supuesta`** cuando el hecho no trae fecha.

**Paridad**: sobre la fuente única da las mismas respuestas que el motor de Hermes en los 782
casos del corpus, salvo las 12 firmadas en `@tu-scope/conocimiento` 0.2.0.

## La capa de lenguaje natural (`./lenguaje`)

```ts
import { generateObject } from 'ai'                 // lo trae el proyecto, no este paquete
import { responde } from '@tu-scope/grafo-conocimiento/lenguaje'

const r = await responde('¿Puedo repartir paquetes con un dron?', {
  conocimiento: mio, jurisdiccion: 'MX', regimen: 'GENERAL',
  // El modelo se inyecta: nivel según routing-modelos.json, y el gasto a tu contabilidad.
  estructurador: async ({ instrucciones, texto, esquema }) =>
    (await generateObject({ model, schema: esquema, system: instrucciones, prompt: texto })).object,
})
// r.tipo === 'resultado' → r.texto: la respuesta redactada · r.tipo === 'fallo' → r.texto: por qué no hay respuesta
```

- **El parser solo estructura**: su salida es un esquema estricto **sin campo de veredicto**, y la
  categoría sale de una lista cerrada. Cada `descripcion` tiene que ser un fragmento literal de la
  pregunta, y el motor contrasta la categoría con sus keywords y exclusiones. Si no cuadran:
  `clasificacion_dudosa`, sin veredicto.
- **Parser caído** (error, tiempo o salida sin forma) es `parser_no_disponible`, que no se redacta como
  «no hay regla».
- **El redactor es determinista.** Cita la fuente solo si el dominio es `publica`. En uno `interna` no
  dice de qué regla ni de qué fuente sale, **pero muestra los requisitos y banderas del autor tal cual**:
  no escribas en ellos la fuente.
- **No medido**: la precisión del parser con un modelo real.
- **Sin modelo**: `estructuradorSinModelo(conocimiento, 'MX')` estructura por keywords, de forma determinista y
  gratuita. Entiende oraciones que usan el vocabulario de las reglas; una paráfrasis da «no hay información
  suficiente». Pruébalo: `node ejemplos/pregunta.mjs "¿Puedo devolver unos zapatos?"`.
- **Ejemplo no legal**: `ejemplos/politica-devoluciones.json`, ficticio. Una dimensión puede declarar sus `frases`
  («procede la devolución»), así que el redactor tampoco queda atado a lo legal.

## El contrato (`src/contrato.ts`, `src/valida.ts`)

Los nombres de campo son los del seed de `hermes-os-a2a` a propósito: este paquete será la fuente
única de la que Hermes lea después. Lo que se **añade** es lo que decidió la Fase 0:

| Decisión | En el contrato |
|---|---|
| Vocabulario por dimensión (RF-1) | `Dimension.vocabulario`; un veredicto ajeno no siembra |
| Cita por dominio (RF-5) | `Dominio.cita`: `publica` cita la fuente, `interna` no |
| Solo se añade (RF-14) | sin `_bajas`: se retira cerrando `vigente_hasta`, y un significado nuevo declara `reemplaza` |
| Fail-safe tipado (RF-6) | `ConceptoEvaluado.motivo`; `sin_regla` ⇔ `veredicto: null` |
| Fecha del hecho (RF-13) | `Resultado.contexto.fecha_supuesta` cuando el hecho no la trae |
| Sin veredicto no hay respuesta | `FalloSinVeredicto`: no admite nada con forma de veredicto |

`validaConocimiento(x)` devuelve **problemas tipados** en vez de lanzar: esquema, bajas por
borrado, referencias rotas, veredictos fuera de vocabulario, reemplazos abiertos, **conflictos de
veredicto con vigencias solapadas**, keywords repetidas, cifras sin verificar y categorías sin
dominio.

## La paridad con Hermes (`pruebas/paridad/`)

| Archivo | Qué es |
|---|---|
| `corpus.json` | 782 casos con la salida **exacta** del motor Python de Hermes en el corte `97d9f9e` (compactada sin pérdida: 2,98 MB → 387 KB) |
| `validacion-seed.json` | lo que este contrato dice del seed de ese corte |
| `divergencias.json` | lo que Hermes hace distinto de la Fase 0, declarado con su porqué |

La prueba exige que la validación del seed dé **exactamente** las divergencias declaradas.

Para regenerarlo hace falta un clon de Hermes. Lee motor y seed con `git show` del commit
pineado, comprueba sus sha256, y es determinista:

```bash
npm run paridad:genera -- --hermes ~/code/hermes-os-a2a
```

## Pruebas

```bash
npm run prueba      # contrato (fixtures sintéticos) + integridad del corpus
```
