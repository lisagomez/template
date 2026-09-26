# Ajustes del dictado — post-mortem (Fase 5 del goal-compiler)

Ejecutado el 2026-09-21 en un run; convergió con la definición de hecho completa (PR #139,
mezclado). Este documento cierra el ciclo: lo aprendido se vuelve regla o arreglo, y lo que
funcionó se declara intocable.

## 1. Retrospectivo del ejecutor

**Fricciones**
- Un interruptor de la página controlado por el estado del servidor hacía fallar el `check()` de
  Playwright («did not change its state»): React repintaba con el valor viejo hasta que llegaba la
  respuesta. Estado optimista local (cambia al click, vuelve si el servidor rechaza) y la caja de
  texto rearmada por `key` cuando el servidor devuelve otro valor, sin `setState` en efectos.
- El guion de capturas dejó un `next-server` huérfano en `:3012` y la corrida siguiente habló
  con el servidor equivocado durante 30 s: matar `npx` no mata a su hijo. Grupo de procesos propio
  y `process.kill(-pid)`, también por señal.
- `--tecla` a secas (presencia, no valor) habría disparado un aviso falso de «espera un código de
  tecla»: la resolución salta esa capa sin aviso cuando la bandera es booleana y el campo no.
- `instala` decía «sin ajustes.json» en su diagnóstico final porque leyó la configuración antes
  de crear el archivo: se relee al terminar.
- `respaldo: auto` cambiaba la forma de los guiones de medición, que dictan con `--motor remoto`:
  con `remoto` no aplica (el demonio trae el suyo).
- La tensión de diseño de la meta: argumento > ajustes hacía que la página no tuviera efecto sobre
  `en-vivo`, que pasaba motor, respaldo, ganancia y silencio como banderas. `en-vivo` pasó a fijar
  solo su forma (manos libres, tecla que alterna, icono). Ninguna medición se movió.

**Gaps del spec**
- No decía de dónde sale la señal de cambio en caliente (se eligió `stat` cada segundo: barato,
  igual en ext4 y `/mnt/c`) ni qué hacer con un valor inválido dentro del archivo (se conserva con
  aviso, nunca se corrige en silencio: es su archivo).
- «Catálogo con cifras» exigía nombres concretos de faster-whisper; `motoresDisponibles` devolvía un
  comodín (`faster-whisper:<small|...>`) y hubo que listar las carpetas reales.
- El spec afirmaba que el README de dictado «se siembra por marcadores»: los marcadores existen,
  pero el texto es prosa a mano. Un hecho del spec que nadie verificó antes de escribirlo.

**Qué funcionó**
- Núcleo puro primero (defectos, esquema, validación, precedencia, migración, catálogo) con sus 10
  pruebas antes de tocar CLI o página.
- Un solo camino para la terminal y la pantalla (`maquina.mjs` → `cli-ajustes` → `pon`): la
  validación no se duplicó y el 422 de la ruta es el mismo texto que el `✗` del CLI.
- Capturas sobre una COPIA de los datos con un servidor propio; el «en caliente» demostrado con
  `dictar --entrada` corriendo y el log como evidencia.
- «Antes» medido de verdad con el código anterior (`git stash` + build), no de memoria.

## 2. Mapa hallazgo → elemento del loop

| Hallazgo | Elemento | Qué era frágil |
|---|---|---|
| interruptor controlado | arista construir → validar (Playwright) | la UI reflejaba el servidor, no el click |
| `next-server` huérfano | lazo validar (capturas repetibles) | matar al padre y creer muerto al hijo |
| bandera de presencia | nodo precedencia | «argumento» sin distinguir `true` de un valor |
| `instala` con config vieja | arista instala → diagnóstico | estado leído antes de escribirlo |
| `respaldo: auto` y `remoto` | arista defectos → guiones de medición | un defecto nuevo cambia la forma de lo ya medido |
| README «sembrado» | nodo spec (hechos) | un hecho afirmado sin comprobarlo |

## 3. Hallazgos convertidos en reglas y arreglos

- `.claude/rules/aprendizajes-stack.md`: «matar `npx` no mata a `next-server`», «un control
  controlado por el servidor rompe `check()` de Playwright», «una bandera a secas es presencia,
  no valor». Y `tools/**`, `scripts/**` entran en sus `paths`: ahí muerden.
- Ya en el run: `Interruptor` y `Caja` optimistas; `captura-ajustes.mjs` con grupo de procesos;
  `resuelve` salta `true` en campos no booleanos; `instala` relee; `auto` no aplica con `remoto`.

Pendiente de CDC (no aplicado): en la skill `goal-compiler`, sección INVESTIGA del spec, una
línea: «todo HECHO que el spec afirme sobre el código (“X siembra el README”, “Y ya deja JSON”)
se comprueba con un `grep` antes de escribirlo; un hecho falso en el spec se cobra en la DoF».

## 4. Intocable

- Defectos en un solo sitio, precedencia visible con origen, y el archivo sin secretos.
- Un camino para CLI y página; el error de validación pegado al campo.
- Capturas sobre copia, servidor propio en su grupo de procesos, «antes» medido con el código
  anterior.

## 5. Lo que sigue

- `cli-dictar.ts` (683 líneas): extraer el bloque «en caliente» cuando se toque de nuevo.
- Oír el tono de los sonidos en una sesión con altavoz (aquí solo se demostró que no hubo error).
