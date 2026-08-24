# La imprenta de CLIs — Spec

> Compilado por `/goal-compiler` el 2026-08-24 desde `impresioncli.md` (el sistema de
> Printing Press de Hermes OS / businessos), alineado con este template.
> **Forma: LOOP.** Manifiesto, auditor, medicion, reglas y cableado comparten el contexto
> del repo y cierran con el mismo gate; colapsarlos en un solo agente no pierde nada.
> Grafearlo seria teatro de complejidad.

## MISION

Que este boilerplate traiga la **tercera palanca de eficiencia** —hermana del routing y del
cache de prefijo— y que llegue con la misma disciplina que las otras dos: **medida, no
afirmada**.

La palanca: un agente que necesita hablar con un servicio puede cargar un **MCP** (cuyas
definiciones de herramientas se pagan en el contexto de **cada sesion**, existan o no
llamadas) o invocar un **CLI impreso** por `bash` (cuyo coste es el `--help` que pida, y
solo cuando lo pida). El material de origen afirma **~100x menos tokens**. En este repo esa
cifra **no se repite: se mide o se declara desconocida**. Ya hay un precedente vivo — el
skill `google-workspace` usa el CLI `gog` y no un MCP, y nadie ha medido nunca cuanto ahorra.

Al terminar, un proyecto que nazca de aqui hereda cuatro cosas que hoy no existen:

**1. Un contrato de que CLI corresponde a que servicio.** Un manifiesto que mapea cada CLI
a la **skill y el servicio del golden path** que lo necesita (no a las "fases 0-5" de otro
proyecto: aqui no existen), con su fuente de verdad —el OpenAPI o la doc de la que se
imprime—, su vertical de datos y si su conexion esta **gateada** por un control.

**2. Un auditor que dice que falta, y que NUNCA aparenta saber lo que no sabe.** La libreria
de binarios vive solo en la maquina que imprime; este repo no la tiene y no debe tenerla. El
auditor lee un **indice versionado** (`slug → grade`) y **declara su fuente**:
`libreria | indice | ninguna`. Un auditor que reporta "0 faltantes" porque no encontro nada
que mirar es exactamente el modo de falla que esta capa persigue en otros tres sitios (el
exit `2` del vigilante, el coste `null` de la contabilidad, el RPO/RTO sin GATE 3).

**3. El ahorro, medido con metodo declarado.** Cuanto contexto cuestan de verdad los **9
servidores MCP** que declara `.claude/example.mcp.json` frente al equivalente por CLI. Si
una parte no se puede medir aqui, se dice cual y por que; **una cifra bonita sin fuente es
peor que un hueco declarado**.

**4. Las cuatro reglas de seguridad, donde disparan.** Dry-run por defecto · lo que mueve
dinero marcado como destructivo · anti-reimplementacion (un CLI llama a la API real o lee
del store local, jamas inventa una respuesta) · grade A antes de produccion. **Inline en las
instrucciones**, no en un runbook: la leccion de que un control escrito solo en el documento
no dispara ya costo cara una vez.

## LIBERTAD TECNICA

Tu eliges el formato del manifiesto, el lenguaje del auditor, como mides tokens y como se
estructura el indice. Lo que aparece aqui —YAML, Python, `slug → grade`— viene del material
de origen y es **sugerencia descartable** salvo la seccion RESTRICCIONES. El repo ya tiene
sus propias herramientas de medicion y de gate: reusarlas es mejor que traer un stack nuevo.

Dos advertencias que no son stack, son fisica del problema:

- **Comparar un MCP con un CLI no es comparar dos numeros.** El MCP se paga aunque no se
  use; el CLI se paga cuando se invoca, pero puede pagarse **varias veces** si el agente
  relee el `--help` en cada turno. Declara que estas midiendo, o el resultado favorecera a
  quien te caiga mejor.
- **La palanca no es gratis.** El manifiesto, las reglas y el runbook tambien entran al
  contexto. `CLAUDE.md` ya va al **88 %** de su presupuesto: mide lo que engorda esto y, si
  no cabe, la profundidad va a `docs/`, no a las instrucciones.

## INVESTIGA ANTES DE CONSTRUIR

Antes de decidir el enfoque, mira **como se paga de verdad un MCP en contexto**: arranca uno
de los servidores declarados en `.claude/example.mcp.json` por stdio, pidele `tools/list` y
cuenta los tokens de los esquemas que devuelve. Ese numero, y no una estimacion, es la mitad
izquierda de la comparacion. Mira tambien el precedente que ya vive en el repo: el skill
`google-workspace` con `gog`, y la nota de `example.mcp.json` que explica por que ese MCP se
retiro.

Y lee el material de origen tal como esta —`/mnt/c/Users/USER/Downloads/impresioncli.md`—
**con la desconfianza que este repo ya se gano el derecho a tener**: la capa B de la
verificacion de Hermes encontro **cuatro afirmaciones falsas** en un runbook heredado del
mismo proyecto. Lo que no puedas verificar, se marca como afirmacion de origen, no como
hecho.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

1. **`npm run validate` en verde**, con su salida pegada, incluyendo el gate nuevo.
2. **Manifiesto completo**: cada servicio del golden path que hoy tiene MCP o CLI aparece
   mapeado, con fuente de verdad y vertical. Ninguno sin asignar, y los que estan **gateados**
   (canal de chat: C3+C4; lo que mueve dinero: gate humano) marcados como tales.
3. **El auditor corriendo, con su salida pegada**, declarando `fuente_impresos: ninguna` en
   esta maquina — y **diciendo la verdad**: sin libreria y sin indice poblado, lo honesto es
   "no puedo saberlo", no "0 faltantes".
4. **Control negativo del auditor**: falsifica el indice (un CLI declarado impreso que no
   existe, o un servicio del manifiesto sin entrada) → el gate en **rojo**, salida pegada;
   revierte → verde. Sin esto el gate no esta verificado.
5. **La medicion, con metodo y margen**: tabla de tokens por servidor MCP (los que se puedan
   arrancar aqui) frente al coste por CLI, el ratio resultante, y una frase explicita sobre
   **que parte del "~100x" queda confirmada, cual refutada y cual sin medir**. Si el numero
   real es otro, se escribe el real.
6. **Coste de la propia palanca**: delta del presupuesto de contexto antes/despues, medido
   con `npm run mide:contexto`, y el gate en verde.
7. **Las cuatro reglas inline** en `AGENTS.md` y `GEMINI.md`, con **control negativo** de que
   el verificador se pone rojo al borrarlas.
8. **Entrada firmada en `.claude/gobernanza/BITACORA-CDC.md`** con el gate aplicado y los
   controles negativos, y memoria del proyecto actualizada.
9. **Lista de las formas en que esto podria estar mal o incompleto**, y resuelvelas.

## COMANDO DE VALIDACION

```bash
npm run validate
```

Correlo tras cada cambio grande y **surfea su salida**. El gate nuevo entra ahi dentro: si
lo que añades no cabe en `validate`, es que no es un gate. Y tiene que seguir corriendo
**sin red, sin Go y sin credenciales** — es un boilerplate.

## RESTRICCIONES REALES

- **Es un boilerplate: aqui no se imprime nada.** No hay Go y no lo va a haber. Lo que viaja
  es el **contrato, el auditor, la medicion y las reglas**; imprimir, mejorar y regenerar el
  indice son acciones de un proyecto derivado en su maquina. No inventes un camino de
  impresion que este repo no pueda ejecutar ni probar.
- **`service_role` no llega al agente.** El CLI de Supabase del origen lleva auth dual-header
  con `service_role`, que tiene **BYPASSRLS**: es herramienta de host/dev, jamas superficie
  de negocio ni algo que el agente invoque (C7).
- **Lo que mueve dinero, gateado.** Un CLI de cobros nace con dry-run y sus operaciones de
  escritura marcadas como destructivas. **Una marca `readOnly` falsa en algo que mueve dinero
  es un bug, no un detalle** — y el dano recae sobre terceros, asi que no es firmable (limite
  de C5).
- **Canales de chat, igual que siempre**: que exista un CLI de Telegram no autoriza a
  conectarlo. Entra con modelo de amenazas (C3) y AISIA (C4), o no entra.
- **Todo cambio de comportamiento es un CDC (C1)**: imprimir o mejorar un CLI cambia la
  superficie de herramientas del agente. Diff, regresion, control negativo, aprobacion y
  entrada firmada. La fuente y el grade van **pineados** en el indice.
- **No inventar cifras.** Sin medicion, "desconocido". El "~100x" es una afirmacion del
  origen hasta que este repo la mida.
- **No romper lo que ya pasa**: 115 comprobaciones del verificador, 92 contratos de skills,
  la auditoria de credenciales, el presupuesto de contexto, el routing y la contabilidad
  siguen en verde. El corpus vive en la rama `golden-sets` y **ningun identificador de caso
  puede aparecer en el arbol**.
- **Secretos**: jamas imprimir el valor de una variable de entorno, ni al depurar.
