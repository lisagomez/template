# Propuesta de entrada para `BITACORA-CDC.md` — pendiente de firma

> El verificador de gobernanza exige que toda entrada de la bitácora lleve firma humana
> («una decisión sin dueño no es una decisión»). El agente NO firma: esta es la entrada
> redactada y medida, lista para que quien decide la revise, la pegue al final de
> `.claude/gobernanza/BITACORA-CDC.md` y ponga su nombre en «Aprobado por». Si prefiere
> volver al micrófono abierto en espera, basta `--mic-en-espera abierto` en `DICTADO_FLAGS`.

### 2026-09-20 — dictado: calibración sobre corpus propio (sin cambio de umbrales), micrófono cerrado en espera por defecto, ganancia `auto` opcional — radio: menor (parámetros de la herramienta de dictado)
- **Cambio**: (1) **Ningún umbral del VAD ni de la puerta de energía cambia**: se midieron sobre
  `tools/dictado/medicion/corpus-propio/` (90 audios sintéticos, dos voces Piper, en limpio, con
  ruido de oficina y como celular; `medicion/calibra.mjs`) y los valores vigentes (cierre 1000 ms,
  relleno 250 ms, puerta −45 dBFS) no parten ninguna frase (0/60 en todo el barrido de 500 a
  1500 ms), no se comen palabras con relleno ≥ 250 ms (1/60 con 100 ms) y no abren ningún turno
  fantasma sobre ruido rosa de −60 a −35 dBFS. (2) La **corrección por similitud del diccionario
  sigue apagada**: con 11 términos no sustituyó nada en 90 archivos (0 mejoras, 0 empeoras); sin
  evidencia a favor, no se enciende. (3) `dictar` cierra el micrófono en espera por defecto
  (`--mic-en-espera cerrado`; `abierto` conserva lo anterior): reabre en 71–262 ms medidos por
  PulseAudio de WSLg (545 ms la primera vez en frío), bajo el tope de 500 ms fijado en el plan.
  (4) `--ganancia-db auto` existe y es **opcional**: `en-vivo.mjs` sigue con ganancia 0 hasta
  medirla con voz real. (5) El laboratorio pide al lote cierre de 500 ms (el defecto del CLI):
  con 700 una reunión de muestra salía en un solo turno.
- **Motivo**: plan «voz lista para usuarios», Etapa 1 (1.2, 1.3, 1.4, 1.5). Lo medido: WER sobre
  el corpus sintético 5,1 % limpio · 4,5 % ruido · 6,3 % celular con cifras igualadas (10,9 / 9,8 /
  11,2 % crudo: el motor escribe «3412» y la referencia «tres mil cuatrocientos doce»); el resto
  son nombres propios. Es voz sintética: la tabla con voz propia queda pendiente de grabar las 30
  frases (`frases.txt`) en tres condiciones.
- **Gate aplicado**: diff revisado ☑ (esta entrada, `calibracion-2026-09-20.md`, `cli-dictar.ts`,
  `ganancia.ts`) · regresión verde ☑ (`tools/dictado` 38/38, laboratorio 13/13, asesor 13/13) ·
  aprobación humana ☐ (pendiente: es un cambio de defecto del CLI; quien decide puede volver a
  `--mic-en-espera abierto` en `DICTADO_FLAGS`) · pineo ☑ (sin modelos nuevos).
- **Regresión**: `npm run validate` en verde el 2026-09-20 tras el cambio (ver informe del goal).
- **Aprobado por**: pendiente.
