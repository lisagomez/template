# Eficiencia de tokens y frescura de versiones — Spec

> Compilado por `/goal-compiler` el 2026-08-23 desde: `eficienciatokens.md` (PRP-001 de
> Hermes OS), `prompt.md` (instalador multi-arnés sobre OpenRouter), Context7 y opencode.
> **Forma: LOOP.** Todas las piezas comparten el contexto del repo; colapsarlas en un solo
> agente no pierde nada, así que grafearlo sería teatro de complejidad.

## MISION

Que este boilerplate sea **consciente de lo que cuesta** y **de lo viejo que está**, y que
ambas cosas dejen de depender de que alguien se acuerde de mirar.

Hoy la fábrica es cara sin saberlo: `CLAUDE.md`, 22 skills, plantillas y salidas de
herramientas entran en cada sesión y nadie ha medido nunca cuánto contexto consumen. Y es
vieja sin saberlo: ya pasó con la imagen del agente (11 releases de rezago descubiertas por
accidente) y con datos técnicos heredados que resultaron falsos. Las dos son el mismo fallo
con distinta cara — **no hay sensor**.

Al terminar, un proyecto que nazca de aquí hereda cuatro cosas que hoy no existen:

**1. Presupuesto de contexto de la fábrica, medido y con gate.**
Cada archivo que entra al contexto base (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, skills,
plantillas, memoria) tiene un coste en tokens **medido**, no estimado a ojo, contra un
presupuesto declarado. Si alguien engorda un skill un 40%, el gate se pone rojo antes del
merge — igual que hoy pasa con la gobernanza. Incluye el coste de las **salidas de
herramientas** que el flujo genera, que es donde se va el contexto sin que nadie lo vea.

**2. Routing por nivel de tarea, con coste real.**
La lección de PRP-001: un solo modelo caro para todo es tirar dinero, y "bajar todo a
barato" es tirar calidad. Cada clase de tarea del flujo (título, compresión, triage,
preview → barato; PRP, revisión, decisión de arquitectura → capaz; el resto → declarado)
queda mapeada a un nivel, sin que ninguna quede heredando el default por descuido. Con
disciplina de **caché de prefijo**: lo estable arriba, lo volátil abajo — un `CLAUDE.md`
que cambia cada turno invalida el prefijo y se paga entero cada vez.

**3. Contabilidad y presupuesto en runtime.**
La app que se construya encima registra cada llamada relevante (fecha, feature, modelo,
tokens in/out, coste) y puede responder "cuánto llevamos gastando" con **cifra real**,
desglosada, sin inventar. Presupuesto con aviso al 80% y corte declarado al 100%. Regla
heredada: si falta el dato, se dice "desconocido" — nunca se estima y se presenta como
medido (misma lección que RPO/RTO).

**4. Frescura de versiones al estilo Context7, pero verificable.**
Context7 existe porque un LLM con docs viejas alucina APIs que ya no existen: cuesta tokens
en reintentos y produce código que no compila. Aquí eso se traduce en un **vigilante único**
que reporta desfase de todo lo pineado —dependencias del stack, servidores MCP, modelos y
arneses—, generalizando el que ya existe para la imagen del agente. **Avisa, no actualiza**:
mover un pineo es un CDC con diff, regresión y firma. Reporta **cambios, no estado**, para
no morir de fatiga de aprobación, y devuelve exit `2` cuando no puede verificar — "no pude
mirar" no es "todo bien".

**Y todo lo anterior corre igual desde otro arnés.** Las instrucciones de la fábrica pasan a
vivir en `AGENTS.md` como fuente única, con `CLAUDE.md` y `GEMINI.md` derivados y verificados
contra ella, de modo que **opencode** (75+ proveedores, compactación automática, poda de
salidas de herramientas, agentes Plan/Build separados) pueda conducir el mismo repo con los
mismos gates. Si un gate solo pasa desde Claude Code, no es un gate del repo: es una
costumbre de un arnés.

## LIBERTAD TECNICA

Tú eliges cómo medir tokens (tokenizador local, aproximación calibrada, API de conteo),
cómo modelar el presupuesto, dónde vive la contabilidad de runtime y cómo se estructura la
portabilidad entre arneses. Cualquier tecnología nombrada aquí es **sugerencia descartable**
salvo la sección RESTRICCIONES. Optimiza por el mejor resultado, no por el camino corto.

Dos advertencias que no son stack, son física del problema:
- **Un contador de tokens que no se calibra miente.** Si usas aproximación, demuéstrala
  contra un conteo real y declara el error.
- **Medir el contexto base no es medir la sesión.** Di explícitamente qué mides y qué no.

## INVESTIGA ANTES DE CONSTRUIR

Antes de decidir el enfoque, mira cómo lo resuelven 2-3 referencias reales: **Context7**
(docs versionadas al día para agentes), **opencode** (compactación, poda de salidas,
Plan/Build separados) y el patrón de **prefix caching** de los proveedores. El material de
origen está en `/mnt/c/Users/USER/Downloads/eficienciatokens.md` (PRP-001: routing por
nivel, caché de prefijo, ingesta a `token_usage`, alerta al 80%, vistas de costeo por tarea)
y `/mnt/c/Users/USER/Downloads/prompt.md` (instalador multi-arnés sobre OpenRouter con una
sola key en `~/.config/sf-agents.env`, permisos 600, y sus reglas duras). Léelos.

## DEFINICION DE HECHO (evidencia visible en la conversación)

1. **`npm run validate` en verde**, con su salida pegada, incluyendo el gate nuevo.
2. **Tabla medida del contexto base**: tokens por archivo y total, contra el presupuesto
   declarado. Números reales, con el método de conteo dicho y su margen de error.
3. **Control negativo del gate de tokens**: infla un archivo por encima del presupuesto →
   rojo (salida pegada); revierte → verde. Sin esto el gate no está verificado.
4. **Mapa de routing**: cada clase de tarea → nivel de modelo, con el coste por millón
   **citando de dónde sale el precio** y la fecha de consulta. Ninguna clase sin asignar.
5. **Runtime probado**: una prueba que registra uso y otra que **dispara el aviso al 80%**,
   con salida pegada. Si no hay proveedor real conectado, se demuestra con el registro
   simulado y se declara qué falta para lo real.
6. **Frescura corriendo**: salida del vigilante de versiones mostrando desfase real de al
   menos una cosa pineada, y su exit `2` cuando no puede verificar (probado cortándole la
   red).
7. **Portabilidad demostrada**: `AGENTS.md` como fuente única y prueba de que los gates
   corren desde otro arnés — con opencode instalado si se puede, o con un informe **medido**
   de qué lo impide y qué costaría. No vale afirmar compatibilidad.
8. **Entrada firmada en `.claude/gobernanza/BITACORA-CDC.md`** con el gate aplicado y el
   control negativo, y memoria del proyecto actualizada.
9. **Lista de las formas en que esto podría estar mal o incompleto**, y resuélvelas.

## COMANDO DE VALIDACION

```bash
npm run validate
```

Córrelo tras cada cambio grande y **surfea su salida**. Ya encadena typecheck, build,
gobernanza, regresión de skills y auditoría de credenciales; el gate de tokens entra ahí
dentro. Si lo que añades no cabe en `validate`, es que no es un gate.

## RESTRICCIONES REALES

- **Es un boilerplate**: nada provisionado, ningún gate que dependa de red o de un servidor
  24/7. El vigilante de versiones sí usa red, y por eso vive **fuera** de `validate`.
- **Todo cambio de comportamiento es un CDC (C1)**: diff, regresión, control negativo,
  aprobación humana y entrada firmada. Aplica a skills, prompts, plantillas y modelos.
- **Todo pineado.** `latest` es anti-patrón para modelos, imágenes, MCP y paquetes propios.
  El vigilante avisa; mover el pineo lo decide una persona.
- **Secretos**: jamás imprimir el valor de una variable de entorno. Presente/ausente, largo
  y a lo sumo 4 caracteres de prefijo. El auditor de credenciales vigila toda la historia.
- **No inventar cifras.** Sin medición, "desconocido". Un número bonito sin fuente es peor
  que un hueco declarado.
- **No romper lo que ya pasa**: 96 comprobaciones del verificador, 92 contratos de skills,
  14 casos del corpus y la auditoría de credenciales siguen en verde. El corpus vive en la
  rama `golden-sets` y **ningún identificador de caso puede aparecer en el árbol**.
- **Eficiencia por routing, no por recorte**: no bajar la calidad donde importa.
