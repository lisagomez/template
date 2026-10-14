# Propuestas de CDC (C1) — crecimiento demostrado

> Redactadas el 2026-10-02; puestas al día el 2026-10-14. **El CDC-0 se firma ahora** y su entrada,
> abajo, se pega en `.claude/gobernanza/BITACORA-CDC.md` cuando el laboratorio firme (entonces se
> borra de aquí). **El CDC-1 sigue siendo propuesta**: se aplica con diff, `npm run regresion`, la
> medición con un LLM real y su propia entrada firmada.

## CDC-0 · Los 3 prompts entran apagados y el gate de Lean, inactivo (entrada para la bitácora)

### 2026-10-14 — crecimiento demostrado: 3 prompts entran apagados + gate de Lean inactivo — radio: producto (paquete `@tu-scope/crecimiento-demostrado`, app `/crecimiento`) y padrón de gates

- **Cambio** (rama `crecimiento/demostrado`, construida el 2026-10-02 y puesta al día con `main` el 2026-10-14):
  1. **Prompts nuevos, APAGADOS**, en `tools/crecimiento-demostrado/src/agentes/llm.ts` (sha256 `b377eecaa88ff8d5…`):
     - `PROMPT_PLAN`: el planificador. Solo un vocabulario cerrado de 6 consultas, nunca SQL, y no calcula nada;
     - `PROMPT_DERIVACION`: el proponente de Γ ⊢ φ. Solo las reglas y los teoremas del kernel, solo hechos de la
       lista con su valor exacto, todos los supuestos declarados, y toda causa es una hipótesis con su experimento;
     - `PROMPT_NARRACION`: el narrador. Solo las cifras de la respuesta verificada, con su formato, y sin causas
       salvo que la respuesta sea una hipótesis.

     **Nadie inyecta un modelo**: `ProponenteLLM` y `NarradorLLM` responden «no medido», y su único uso es la
     trampa `llm-sin-llave` del laboratorio. **Ninguna clase nueva en el routing.**
  2. **`.claude/gates.json`: `prueba:lean-crecimiento` declarado INACTIVO** (`bash tools/crecimiento-demostrado/lean/comprueba.sh`).
     - `motivo`: el toolchain de Lean (unos 900 MB) no está en todas las máquinas ni en CI, y sin él el script
       sale con 2 («no medido»).
     - `falta`: instalar Lean 4.34.1 donde corra el gate, contra `lean/toolchain.sha256`. Hasta entonces, a mano.
     - **Corrección de la propuesta del 2026-10-02**: decía que la prueba de estructura detecta si el teorema y el
       kernel divergen. **No es así**: nada en `prueba:tools` compara el enunciado de Lean con el del kernel. Lo que
       sí vigila es que el kernel exija las hipótesis de cada teorema (las siembras de `kernel/teoremas`).
- **Motivo**: C1 pide CDC para un prompt nuevo aunque esté apagado (precedente: el redactor de pymes, 2026-09-27).
  Encenderlo es el CDC-1, aparte: dos clases de routing, la medición con un LLM real y la decisión C4 de qué sale
  al proveedor. El gate de Lean se declara para que su ausencia se vea en `npm run gates`.
- **Qué hace que los prompts no basten solos** (en código y probado con agentes simulados):
  - el plan pasa por su esquema: vocabulario cerrado, sin SQL;
  - un kernel sin LLM verifica cada paso de la derivación y rechaza lo que no se deriva;
  - la inclusión de números bloquea una narración con una cifra que no esté verificada;
  - Γ, el texto y A2A llevan seudónimos HMAC, nunca RFC ni nombre;
  - toda acción sale como propuesta para una persona; ninguna se ejecuta.
- **Estado del LLM** (2026-10-14): **NO MEDIDO, a propósito** (decisión del laboratorio del 2026-10-02: agentes
  simulados). Con simulados: 53/53 pruebas de la herramienta, 19/19 trampas, 12/12 snapshots sucios, puente igual
  a la verdad plantada en 60/60 filas, 19/19 siembras tumbadas y replay idéntico entre procesos. Lean 4.34.1
  comprueba `Puente.lean` hoy (a mano).
- **Gate aplicado** (2026-10-14, tras la mezcla con `main`):
  - diff revisado ☐ (arriba, para el laboratorio);
  - regresión capa A ☑ 163/163;
  - `verifica:routing` ☑ coherente (sin clases nuevas);
  - `verifica:gates` ☑ 11 comprobaciones; 35 activos y 10 inactivos con motivo;
  - aprobación humana ☐;
  - pineo ☑ (sin modelo ni dependencia nueva; Lean pineado en `lean-toolchain`);
  - capa B no corrida por el agente: no toca skills ni instrucciones del arnés, y leer la rama `golden-sets`
    contamina las corridas en frío; decide el laboratorio («capa A basta» o corrida en sesión limpia) ☐.
- **Regresión**: `npm run validate` ☑ VALIDATE_PENDIENTE.
- **Aprobado por**: pendiente

## CDC-1 · Dos clases de routing para activar el LLM real

Hoy los agentes son simulados (decisión del laboratorio) y el adaptador real dice «no medido».
Activarlo pide dos clases nuevas en `.claude/routing-modelos.json`.

| Clase | Nivel | Por qué ese nivel |
|---|---|---|
| `propuesta-de-derivacion` | `capaz` | Planea y arma derivaciones Γ ⊢ φ. **No decide**: el kernel sin LLM verifica cada paso y rechaza lo que no se deriva, así que un error se vuelve un reintento, no una cifra falsa. No entra a `no_se_abaratan`, porque el riesgo ya lo absorbe el kernel. |
| `narracion-verificada` | `ligero` | Redacta un texto cuyas cifras pasan la inclusión de números; una cifra mal puesta se bloquea. El acierto se verifica de un vistazo, que es la definición del nivel. |

**La medición que falta**, sin la cual el producto sigue «no medido»:
- la tasa de aceptación al primer intento;
- los intentos por respuesta;
- la tasa de narraciones bloqueadas, con el adversario apagado;
- el costo por respuesta, en la contabilidad (coste `null` si el proveedor no da el uso).

**Antes de una corrida real**, el aprendizaje del goal SGI: comprobar la llave **y** el saldo,
enmascarados, y poner un tope.

**Los prompts que se activan** (`src/agentes/llm.ts`): `PROMPT_PLAN`, `PROMPT_DERIVACION` y
`PROMPT_NARRACION`. Son parte de este CDC.

**C4:** con un LLM real, el plan y los hechos agregados (seudonimizados) salen al proveedor. Ver
la AISIA en `src/features/crecimiento-demostrado/BUSINESS_LOGIC.md` §6.

## CDC-2 · El gate de Lean

Aplicado dentro del CDC-0 (2026-10-14), como gate **inactivo** con su motivo y lo que le falta.

## Fuera de C1, pero del mismo paquete

- **Extractor documental** (otro producto, firma pendiente): leer `CfdiRelacionados`
  (TipoRelacion + UUID) e `InformacionGlobal` (Periodicidad, Meses, Año) en `leeCfdi40`. Hoy van a
  `noLeido` (comprobado el 2026-10-14), y su skill A2A no los devuelve. Aquí se leen con su mismo analizador XML.
- **ERP:** la cola `sis_propuesta` (migración 008, D-42) no existe. La propuesta sale con su forma
  y nadie la encola.
