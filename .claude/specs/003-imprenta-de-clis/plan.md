# Plan 003 — La imprenta de CLIs

> **Plan RETROSPECTIVO.** Construido y con CDC firmado. Reconstruye la arquitectura
> resultante, verificada contra el repo el 2026-08-30. La restricción que define esta
> spec: **aquí no se imprime nada** — viaja el contrato, el auditor, la medición y las
> reglas; imprimir es acción de un proyecto derivado en su máquina.

## Módulos

| Módulo | Dónde vive | Responsabilidad |
|---|---|---|
| Manifiesto | `.claude/imprenta/manifiesto.json` | Contrato CLI ↔ servicio del golden path, con fuente de verdad y vertical |
| Medición | `.claude/imprenta/medicion-mcp.json` | Coste real en contexto de los servidores MCP declarados |
| Auditor | `scripts/audita-imprenta.mjs` | Dice qué falta y **declara su fuente**: `libreria \| indice \| ninguna` |
| Prueba | `scripts/prueba-imprenta.mjs` | Control negativo del auditor |
| Skill | `.claude/skills/cli-audit/SKILL.md` | Superficie conversacional del auditor |
| Reglas inline | `AGENTS.md` (escalera CLI-first + cuatro reglas) | Lo que dispara en el momento de decidir |
| Profundidad | `docs/SDD-imprenta-de-clis.md` | Lo que no cabe en las instrucciones |

## Decisiones, con la alternativa descartada

1. **El auditor declara su fuente y admite no saber.** Sin librería ni índice poblado,
   dice `fuente_impresos: ninguna`, no "0 faltantes". **Descartado**: reportar cero cuando
   no hay nada que mirar — es el mismo modo de falla que el exit `2` del vigilante y el
   coste `null` de la contabilidad. Tres sitios, un solo principio.

2. **El "~100x" del material de origen se midió, no se repitió.** Resultado: los 9
   servidores MCP declarados cuestan **20.363 tokens por sesión** (medido; 5 servidores,
   4 sin medir, así que el real es mayor). La afirmación de origen quedó **refutada** en
   su forma "100x". **Descartado**: citar la cifra heredada — una cifra bonita sin fuente
   es peor que un hueco declarado.

3. **La escalera CLI-first tiene cuatro peldaños y la pregunta del modelo es la última.**
   ¿Hay CLI? → ¿existe publicado? → ¿conviene imprimir (3+ repeticiones)? → resolver con
   el modelo. **Descartado**: preguntar primero qué modelo usar.

4. **Instalar de la librería pública es adoptar un CLI NO medido.** Su registro no publica
   grados. **Descartado**: tratar "publicado" como "aprobado" — sin grado no es aprobado,
   es no medido.

5. **Las cuatro reglas van inline en `AGENTS.md`, no en un runbook.** La lección de 001,
   aplicada antes de que costara caro otra vez.

6. **Imprimir un CLI es un CDC.** Cambia la superficie de herramientas del agente:
   no es una decisión autónoma por presupuesto.

## Cobertura de la DEFINICIÓN DE HECHO

| DoF | Qué lo cubre | Estado |
|---|---|---|
| 1. `validate` verde | Gate completo | ⚠️ no corre aquí (`node_modules/` vacío) |
| 2. Manifiesto completo | `.claude/imprenta/manifiesto.json` | ✅ el verificador comprueba que existe |
| 3. Auditor corriendo y diciendo la verdad | `npm run audita:imprenta` | ✅ verde 2026-08-30 |
| 4. Control negativo del auditor | `scripts/prueba-imprenta.mjs` | ✅ verde 2026-08-30 |
| 5. Medición con método y margen | `.claude/imprenta/medicion-mcp.json` | ✅ 20.363 tok/sesión, 4 sin medir declarados |
| 6. Coste de la propia palanca | `npm run mide:contexto` | ✅ dentro de presupuesto |
| 7. Cuatro reglas inline + control negativo | `AGENTS.md`, `GEMINI.md` | ✅ 4 comprobaciones del verificador |
| 8. Entrada firmada | `BITACORA-CDC.md` | ✅ |

## Estrategia de gates

`audita:imprenta` y `prueba:imprenta` entran en `validate` y en `predeploy`. Corren **sin
red, sin Go y sin credenciales** — requisito de boilerplate, cumplido: ambos dieron verde
en esta máquina, que no tiene ninguna de las tres cosas conectadas al gate.

## Nota de entorno

La memoria del proyecto registra que **esta máquina sí imprime** (Go 1.26.7, 5 CLIs en
librería). Eso es del entorno, no del template: el repo sigue sin traer binarios y no debe
traerlos.
