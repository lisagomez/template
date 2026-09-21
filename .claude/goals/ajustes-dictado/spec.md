# Ajustes del dictado — lo que `config.py` de sflow hace bien, hecho aquí — Spec

Compilado por `/goal-compiler` el 2026-09-21. Forma: **LOOP**. Lo que se pega en `/goal` es
`goal.txt`, NO este archivo. Referencia analizada: `config.py` de sflow (195 líneas, MIT,
© Daniel Carreón; https://github.com/daniel-carreon/sflow/blob/main/config.py). Decisión de
alcance (2026-09-21): **el mecanismo de ajustes + el catálogo de motores + la pantalla**; lo que
exige un modelo de lenguaje se deja como enchufe apagado, y el audio sigue sin guardarse.

## LO QUE HACE `config.py` Y QUÉ PASA CON CADA COSA

| En sflow | Qué es | Aquí |
|---|---|---|
| `_default_settings()` + `settings.json` + `load/save/get/set_setting` | ajustes con defectos en un solo sitio, que persisten y se cambian en caliente desde la UI | **falta: es el corazón de esta meta**. Hoy `dictado` solo lee entorno + argumentos (`src/node/cli-config.ts`) y cada vez que corres `dictar` repites banderas |
| migración `transcribe_backend → stt_model` | los ajustes viejos siguen valiendo | **portar la idea**: el archivo lleva `version` y una función de migración con prueba |
| `STT_MODELS` con benchmark M4 (latencia, WER) y `get_stt_model()` con caída | catálogo elegible desde Ajustes, con cifras | **portar, con cifras de ESTA máquina**: `medicion/ultima-medicion-cpu.json` (Ryzen 5700G, CPU, FLEURS es_419) cruzado con lo que hay en la carpeta de modelos (`dictado motores`). La tabla del M4 no se hereda (SDD §5) |
| separación `_RESOURCE_DIR` / `_DATA_DIR` y `.env` aparte | recursos de solo lectura vs datos del usuario; secretos fuera del settings | **ya existe** (`DICTADO_DATOS` = `~/.dictado`, pesos aparte). Se conserva la regla: **ningún secreto en `ajustes.json`** (el token sigue en entorno / donde lo dejó `instala`) |
| `stt_model`, `paste_backend`, `mouse_button_hotkey`, `smart_commands_enabled`, `snippets_enabled`, `personal_dictionary_enabled`, `sound_on_start/done`, `history_hotkey_enabled`, `command_mode_enabled` | interruptores | motor, pegado, modo/tecla, comandos, snippets, diccionario ya son banderas: **pasan a ajustes con la misma semántica**. Sonidos al empezar/terminar: **nuevo, apagado por defecto** (un wav corto por el altavoz que ya usa `di`). Botón del ratón: se toma **solo si el sensor `tecla-global.ps1` lo puede leer sin cambiar de método**; si no, se documenta como fuera |
| `llm_cleanup_enabled`, `llm_model`, `context_aware_tone`, `transform_prompts` | limpieza y transformaciones por LLM | **enchufe apagado**: en Ajustes aparecen como «sin proveedor» y no se pueden encender. Se recuperan cuando exista un `ModeloTexto` (decisión C4/CDC aparte) |
| `save_audio_for_retry`, `AUDIO_DIR` | guardar el audio para reintentar | **no**: el audio nunca toca el disco (decisión del proyecto, no se re-decide) |
| `focus_mode_*`, `liquid_glass_enabled`, `streaming_paste_enabled` | macOS / estética / pegado en flujo | **fuera** (macOS, o no es dictado); el pegado en flujo queda anotado como idea, sin construir |
| constantes de audio, píldora, visualizador, doble toque de Ctrl | cifras de ingeniería | **ya viven en código** (`audio.ts`, `pildora.ts`, `barras.ts`, `tecla.ts`) y ahí se quedan: no son ajustes de usuario. Lo que sí es del usuario (tecla, ganancia, silencio que cierra frase, idioma, retención) entra a ajustes |

## MISION

Que la persona configure su dictado **una vez** y la máquina lo recuerde: `dictar` sin banderas
hace lo que ella decidió (motor, respaldo, modo y tecla, cómo pegar, ganancia, silencio que
cierra la frase, idioma, sonidos, comandos, snippets, corrección por diccionario, retención del
historial), y cambiarlo es abrir una pantalla de Ajustes en la app o teclear `dictado ajustes`.
Nivel referencia: los ajustes de una herramienta de dictado seria.

- **Un archivo, un origen**: `~/.dictado/ajustes.json` (o donde diga `DICTADO_DATOS`), con los
  defectos declarados en **un solo sitio** de TypeScript puro (y probados), `version`, y una
  migración por versión con prueba. Escritura atómica (temporal + rename). Lectura tolerante:
  archivo roto o ajeno → defectos + aviso claro, **nunca** una caída ni un archivo pisado en silencio.
- **Precedencia explícita y visible**: argumento > entorno > ajustes > defecto. `dictado config`
  dice **de dónde salió cada valor** (`motor=parakeet (ajustes)`, `hilos=8 (defecto)`). Sin secretos:
  el token se sigue enmascarando y nunca se escribe en `ajustes.json`.
- **Terminal**: `dictado ajustes` (lista con origen), `dictado ajustes pon <clave> <valor>` (valida
  clave y valor con el mismo esquema que la pantalla: un motor que no está en la carpeta se
  rechaza con la lista de los que sí hay), `dictado ajustes quita <clave>`, `dictado ajustes
  restablece --si`.
- **Catálogo de motores medido aquí**: lo que hay instalado (carpeta de modelos) cruzado con
  `medicion/ultima-medicion-cpu.json` → por motor: WER, latencia p50/p95, fecha de la medición,
  y «sin medir» cuando no hay cifra. El defecto sigue siendo el medido (Parakeet TDT 0.6B v3
  int8); elegir otro es de la persona y se muestra con su coste. El respaldo (`faster-whisper:small`)
  también se elige ahí.
- **Pantalla de Ajustes en la app** (tras el token, como `/historial`): secciones motor / tecla y
  modo / pegado / audio (ganancia, silencio, idioma) / texto (comandos, snippets, diccionario,
  acciones «dale enter») / sonidos / historial (retención) / «sin proveedor» (limpieza y
  transformaciones, gris, con una línea de por qué). Guardar escribe el mismo archivo por la
  misma lógica pura; lo que ya está en vuelo (`dictar` corriendo, el demonio) **lo toma sin
  reiniciar** cuando es seguro (pegado, comandos, snippets, sonidos, retención), y lo que exige
  recargar un motor se aplica en la siguiente sesión con un aviso honesto en pantalla. Entra
  desde `/historial`, `/dictar` y, si la píldora tiene menú, una entrada «Ajustes» junto a
  «Abrir historial». Bien a 390 px y en oscuro (clase `dark`), mismo lenguaje neutro.
- **Instalación**: `dictado instala` deja `ajustes.json` con defectos y el motor que instaló;
  `dictado diagnostico` muestra los ajustes (sin secretos) y de dónde salieron.
- **Todo lo que no es UI va en TypeScript puro con pruebas**: defectos, esquema y validación,
  precedencia, migración, lectura tolerante, escritura atómica, catálogo cruzado con la medición.

## LIBERTAD TECNICA

Tú eliges arquitectura, forma del esquema, cómo se comparte la validación entre CLI y página,
cómo se avisa en caliente (sondeo, huella del archivo, señal del socket del icono) y dónde vive
la ruta. Lo que aparece aquí es sugerencia descartable, salvo RESTRICCIONES. Reafirma el objetivo
en una línea antes de cada edición grande.

## INVESTIGA ANTES DE CONSTRUIR

Lee entero `tools/dictado/src/node/cli-config.ts`, `cli-dictar.ts`, `cli-instala.ts`,
`cli-diagnostico.ts`, `scripts/demonio.mjs` y `medicion/ultima-medicion-cpu.json`; cómo
`/historial` (`src/features/historial/`, `maquina.mjs`) lee el disco y exige el token; el SDD
(`docs/SDD-dictado.md` §2 y §5) y el README de dictado. Mira 2-3 referencias de cómo lo hacen
herramientas de dictado maduras (ajustes en archivo + UI, precedencia con CLI) y decide.

## DEFINICION DE HECHO (evidencia visible en la conversación)

1. Validación en verde pegada tras cada cambio grande; `npm run validate` en verde al final.
2. Pruebas puras en verde, listadas: defectos, precedencia (argumento/entorno/ajustes/defecto con
   los cuatro casos), migración de una versión vieja, archivo roto → defectos + aviso, escritura
   atómica, validación de clave y valor, catálogo cruzado con una medición fija.
3. Salida real de terminal: `dictado ajustes` (con origen), `pon motor <x>` aceptado y uno
   rechazado con la lista, `dictado config` mostrando el origen de cada valor, `dictado
   diagnostico` sin secretos con la sección de ajustes.
4. Capturas Playwright de la pantalla de Ajustes a 1280 y 390 px y en oscuro: todas las secciones,
   el catálogo con cifras de esta máquina, un cambio guardado, «sin proveedor» en gris, un valor
   inválido rechazado.
5. Caliente demostrado: cambiar «pegado» o «sonidos» en la pantalla con `dictar --entrada
   archivo.wav` corriendo, y el log del dictado mostrando que lo tomó sin reiniciar; y el aviso
   honesto para un cambio de motor.
6. Tabla medida: coste de leer los ajustes al arrancar (ms, p50 de 20 corridas, sin otra carga),
   carga de la pantalla, y latencia de `dictar` **antes y después** (que no suba).
7. `dictado instala` en un `DICTADO_DATOS` limpio deja el archivo y `diagnostico` lo lee.
8. Reporte de decisiones y **formas en que podría estar mal**, resueltas: archivo roto, clave
   desconocida (de una versión futura), motor en ajustes que ya no está en la carpeta, entorno
   y ajustes en conflicto, dos escrituras a la vez, `DICTADO_DATOS` de solo lectura, token
   caducado en la pantalla.
9. README de dictado (sección de ajustes y la ficha de `dictar`) y SDD §2 al día: la fila de
   `config.py` pasa de «sustituido» a «portado» diciendo exactamente qué se tomó y qué no.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && (cd tools/dictado && npm run build && npm run prueba)`
tras cada cambio grande, con el output pegado; si añades otra suite (`prueba:ajustes`), súmala
al comando y al gate `validate`. `npm run validate` antes de cerrar. Mediciones sin otra carga.

## RESTRICCIONES REALES

- Todo local y sin modelo de lenguaje; el audio no se guarda.
- **Ningún secreto en `ajustes.json` ni en pantalla** (token enmascarado: presente/ausente y largo).
- Toda ruta nueva exige el token (Bearer), como `/historial`.
- El bundle de la app no toca el disco con `fs`: va por `maquina.mjs` o su equivalente.
- El defecto de motor sigue siendo el medido; no se cambia un defecto sin cifra de esta máquina.
- No tocar `settings.json` de Claude, skills, prompts, atajos de teclado ni la píldora, salvo una
  entrada de menú «Ajustes» si ya hay menú.
- Español sin jerga, nombres en español (`ajustes`, no `settings`).
