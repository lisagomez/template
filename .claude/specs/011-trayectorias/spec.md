# Spec 011 — Trayectorias: trazas de ejecución que cierran el lazo de mejora sin autoaprobarse

> **Origen**: [`docs/GOAL-trayectorias.md`](../../../docs/GOAL-trayectorias.md), compilado con
> `/goal-compiler` el 2026-09-13; grafo en `docs/grafos/trayectorias.json`. Decisión de la dueña:
> «trayectorias» son **trazas de ejecución**, no rutas de producto ni recorridos de usuario.
> Se apoya en la spec 002 (contabilidad, presupuesto de contexto, routing) y en el control C2.

## Contexto y objetivo

La fábrica ya mide por partes: la contabilidad sabe cuánto costó una llamada, la medición de una
herramienta sabe cuánto tardó, y los transcripts del arnés saben qué herramientas usó una sesión.
Ninguna de las tres se junta con las otras, y el Auto-Blindaje sigue siendo manual: un error se
escribe en un aprendizaje si alguien se acuerda. El objetivo es que **toda ejecución deje una
trayectoria de forma en un formato común**, que un **evaluador distinto del ejecutor** la juzgue
con criterios binarios, que un **informe compare periodos** y marque regresiones, y que de ahí
salgan **propuestas con evidencia que nadie aplica sin CDC**. Automejorado no es autoaprobado.

## Usuarios / actores

- **La dueña**: aprueba o rechaza las propuestas; es la única que cambia comportamiento (C1).
- **El operador de la fábrica**: lee el informe, decide qué corpus de trayectorias vale.
- **El agente ejecutor**: deja trayectoria sin hacer nada especial.
- **El evaluador**: un subagente o sesión fría que no produjo las trayectorias ni vio el cambio.
- **Los terceros**: usuarios finales y personas cuyos documentos pasan por las apps; una
  trayectoria nunca lleva nada suyo.

## Historias de usuario

- H1: Como dueña quiero saber qué skill gasta más y acierta menos, para decidir dónde mejorar.
- H2: Como operador quiero que una regresión de rendimiento de una herramienta se vea en el
  informe sin que nadie la busque.
- H3: Como dueña quiero que las propuestas de mejora vengan con la trayectoria que las
  sostiene, y que ninguna se aplique sin mi firma.
- H4: Como tercero quiero que ninguna traza de la fábrica contenga mi documento ni mi mensaje.

## Requisitos funcionales (criterios de aceptación en EARS)

### Formato y verificador

- RF-1: EL SISTEMA definirá un formato común de trayectoria con versión, línea (`fabrica`,
  `aplicacion`, `herramientas`), origen, actor, acciones, uso de tokens, coste, tiempos, gates,
  resultado y cobertura, y un verificador que lo exige.
- RF-2: SI una trayectoria contiene un valor con forma de identificador personal (RFC, CURP,
  correo), un texto largo o con saltos de línea, algo con forma de secreto, o un identificador de
  caso del corpus de regresión, ENTONCES EL SISTEMA la rechazará.
- RF-3: SI una llamada no trae datos de uso, ENTONCES EL SISTEMA guardará el coste como `null` y
  la cobertura lo declarará; nunca lo estimará como cero.
- RF-4: EL SISTEMA correrá el verificador de trayectorias dentro de `npm run validate`.

### Captura

- RF-5: CUANDO termine una sesión del arnés, EL SISTEMA producirá su trayectoria de forma
  (skills invocados, herramientas por nombre y conteo, modelos, tokens con caché, gates corridos
  y su resultado, errores) sin intervención humana.
- RF-6: EL SISTEMA convertirá los transcripts históricos de la máquina a trayectorias con la
  misma conversión, deduplicando el uso por mensaje.
- RF-7: CUANDO una feature con IA registre uso por el `Registrador` de contabilidad, EL SISTEMA
  emitirá además una trayectoria de la línea de aplicación con la misma regla de coste `null`.
- RF-8: CUANDO una corrida de medición de una herramienta termine, EL SISTEMA emitirá su
  trayectoria junto al resumen de la corrida.
- RF-9: EL SISTEMA ingestará las trayectorias de las tres líneas en un almacén versionado de
  forma y métricas, y dejará lo crudo fuera de git.

### Evaluación, informe y propuestas

- RF-10: EL SISTEMA declarará criterios binarios y ortogonales (3 a 6) por skill, feature y
  herramienta, y los aplicará a cada trayectoria.
- RF-11: MIENTRAS se evalúe, EL SISTEMA exigirá que el evaluador sea distinto del ejecutor y no
  reciba el contexto del cambio; el veredicto registra quién evaluó y qué vio.
- RF-12: EL SISTEMA producirá un informe que compare dos periodos por línea y actor (tokens,
  caché, coste, latencia, aciertos, revisión humana, gates rojos, errores) y marque regresiones
  con su fuente.
- RF-13: SI un periodo tiene menos cobertura que el otro, ENTONCES EL SISTEMA lo dirá en el
  informe en vez de comparar como si fueran iguales.
- RF-14: CUANDO haya una señal (criterio que falla repetido, coste fuera de lo previsto,
  regresión de rendimiento), EL SISTEMA redactará una propuesta con la evidencia que la sostiene.
- RF-15: EL SISTEMA no modificará `AGENTS.md`, ningún skill, prompt, routing, `settings.json` ni
  `.mcp.json` a partir de una propuesta; la dejará redactada como CDC con aprobación pendiente.

## Requisitos no funcionales

- La captura no degrada la sesión: el hook corre al terminar, no por herramienta, y en segundos.
- Todo en español; los nombres de herramientas y modelos van literales.
- Modelos pineados en cualquier juez que se invoque.
- El almacén cabe en el repo sin entrar al presupuesto de contexto (no vive bajo `.claude/`).

## Casos límite

- Un transcript sin `usage` en ningún mensaje: trayectoria con `uso: null` y cobertura incompleta.
- Un transcript de subagente: se marca como tal y no se suma como sesión.
- Un mensaje de usuario que contiene un secreto o un documento pegado: la trayectoria nunca copia
  texto de mensajes, solo conteos.
- Un modelo que no está en el catálogo de precios: coste `null`, declarado.
- Dos periodos con cobertura muy distinta: el informe lo dice y no marca regresión por eso.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| Usuarios finales de las apps | Un prompt o documento suyo acaba en un dataset versionado | RF-2: solo forma; el verificador rechaza texto libre e identificadores |
| Personas en documentos de las herramientas | Un valor extraído acaba en la trayectoria de medición | RF-2 y el patrón «imprime forma, nunca valores» de `medicion/` |
| La propia fábrica | Un identificador del corpus de casos-trampa filtra qué se evalúa | RF-2 y el verificador de gobernanza |
| La dueña | Una propuesta se aplica sola y cambia el comportamiento sin firma | RF-15 (C1) |

## Fuera de alcance

- Aplicar propuestas; cambiar skills, prompts o routing (CDC aparte).
- Tablero web; el informe es Markdown generado.
- Captura por herramienta en tiempo real (`PostToolUse`): se captura al cerrar la sesión.
- Trayectorias de agentes ajenos (Hermes): fuera de este repo.

## Criterios de finalización

1. `npm run verifica:specs` en verde.
2. Formato y verificador con pruebas que rechazan documento, secreto e identificador de caso y
   aceptan coste `null`; el verificador dentro de `validate`.
3. Transcripts históricos convertidos y una sesión nueva que deja trayectoria sola.
4. Prueba con `Registrador` falso en verde: cada llamada emite trayectoria.
5. Una corrida real de medición del extractor emite su trayectoria.
6. Criterios declarados y veredicto de un agente distinto sobre al menos diez trayectorias.
7. Informe comparando dos periodos con una regresión o mejora marcada y su fuente.
8. Una propuesta con su trayectoria, diff vacío en lo gobernado por C1 y CDC pendiente.
9. `npm run validate` y `verify:gobernanza` en verde.

## Dudas abiertas

- [NECESITA ACLARACIÓN] Cuántas trayectorias caben en el repo antes de mover el almacén a un
  archivo por periodo comprimido; se decide midiendo el peso real tras un mes de uso.
- [NECESITA ACLARACIÓN] Si el hook de cierre de sesión debe entrar en `settings.json` del repo
  (CDC) o quedarse como configuración local por máquina; esta spec lo deja propuesto.
