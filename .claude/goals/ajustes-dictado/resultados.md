# Ajustes del dictado — resultados

Ejecutado el 2026-09-21 a partir de `spec.md` (compilado el mismo día desde `config.py` de sflow).
Evidencia: `node scripts/laboratorio-voz/captura-ajustes.mjs` (capturas y medidas sobre la build de
producción, con un servidor propio en `:3012` sobre una COPIA de los datos) → `capturas-laboratorio/
4*-ajustes-*.png` y `ajustes.json`; pruebas puras en `tools/dictado/pruebas/ajustes.ts` (10) y
`src/features/ajustes/pruebas/ajustes.ts` (5); `npm run validate` en verde y sellado.

## Qué hay

- **Un archivo, un origen**: `<datos>/ajustes.json`, defectos en un solo sitio (`tools/dictado/src/ajustes.ts`,
  `DEFECTOS` + `ESQUEMA` de 21 campos en 8 grupos), `version` 1, migración (v0 = nombres de bandera →
  claves), lectura tolerante (roto → defectos + aviso, y no se pisa), escritura atómica (temporal + rename),
  claves desconocidas conservadas. Ningún secreto: el token sigue en `movil.token` / entorno.
- **Precedencia visible**: argumento > entorno > ajustes > defecto. `dictado config` y `dictado ajustes`
  dicen `clave = valor (origen)`; un valor inválido en una capa se descarta con aviso y se sigue con la
  siguiente (nunca una caída).
- **Terminal**: `dictado ajustes [pon|quita|restablece --si|catalogo] [--json]`. Un motor no instalado se
  rechaza con la lista; lo «sin proveedor» no se puede encender; carpeta de solo lectura → error con la ruta.
- **Catálogo medido aquí**: instalados (`motoresDisponibles`, ahora con los faster-whisper concretos)
  × `medicion/ultima-medicion-cpu.json` (Ryzen 7 5700G, FLEURS es_419, 150 tomas, 2026-09-15): WER, p50,
  p95, carga; sin cifra → «sin medir». El defecto sigue siendo Parakeet.
- **Página `/ajustes`** (`src/features/ajustes/`, ruta `/api/ajustes` tras Bearer): grupos Motor (con el
  catálogo), Tecla y modo, Pegado, Audio, Texto, Sonidos, Historial, Sin proveedor (gris, deshabilitado);
  cada campo con su origen, si se aplica en caliente o en la siguiente sesión, y el aviso cuando una
  bandera o el entorno mandan por encima del archivo; error de validación pegado al campo (422);
  restablecer con doble confirmación. Entra desde `/historial`, `/dictar` y el menú del icono («Ajustes»).
  Guarda por las MISMAS piezas que el CLI (`maquina.mjs` → `cli-ajustes`).
- **En caliente**: `dictar` vigila el archivo (stat cada 1 s). Aplica sin reiniciar `pegar`, `gananciaDb`,
  `umbralVozDb`, `comandos`, `snippets`, `diccionario`, `sonidoAlEmpezar/Terminar`, `retencionDias`;
  avisa «siguiente sesión» para motor, respaldo, idioma, hilos, modo, tecla, silencio, mic, corrección;
  y dice cuándo el archivo cambió pero una bandera/entorno lo fija en esta sesión.
- **Sonidos** (nuevo, apagado): dos tonos generados (sin archivos) por el altavoz de `di`.
- **`instala`** deja `ajustes.json` con los defectos (y no toca uno que exista); **`diagnostico`** muestra
  los ajustes fuera de defecto con su origen, sin secretos. **`en-vivo`** solo fija su forma (manos libres,
  tecla que alterna, icono); el **demonio** lee motor/respaldo/idioma/hilos del archivo.

## Evidencia de terminal (real, 2026-09-21)

```
$ dictado ajustes pon pegar teclear
pegar = teclear guardado en /tmp/…/ajustes.json
  un dictado en marcha lo toma sin reiniciar
$ dictado ajustes pon motor whisper-turbo
✗ el motor «whisper-turbo» no esta en la carpeta de modelos. Instalados: parakeet, faster-whisper:small   (rc=1)
$ dictado ajustes pon silencioMs abc
✗ «silencioMs» espera un entero entre 300 y 5000   (rc=1)
$ dictado ajustes pon limpiezaLlm true
✗ «limpiezaLlm» no se puede encender: no hay modelo de lenguaje local ni proveedor declarado; encenderlo mandaria lo dictado a un tercero (C4)
$ DICTADO_RETENCION_DIAS=30 dictado config --silencio-ms 800   (extracto)
  pegar                   teclear                (ajustes)
  silencioMs              800                    (argumento)
  retencionDias           30                     (entorno)
  motor                   parakeet               (defecto)
$ dictado ajustes catalogo
medido el 2026-09-15 en AMD Ryzen 7 5700G with Radeon Graphics (FLEURS es_419 test, 150 tomas)
  parakeet             WER   3,3 % · p50   532 ms · p95   926 ms · carga 76 ms   el defecto: mejor latencia por precision medida
  faster-whisper:small WER   5,8 % · p50  1626 ms · p95  1923 ms · carga 2674 ms  mas lento que el defecto
$ dictado diagnostico --sin-microfono   (última línea)
ajustes: /tmp/…/ajustes.json (version 1) · pegar=teclear (ajustes)
$ DICTADO_DATOS=<limpio> dictado instala --sin-icono   (extracto)
  | ajustes (ajustes.json) | script | 0 ms | creado con los defectos (motor parakeet): …/ajustes.json |
ajustes: …/ajustes.json (version 1) · todo por defecto
```

Archivo con motor ausente, valor inválido y clave ajena (`{"motor":"whisper-turbo","silencioMs":"abc","colorDeLaPildora":"rojo"}`):
`dictado ajustes` arranca con `motor parakeet (defecto)`, `silencioMs 1000 (defecto)` y tres avisos
(«claves que no conozco y conservo», «ajustes.motor … se ignora», «ajustes.silencioMs … se ignora»); el
siguiente `pon` conserva las tres claves tal cual.

## Capturas (Playwright, build de producción)

- `40-ajustes-completo.png` (1280, página entera): 8 grupos, 21 campos, «0 ajustes fuera del defecto».
- `41-ajustes-catalogo.png`: tabla con parakeet «en uso» 3,3 % / 532 / 926 / 76 ms y faster-whisper:small
  5,8 % / 1626 / 1923 / 2674 ms; pie con la máquina, el corpus y la fecha.
- `42-ajustes-guardado.png`: pegar → teclear, origen «guardado», «1 ajuste fuera del defecto»; el archivo
  quedó `{"version":1,"pegar":"teclear"}`.
- `43-ajustes-invalido.png`: silencioMs = 100 → «tiene que estar entre 300 y 5000 (diste 100)» junto al
  campo; el archivo no cambió. Por la ruta: motor no instalado → 422 con la lista; sin token → 401.
- `44-ajustes-sin-proveedor.png`: dos interruptores deshabilitados y apagados, con la razón.
- `45-ajustes-caliente.png` + `ajustes-caliente.log`: con `dictar --entrada pildora-sesion.wav` corriendo
  (manos libres, `--silencio-ms 700`), desde la página: `sonidoAlTerminar false → true: aplicado en
  caliente`, `comandos true → false: aplicado en caliente`, `motor parakeet → faster-whisper:small: se
  aplica en la siguiente sesion (exige recargar)`, `silencioMs cambio en el archivo, pero en esta sesion lo
  fija --silencio-ms (700): el archivo no manda`. Las tres frases siguieron transcribiéndose (325 / 237 /
  243 ms). El altavoz no reportó error (el tono no se puede oír en esta sesión).
- `46/47-ajustes-movil-oscuro*.png` (390 px, clase `dark`): sin desborde horizontal (ancho 390); los campos
  se apilan; el catálogo esconde «carga» y «nota» en pantallas estrechas.

## Tabla medida (sin otra carga)

| Medida | Valor |
|---|---|
| Leer + resolver los ajustes al arrancar (en proceso, 20 corridas) | p50 **0,01 ms**, máx 0,27 ms |
| `GET /api/ajustes` (7 corridas) | p50 **98-102 ms** (el arranque de `maquina.mjs`, como el historial) |
| Carga de `/ajustes` hasta el último grupo (build) | 761-805 ms |
| `dictar --entrada limpio-14.wav`, sin respaldo, **antes** (código anterior, 5 corridas) | arranque → motor listo 2 578-2 805 ms (p50 2 597) · latencia fin de habla → pegado 206-223 ms (p50 215) |
| Lo mismo **después** (5 corridas) | arranque → motor listo 2 513-2 875 ms (p50 2 522) · latencia 209-221 ms (p50 216) |
| Con `respaldo: auto` (defecto) y faster-whisper instalado | +~1,4 s de arranque (carga del respaldo), latencia igual (228 ms) |

Pruebas: `tools/dictado`: 118/118 (10 nuevas: defectos, validación, precedencia con los 4 casos, migración,
pon/quita, archivo roto + atómico, dos escrituras + solo lectura, vigilancia, catálogo con medición fija,
tono); app: `prueba:ajustes` 5/5, en el gate. `npm run validate` verde y sellado (árbol d4f13ca4ccc0).

## Decisiones

- **Los defectos son los medidos, no los de sflow**: Parakeet, 1000 ms de silencio, ganancia 0, 8 hilos,
  retención 365 (AISIA). `respaldo: auto` (faster-whisper:small si está instalado; nada con `remoto`, que ya
  trae el suyo) reproduce lo que `en-vivo` hacía a mano, y si no arranca se sigue sin él y se dice.
- **`en-vivo` deja de fijar motor/respaldo/ganancia/silencio**: si los pasara como banderas, la página no
  tendría efecto sobre el dictado de todos los días (argumento > ajustes). Sigue fijando su forma (modo
  manos libres, tecla que alterna, icono) porque eso es lo que `en-vivo` significa.
- **Precedencia argumento > entorno > ajustes > defecto**, y no al revés: una bandera es lo que la persona
  escribe hoy; el entorno son las decisiones del guion que lanza; el archivo es lo de siempre. Y se ve.
- **El archivo no lleva secretos ni rutas**: rutas y servicio remoto siguen por entorno (son de la máquina).
- **Lo inválido en el archivo se conserva**, con aviso, en vez de corregirse en silencio: es su archivo.
- **Sin proveedor, de verdad**: `limpiezaLlm` y `modoComando` existen en el esquema para que la página los
  enseñe apagados con la razón (C4); `valida` rechaza `true`.
- **Interruptores optimistas** en la página (cambian al click y vuelven si el servidor rechaza); las cajas
  guardan al salir o con Enter y se rearman por `key` cuando el servidor devuelve otro valor (sin
  `setState` en efectos, la regla del lint).
- **`config.py` en el SDD pasa de «sustituido» a «portado»**, con lo que se tomó, lo que se cambió y lo que no.

## Formas en que podría estar mal, y qué se hizo

- *Archivo roto*: defectos + aviso, no se pisa; probado (pura y en terminal). *Clave desconocida / versión
  futura*: se conserva al escribir, avisa; probado. *Motor en ajustes que ya no está*: aviso y defecto;
  probado en terminal. *Entorno vs ajustes*: manda el entorno y la página dice «lo fija DICTADO_…»; probado.
- *Dos escrituras a la vez*: temporal único por pid + rename; 20 seguidas dejan la última entera y ningún
  `.tmp`. *Carpeta de solo lectura*: error con la ruta (CLI rc=1; página 422 junto al campo; `instala` lo
  anota y sigue). *Token caducado*: 401 → «el emparejamiento caducó» como en `/historial`.
- *`--tecla` a secas dispararía un aviso falso* («espera un código») por ser presencia y no valor: la
  resolución salta esa capa sin aviso; probado.
- *Las capturas dejaban un `next-server` huérfano en :3012* (matar `npx` no mata a su hijo; vivido en la
  segunda corrida): el guion lo lanza en su propio grupo y mata el grupo, también por señal.
- *`instala` decía «sin ajustes.json» en su diagnóstico final* porque la configuración se leyó antes de
  crearlo: se relee al final.
- *`respaldo: auto` podía cambiar la forma de los guiones de medición* (dictan con `--motor remoto`): con
  `remoto` no aplica.
- **Deuda que queda**: `cli-dictar.ts` pasa de 600 a 683 líneas (ya superaba las 500 antes de esta meta);
  el bloque «en caliente» es un cierre sobre el estado de la sesión y no se extrajo. El tono de los sonidos
  se manda al altavoz de Windows sin poder verificarse en esta sesión que suena.

## Lo que queda fuera

Modelo de lenguaje para limpieza/transformaciones/modo comando (CDC + C4 aparte), botón del ratón como
tecla (el sensor `tecla-global.ps1` solo lee teclas), pegado en flujo, y reiniciar el demonio solo cuando
cambia el motor (hoy se dice: `npm run demonio -- --parar && npm run demonio`).
