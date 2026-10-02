# Plan de orquestación — Analista de producto — rol con contrato A2A: dolores con evidencia, casos de uso por categoria y propuestas product first

> Derivado DETERMINISTA del grafo `analista-producto` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1 · ⚡ GRUPOS EN PARALELO

**→ produce `docs/SDD-<nombre>.md: pipeline, regla de evidencia, contrato, estados, que NO se construye`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **disenar el rol leyendo el borrador como hipotesis** (desde Spec: pedido, decision del laboratorio e hipotesis H1-H6 del borrador)
- ◆ spawnear subagente (Sonnet) · **anclar el diseno en los activos reales** (desde inventario/activos.json (38 activos, 229 unidades, gate verifica:inventario))
- ◆ spawnear subagente (Sonnet) · **verificar que fuentes existen y que dan** (desde Fuentes: contratos por producto, registros de gobernanza, specs/PRPs/SDD/goals, trayectorias, git y PR, padron de gates)

**→ produce `Cifras de los medidores, cada una con su comando (null, nunca cero)`**
- ▸ correr script (determinista) · **correr los medidores** (desde Fuentes: contratos por producto, registros de gobernanza, specs/PRPs/SDD/goals, trayectorias, git y PR, padron de gates)

**Gates al cerrar la fase:**
- ↻ cada cifra con su comando [gris] — referencia: 0 cifras sin comando; dato ausente = null

## Fase 2

**→ produce `PRP-008: fase 1 (skill + contrato + corrida) y fase 2 A2A viva planeada con sus gates`**
- ◆ spawnear subagente (Sonnet) · **planear por fases; la A2A viva con su gate** (desde docs/SDD-<nombre>.md: pipeline, regla de evidencia, contrato, estados, que NO se construye)

**Gates al cerrar la fase:**
- ↻ spec o PRP, nunca los dos [gris] — referencia: PRP directo (QUE acordado); handoffs de candidatos solo recomendados

## Fase 3 · ⚡ GRUPOS EN PARALELO

**→ produce `Skill del rol (solo lectura; escribe solo en docs/analisis/)`**
- ◆ spawnear subagente (Sonnet) · **escribir el skill** (desde PRP-008: fase 1 (skill + contrato + corrida) y fase 2 A2A viva planeada con sus gates)

**→ produce `Agent Card + estados de Task tipados con @a2a-js/sdk 1.1.0, con prueba, NO servidos`**
- ◆ subagente con scripts · **Agent Card con tipos del SDK + prueba** (desde PRP-008: fase 1 (skill + contrato + corrida) y fase 2 A2A viva planeada con sus gates)

**→ produce `Comparador determinista de evidencia con --prueba que tumba siembras`**
- ◆ subagente con scripts · **construir el comparador de evidencia** (desde PRP-008: fase 1 (skill + contrato + corrida) y fase 2 A2A viva planeada con sus gates)

**Gates al cerrar la fase:**
- ↻ contrato tipado y no servido [gris] — referencia: typecheck + prueba en verde; 0 rutas nuevas en src/app

## Fase 4 · ⚡ GRUPOS EN PARALELO

**→ produce `Contrato capa A del skill en golden-sets/contratos.json`**
- ◆ spawnear subagente (Sonnet) · **declarar su contrato capa A** (desde Skill del rol (solo lectura; escribe solo en docs/analisis/))

**→ produce `Hallazgos con cita graduada + hipotesis aparte (fechado, formato de maquina)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **primera corrida del skill: detectar y citar** (desde Skill del rol (solo lectura; escribe solo en docs/analisis/))
- ▸ correr script (determinista) · **cobertura: cada activo PRODUCTO revisado** (desde inventario/activos.json (38 activos, 229 unidades, gate verifica:inventario))
- ▸ correr script (determinista) · **las cifras entran por script, no por el modelo** (desde Cifras de los medidores, cada una con su comando (null, nunca cero))
- ◆ spawnear subagente (Sonnet) · **leer las fuentes y citar** (desde Fuentes: contratos por producto, registros de gobernanza, specs/PRPs/SDD/goals, trayectorias, git y PR, padron de gates)
- ▸ correr script (determinista) · **validar cada cita; sin cita = hipotesis** (desde Comparador determinista de evidencia con --prueba que tumba siembras)

**Gates al cerrar la fase:**
- ↻ ningun hallazgo sin cita verificada [gris] — referencia: verificador en verde; lo no citado en hipotesis; --prueba tumba todas las siembras
- ↻ ausente no es cero [gris] — referencia: N/N activos PRODUCTO (y FABRICA con usuario) revisados; sin dolor = dicho

## Fase 5

**→ produce `Casos de uso por categoria: quien, cuando, que intenta, que lo impide, cuanto cuesta`**
- ◆ spawnear subagente (Sonnet) · **agrupar por categoria** (desde Hallazgos con cita graduada + hipotesis aparte (fechado, formato de maquina))

## Fase 6

**→ produce `Ranking con vetos C3/C4 aparte`**
- ◆ spawnear subagente (Sonnet) · **puntuar y vetar C3/C4** (desde Casos de uso por categoria: quien, cuando, que intenta, que lo impide, cuanto cuesta)

**Gates al cerrar la fase:**
- ↻ C3/C4 vetan, no ponderan [gris] — referencia: vetados aparte con motivo; ninguno en el ranking

## Fase 7

**→ produce `One-pagers product first + handoff recomendado (no ejecutado)`**
- ◆ spawnear subagente (Sonnet) · **one-pager product first por candidato** (desde Ranking con vetos C3/C4 aparte)

**Gates al cerrar la fase:**
- ↻ product first verificable [gris] — referencia: usuario, tarea y coste antes de la tecnologia; >=1 TPL-* existente o motivo

## Fase 8

**→ produce `docs/analisis/<fecha>/ para el laboratorio, con veredicto de H1-H6`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **redactar para el laboratorio** (desde One-pagers product first + handoff recomendado (no ejecutado))
- ◆ spawnear subagente (Sonnet) · **veredicto de H1-H6 con cita** (desde Spec: pedido, decision del laboratorio e hipotesis H1-H6 del borrador)

**Gates al cerrar la fase:**
- ↻ H1-H6 con veredicto [gris] — referencia: 6/6 confirmada | refutada | sin evidencia, con cita

## Fase 9

**→ produce `Propuesta CDC: diff completo + bitacora con firma en hueco`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **diff del skill + clase de routing + cuenta de skills** (desde Skill del rol (solo lectura; escribe solo en docs/analisis/))
- ◆ subagente con scripts · **diff del contrato** (desde Agent Card + estados de Task tipados con @a2a-js/sdk 1.1.0, con prueba, NO servidos)
- ◆ subagente con scripts · **diff del contrato capa A** (desde Contrato capa A del skill en golden-sets/contratos.json)
- ◆ subagente con scripts · **gate propuesto, sin aplicar** (desde Comparador determinista de evidencia con --prueba que tumba siembras)
- ◆ subagente con scripts · **la primera corrida es la evidencia del CDC** (desde docs/analisis/<fecha>/ para el laboratorio, con veredicto de H1-H6)

**Gates al cerrar la fase:**
- ↻ gate completo y firma en hueco [gris] — referencia: validate en verde tras commit; regresion; verify:gobernanza con 28 skills; aprobacion humana sin marcar
