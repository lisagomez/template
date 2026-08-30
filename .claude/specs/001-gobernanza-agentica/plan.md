# Plan 001 — Capa de gobernanza agéntica

> **Plan RETROSPECTIVO.** Esta spec ya está construida y con CDC firmado (2026-08-23).
> Este documento **no guió** la construcción: reconstruye la arquitectura que resultó,
> verificada contra el repo el 2026-08-30. Existe para entender lo que hay sin releer
> 247 líneas de spec, y para que el siguiente cambio no vuelva a decidirlo desde cero.
> Todo lo que se afirma aquí se verificó en disco; lo no verificado va marcado.

## Módulos

| Módulo | Dónde vive | Responsabilidad |
|---|---|---|
| Documento núcleo | `.claude/gobernanza/GOBERNANZA.md` | Los siete controles C1–C7 y los tres huecos que cierran |
| Registro de cambios | `.claude/gobernanza/BITACORA-CDC.md` | C1: una entrada por cambio de comportamiento. Append-only |
| Registro de riesgo | `.claude/gobernanza/REGISTRO-RIESGO.md` | C5: riesgos aceptados con firma. Append-only |
| Registro de incidentes | `.claude/gobernanza/INCIDENTES.md` | C6: incidentes y su cierre con caso de regresión |
| Plantillas | `.claude/gobernanza/plantillas/{aisia,incidente,modelo-amenazas}.md` | C3, C4, C6: el formato que se copia por proyecto |
| Corpus de regresión | `.claude/gobernanza/golden-sets/` | C2: contratos (capa A) y casos-trampa (capa B) |
| Verificador | `scripts/verifica-gobernanza.mjs` | El control que impide que papel y código diverjan |
| Cableado | `AGENTS.md` (decision tree, Reglas de Código), `.claude/PRPs/prp-base.md` | Lo que hace que los controles **disparen** |

## Decisiones, con la alternativa descartada

1. **Varios documentos, no uno solo.** La spec pedía originalmente "un solo documento" y
   dejó la decisión abierta en LIBERTAD TECNICA. Resultó en documento núcleo + registros
   separados + plantillas sueltas. **Descartado**: el documento único — las plantillas se
   copian por proyecto y los registros son append-only con vidas distintas; fundirlos
   obliga a versionar juntos cosas que cambian a ritmos distintos.

2. **Las reglas que obligan viven inline en `AGENTS.md`, no en `GOBERNANZA.md`.** Es la
   decisión más importante de esta capa y no estaba en la spec: salió de medir. La capa B
   mostró que C7 y C4 disparaban y **C1 y C5 no**, porque estos vivían solo en el
   documento. **Descartado**: dejar los siete controles solo en `GOBERNANZA.md` — un
   control escrito solo en el documento no dispara. Está registrado en
   `.claude/rules/aprendizajes-gobernanza.md`.

3. **Verificador en Node puro (`.mjs`), no en el pipeline de TypeScript.** Corre sin
   `node_modules`, sin red y sin credenciales. **Descartado**: un test de la suite del
   proyecto — habría atado el gate de gobernanza a que el stack compile.

4. **El gate entra en `predeploy`, no solo en `validate` manual.** **Descartado**:
   confiar en que alguien lo corra. Si depende de que alguien se acuerde, es costumbre.

## Cobertura de la DEFINICIÓN DE HECHO

| DoF | Qué lo cubre | Estado |
|---|---|---|
| 1. La capa existe | `.claude/gobernanza/` con 4 registros + 3 plantillas + golden-sets | ✅ verificado en disco |
| 2. Los 7 controles cubiertos | `GOBERNANZA.md` §C1–C7 | ✅ el verificador lo comprueba |
| 3. Está cableada | Decision tree y Reglas de Código de `AGENTS.md`; secciones de `prp-base.md` | ✅ comprobaciones del verificador |
| 4. Plantillas probadas con caso real | AISIA sobre el propio template; entrada firmada en `REGISTRO-RIESGO.md` | ⚠️ no releído en esta pasada |
| 5. El verificador pasa | `npm run verify:gobernanza` → **136/136** | ✅ corrido 2026-08-30 |
| 6. Control negativo | Romper un cable → rojo → restaurar → verde | ⚠️ hecho en su sesión; no repetido hoy |
| 7. Trazabilidad del destilado | `.claude/memory/reference/material-origen-gobernanza.md` | ✅ existe |
| 8–9. Reporte y autocrítica | Entrada de CDC del 2026-08-23 | ✅ en bitácora |

## Estrategia de gates

`npm run verify:gobernanza` (136 comprobaciones) + `npm run regresion` capa A (contratos)
y capa B (`--trampa`, casos adversariales). Ambas entran en `npm run validate` y en
`predeploy`. El principio que las ordena: **control negativo obligatorio** — toda
comprobación se prueba también rompiéndola a propósito.

## Lo que este plan NO cierra

La deuda declarada en su CDC sigue siendo suya, no de este documento: la capa B se mide en
sesiones frías y su cobertura es parcial por diseño.
