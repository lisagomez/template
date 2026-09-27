# @tu-scope/grafo-conocimiento

Motor de reglas de la **spec 004**: responde una pregunta con un veredicto acotado,
`categoría (keywords + exclusiones) → regla → veredicto`, calculado **siempre** por un motor
determinista. Cuando no hay regla, lo dice con una forma que no se puede confundir con una
respuesta.

> **Estado: Fase 3 de PRP-005.** Contrato, selección de dominios y **motor**, en paridad con el de
> Hermes. Pendiente: el gate de siembra (Fase 4) y la capa de lenguaje natural (Fase 5). Plan:
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
