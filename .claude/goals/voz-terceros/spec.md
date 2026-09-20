# Voz lista para terceros — Spec (Etapa 2)

Compilado por `/goal-compiler` el 2026-09-20. Forma: **LOOP**. Lo que se pega en `/goal` es
`goal.txt`, NO este archivo. Sigue a `voz-lista-para-usuarios` (Etapas 0 y 1, PRs #129-#131),
cuyo `resultados-etapas-0-1.md` y `post-mortem.md` se leen antes de empezar.

**Advertencia de partida.** El plan pedía compilar esta etapa con dos semanas de cifras del
piloto con voz propia. Se compila antes, por decisión de quien decide. Regla: donde una
decisión dependa de esas cifras (umbrales, defaults del micrófono, corrección del diccionario),
se usan las del piloto si existen en `trayectorias/datos/herramientas/` y en
`tools/dictado/medicion/corpus-propio/`; si no, se mantienen las del corpus sintético y se dice.

## MISION

Que una persona que no es quien decide, en una máquina que no es esta, instale la voz y la use
sin abrir una terminal más de lo imprescindible: un instalador de un paso que comprueba lo que
falta, descarga solo los pesos pineados (sin el corpus de medición), deja el icono, el token y
la dirección del celular, y termina con un diagnóstico que se puede pegar en un issue sin
filtrar nada. Criterio de la Etapa 2 del plan: máquina limpia operativa en menos de 20 minutos
con 6 acciones humanas o menos, **medido**, no supuesto. Además: el icono que se actualiza
solo, la red del celular con dos caminos documentados y probados, retención y borrado de los
datos del usuario, y el lote de reuniones sobre el demonio para bajar el proceso a menos de
0,15 veces la duración. Horizonte (Etapa 3, fuera de este goal): llamadas en vivo, la máquina
que habla en tiempo real, educación y campo.

## LIBERTAD TECNICA

Tú eliges cómo se construye el instalador (un subcomando del CLI, un script, ambos), cómo se
mide en limpio (contenedor Linux reproducible para la parte WSL2, distro WSL nueva si es
posible, lista de comprobación para lo que solo Windows puede verificar), cómo se versiona el
icono y cómo se guarda la política de retención. `tools/voz`, `tools/dictado`,
`tools/asesor-ventas`, el laboratorio y `scripts/laboratorio-voz/*` son la base: se extienden
con prueba, no se reescriben. Las propuestas del plan (2.1 a 2.7 y 0.2) son el punto de partida
razonado; si mides algo mejor, hazlo y explícalo.

## INVESTIGA ANTES DE CONSTRUIR

Lee `tools/dictado/README.md` (secciones «Instalar», 7, 8 y 9), `docs/SDD-dictado.md`,
`docs/CREAR-UNA-HERRAMIENTA.md` y `docs/EMPAQUETAR-HERRAMIENTA.md` (publicar es gate humano),
`tools/dictado/medicion/mide.mjs` (las URLs pineadas y lo que descarga de más),
`tools/dictado/src/node/cli-icono.ts` (`copiaIconoAWindows`), `tools/dictado/windows/*.ps1`,
`tools/dictado/scripts/demonio.mjs` y `servicio/`, `scripts/laboratorio-voz/captura-movil.mjs`
y `mide-reuniones.mjs`. Cuenta de verdad los pasos de instalación de hoy antes de recortarlos.
Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

- Último output del comando de validación pegado, en verde; `npm run validate` en verde al final.
- **Instalación medida en limpio**: tabla con cada paso, quién lo hace (script o persona), su
  tiempo y el total; ≤ 6 acciones humanas y < 20 min, o la cifra real y por qué. El entorno
  limpio se nombra (contenedor, distro nueva) y lo que Windows tiene que hacer a mano va en una
  lista de comprobación explícita.
- Salida de `dictado diagnostico` pegada: versión, piezas presentes, pico del micrófono, salud
  del demonio, últimas líneas del log sin texto dictado, últimas trayectorias; y la comprobación
  de que no lleva secretos ni contenido (el mismo criterio que `verifica:trayectorias`).
- Icono: prueba de que, al cambiar la versión de la herramienta, la copia en Windows se
  refresca sola; evidencia por prueba unitaria y por la línea del log de `dictar`.
- Red del celular: documento con los dos caminos (Tailscale recomendado; LAN con el script de
  red y certificado) y la corrida de `captura-movil.mjs` contra la dirección de Tailscale con
  el tiempo que tarda emparejar un navegador limpio.
- Retención y borrado: `historial --borra` (todo, o `--antes <fecha>`) y una retención por
  defecto configurable, con prueba y con la salida del comando; el documento de «qué se guarda
  y dónde» para un tercero.
- Lote sobre el demonio: tabla antes/después de `mide-reuniones.mjs` con proceso/duración
  (hoy 0,21–0,28×; meta < 0,15×), etiquetado y WER iguales o mejores.
- Empaquetado en verde sin publicar: `npm run empaqueta voz`, `dictado` y `asesor-ventas`
  instalando el tarball en un proyecto limpio; se pega la salida. Publicar queda para firma.
- Tabla de lo que cambió de estado en el laboratorio (casos y piezas) y lista de lo que queda
  para la Etapa 3; reporte de decisiones; formas en que podría estar mal, resueltas.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && (cd tools/dictado && npm run prueba) && npm run prueba:laboratorio`
tras cada cambio grande, con el output pegado. `npm run validate` antes de cerrar. Para
capturas: `npm run build && npx next start -H 0.0.0.0 -p 3000`.

## RESTRICCIONES REALES

- **No se publica nada** en npm ni en ningún registro: empaquetar sí, publicar es firma humana.
- No se expone nada fuera de la LAN o de Tailscale: abrir un puerto a internet es C3 con firma.
- Solo pesos pineados por URL exacta (y sha si se añade alguno); el instalador no baja el
  corpus de medición ni el venv de Python salvo que se pida el respaldo.
- Sin LLM (C4); sin modelo nuevo sin CDC aprobado; el modelo de solape sigue como propuesta.
- Plataformas: Windows con WSL2 es la que se instala y se mide; Linux de escritorio solo si una
  persona lo pide; macOS no; GPU no se mide sin hardware.
- El instalador no pide administrador salvo para la red del celular por LAN, y lo dice antes.
- Secretos jamás en pantalla ni en el diagnóstico; el token se genera y se guarda, no se imprime.
- No se tocan `settings.json`, skills ni prompts. Un cambio de defecto del CLI lleva propuesta
  de bitácora para firma, nunca «pendiente» dentro del registro.
- Todo lo que lee un tercero, en español sin jerga. Probar con build de producción.
