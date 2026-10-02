# @tu-scope/reel

**Reel del celular para pymes**: corta y subtitula lo que el dueño graba, con su marca, **sin exponer a nadie que
no consintió**, y deja el máster listo para aprobar con cuenta y huella. Todo local: nada sale del servidor. Nada
se publica. Diseño y candado: `.claude/PRPs/PRP-007-reel-del-celular.md`; lo firmado:
`.claude/goals/pymes-marketing/propuesta-video.md` §8.

## Qué hace
- **Cortes por reglas** (sin LLM): silencios largos y retomas (se queda la última toma), con respiro medido.
- **Subtítulos** de la marca, en la zona segura de 9:16, escapados (lo dicho es dato, nunca estilo).
- **Cotejo de precios** contra el catálogo (cifras o palabras: «cuarenta y cinco pesos»); si no coincide, bloquea.
- **Privacidad** (AISIA firmada): caras sin consentimiento desenfocadas por defecto y re-verificadas en el
  máster; datos en pantalla (teléfono, RFC, CURP, correo, tarjeta) bloquean con reporte enmascarado a 4
  caracteres; más voces que consentimientos bloquea; sonido de fondo continuo (música) bloquea; clip horizontal
  bloquea antes de gastar CPU; un corte que parte lo que dijo otra persona (quitarla entera no) bloquea hasta que el
  dueño confirma en la sala que no le cambia el sentido, y si ninguna voz domina se revisan los cortes de todas.
- **Máster declarativo y determinista** (misma entrada, mismos bytes) a 1080×1920, 30 fps, H.264 + AAC 48 kHz,
  −14 LUFS; **QA** que bloquea; hoja de cuadros.
- **Retención** de 30 días con reloj inyectado; **sala**: validar aprobaciones y aplicar marcas en el segundo exacto.

### Lo que no hace (bloqueado hasta firma)
LLM sobre la transcripción, transcripción remota, video generativo, reducción de ruido, foto de producto en
video, render en producción. **Publicar: nunca** — lo hace el dueño.

## Casos de uso

- **El dueño de una pyme** graba con su celular, de pie y en vertical, 15 a 60 segundos de lo que sabe hacer
  (guía: `docs/GUIA-DUENO-REEL.md`): recibe un reel 9:16 cortado donde se trabó o repitió, con subtítulos en sus
  colores y el volumen que piden las redes, listo para aprobar y subir él.
- **Sale alguien más en cuadro o se oye otra voz**: sin consentimiento registrado, su cara se desenfoca y, si hay más
  voces que consentimientos, el reel se detiene hasta que se registre o se corte ese tramo.
- **Dice un precio**: se coteja contra su catálogo; si dice «cincuenta» y el catálogo dice $45, el reel se detiene.
- **Aprueba desde la sala**: la aprobación guarda la huella del archivo exacto; si después cambia algo, queda revocada.
  La app que lo usa: `src/features/reel/`.

## Requerimientos de infraestructura

- **Runtime**: Node `>=20` (`engines`). El núcleo (`.`) no tiene dependencias; `./node` es el que necesita lo demás.
- **Dependencias del sistema**: para `./node`, ffmpeg, `python3` con OpenCV ≥ 4.5.4 y Tesseract con `spa`; los
  modelos (Parakeet TDT 0.6B v3 int8, WeSpeaker ResNet34-LM, YuNet 2022mar) y los runtimes `sherpa-onnx-node@1.13.8` y
  `onnxruntime-node@1.30.0` se inyectan y van pineados con su huella en `LICENCIAS.md`. El paquete no trae ninguno.
- **CPU, GPU y memoria**: CPU medida (clips sintéticos, 2026-09-27): ≈ 45–50 s por clip de 25 s (ver «Medido» abajo).
  GPU: no medido (no se usa). Memoria: no medido.
- **Servicios externos**: ninguno. Transcripción, caras, voces y lectura de pantalla corren en la máquina.
- **Variables de entorno**: ninguna en el paquete; las rutas y los modelos se pasan como argumentos. La app que lo
  usa lee las suyas (ver `src/features/reel/README.md`).
- **Almacenamiento**: la `carpeta` que le pasa quien llama (video, transcripción, máster y hoja de cuadros), con
  retención de 30 días por reloj inyectado. El paquete no elige dónde.
- **Salida del perímetro (C4)**: nada sale del servidor (AISIA firmada). Transcripción remota y LLM sobre la
  transcripción están bloqueados hasta firma; publicar, nunca.

## Uso
```ts
import { propone, rotulos, revisaPrivacidad, validaAprobacion } from '@tu-scope/reel';      // núcleo, cero dependencias
import { procesa } from '@tu-scope/reel/node';                                             // de punta a punta
const r = await procesa({ bruto, carpeta, marca, catalogo, consentimientos, hoy }, {
  sherpa, ort, diarizacion: { creaModeloHablante, creaDiarizador },  // inyectados (p. ej. de @tu-scope/voz 0.5.0)
  parakeet, hablante, yunet,                                          // rutas de los modelos (ver LICENCIAS.md)
});
```
`./node` necesita en la máquina: ffmpeg, `python3` con OpenCV ≥ 4.5.4 y Tesseract con `spa`.

## Medido (clips sintéticos, 2026-09-27)
Ver `public/laboratorio-pymes/reel/medicion.json` y `/laboratorio-pymes`: ≈ 45–50 s por clip de 25 s en CPU;
marcas por palabra con mediana 51 ms y p90 140 ms; misma huella en dos renders.
