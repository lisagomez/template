# Spec 003 — La imprenta de CLIs

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-24 y **aprobada con CDC firmado**. El texto exacto que se
> firmó sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-imprenta-de-clis.md`
>
> Se conserva **Libertad técnica**, núcleo del diseño original.
>
> **Estado: CONSTRUIDA.** Ver `plan.md` y `tareas.md`.

## Contexto y objetivo

Un agente que necesita hablar con un servicio puede cargar un **MCP** —cuyas definiciones se
pagan en el contexto de cada sesión, existan o no llamadas— o invocar un **CLI** por bash,
cuyo coste es el `--help` que pida, y solo cuando lo pida. Es la tercera palanca de
eficiencia, hermana del routing y del caché de prefijo.

El material de origen afirmaba **~100x menos tokens**. El objetivo es traer la palanca con
la misma disciplina que las otras dos: **medida, no afirmada**. Esa cifra no se repite: se
mide o se declara desconocida.

## Usuarios / actores

- **El agente**, que decide entre MCP, CLI o modelo en cada tarea.
- **La dueña**, que aprueba imprimir o adoptar un CLI (cambia la superficie de herramientas).
- **Un proyecto derivado**, que sí imprime en su máquina.

## Historias de usuario

- H1: Como agente quiero un orden de resolución explícito para no preguntar "¿qué modelo
  uso?" como primera pregunta cuando ya existe un CLI que lo resuelve.
- H2: Como dueña quiero que el auditor me diga que **no sabe**, en vez de reportar cero
  faltantes porque no encontró nada que mirar.
- H3: Como responsable quiero que un CLI que mueve dinero nazca con dry-run, para que un
  `readOnly` mal puesto no sea un detalle.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: EL SISTEMA mantendrá un manifiesto que mapea cada CLI a la skill y el servicio del
  golden path que lo necesita, con su fuente de verdad y su vertical de datos.
- RF-2: CUANDO un servicio esté gateado por un control, EL SISTEMA lo marcará como tal en el
  manifiesto.
- RF-3: CUANDO el auditor se ejecute, EL SISTEMA declarará su fuente: `libreria`, `indice` o
  `ninguna`.
- RF-4: SI no hay librería ni índice poblado, ENTONCES EL SISTEMA responderá que no puede
  saberlo, nunca "0 faltantes".
- RF-5: SI el índice declara un CLI impreso que no existe, o un servicio sin entrada,
  ENTONCES EL SISTEMA pondrá el gate en rojo.
- RF-6: EL SISTEMA resolverá toda tarea contra un servicio externo en este orden: CLI
  existente → CLI publicado → imprimir uno (solo con 3+ repeticiones) → resolver con el
  modelo.
- RF-7: EL SISTEMA tratará un CLI adoptado de la librería pública como **no medido** hasta
  que se le puntúe en local.
- RF-8: EL SISTEMA hará que todo CLI nazca con dry-run por defecto.
- RF-9: SI una operación mueve dinero, ENTONCES EL SISTEMA la marcará destructiva, y un
  `readOnly` falso será tratado como bug, no como detalle.
- RF-10: EL SISTEMA exigirá que un CLI llame a la API real o lea del store local, y jamás
  invente una respuesta.
- RF-11: SI un CLI no tiene grado medido, ENTONCES EL SISTEMA lo mantendrá fuera de
  producción — sin grado no es aprobado, es no medido.
- RF-12: CUANDO se imprima o se adopte un CLI, EL SISTEMA lo tratará como cambio de
  comportamiento con diff, regresión y aprobación.
- RF-13: MIENTRAS no exista medición propia, EL SISTEMA declarará el "~100x" como afirmación
  de origen, no como hecho.

## Requisitos no funcionales

- El gate corre **sin red, sin Go y sin credenciales**.
- La profundidad va a `docs/` si no cabe en el presupuesto de contexto de las instrucciones.
- Las cuatro reglas van **inline** en las instrucciones, no en un runbook.
- Secretos: jamás imprimir el valor de una variable de entorno, ni al depurar.

## Libertad técnica *(sección conservada del diseño original)*

Formato del manifiesto, lenguaje del auditor, método de medición y estructura del índice son
decisiones de quien ejecuta. Reusar las herramientas de medición que el repo ya tiene es
mejor que traer un stack nuevo.

Dos advertencias de física del problema: **comparar un MCP con un CLI no es comparar dos
números** —el MCP se paga aunque no se use; el CLI puede pagarse varias veces si el agente
relee el `--help` cada turno—, y **la palanca no es gratis**: el manifiesto y las reglas
también entran al contexto.

## Casos límite

- Un auditor que reporta cero porque no tiene nada que mirar: mismo modo de falla que el
  exit `2` del vigilante y el coste `null` de la contabilidad.
- Que exista un CLI de Telegram no autoriza a conectarlo: entra con modelo de amenazas y
  AISIA, o no entra.
- El CLI de Supabase del origen lleva `service_role`, que tiene BYPASSRLS: es herramienta de
  host, jamás superficie de negocio.
- Un CLI documentado y nunca ejecutado es una afirmación, no una capacidad.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| **Quien recibe una acción que mueve dinero** | Un `readOnly` mal puesto ejecuta un cobro real mientras el agente cree estar en dry-run. **No hace falta ningún atacante**: basta una marca equivocada | RF-8 y RF-9: dry-run por defecto y marca destructiva obligatoria. Un `readOnly` falso se trata como bug, no como detalle |
| Quien consume la salida de un CLI | Un CLI que inventa una respuesta en vez de llamar a la API real produce un dato falso con forma de dato real | RF-10, anti-reimplementación: llama a la API o lee del store, jamás inventa |
| Usuarios de un canal de chat conectado | Un CLI de mensajería convierte una superficie **no autenticada** en entrada hacia un agente con llaves | Que exista el CLI no autoriza a conectarlo: entra con modelo de amenazas y AISIA propios, o no entra |
| Quien depende de un CLI sin grado | Se usa en producción algo cuya calidad nadie midió | RF-11: sin grado no es aprobado, es no medido — y fuera de producción |

**Límite de C5, explícito**: el daño de un cobro erróneo recae sobre un tercero que no firmó
nada. **Ninguna firma lo autoriza**: ahí no se ofrece la vía del registro de riesgo.

## Fuera de alcance

- **Imprimir aquí**: no hay Go y no lo va a haber. Viaja el contrato, el auditor, la
  medición y las reglas; imprimir es acción de un proyecto derivado.
- Traer la librería de binarios al repo.

## Criterios de finalización

Manifiesto sin servicios sin asignar · auditor corriendo y diciendo la verdad sobre lo que
no sabe · su control negativo · medición con método y margen, diciendo qué parte del "~100x"
queda confirmada, cuál refutada y cuál sin medir · las cuatro reglas inline con control
negativo · delta del presupuesto de contexto medido.

## Dudas abiertas

- [NECESITA ACLARACIÓN] Cuatro de los servidores MCP declarados siguen sin medir, así que la
  cifra de coste en contexto es un piso, no un total.
