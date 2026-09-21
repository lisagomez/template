# Dictado y voz alineadas — resultados

Ejecutado el 2026-09-21 a partir de `spec.md`, sobre `main` con el PR #139 mezclado. Evidencia:
`tools/voz/pruebas/familia.ts` (5 pruebas nuevas), `tools/dictado/pruebas/contrato.ts` (3, y la
parte de tipos la compila el `typecheck` de la raíz), la medición real de voz
(`tools/voz/medicion/ultima-medicion.json` + bloque `MEDICION` del README), `npm run empaqueta voz`,
`npm run empaqueta dictado` y `npm run validate` en verde y sellado (árbol `27302955e0bc`).

## Superficie pública de voz, antes → después (solo añadidos)

```
+ export declare function codificaWav            (./node)
+ export declare function floatAPcm16            (./node)
+ export { mbDe, PESOS, RUNTIMES, SEGMENTACION, SILERO, WESPEAKER, type Peso }   (./node)
+ export { factorDeDb, nivelDb, picoDb, rms }
+ export { creaDetectorVoz, PERFILES_DETECTOR, type DetectorVoz, type MandosDetector }   (antes: creaDetectorVoz, DetectorVoz)
+ export type { …, OpcionesTranscribe, PerfilDetector, Transcripcion, … }
```

Ninguna firma de 0.4 cambia. `Transcriptor.transcribe(muestras, hz, opciones?)` → `Transcripcion`:
un transcriptor escrito contra 0.4 (dos parámetros, solo `texto`) compila contra 0.5 —está en
`familia.ts` (`const comoTranscriptor: Transcriptor = viejo`) y en `contrato.ts`—. `creaDetectorVoz`
sin `perfil` se comporta igual (probado: 2 turnos con un hueco de 700 ms, como siempre). La app
(`use-interrupcion.ts`, con valores explícitos) compila; `prueba:laboratorio` 23/23.

## Duplicados retirados de dictado

| Símbolo | Archivo de dictado | Antes | Después | Lo sustituye en voz |
|---|---|---|---|---|
| `Muestras`, `Turno`, `EventoVoz`, `DetectorVoz` redeclarados | `src/types.ts` | 95 líneas | 49 | `import type` de `@tu-scope/voz` (cero rastro en el JS) |
| `OpcionesTranscribe`, `Transcripcion`, `Transcriptor` superconjunto | `src/types.ts` | (ídem) | (ídem) | los mismos nombres, en voz; `Motor extends Transcriptor` de voz |
| `DEFECTOS_DICTADO` con sus cifras | `src/node/vad.ts` | 38 | 30 | `PERFILES_DETECTOR.dictado` (mismo objeto; el nombre se conserva) |
| `nivelDb` (RMS en dBFS) | `src/node/audio.ts` | 154 | 140 | `nivelDb` de voz (reexportado) |
| pico por ventanas de 30 ms | `src/node/cli-dictar.ts` | bucle propio | `picoDb(muestras, ventana)` | `picoDb` |
| `floatAPcm16` | `src/node/audio.ts` | escala asimétrica propia | `Buffer` sobre el de voz | `floatAPcm16` (escala simétrica, inversa exacta de `pcm16aFloat`) |
| `escribeWav` (cabecera a mano) | `src/node/audio.ts` | 14 líneas | 6 | `codificaWav` + `writeFile` |
| `factorDe` | `src/node/ganancia.ts` | fórmula propia | alias | `factorDeDb` |

`wc -l` antes → después: `types.ts` 95 → 49 · `node/vad.ts` 38 → 30 · `node/audio.ts` 154 → 140 ·
`node/ganancia.ts` 40 → 42 (dos líneas de import y comentario). Se quedan en dictado, porque no
son de voz: WER, cantidades, posproceso, pegado, historial, ajustes, píldora, remoto.

## Pruebas

- voz: 90 → **97** (`familia.ts`: perfiles y precedencia de lo explícito; transcriptor 0.4 válido y
  paso de idioma/pista; `rms`/`nivelDb`/`picoDb`/`factorDeDb` y la misma aritmética que `modeloEnergia`;
  WAV y PCM ida y vuelta con error ≤ ½ LSB; pesos y runtimes pineados).
- dictado: 118 → **121** (`contrato.ts`: `DEFECTOS_DICTADO === PERFILES_DETECTOR.dictado`; `nivelDb`
  es la misma función; PCM byte a byte y WAV legible por `leeWav`). Y en tipos: `Igual<A, B>` para
  las siete piezas del contrato + `Motor extends Voz.Transcriptor` + un transcriptor 0.4 asignable.
- app: `prueba:laboratorio` 23/23, `prueba:historial`, `prueba:ajustes` en el gate. `npm run validate`
  verde y sellado.

## Cifras iguales

| Qué | Antes | Después |
|---|---|---|
| Perfiles impresos desde código | — | `bargeIn {0.5, 0.35, 500, 120, 200}` = los defectos de 0.4 · `dictado {0.5, 0.35, 1000, 200, 250}` = lo medido; `DEFECTOS_DICTADO` idéntico |
| `dictar --entrada limpio-14.wav`, sin respaldo, arranque → motor listo (p50 de 5) | 2 522 ms | 2 497 ms |
| Latencia fin de habla → pegado (p50 de 5) | 216 ms | 207 ms |
| Cierre por silencio en el log de `dictar` | 1000 ms | 1000 ms |
| Medición de voz (`npm run mide`, LibriSpeech dev-clean, 5 × 12) | README 2026-09-01: mismo hablante p50 0,15–0,25 · p95 0,46–0,50 · max 0,83; distintos min 0,61–0,63 · p50 0,91; `calibraUmbral` 0,55 al 100 %; registro 33/35/35/35/36/36 y el impostor con nombre 4/12 a 0,70 | 2026-09-21: 0,154 · 0,463 · 0,827; 0,626 · 0,910; 0,55 al 100 %; 33/35/35/35/36/36 y 4/12 a 0,70. **Decimal a decimal.** |

## voz alineada a dictado

- `src/node/pesos.ts`: `SILERO`, `WESPEAKER`, `SEGMENTACION` con URL exacta y MB; `RUNTIMES`
  (`onnxruntime-node@1.30.0`, `onnxruntime-web@1.29.0`, lo que ya usaban `mide` y `demo`); `mide`,
  `demo` y `diagnostico` los leen del `dist/`. Prueba: URLs de github/huggingface, versiones exactas.
- `npm run mide` instala el runtime **pineado** (antes `npm install onnxruntime-node` sin versión),
  deja `medicion/ultima-medicion.json` (versión, fecha, máquina, corpus, silero, distancias,
  calibración, registro, reunión) y siembra el bloque `<!-- MEDICION -->` del README. Diff del
  README: +23 líneas, el bloque; las cifras coinciden con las escritas a mano el 2026-09-01.
- README de voz: «Dictar con el mismo detector: perfiles, transcriptor con opciones, nivel»,
  «Qué se guarda y dónde (y cómo se borra)» (el registro de voces es biométrico y lo persiste el
  consumidor; el paquete no escribe nada), fila `perfil` en «mandos», «Cambios» con 0.5.0.
- `npm run diagnostico`, salida real (sin rutas de usuario):
  ```
  voz 0.5.0 · Node v24.14.0 · linux · WSL Ubuntu
  dist: construido
  pesos (en medicion/banco/modelos):
    ✓ silero_vad.onnx — Silero VAD v5 (~2 MB)
    ✓ embedding.onnx — WeSpeaker ResNet34-LM (embeddings, come fbank de 80 bandas) (~26 MB)
    ✓ segmentation-3.0.onnx — pyannote segmentation-3.0 (mirror sin gate de onnx-community) (~6 MB)
  runtimes (peers opcionales):
    ✓ onnxruntime-node@1.30.0
    · onnxruntime-web@1.29.0 (no instalado en el banco)
  audio de medicion: 60 tomas
  ultima medicion: 2026-09-21 · AMD Ryzen 7 5700 · LibriSpeech dev-clean · calibraUmbral 0.55
  ```

## Pin y empaquetado

`tools/dictado/package.json`: `@tu-scope/voz` **0.5.0**, peer exacto y ya **no opcional** (el núcleo
importa sus tipos y `./node` la usa en tiempo de ejecución). `prepara-voz.mjs` instaló
`tu-scope-voz-0.5.0.tgz` sin quejas. El empaquetador de dictado falló la primera vez —npm intentaba
bajar `@tu-scope/voz@0.5.0` de un registro donde no está— y ahora instala primero el tarball del
peer de la familia (`scripts/empaqueta-herramienta.mjs`, documentado en
`docs/EMPAQUETAR-HERRAMIENTA.md`): `✓ integracion: 3 subpath(s)`, 46 exports.

## La familia

| Rasgo | voz 0.5.0 | dictado 0.1.0 |
|---|---|---|
| README: qué hace y qué no · usos · mandos que importan · avisos que ahorran una tarde · pruebas · medición | ✓ | ✓ (mandos y avisos nuevos, vividos y medidos) |
| Guiones `build` · `prueba` · `mide` · `diagnostico` · `empaqueta` en verde | ✓ | ✓ |
| Medición que deja JSON (fecha, máquina, corpus) | ✓ `ultima-medicion.json` (+ README sembrado) | ✓ `ultima-medicion-cpu.json` |
| Pesos y runtimes pineados en un módulo probado | ✓ `src/node/pesos.ts` | ✓ `src/node/pesos.ts` |
| Pruebas contra `dist/` | ✓ 97 | ✓ 121 |
| Empaquetado con integración probada en proyecto limpio | ✓ | ✓ (con el peer de la familia) |
| «Qué se guarda y dónde (y cómo se borra)» | ✓ | ✓ |
| Diagnóstico sin secretos ni rutas de usuario | ✓ | ✓ |
| Contrato | dueña | consumidora (tipos importados, prueba de contrato) |

## Decisiones

- **Importar tipos, no copia verificada**: `import type` no deja rastro en el JS y la divergencia
  rompe al compilar; una copia con prueba `satisfies` habría sido una segunda fuente con vigilante.
  Precio: voz pasa a peer obligatorio de dictado, que es la verdad (su `./node` ya la exigía).
- **`floatAPcm16` de voz usa escala simétrica** (×32768, tope 32767): la inversa exacta de
  `pcm16aFloat`; la de dictado era asimétrica (×32767 en positivo) y la ida y vuelta perdía hasta
  1,1 LSB. Cambia bytes que van al motor por proceso y al remoto en 1 LSB: inaudible e imperceptible
  para un motor int8; la latencia y el WER no se movieron.
- **`nivelDb(vacío)` = −180, no −Infinity**: se puede restar y comparar; ningún camino de dictado
  llama con audio vacío (el pico de la escucha arranca en −Infinity por su cuenta).
- **`respaldo`/`modo`/`tecla` no entran en voz**: son del dictado, no del VAD.
- **Los defectos de dictado siguen siendo `DEFECTOS_DICTADO`** (alias del perfil) para quien ya lo
  importaba; el dueño es `PERFILES_DETECTOR.dictado`.
- **La app no cambia**: usa valores explícitos y `modeloEnergia`; el perfil no la toca.

## Formas en que podría estar mal, y qué se hizo

- *Un consumidor de voz 0.4 con un `Transcriptor` viejo*: asignable en tipos (probado dos veces) y
  `transcribeTurnos` le pasa un tercer argumento que ignora.
- *El navegador tras tocar `voz/node`*: `./node` sigue sin importar módulos de Node (`codificaWav`
  devuelve bytes; `pesos.ts` es datos); `./browser` sin cambios; la app compila y `prueba:laboratorio`
  en verde.
- *dictado instalado desde tarball en un proyecto sin voz*: antes del cambio moría el `install`
  (peer obligatorio no publicado); ahora el empaquetador lo instala desde `tools/voz/` y el
  consumidor real hace lo mismo con los dos tarballs (documentado).
- *El tarball 0.4.0 referenciado por alguien*: no está en git (ignorado); las referencias vivas
  (README de dictado, `package.json`, SDD) pasan a 0.5.0; las históricas (specs 012/013, goals
  anteriores) se quedan como estaban porque cuentan lo que pasó.
- *Un perfil que mueva las cifras del laboratorio*: la app no usa perfiles; el barge-in de voz sin
  perfil = `bargeIn` = 0.4 (probado con el modelo falso: mismos turnos).
- *`prepara-voz.mjs` rechazando la subida*: pide exacto `0.5.0` y `tools/voz` está en 0.5.0 con su
  tarball; instaló sin protestar.
- *La medición de voz no repetible*: sí lo fue, decimal a decimal, con runtime pineado.
- **Deuda que queda**: `src/features/laboratorio-voz/services/wav.ts` de la app tiene su propio
  `escribeWavPcm16` (estéreo, `Int16Array`): tercera copia de la cabecera WAV, fuera del alcance de
  este goal (es de la app, no de las herramientas). `cli-dictar.ts` sigue en 680 líneas.

## Lo que queda fuera

Publicar (firma humana), un `siembra` para el README de dictado (sus marcadores siguen siendo prosa
a mano), y unificar la copia de WAV de la app con `codificaWav` de voz.
