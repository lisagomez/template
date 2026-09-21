# Píldora flotante del dictado — resultados (2026-09-20)

Ejecutado en un run sobre `main` tras la Etapa 3 de la voz (PR #134). Los atajos no cambiaron
(decisión al compilar). Evidencia repetible: `node medicion/mide-pildora.mjs` en `tools/dictado`
(exige Windows al alcance y el demonio vivo); las capturas y la tabla quedan en
`tools/dictado/medicion/corpus-propio/pildora/`.

## Qué existe ahora

- **La píldora** (`windows/icono-barra.ps1`, PowerShell + WinForms, legible, sin binarios):
  idle 34 × 34 con el logo del micrófono; escuchando 100 × 34 con 20 barras que siguen la voz;
  procesando 52 × 34 con tres puntos que giran; hecho, palomita verde; error, X roja; opacidad
  0,90, radio 17, abajo al centro a 14 px de la barra de tareas (o donde la dejes arrastrando).
  Consciente del DPI (a 150 % se dibuja a escala y nítida). Menú: «Abrir historial» (la página
  de tus datos si la app responde; si no, `dictado historial` en una terminal), «Apagar el
  dictado», «Mostrar/ocultar la píldora», «Quitar este icono». Reemplaza al botón redondo.
- **La lógica, en TypeScript con pruebas** (`tools/dictado`, 108/108):
  `src/node/pildora.ts`, la máquina de estados con reloj inyectado (hecho se cierra a 800 ms,
  error a 1200 ms, y vuelve a lo que el dictado haga ENTONCES); `src/node/barras.ts`, las 20
  barras (bandas mel de `@tu-scope/voz` sobre ventanas de 32 ms, pico móvil con suelo, dB con
  suelo −50, ganancia 2,3, caída 0,85 por cuadro); `src/node/icono.ts`, el protocolo ampliado
  (`pildora <visual>`, `barras <20 enteros>`, además de `estado`). PowerShell solo pinta.
- **`dictar`** publica el visual en cada evento (estado, texto pegado → hecho, sin voz o fallo →
  error), manda las barras solo si hay un icono conectado y se está escuchando, y al refrescar
  la copia del icono por huella cierra el icono anterior para que arranque el nuevo.
  `--prueba-error <ms>` (solo pruebas) simula un fallo para ver la X.

## Medido (sesión de tres frases sintéticas por `dictar --entrada`, icono con `-Medir`)

| medida | valor | nota |
|---|---|---|
| cuadros por segundo escuchando | **32** (mediana de los segundos enteros; 25,5 de media contando arranque y cambios de estado) | el Timer de WinForms va a saltos de 15,6 ms: 25 ms → ~31; 16 ms daría ~39 (medido) |
| CPU del PowerShell escuchando, de un núcleo | **4,7 %** en régimen (9,5 % de media con el arranque y las capturas) | primer intento: 15,6 %; bajó al cachear pinceles y plumas |
| CPU del PowerShell en reposo | 4,4 % | reloj relajado a 100 ms; incluye el propio registro de medición |
| bytes/s del socket escuchando | ~2 300 | 20 enteros por cuadro, ~31 cuadros/s |
| latencia estado → anotado en el icono | **p50 21 ms, máximo 36 ms** (9 estados) | mismo reloj de sistema en WSL2 y Windows |
| visuales recorridos | idle → escuchando → procesando → hecho → escuchando → … → error → … → apagado | hecho 800 ms y error 1200 ms medidos en la secuencia |

Capturas (de la propia píldora sobre el escritorio real, tomadas por el script con `-Medir`):
`captura-idle.png` (logo gris sobre la píldora oscura), `captura-escuchando-1.png` y
`captura-escuchando-2.png` (dos cuadros distintos de barras rojas), `captura-procesando.png`
(tres puntos ámbar, uno vivo), `captura-hecho.png` (palomita verde), `captura-error.png` (X
roja) y `captura-menu.png` (el menú con «Abrir historial»). Las vi y describo: son las de arriba.

**Compatibilidad**: el icono de la versión anterior (el script de `HEAD` lanzado a mano)
conectado al dictado nuevo aguantó la sesión entera («icono conectado» al principio, las tres
frases, «icono desconectado» solo al salir): las líneas `pildora` y `barras` no casan con su
`^estado (\w+)$` y las ignora. El refresco por huella se ve en el log de `dictar --icono`:
«icono actualizado en Windows (version …) · el icono anterior se cerro para que arranque la
version nueva».

## Decisiones

- **Las barras se calculan en WSL** y viajan como enteros: PowerShell no hace FFT ni sabe de
  audio; `fbank` de `voz` ya estaba escrito y probado.
- **Cola de un cuadro por tick**: el audio llega en trozos de ~128 ms (4 cuadros de golpe); sin
  cola la píldora pintaba 10 cuadros/s; con cola de 6 y descarte de los viejos, 32.
- **Reloj adaptable**: 25 ms con algo que animar, 100 ms en reposo.
- **Conexión sin bloquear**: `Connect` por el puente localhost de WSL2 a un puerto sin nadie
  tardaba segundos y congelaba el reloj; ahora `BeginConnect` y se remata en un tick posterior.
- **DPI a mano**: el proceso se declara consciente del DPI y escala las medidas lógicas de sflow;
  sin eso Windows lo pintaba borroso y `CopyFromScreen` fotografiaba otra zona.
- **Órdenes a PowerShell codificadas** (`-EncodedCommand`): con `-Command`, Windows se come las
  comillas al partir la línea.

## Formas en que podría estar mal, y qué se hizo

- *Parpadeo*: doble búfer en el formulario y una sola pasada de pintado por cuadro; no se vio en
  las capturas.
- *Tapa la barra de tareas*: se coloca sobre `WorkingArea` (excluye la barra); si se arrastra,
  queda donde la dejes.
- *Dos monitores*: se centra en el monitor principal; en otro, arrástrala (la posición se
  recuerda). No se probó con dos pantallas.
- *DPI alto*: probado a 150 % (144 dpi). Con monitores de DPI distinto no se probó.
- *El dictado muere y la píldora se queda «escuchando»*: el icono detecta el cierre del socket
  (`Poll` + 0 bytes) y pasa a «apagado»; visto en cada corrida al terminar la sesión.
- *Socket saturado*: cola acotada a 6 cuadros; a ~2,3 KB/s no hay saturación posible.
- *Se oye a sí misma*: no aplica, la píldora no captura nada; el audio llega del dictado.
- *Un `sinVoz` real muestra la X*: sí, y a los 1,2 s vuelve; en la sesión se simuló con
  `--prueba-error` porque las voces sintéticas nunca dan «sin voz».

## Lo que queda fuera

Hub de sflow, ajustes en ventana, punto rojo en la barra de menú (macOS), animación del ancho
(sflow interpola; aquí cambia de golpe), y cualquier binario o DLL.
