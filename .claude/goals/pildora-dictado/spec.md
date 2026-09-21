# Píldora flotante del dictado — Spec

Compilado por `/goal-compiler` el 2026-09-20. Forma: **LOOP** (un ejecutor, un artefacto,
nada que exija contextos separados). Lo que se pega en `/goal` es `goal.txt`, NO este archivo.
Decisión tomada al compilar (no se re-decide): **los atajos de teclado se quedan como están**
(un toque de Ctrl derecho enciende manos libres, otro lo apaga; `en-vivo` con `--tecla-alternar`).
Este goal es lo VISUAL: la píldora.

## MISION

Que el dictado tenga en Windows la píldora flotante que tiene sflow y que hoy no tiene: un
óvalo mínimo, siempre encima, abajo al centro de la pantalla, que en reposo es solo el logo, al
escuchar se ensancha y muestra **barras de audio en tiempo real** que siguen la voz, al
transcribir muestra puntos girando, al pegar muestra una palomita verde que se va sola, y ante
un fallo una X roja que también se va sola. Que una persona que dicta todo el día vea DE UN
VISTAZO si la máquina la oye, sin mirar la terminal ni el icono de la barra. Nivel referencia:
la píldora de sflow (`ui/` de https://github.com/daniel-carreon/sflow, MIT, © Daniel Carreón; la
atribución sigue en el SDD y el README), con sus mismas medidas y su mismo visualizador de
barras en escala de dB con decaimiento, pero alimentado desde WSL por el dictado que ya existe.

Reemplaza al botón flotante redondo de 46 px que hoy pinta `windows/icono-barra.ps1` (el icono
del área de notificación y su menú se conservan). Estados y visual, tal cual sflow:

| estado del dictado | píldora | visual |
|---|---|---|
| `inactivo` (en espera) | idle | píldora pequeña (34 × 34) con el logo (22 px) |
| `escuchando` | recording | píldora ensanchada (100 × 34) con 20 barras animadas |
| `transcribiendo` / `pegando` | processing | píldora de estado (52 × 34) con puntos girando |
| texto pegado | done | palomita verde, se va sola (~1,2 s) y vuelve a idle |
| sin voz / fallo del motor / captura muerta | error | X roja, se va sola (~1,5 s) y vuelve a idle |
| dictado apagado / arrancando | apagado | como hoy: gris hueco / ámbar hueco |

Constantes de sflow que se respetan (son medidas, no sugerencias): anchos 34 / 100 / 52, alto
34, radio 17, opacidad 0,90, margen inferior 14 px, logo 22 px, 20 barras, decaimiento 0,85 por
cuadro, ganancia como perilla (~2,3 de partida, en escala de dB, no multiplicador crudo), 60 fps
objetivo (si PowerShell no llega, 30 fps medidos y dicho). Colores: los del icono actual (gris,
rojo escuchando, ámbar transcribiendo), verde y rojo para hecho/error.

Menú derecho del icono: además de lo de hoy, «Abrir historial» abre `http://localhost:3000/laboratorio-voz`
(la sección «Tus datos», si la app responde) y, si no, una terminal con `dictado historial`. Es
el equivalente de «Abrir Dashboard» de sflow; el hub no se porta.

## HECHOS QUE FIJAN EL DISEÑO (ya en el repo; leerlos antes)

- `windows/icono-barra.ps1` (235 líneas, PowerShell + WinForms, legible): NotifyIcon + botón
  flotante TopMost con `TransparencyKey`, colores por estado, arrastre con posición recordada,
  timer de 150 ms que lee `estado <nombre>` del TCP 127.0.0.1:47124 (`src/node/icono.ts`), click
  → `alternar`, arranque del dictado por `wsl.exe` si no corre, mutex de instancia única, menú
  derecho. `dictado icono instala` lo copia a Windows con huella (`cli-icono.ts`), así que cambiar
  el script se refresca solo en la máquina de quien lo usa.
- `Estado` del núcleo (`src/dictado.ts`): `inactivo | escuchando | transcribiendo | pegando`. No
  hay «hecho» ni «error» como estado: salen como eventos `texto` (pegado) y `sinVoz`/errores en
  `cli-dictar.ts`. La píldora los necesita como avisos de un momento, no como estados.
- Nivel de audio: `cli-dictar.ts` ya recibe cada trozo del micrófono (`alimenta(m, …)`) y calcula
  `nivelDb` por ventana de 30 ms para el pico. `tools/voz` trae `fbank` (bancos de filtros) y
  `creaTroceador`; con eso, 20 bandas por cuadro cuestan poco. Nada de esto sale hoy hacia
  Windows: el protocolo del icono es de una palabra por línea.
- El icono y la tecla hablan por TCP local porque Windows llega a WSL2 por localhost sin
  configurar nada (SDD §2). Solo 127.0.0.1; dos palabras admitidas hacia dentro.
- Fuera: WSL no puede pintar sobre el escritorio de Windows; todo lo visual va en el ayudante
  PowerShell, a la vista, sin compilar (SDD §8 y §2: «ventana de Windows como otro ayudante
  PowerShell/WinForms»). Un binario o DLL sería CDC (C1) y no hace falta.
- Medido el 2026-09-19: PowerShell repinta el botón sin problema a 150 ms; a 30–60 fps con 20
  barras NO está medido. Es lo primero que se mide.

## LIBERTAD TECNICA

Tú eliges dónde calcular las barras (el dictado en WSL manda 20 valores por cuadro por el
mismo socket, o manda el nivel y la píldora lo reparte; lo primero mantiene a PowerShell tonto y
es la sugerencia), cómo pintar sin parpadeo (doble búfer, `SetStyle`, región redonda, capa
`Layered` con alfa real para la opacidad 0,90), cómo animar los puntos, y cómo extender el
protocolo (`nivel <db>`, `barras <20 valores>`, `hecho`, `error <razon>`: cortas, una por línea,
y el icono viejo debe seguir funcionando si recibe lo que no entiende). Sugerencias descartables
salvo RESTRICCIONES. Lo que sí es innegociable: la lógica que se pueda probar sin Windows (la
máquina de estados de la píldora con sus temporizadores de auto-cierre, el cálculo de barras con
decaimiento y ganancia, el parseo del protocolo) vive en TypeScript en `tools/dictado` con
pruebas puras; PowerShell solo pinta lo que le llega.

## INVESTIGA ANTES DE CONSTRUIR

Lee `windows/icono-barra.ps1`, `src/node/icono.ts`, `src/node/cli-icono.ts`, `cli-dictar.ts`
(dónde se publica el estado y dónde llegan los trozos de audio), `tools/voz/src/audio/fbank.ts`
y el `ui/` de sflow (`audio_visualizer.py` para la escala de dB, `pill` para los estados y el
auto-cierre). Mide primero cuántos fps aguanta PowerShell pintando 20 barras con transparencia
antes de decidir el tamaño del cuadro. Reafirma el objetivo en una línea antes de cada edición
grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- Último output del comando de validación pegado, en verde; `npm run validate` en verde al final.
- Capturas de pantalla de Windows (tomadas desde WSL con PowerShell, p. ej. `CopyFromScreen`
  de la región de la píldora, y leídas con la herramienta de lectura) de los CINCO estados: idle
  con logo; escuchando con barras en DOS cuadros distintos mientras suena un audio (para que se
  vea que se mueven); procesando; hecho (palomita); error (X). Y una del menú con «Abrir
  historial». Cada captura descrita en una línea.
- Tabla medida: fps reales de la píldora en Windows mientras escucha; CPU del PowerShell en
  reposo y escuchando; latencia de `estado` → repintado (marca de tiempo en el dictado y en el
  script) p50; bytes/s del socket con barras. Sin otra carga en la máquina.
- Pruebas puras en Node (`tools/dictado/pruebas/`): máquina de estados de la píldora con reloj
  falso (idle → recording → processing → done → idle; error → idle; auto-cierre; un `estado` en
  mitad de un aviso), cálculo de barras (decaimiento 0,85, ganancia, escala de dB, 20 bandas de
  un tono y de silencio), protocolo (líneas desconocidas se ignoran).
- El icono viejo ya instalado sigue funcionando con el dictado nuevo (líneas nuevas ignoradas),
  y `dictado icono instala` / `dictar --icono` refrescan al nuevo por huella: mostrado en el log.
- `dictado dictar --entrada <wav> --icono` (el archivo como micrófono) sirve de banco de pruebas
  repetible de toda la secuencia; se enseña la salida.
- Reporte de decisiones (dónde se calculan las barras, cuadro elegido y por qué, cómo se logró
  la opacidad con transparencia) y lista de formas en que podría estar mal, resueltas
  (parpadeo, píldora que tapa la barra de tareas, dos monitores, DPI alto, el dictado muere y la
  píldora se queda en «escuchando», socket saturado a 60 fps).
- README de dictado (§1.b «El icono de la barra») y SDD §2 (fila `ui/*`) y §8 al día.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && (cd tools/dictado && npm run build && npm run prueba)`
tras cada cambio grande, con el output pegado. `npm run validate` antes de cerrar. Mediciones
sin otra carga en la máquina.

## RESTRICCIONES REALES

- Los atajos de teclado NO cambian: un toque de Ctrl derecho alterna manos libres (decisión de
  quien decide al compilar). `tecla-global.ps1` y `creaGestosDeTecla` no se tocan.
- Sin binarios ni DLL: PowerShell legible, a la vista, como los otros ayudantes. Un compilado
  sería CDC (C1) y no se hace aquí.
- Solo 127.0.0.1; el mismo puerto 47124; ninguna palabra nueva hacia DENTRO del dictado (solo
  `alternar`); nada sale a internet; ningún audio ni texto se escribe en Windows (las barras son
  niveles, no audio).
- No tocar `settings.json`, skills ni prompts. Español sin jerga en todo lo que lee una persona.
- Lo que no se hará: el hub de sflow, modo comando, streaming parcial de texto, macOS.
