# Spec NNN — <Nombre de la funcionalidad>

## Contexto y objetivo
<Qué problema resuelve y por qué merece la pena. Un párrafo.>

## Usuarios / actores
<Quién lo usa.>

## Historias de usuario
- H1: Como <rol> quiero <acción> para <beneficio>.

## Requisitos funcionales (criterios de aceptación en EARS)
- RF-1: CUANDO <evento>, EL SISTEMA <respuesta> (salida/resultado esperado).
- RF-2: SI <condición no deseada>, ENTONCES EL SISTEMA <respuesta>.
- RF-3: MIENTRAS <estado>, EL SISTEMA <respuesta>.
- RF-4: EL SISTEMA <comportamiento permanente>.

## Requisitos no funcionales
<Solo los que apliquen: rendimiento, seguridad, plataformas, idioma...>

## Casos límite
<Vacíos, duplicados, datos corruptos, límites, concurrencia...>

## Impacto sobre terceros (control C4)
<Quién puede salir dañado con el sistema funcionando BIEN y sin ningún atacante presente.
Por parte afectada: qué daño, y qué lo mitiga. Si no alcanza a nadie fuera del equipo,
escríbelo y di por qué — un "no aplica" razonado es una respuesta; dejarlo vacío no.>

<LÍMITE: si el daño recae sobre quien no firmó —datos de clientes, dinero ajeno, seguridad
de un usuario final— ninguna firma lo autoriza. Ahí no se ofrece la vía del registro de
riesgo: se rediseña o no se hace, y ese requisito baja a "Fuera de alcance".>

## Fuera de alcance
<Lo que explícitamente NO se hace en esta iteración.>

## Criterios de finalización
<Ej.: todos los RF con test en verde + demo manual del flujo principal.>

## Dudas abiertas
- [NECESITA ACLARACIÓN] <duda>