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
  bloquea antes de gastar CPU.
- **Máster declarativo y determinista** (misma entrada, mismos bytes) a 1080×1920, 30 fps, H.264 + AAC 48 kHz,
  −14 LUFS; **QA** que bloquea; hoja de cuadros.
- **Retención** de 30 días con reloj inyectado; **sala**: validar aprobaciones y aplicar marcas en el segundo exacto.

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

## Lo que no hace (bloqueado hasta firma)
LLM sobre la transcripción, transcripción remota, video generativo, reducción de ruido, foto de producto en
video, render en producción. **Publicar: nunca** — lo hace el dueño.
