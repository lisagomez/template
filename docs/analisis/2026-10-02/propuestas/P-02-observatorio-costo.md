# P-02 · Observatorio del costo de operar la fábrica

> Antes de abrir una sesión cara, el laboratorio sabe cuánto cuesta lo que va a pagar y dónde se
> le va. Puntuación 54 · solidez 3 (medida) · siguiente paso: `/prp`.

## Usuario

El laboratorio, que opera agentes todos los días, y en adelante cualquier equipo que opere agentes
con esta fábrica.

## La tarea que hoy le cuesta

Construir sin que la sesión se coma el presupuesto. Hoy el costo existe, repartido en cinco
lugares que nadie junta: trayectorias por sesión (D-08), contexto fijo (D-09), MCP sin umbral
(D-10), errores de Bash que reinciden (D-11) y reglas que opencode paga siempre (D-17).

## Cuánto le cuesta

- Una sesión de [C-01] USD y la más cara de [C-02] USD; [C-03] USD por llamada.
- [C-04] tokens fijos en cada sesión y [C-05] de MCP, con cuatro servidores sin medir.
- [C-10] de 38 errores de herramienta en la sesión más cara fueron de Bash.
- [C-08] tokens extra en cada sesión de opencode; la memoria del proyecto, al [C-09] de su tope.

## Promesa

Una vista que junta lo que ya se mide (costo por sesión, por llamada, contexto fijo, MCP y
errores por herramienta) con **umbrales declarados** que avisan antes de pasarse. **No hace:**
cortar una sesión por su cuenta, ni elegir modelo: eso sigue siendo del routing (C8).

## Métrica de éxito

Costo por llamada del siguiente periodo contra [C-03] con la misma mezcla de modelos, y número de
sesiones que pasan un umbral sin aviso previo. Referencia: el informe de trayectorias de hoy.

## Qué se recombina

- `TPL-trayectorias`: costo por sesión, errores por herramienta e informe por periodos.
- `TPL-motor-ia`: routing por nivel y contabilidad de tokens.
- `TPL-imprenta`: la medición de MCP, que hoy no tiene umbral.
- `TPL-doctrina`: el presupuesto de contexto que mide `mide:contexto`.
- **Falta construir**: la vista que los junte, los umbrales (el padrón ya pide uno para MCP) y el
  aviso.

## App o herramienta

Herramienta de la fábrica (camino «herramienta» del README). Si otro equipo la pide, se empaqueta
con `/crear-herramienta`. Hoy ninguna fuente nombra a ese equipo.

## Amenazas (C3)

Las trayectorias contienen comandos y rutas de sesiones reales: la vista no las expone fuera del
repo privado ni imprime valores de variables.

## Terceros (C4)

Ninguno directo: el dato es de la fábrica. El riesgo es de decisión, porque abaratar a ciegas mueve
el riesgo a donde no se ve. Las clases que no se abaratan siguen sin abaratarse.

## Fuera de alcance

Cambiar modelos, cortar sesiones y tocar el routing: cada uno es un CDC aparte.

## Siguiente paso

`/prp`: el QUÉ está claro (juntar y poner umbrales) y solo falta el plan.
