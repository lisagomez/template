# Resultados — reel del celular para pymes (2026-09-27)

Rama `reel-pymes`. Plan con candado: `.claude/PRPs/PRP-007-reel-del-celular.md`. Lo firmado:
`.claude/goals/pymes-marketing/propuesta-video.md` §8 (14 respuestas recomendadas).

## Lo construido
| Pieza | Qué quedó | Cómo se prueba |
|---|---|---|
| Cuentas | `/add-login` acotado: correo y contraseña, `profiles` con disparador, `proxy.ts` solo sobre `/reel`, `/cuenta`, `/api/reel` | Playwright (alta, entrada, salida, ruta protegida, rutas existentes intactas) |
| Esquema | 5 tablas del reel + perfiles, RLS por dueño, aprobaciones y consentimientos inmutables salvo revocar | `npm run reel:rls`: 14/14 contra la base real |
| Motores | Parakeet (palabras con tiempo), WeSpeaker + diarización de `voz` (inyectada), YuNet, Tesseract, ffmpeg | `tools/reel/LICENCIAS.md` con licencia y huella; marcas por palabra medidas |
| `@tu-scope/reel` 0.1.0 | Núcleo sin dependencias (cortes, precios, subtítulos, privacidad, máster, QA, retención, sala) + `./node` | 12 pruebas; `npm run empaqueta reel` |
| Tarjetas | `tarjetaDeTemporada` y las 7 temporadas firmadas en `@tu-scope/pymes-marketing/video` (0.3.0) | `tarj-1..5` |
| App | `/reel` (subir), `/reel/[id]` (sala en el celular), API con sesión + `Origin` + Zod + RLS, proceso hijo | Playwright de punta a punta |
| Laboratorio | 27 casos nuevos (reel 7, privacidad 8, tarjetas 5, sala 7), las 6 trampas firmadas | `prueba:laboratorio-pymes` (en `validate`) |

## Decisiones
- **Supabase en la nube** (decisión del laboratorio) solo para cuentas, versiones, registro y estado de
  consentimientos; video, transcripción y documentos firmados en `REEL_DATOS`, en el servidor.
- **El proceso del reel corre en un proceso hijo**, no dentro de Next: los módulos nativos no pasan por el
  empaquetador y un fallo del motor no tumba el servidor. Uno a la vez (O4).
- **Nada se importa, todo se inyecta** en `./node` (sherpa, onnxruntime, la diarización de `voz`): el paquete no
  depende de ningún `node_modules` local, que era la fragilidad de `dictado`.
- **Aprobar exige `Origin` presente y del mismo sitio**, además de sesión y huella exacta: la sonda de sfstudio aprobó
  desde otro origen.
- **Caras: detección, nunca reconocimiento.** YuNet 2022 (el que carga OpenCV 4.6), umbral 0.8 medido (0.64 era un
  falso positivo del retrato de Rembrandt).
- **Clips sintéticos**: retratos al óleo de dominio público (nadie vivo, ningún menor) y voces Piper locales.
- **Migraciones**: el laboratorio pegó el SQL en el SQL Editor (el MCP responde «Unauthorized»: su token es un
  marcador; no hay cadena de conexión). El script declarado `reel:migraciones` queda para cuando la haya.
- **La prueba de RLS es una medición** (escribe `rls.json`, la verifica `sala-7` en `validate`) porque necesita red y
  crea cuentas; el gate inactivo con motivo queda propuesto para firma.

## Formas de estar mal, y cómo se resolvieron
| Riesgo | Qué pasaba | Resuelto |
|---|---|---|
| Retoma falsa | «el pan de» en dos frases se cortaba como retoma (dos veces, con reglas distintas) | Retoma = inicio de frase y ≤ 2 palabras en medio (`reel-4`) |
| Precio sin producto | «pan de muer» no casaba con «pan de muerto» | Prefijo desde 4 letras |
| Segunda voz invisible | Turnos largos la absorbían | Turnos por frase y ≤ 4 s; umbral calibrado (`priv-3`) |
| Música que no sonaba | La trampa tenía la música a −45.5 dB, y la regla pedía 1.5 s de pausas | Nivel realista y regla medida (`priv-4`) |
| 25 bloqueos por un ticket | Uno por cuadro | Hallazgos agrupados por dato y rango (`priv-2`) |
| Copia del video tras 30 días | `normalizado.mov` y `resultado.json` sobrevivían a la retención | Se borran; regresión en el paquete |
| Palabra larga fuera de zona | Un código sin espacios se salía del rótulo | Se parte (`reel-5`) |
| SQL rechazado | Columna generada con `+ interval` no es inmutable (42P17) | Sin columna generada |
| Errores de consola | `<video src="">` y emojis sin fuente | Sin `src` vacío; texto en los botones |
| `priv-8` en rojo por sí mismo | El control negativo estaba escrito literal en el archivo escaneado | Se arma por partes |

## Lo que sigue bloqueado (y quién firma)
| Fase | Firma |
|---|---|
| 11 · LLM sobre la transcripción | el laboratorio: C4 + CDC por los prompts |
| 12 · Transcripción remota | el laboratorio; solo clips de un hablante |
| 13 · Video generativo | el laboratorio, con tope |
| 14 · Reducción de ruido | el laboratorio |
| 15 · Foto de producto en el video | el laboratorio |
| 16 · Render en producción | el laboratorio (Chromium, ffmpeg, Tesseract, OpenCV y modelos en la imagen) |
| 17 · Estreno con clips reales | manual: el laboratorio graba 2–3 clips y consiente; recalibrar voces y música |
| Formato de consentimiento | asesoría legal (LFPDPPP, art. 87 LFDA) |
| Respaldo (`propuesta-respaldo.md`) | el laboratorio; GATE 3 sin cerrar: RPO/RTO desconocidos |
| Gate `reel:rls` (`propuesta-cdc-gate.md`) | el laboratorio (CDC del padrón) |
| Publicar | siempre el dueño, a mano |

## Lo que no se midió
- Ningún clip real: todo es sintético (retratos al óleo, voces Piper). Umbrales de voces y de música calibrados con
  eso: el estreno los recalibra.
- Rostros reales en movimiento, de perfil o con poca luz; texto en pantalla fotografiado (no dibujado).
- La sala en un iPhone de verdad (se probó con Chromium en viewport de celular y soporte de `Range`).
- La zona segura de 9:16 sigue «a verificar en la guía oficial de Meta».
