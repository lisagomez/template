# Plan de orquestación — Estudio de dashboards con agente sobre capa semántica (laboratorio Golfo Norte, datos ficticios)

> Derivado DETERMINISTA del grafo `estudio-dashboards` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1 · ⚡ GRUPOS EN PARALELO

**→ produce `7 CSV crudos fuera de git, fijados por sha256 y regenerables con semilla`**
- ▸ correr script (determinista) · **copiar los CSV fuera de git y fijar sus hashes** (desde Insumos: propuesta, prototipo publicado y proyecto dbt golfo_norte (zip))

**→ produce `Esquema versionado de la especificación del dashboard y de sus parches`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **diseñar la especificación y sus operaciones de parche** (desde Spec del goal (docs/goals/estudio-dashboards.md))
- ◆ spawnear subagente (Sonnet) · **derivar los tipos de componente del prototipo** (desde Insumos: propuesta, prototipo publicado y proyecto dbt golfo_norte (zip))

**Gates al cerrar la fase:**
- ↻ sha256 de los 7 CSV igual al del zip; regenerar con semilla da lo mismo, o se declara no reproducible con sus versiones [gris] — referencia: zip golfo_norte_dbt.zip (sha256 273f07d93ff6c414…) y sus 7 hashes en el spec

## Fase 2

**→ produce `Proyecto dbt en el repo con entorno pineado (lock con hashes) y dbt build verde`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **traer el proyecto dbt y su dialecto** (desde 7 CSV crudos fuera de git, fijados por sha256 y regenerables con semilla)
- ◆ subagente con scripts · **entorno Python pineado con lock y hashes, como la casa** (desde Piezas de la casa: dbt + MetricFlow con lock y hashes (soporte-sap, clinica-dental), routing pineado, contabilidad de tokens, reglas de CLI, empaqueta)

## Fase 3

**→ produce `Catálogo semántico validado (10 modelos, 31 métricas) y cifras de la propuesta reproducidas`**
- ▸ correr script (determinista) · **dbt build, mf validate-configs y mf query de cada cifra** (desde Proyecto dbt en el repo con entorno pineado (lock con hashes) y dbt build verde)

**Gates al cerrar la fase:**
- ↻ dbt build verde: 22 modelos y 45 pruebas, o el conteo real explicado [gris] — referencia: propuesta §Modelado con dbt
- ↻ cada cifra de la propuesta reproducida por mf query y por un conteo directo independiente; una divergencia se explica, nunca se ajusta [gris] — referencia: tablas de la propuesta (foto ene-sep, catálogo, hallazgos, growth por área)

## Fase 4 · ⚡ GRUPOS EN PARALELO

**→ produce `Set de 100 preguntas con respuesta esperada, congelado por hash ANTES del prompt del agente`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **revisor dedicado escribe las 100 preguntas y su respuesta esperada** (desde Catálogo semántico validado (10 modelos, 31 métricas) y cifras de la propuesta reproducidas)
- ◆ spawnear subagente (Sonnet) · **la respuesta esperada se expresa en el esquema** (desde Esquema versionado de la especificación del dashboard y de sus parches)

**→ produce `Núcleo tools/estudio-dashboards (nombre sugerido): puerto semántico, parches validados, versiones, intérprete determinista; sin React, Next ni Supabase`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **puerto semántico: listar, describir, consultar con límites** (desde Catálogo semántico validado (10 modelos, 31 métricas) y cifras de la propuesta reproducidas)
- ◆ spawnear subagente (Sonnet) · **validar parches, versionar, deshacer y comparar** (desde Esquema versionado de la especificación del dashboard y de sus parches)

**Gates al cerrar la fase:**
- ↻ el set queda en un commit anterior a cualquier prompt del agente, con su hash [gris] — referencia: orden de commits en la rama
- ↻ todo parche valida; se rechazan métrica inventada, dimensión inválida, SQL libre y un parche que borra lo que no se pidió [gris] — referencia: esquema versionado y catálogo semántico
- ↻ npm run empaqueta verde: tarball instalado en un proyecto limpio [gris] — referencia: docs/EMPAQUETAR-HERRAMIENTA.md

## Fase 5 · ⚡ GRUPOS EN PARALELO

**→ produce `Motor de señales: detectar y diagnosticar con consultas semánticas, backlog ICE`**
- ◆ subagente con scripts · **detectar y diagnosticar por tienda, cohorte y origen** (desde Núcleo tools/estudio-dashboards (nombre sugerido): puerto semántico, parches validados, versiones, intérprete determinista; sin React, Next ni Supabase)

**→ produce `Agente LLM: herramientas tipadas del núcleo, prompts versionados, modelo pineado`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **bucle de regeneración sobre las herramientas del núcleo** (desde Núcleo tools/estudio-dashboards (nombre sugerido): puerto semántico, parches validados, versiones, intérprete determinista; sin React, Next ni Supabase)
- ◆ subagente con scripts · **modelo pineado, contabilidad de tokens y clase de routing propuesta** (desde Piezas de la casa: dbt + MetricFlow con lock y hashes (soporte-sap, clinica-dental), routing pineado, contabilidad de tokens, reglas de CLI, empaqueta)

**→ produce `El Estudio sobre un segundo catálogo semántico del repo, sin tocar el núcleo`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **cargar otro manifiesto semántico del repo** (desde Núcleo tools/estudio-dashboards (nombre sugerido): puerto semántico, parches validados, versiones, intérprete determinista; sin React, Next ni Supabase)
- ◆ subagente con scripts · **usar la capa de soporte-sap o clinica-dental tal cual** (desde Piezas de la casa: dbt + MetricFlow con lock y hashes (soporte-sap, clinica-dental), routing pineado, contabilidad de tokens, reglas de CLI, empaqueta)

**Gates al cerrar la fase:**
- ↻ reencuentra las 3 señales sembradas sin que se le nombren, y ninguna inventada [gris] — referencia: README del proyecto dbt y scripts/lifecycle.py
- ↻ toda cifra del texto sale de una consulta; sin métrica, lo dice y ofrece proponerla [gris] — referencia: resultados de consultar_metricas de esa misma vuelta
- ↻ diff vacío en el núcleo al cambiar de catálogo [gris] — referencia: git diff del núcleo

## Fase 6 · ⚡ GRUPOS EN PARALELO

**→ produce `Medición del agente contra el set: precisión por nivel y por tipo, gasto y latencia`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ▸ correr script (determinista) · **correr el set por nivel, el barato primero, con tope** (desde Agente LLM: herramientas tipadas del núcleo, prompts versionados, modelo pineado)
- ▸ correr script (determinista) · **puntuar contra la respuesta esperada** (desde Set de 100 preguntas con respuesta esperada, congelado por hash ANTES del prompt del agente)

**→ produce `Lienzo de laboratorio: instrucciones, rejilla, mapa de matriz de puntos con lazo, panel de contexto, señales`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **renderizar la especificación** (desde Núcleo tools/estudio-dashboards (nombre sugerido): puerto semántico, parches validados, versiones, intérprete determinista; sin React, Next ni Supabase)
- ◆ spawnear subagente (Sonnet) · **tarjetas en el mapa y tablero detectar-aprender** (desde Motor de señales: detectar y diagnosticar con consultas semánticas, backlog ICE)
- ◆ spawnear subagente (Sonnet) · **barra de instrucciones y lo que entendió** (desde Agente LLM: herramientas tipadas del núcleo, prompts versionados, modelo pineado)

**→ produce `CLI del Estudio: las mismas herramientas, escrituras en dry-run, lee la capa real`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **exponer las herramientas como CLI** (desde Núcleo tools/estudio-dashboards (nombre sugerido): puerto semántico, parches validados, versiones, intérprete determinista; sin React, Next ni Supabase)
- ◆ subagente con scripts · **subcomando que corre el agente sobre una instrucción** (desde Agente LLM: herramientas tipadas del núcleo, prompts versionados, modelo pineado)
- ◆ subagente con scripts · **subcomando de señales** (desde Motor de señales: detectar y diagnosticar con consultas semánticas, backlog ICE)

**Gates al cerrar la fase:**
- ↻ precisión de al menos 90 % sobre el set, por nivel y por tipo de instrucción [gris] — referencia: KPI de la propuesta
- ↻ gasto de OpenRouter medido antes y después, de US$2 o menos, modelo pineado [gris] — referencia: tope del laboratorio (20/10)
- ↻ regeneración menor a 5 s p95 con caché caliente; consulta semántica menor a 3 s [gris] — referencia: objetivos de servicio de la propuesta
- ↻ sin violaciones serias de accesibilidad, en escritorio y celular [gris] — referencia: axe-core, WCAG 2.2 AA
- ↻ escrituras en dry-run por defecto, misma salida que el núcleo, códigos de salida, nunca inventa; grado no medido hasta puntuarlo [gris] — referencia: AGENTS.md, CLIs: cuatro reglas

## Fase 7

**→ produce `Evidencias: capturas, mediciones, reporte de decisiones, post-mortem`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **recorridos con Playwright, escritorio y celular** (desde Lienzo de laboratorio: instrucciones, rejilla, mapa de matriz de puntos con lazo, panel de contexto, señales)
- ▸ correr script (determinista) · **tablas de precisión, gasto y latencia** (desde Medición del agente contra el set: precisión por nivel y por tipo, gasto y latencia)
- ▸ correr script (determinista) · **recorrido del CLI** (desde CLI del Estudio: las mismas herramientas, escrituras en dry-run, lee la capa real)
- ▸ correr script (determinista) · **tablero válido sobre el segundo catálogo** (desde El Estudio sobre un segundo catálogo semántico del repo, sin tocar el núcleo)

## Fase 8

**→ produce `Propuestas para firmar: CDC (clase de routing, prompts, superficie CLI), README, inventario`**
- ◆ spawnear subagente (Sonnet) · **redactar CDC, README product first e inventario, sin firmar** (desde Evidencias: capturas, mediciones, reporte de decisiones, post-mortem)

**Gates al cerrar la fase:**
- ↻ npm run validate completo verde tras el último commit [gris] — referencia: .claude/gates.json, perfil validate

## Fase 9

**→ produce `Firma del laboratorio (fuera del HECHO del goal)`**
- ⏸ checkpoint de Daniel · **revisar el diff y firmar** (desde Propuestas para firmar: CDC (clase de routing, prompts, superficie CLI), README, inventario)
