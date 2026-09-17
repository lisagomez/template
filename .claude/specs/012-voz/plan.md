# Plan 012 — Detección de voz y diarización local como herramienta enchufable

> Cierra el **CÓMO** de [`spec.md`](./spec.md). Es un plan **retroactivo**: describe lo que
> `tools/voz/` 0.4.0 ya es, con las decisiones y su porqué, tal como las cuenta su README.

## Módulos

`tools/voz/` → `@tu-scope/voz`.

| Subpath | Contenido | peerDependency | Cubre |
|---|---|---|---|
| `.` | Núcleo TS puro, **cero dependencias**: `audio/` (remuestreo, marcos, fbank), `vad/` (detector con histéresis, `modeloEnergia`), `canales/`, `diar/` (agrupación, diarizador por lotes, streaming, por segmentación, segmentación en streaming, registro), `asr/adaptador` (`transcribeTurnos`), `fusionaTurnos` | — | RF-1..RF-6, RF-8..RF-22, RF-25 |
| `./browser` | `capturaMicrofono` (AudioWorklet) y `creaModeloSilero` sobre `onnxruntime-web` | `onnxruntime-web` (opcional) | RF-7 |
| `./node` | `leeWav`, `preparaParaModelo`, `pcm16aFloat`, `creaModeloSilero`, `creaModeloHablante`, `creaModeloSegmentacion` sobre `onnxruntime-node`; **no importa el runtime**: lo recibe ya importado | `onnxruntime-node` (opcional) | RF-7, RF-23, RF-24 |

### Puertos del núcleo

```
ModeloVoz          probabilidad(marco) → [0,1] · tamMarco · frecuenciaHz · reinicia()
ModeloHablante     vector(muestras) → Float32Array L2-normalizado
ModeloSegmentacion ventana(muestras) → actividad por marco y hablante local
Transcriptor       transcribe(muestras, hz) → { texto, confianza? }
```

Los modelos se **inyectan**; el runtime ONNX llega importado por el consumidor (`ort`). Así el
núcleo se prueba con modelos de guion (`modeloGuion` en las pruebas) y no descarga un MB.

## Decisiones de diseño (las que cuestan si se olvidan)

| Decisión | Por qué |
|---|---|
| Dos umbrales, no uno (histéresis) | Con uno, una señal en el límite abre y cierra turnos decenas de veces por segundo |
| Relleno anterior al inicio | El modelo tarda uno o dos marcos en reaccionar: sin relleno, «ola» por «hola» |
| Un modelo Silero **por canal** | Tiene estado recurrente; compartido mezcla el contexto de dos personas |
| Dos caminos de diarización (VAD / PyanNet) | El VAD no ve solape; la segmentación sí, a cambio de cerrar el turno cuando avanza la ventana (~5 s) y de no dar `inicioHabla` |
| Tres eventos en vivo (`turno`, `correccion`, `firme`) | Decidir con lo oído cambia la promesa; la corrección explícita es lo que casi nadie implementa |
| Pista (segundos) ≠ hablante (sesión) | Las etiquetas de PyanNet son locales a la ventana; coserlas es otra capa |
| El registro **manda** sobre la continuidad de sesión | Al revés, dos registradas parecidas se fundirían en el primer turno |
| El registro no aprende solo | Un turno mal identificado arrastraría el centroide y la deriva no avisa |
| Formato de salida de PyanNet deducido con una inferencia de sonda | Un modelo con salida inesperada falla al crear, no en el marco 4000 |
| Silero v5 con 576 muestras | Con 512 el grafo corre y devuelve 0,0006: el VAD estaba mudo (medido 2026-09-01) |

## Medición (`medicion/mide.mjs`)

Pesos pineados por URL exacta (Silero VAD v5, WeSpeaker ResNet34-LM, pyannote segmentation-3.0
por el espejo sin gate) y audio de LibriSpeech dev-clean por el `datasets-server` de HF. Mide el
convenio de llamada de los `.onnx` reales, el umbral de agrupamiento (0,55 → 5 grupos para 5
hablantes) y el registro (tabla de umbrales con impostor). No devuelve exit 1 por un decimal:
imprime para que una persona compare con el README.

## Modelo de amenazas (C3)

No hay superficie de red: es una librería. Lo que queda:

| Amenaza | Control |
|---|---|
| Cadena de suministro de los pesos | URLs pineadas; el consumidor decide de dónde carga y puede fijar un hash |
| Registro de voces (biométrico) leído por quien no debe | La herramienta no lo persiste: lo exporta como JSON y el integrador elige dónde y cómo (cifrado en reposo es su decisión) |
| Registro cargado con otro modelo de embeddings | Etiqueta de modelo en el registro; importar con otra falla (RF-20) |

## Pruebas

`tools/voz/pruebas/` (`nucleo`, `onnx`, `registro`, `segmentacion`, `solape-vivo`, `streaming`):
91 pruebas contra `dist/`, sin red ni modelos. La demo del navegador (`npm run demo`) es un banco
con los pesos reales, no una prueba.

## Empaquetado

`npm run empaqueta voz`: contrato, build, tarball, integración de los tres subpaths en un
proyecto limpio. Consumidores en este repo: `tools/dictado` (peer exacto 0.4.0, por tarball).
