# Laboratorio de voz — post-mortem (Fase 5 del goal-compiler)

Ejecutado el 2026-09-20 en un solo run. Convergió: la definición de hecho se cumplió entera
(validación en verde, build de producción servido, siete capturas, tabla de 20 casos, decisiones,
formas en que podía estar mal). PR #125. Este documento cierra el ciclo: lo aprendido se vuelve
regla, y lo que funcionó se declara intocable.

## 1. Retrospectivo del ejecutor

**Fricciones**
- El build de producción reventó una vez: Turbopack rastreó el banco de modelos porque el bundle
  lo tocaba con `fs`. Costó un ciclo de build (~2 min) y una reescritura del sondeo de disco.
- `pkill -f` mató la shell de la sesión (exit 144) con la regla que lo prohíbe cargada en
  contexto. Reincidencia de un aprendizaje de 2026-09-13.
- El verificador de gobernanza leía el nombre del paso nuevo truncado en el guion y pedía
  declarar un paso que no existía. Se renombró el paso y se corrigió la expresión.
- Playwright: `getByRole('button', { name: 'Funcionó' })` casaba también «No funcionó». Un
  `exact: true` y pasos seleccionables (`--pasos f,g`) para no repetir los cuatro minutos.

**Gaps del spec**
- El spec decía «capturas con Playwright» sin decir CÓMO meter el token sin imprimirlo. Se
  resolvió leyendo `.env.local` desde el guion e inyectándolo en `localStorage`; conviene que el
  spec lo diga la próxima vez que haya una superficie autenticada.
- El spec no preveía la muestra: sin audio en la máquina, «pruébalo con tu voz o un archivo»
  deja fuera a quien prueba sin micrófono. La voz sintética local como fabricante de muestras
  (y en estéreo para el call center) fue la decisión que hizo demostrable la Sala 2.
- La skill referencia un metagrafo (`public/conectoma/grafos/goal-compiler.json`) que en este
  repo no existe: la Fase 5 pide actualizar un archivo de otro proyecto.

**Fallas de las reglas, vistas en pruebas**
- «a las diez de la mañana» se leía como «mañana» (día siguiente). Corregido con lookbehind y
  cubierto en `pruebas/reglas.ts`.
- Un dictado con dos acciones mostraba solo una. Ahora se detecta una intención por frase.

**Qué funcionó**
- Medir antes de escribir: correr `di`, `archivo` y `lote` a mano dio los hechos (formatos,
  tiempos, que faltaba WeSpeaker) sobre los que se diseñó todo.
- Reglas puras con `node --test` (11 pruebas, 150 ms): dos bugs cazados antes de la pantalla.
- El estado real calculado desde la máquina: descargar un peso cambió tres casos de PUERTA a
  LISTO sin tocar el catálogo.
- El CLI como proceso: cero acoplamiento con los runtimes ONNX y el mismo patrón que `/dictar`.

## 2. Mapa hallazgo → elemento del grafo

El goal fue un LOOP (Fase 1.5): spec → construir → validar → evidencia → evaluador. Cada
hallazgo cae en una arista o en un lazo de ese loop.

| Hallazgo | Elemento | Qué era frágil |
|---|---|---|
| Turbopack y `fs` | arista construir → validar (build) | el spec no advertía del bundler; la regla de la ruta móvil estaba en un comentario, no en `.claude/rules/` |
| `pkill -f` | lazo validar (arrancar servidor) | regla existente que no dispara al ejecutar: es de comportamiento, no de archivo |
| verificador truncaba el guion | lazo validar → gobernanza | un control que lee mal su entrada exige un cambio de nombre en vez de detectar el gate |
| token en Playwright | arista evidencia → evaluador | sin mecanismo declarado, la evidencia tienta a imprimir el secreto |
| sin audio de muestra | arista construir → probar (persona) | la DoF exigía audio real y la máquina no tenía ninguno |
| «de la mañana» | nodo reglas (intenciones) | regla sin prueba con la frase de la propia muestra |
| metagrafo inexistente | lazo post-mortem → skill | la skill apunta a un artefacto de otro repo |

## 3. Hallazgos convertidos en gates y reglas

Hechos en este cierre:
- `.claude/rules/aprendizajes-stack.md`: entrada nueva «Turbopack rastrea como assets el disco
  que el bundle toca con `fs`» (carga al tocar `src/**`), y la reincidencia del `pkill -f`
  anotada en su entrada, con el camino que sí funcionó (PID por puerto).
- `scripts/verifica-gobernanza.mjs`: lee nombres de paso con guion (`[a-z:-]+`). Verificado
  152/152.
- `npm run prueba:laboratorio` dentro de `validate` y declarado en el README: las reglas del
  laboratorio ya son gate.
- `scripts/laboratorio-voz/captura.mjs`: el token se lee del `.env.local` y nunca se imprime;
  queda como patrón para toda evidencia sobre superficies autenticadas.

Pendientes que exigen aprobación humana (CDC, C1), NO aplicados:
- Skill `goal-compiler`, sección «Plantilla A → COMANDO DE VALIDACION»: añadir una línea
  «si la infra es Next con Turbopack y el spec toca carpetas fuera de `src/`, el spec advierte
  que el bundle no toca disco: sondeo por proceso». Y en la Fase 5: «si el repo no tiene
  conectoma, el post-mortem vive junto al spec (`.claude/goals/<slug>/post-mortem.md`)».
- Ese diff se propone aquí y se aplica solo con entrada en `BITACORA-CDC.md` y `npm run regresion`.

## 4. Intocable (lo que funcionó y no se cambia sin medir)

- Hechos antes que diseño: correr las herramientas a mano y leer sus formatos reales.
- Reglas puras + `node --test` antes de cualquier pantalla.
- Estado calculado desde la máquina, nunca declarado a mano.
- Disco fuera del bundle: todo sondeo por proceso (`maquina.mjs`), el CLI por `execFile`.
- Evidencia con Playwright sobre build de producción, con pasos seleccionables y el secreto
  inyectado desde el entorno.
- La honestidad como interfaz: PUERTA HUMANA con razón y botón deshabilitado, nada simulado.

## 5. Lo que sigue (fuera de este goal)

- Medir WER con ruido de campo sobre grabaciones reales (caso 17): el laboratorio ya lo pide.
- Diarización con habla solapada: `voz` tiene el camino PyanNet; el laboratorio usa el camino VAD.
- Abrir Role-playing o Zoom/Meet es decisión humana: llave + CDC, o modelo de amenazas + AISIA.
