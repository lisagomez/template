# Spec 002 — Eficiencia de tokens y frescura de versiones

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-23 y **aprobada con CDC firmado**. El texto exacto que se
> firmó sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-eficiencia-tokens.md`
>
> Se conserva **Libertad técnica**, núcleo del diseño original.
>
> **Estado: CONSTRUIDA** (cinco incrementos). Ver `plan.md` y `tareas.md`.

## Contexto y objetivo

La fábrica era cara sin saberlo y vieja sin saberlo. Nadie había medido cuánto contexto
consumen las instrucciones, los skills y las salidas de herramientas; y el rezago de
versiones se descubría por accidente (once releases de retraso en la imagen del agente).
Son el mismo fallo con dos caras: **no hay sensor**.

El objetivo es que ambas cosas dejen de depender de que alguien se acuerde de mirar.

## Usuarios / actores

- **La dueña**, que paga la factura y decide cuándo mover un pineo.
- **El agente**, cuyo routing determina el coste de cada clase de tarea.
- **La app derivada**, que registra su propio gasto en runtime.
- **Otro arnés** (opencode), que debe poder conducir el mismo repo con los mismos gates.

## Historias de usuario

- H1: Como dueña quiero que engordar un skill un 40 % ponga el gate en rojo antes del merge,
  para no descubrir el coste en la factura.
- H2: Como dueña quiero saber cuánto llevamos gastando con cifra real y desglosada, para no
  decidir sobre estimaciones.
- H3: Como responsable quiero que el vigilante me avise del desfase pero **no actualice
  nada**, porque mover un pineo es una decisión con firma.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: EL SISTEMA medirá en tokens el coste de cada archivo que entra al contexto base,
  contra un presupuesto declarado.
- RF-2: SI un archivo supera su presupuesto, ENTONCES EL SISTEMA pondrá el gate en rojo
  antes del merge.
- RF-3: CUANDO se use una aproximación para contar tokens, EL SISTEMA declarará el método y
  su margen de error, demostrado contra un conteo real.
- RF-4: EL SISTEMA asignará cada clase de tarea a un nivel de modelo, con precio y fecha de
  consulta citados.
- RF-5: SI una clase de tarea queda sin asignar, ENTONCES EL SISTEMA la rechazará en el
  gate, en vez de dejarla heredar el default caro en silencio.
- RF-6: CUANDO se realice una llamada al modelo, EL SISTEMA registrará fecha, feature,
  modelo, tokens de entrada y salida, y coste.
- RF-7: SI faltan los datos de uso de una llamada, ENTONCES EL SISTEMA guardará el coste
  como `null`, nunca como cero.
- RF-8: CUANDO el gasto alcance el 80 % del presupuesto, EL SISTEMA emitirá un aviso.
- RF-9: EL SISTEMA dejará la decisión de cortar al 100 % a la aplicación, no al módulo.
- RF-10: EL SISTEMA reportará el desfase de todo lo pineado, informando **cambios, no
  estado**.
- RF-11: SI el vigilante no puede verificar, ENTONCES EL SISTEMA devolverá exit `2` — "no
  pude mirar" no es "todo bien".
- RF-12: EL SISTEMA tratará `AGENTS.md` como fuente única, con `GEMINI.md` generado y
  verificado contra ella.
- RF-13: SI `GEMINI.md` se edita a mano, ENTONCES EL SISTEMA lo rechazará.
- RF-14: MIENTRAS el vigilante dependa de red, EL SISTEMA lo mantendrá fuera del gate
  principal.

## Requisitos no funcionales

- Ningún gate del boilerplate puede depender de red ni de un servidor permanente.
- **No inventar cifras**: sin medición, "desconocido".
- Secretos: jamás imprimir el valor de una variable de entorno; presencia enmascarada.
- **Eficiencia por reparto, no por recorte**: no bajar la calidad donde importa.

## Libertad técnica *(sección conservada del diseño original)*

Cómo medir tokens, cómo modelar el presupuesto, dónde vive la contabilidad y cómo se
estructura la portabilidad son decisiones de quien ejecuta.

Dos advertencias que no son de stack, son física del problema: **un contador que no se
calibra miente**, y **medir el contexto base no es medir la sesión** — hay que decir
explícitamente qué se mide y qué no.

## Casos límite

- Una llamada sin datos de uso: sumarla como cero da una factura que parece completa y no
  lo es.
- Cortar el servicio al 100 % para proteger la propia factura: es una decisión con víctima.
- El caché de prefijo: un archivo de instrucciones que cambia cada turno lo invalida y se
  paga entero. Lo estable arriba, lo volátil abajo.
- El ahorro de la carga condicional **no aplica en opencode**, que carga siempre: es un
  intercambio, no un ahorro gratis.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| **Usuario final de la app derivada** | Cortar el servicio al llegar al 100 % del presupuesto le niega el servicio a alguien que no tiene culpa de la factura. **Es una decisión con víctima**, y el que la sufre no participó en fijar el tope | RF-9: el módulo avisa, **la app decide**. La decisión queda donde hay contexto para tomarla, no enterrada en una librería |
| Usuario final | Routing barato aplicado a una clase que sí necesitaba calidad: recibe peor respuesta **sin enterarse** de que se abarató | "Eficiencia por reparto, no por recorte". Lo que decide sobre riesgo no se abarata nunca |
| Quien lee las cifras | Sumar llamadas sin dato como cero da una factura que parece completa y no lo es: se decide sobre un número falso | RF-7: coste `null`, nunca cero |

**Límite de C5 aplicado**: negar servicio a un usuario final para proteger la propia factura
es daño sobre quien no firmó. Por eso el corte **no** se implementa en el módulo como
automatismo — se expone la decisión, no se toma por nadie.

## Fuera de alcance

- Provisionar cualquier servicio: es boilerplate.
- Actualizar pineos automáticamente. El vigilante avisa; mover el pineo lo decide una
  persona.

## Criterios de finalización

Tabla medida del contexto con método y margen · control negativo del gate (inflar → rojo →
revertir → verde) · mapa de routing sin clases sin asignar · aviso al 80 % disparado ·
vigilante con su exit `2` probado · portabilidad **medida**, no afirmada.

## Dudas abiertas

- [NECESITA ACLARACIÓN] La portabilidad está medida en documento, pero opencode no está
  instalado en esta máquina: el punto 7 de los criterios no se puede reproducir aquí.
