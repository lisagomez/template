# Investigación — La mejor opción **open source** para extracción documental masiva

> Continuación de [`INVESTIGACION-OCR-MISTRAL.md`](./INVESTIGACION-OCR-MISTRAL.md). Aquel
> documento dejó un bloqueo abierto: si los documentos llevan datos personales de terceros,
> C4 y el límite de C5 impiden sacarlos del perímetro, y el contenedor de Mistral es licencia
> enterprise. Esto responde qué hacer entonces.
>
> **Recomendación**: no hay "un modelo". Hay un **pipeline de cuatro capas** con
> **PaddleOCR-VL 1.5** (Apache 2.0) o **GLM-OCR** (MIT) como motor principal, **Qwen3-VL**
> como segunda pasada para manuscrito difícil, **Docling** (MIT) de orquestador, y salida JSON
> **garantizada por gramática** con `xgrammar`. Detalle en §3.

**Fecha**: 2026-09-07 · **Estado**: investigación, no compromiso de implementación

---

## 0. La pregunta que hay que responder primero

No es "¿cuál es el mejor modelo abierto?". Es **por qué quieres uno**, porque la respuesta
cambia el ganador:

| Motivo | Qué implica | ¿Gana el open source? |
|--------|-------------|----------------------|
| **El dato no puede salir del perímetro** (C4) | El autohospedado no compite en precio: es la **única opción legal** | **Sí, sin discusión.** El precio deja de ser un criterio |
| **Ahorrar dinero** | Hay un umbral de volumen por debajo del cual pierdes | Solo por encima de ~50.000–133.000 páginas/mes (§5) |
| **No depender de un proveedor** | Ganas control, compras operación | Sí, si aceptas que la disponibilidad pasa a ser tuya |

Y una advertencia que ya está escrita en `.claude/routing-modelos.json` y aplica literalmente
aquí:

> **Pesos abiertos NO es alojado por ti.** Servir un modelo abierto a través de OpenRouter,
> Replicate o un GPU cloud de terceros **saca el dato igual**. El radio de daño es el mismo que
> con un propietario. Solo el autohospedado real resuelve C4.

Si el motivo es el primero de la tabla, "usamos un modelo open source" en un GPU cloud ajeno
**no cierra el hueco**, solo lo disfraza. Es el error más caro de esta clase de decisión.

---

## 1. El filtro que descarta antes que el benchmark: la licencia

En 2026 "open source" en OCR significa cuatro cosas distintas, y tres de ellas tienen letra
pequeña. Este filtro se aplica **antes** de mirar precisión, porque un modelo con licencia
ambigua sobre documentos de terceros no se usa aunque sea el mejor.

| Modelo / herramienta | Licencia real | Veredicto |
|---|---|---|
| **PaddleOCR-VL 1.5** | Apache 2.0 (modelo y toolkit) | ✅ **Limpia** |
| **GLM-OCR** | Código Apache 2.0, **pesos MIT** | ✅ **Limpia** |
| **Qwen3-VL** | Apache 2.0 (la mayoría de tamaños) | ✅ **Limpia** |
| **olmOCR 2** | Apache 2.0 | ✅ Limpia — descartado por otro motivo (§4) |
| **Docling** | MIT, bajo LF AI & Data Foundation | ✅ Limpia, y con gobernanza de fundación |
| **Granite-Docling 258M** | Apache 2.0 (IBM) | ✅ Limpia |
| **DeepSeek-OCR** | Pesos MIT (OCR-2: Apache 2.0) | ⚠️ **Pesos limpios, repo contaminado**: arrastra PyMuPDF (**AGPL-3.0**). Copiar el pipeline tal cual te obliga a AGPL |
| **MinerU** | Licencia propia basada en Apache 2.0 | ⚠️ **Umbrales**: exige licencia comercial por encima de 100M MAU o $20M de ingresos mensuales. No muerde aquí, pero no es Apache limpio |
| **Marker** (Datalab) | Pesos bajo AI Pubs Open Rail-M modificada | ❌ **Licencia comercial de pago** por encima de $2M de ingresos o financiación. No es utilizable sin condiciones |
| **dots.ocr / dots.mocr** | **Dos ficheros de licencia contradictorios** | ❌ **Descartado**. Hay [issue abierta](https://github.com/rednote-hilab/dots.ocr/issues/141) sin respuesta del mantenedor. Además fue rebautizado a `dots.mocr` en marzo de 2026 |

Sobre `dots.ocr`: técnicamente es bueno y varias comparativas lo colocan arriba. Pero un
repositorio con dos licencias que se contradicen en las restricciones de uso, y una issue
abierta que nadie contesta, **no es una base sobre la que procesar documentos de terceros**.
La ambigüedad legal no se resuelve con un buen benchmark. Si el mantenedor la aclara, vuelve a
la mesa.

---

## 2. Precisión: dónde está cada uno

**OmniDocBench v1.5** (parsing de documento completo — el benchmark que importa para este caso):

| Modelo | Score | Tamaño | Licencia |
|---|---|---|---|
| **GLM-OCR** (Zhipu / Z.ai) | **94,6** | 0,9 B | MIT |
| **PaddleOCR-VL 1.5** (Baidu) | **94,5** | 0,9 B | Apache 2.0 |
| DeepSeek-OCR | 4.º del ranking | — | MIT (repo con AGPL) |
| MinerU 2.5 | 5.º del ranking | — | Propia con umbrales |

Los dos primeros están **empatados dentro del ruido** (0,1 puntos). Cualquiera que diga que uno
gana al otro por esa diferencia está sobreinterpretando un benchmark.

Y el dato que de verdad sorprende: **0,9 B de parámetros**. Estos modelos no necesitan un H100.
Caben con holgura en una GPU de 20 GB y sobra para lotes. Eso cambia por completo la economía
de §5.

**olmOCR-Bench**: olmOCR 2 marca 82,4, con Apache 2.0 y una eficiencia brutal — 3.400 tokens/s
en una sola H100 en FP8, **10.000 páginas por menos de $2**. Es el más barato del mercado por
página. Y aun así no es la recomendación: ver §4.

**Manuscrito** — aquí hay que separar dos mundos:

| Familia | Estado 2026 |
|---|---|
| VLM frontera (GPT-5, Claude Opus, Gemini 3) | Cabeza del leaderboard IAM, ~1,2% CER. **No son open source y no autohospedas** |
| Especializados HTR (DTrOCR 2,38% CER, TrOCR-Large 2,89%) | Ya no son el techo, pero **son la mejor base abierta para fine-tune sobre corpus propio** |
| VLM abiertos (Qwen3-VL, GLM-OCR, PaddleOCR-VL) | Manejan manuscrito de forma genérica; Qwen3-VL es explícitamente robusto en caligrafías diversas, poca luz e inclinación |
| PyLaia / Kraken | Entrenables, vivos, pensados para material histórico y no latino. Es lo que usa Transkribus por debajo |

---

## 3. La recomendación

**No es un modelo, es un enrutador de cuatro capas.** Ese es el diseño que gana, y por un motivo
que ya está en las reglas de la casa: *eficiencia por reparto, no por recorte*.

```
documento
   │
   ├─ Capa 0 · ¿PDF con capa de texto nativa?
   │     └─ SÍ → extraer texto directamente.  GPU: no.  Coste: 0.  ~30-50% del corpus
   │
   ├─ Capa 1 · impreso, escaneado o fotografía
   │     └─ PaddleOCR-VL 1.5  (o GLM-OCR — se decide midiendo, §6)
   │        0,9 B · Apache 2.0 · 109 idiomas · tablas, fórmulas, layout
   │
   ├─ Capa 2 · manuscrito difícil, o confianza baja en la capa 1
   │     └─ Qwen3-VL  ·  Apache 2.0  ·  segunda pasada, solo sobre la cola
   │
   └─ Capa 3 · cola de revisión humana
```

**Orquestador**: **Docling** (MIT, LF AI & Data). Maneja el PDF, el orden de lectura, las tablas
vía TableFormer, y ya tiene pipeline de VLM enchufable. No hay que escribir el andamiaje.

**Servidor de inferencia**: **vLLM**. Y con él, la pieza que hace que esto sea *mejor* que la API
de Mistral, no solo más barato:

> **Salida estructurada garantizada.** Con `guided_json` sobre `xgrammar` (u Outlines), el
> modelo queda **matemáticamente impedido** de emitir un token que rompa el esquema. La API de
> Mistral devuelve `document_annotation` como **string** que hay que parsear y rezar; aquí el
> JSON válido no es una promesa del modelo, es una propiedad del decodificador. Sobrecarga
> ~nula con xgrammar.

Eso no es un empate con la opción de pago: es una ventaja técnica del autohospedado. Sigue
haciendo falta validar con Zod — el esquema garantiza la *forma*, no la *verdad* del contenido.

### Por qué PaddleOCR-VL 1.5 como opción por defecto

1. **Licencia Apache 2.0 sin asteriscos**, en modelo y toolkit.
2. **109 idiomas**, español incluido de primera. No es un modelo English-first disfrazado.
3. **0,9 B**: cabe en cualquier GPU razonable y deja sitio para lotes grandes.
4. **94,5 en OmniDocBench v1.5**, por encima de modelos cerrados mucho mayores.
5. Cubre explícitamente **manuscrito y documento histórico**, además de tablas y fórmulas.

GLM-OCR es su gemelo (94,6 · 0,9 B · pesos MIT · 100+ idiomas · maneja anotaciones manuscritas y
márgenes). **Cuál de los dos es asunto de medición, no de lectura.** Los dos entran al piloto.

---

## 4. Por qué NO olmOCR 2, aunque duela

Es el caso más interesante de descarte, porque en papel gana: Apache 2.0, 82,4 en su propio
bench, y **10.000 páginas por menos de $2** — una décima parte de lo que cuesta la API de
Mistral en batch.

Se cae por dos frases de su propia documentación:

- Está **diseñado para documentos predominantemente impresos, no manuscritos**.
- Su rendimiento es **English-first**; en la práctica se le describe como **English-only**.

El caso de uso de este proyecto es **español con manuscrito**. Son exactamente sus dos puntos
ciegos, a la vez. Es un modelo excelente para digitalizar un archivo de papers en inglés, y el
peor encaje posible para lo que se preguntó.

Se anota como candidato si algún día aparece un corpus en inglés e impreso: ahí sería el ganador
por coste, con diferencia.

Mismo criterio, otros descartes rápidos:

- **Marker**: excelente calidad, pero licencia comercial de pago por encima de $2M. Es software
  comercial con fuente disponible, no open source utilizable sin condiciones.
- **Tesseract**: sigue siendo la línea base honesta y no necesita GPU, pero en manuscrito y
  maquetación compleja no compite en 2026. Sirve como suelo comparativo en el piloto, no como
  motor.

---

## 5. Coste: cuándo sale a cuenta y cuándo no

**El punto de partida**: Mistral API cuesta $4/1.000 páginas, $2 en batch. El autohospedado
cambia coste variable por **coste fijo**.

Hardware, con el proveedor que este repo ya usa para deploy (`docs/DEPLOY-HETZNER.md`):

| Servidor | GPU | VRAM | Precio | Nota |
|---|---|---|---|---|
| **GEX44** | RTX 4000 SFF Ada | 20 GB | **€184/mes** + €79 alta | **Figura como no disponible desde julio de 2026** — hay que confirmar stock antes de contar con él |
| **GEX131** | RTX PRO 6000 Blackwell Max-Q | 96 GB | **€889/mes**, sin alta | Sobredimensionado para un modelo de 0,9 B |
| GEX130 | RTX 6000 Ada 48 GB | — | — | Descatalogado |

Un modelo de 0,9 B en BF16 ocupa ~2 GB de pesos. **20 GB es holgadísimo**: entra el modelo, un
KV cache grande y lotes anchos. El GEX131 solo se justifica si la capa 2 monta un Qwen3-VL
grande en la misma máquina.

**Umbral de rentabilidad** (con GEX44 ≈ $200/mes, y cifras publicadas de break-even que van de
50.000 a 133.000 páginas/mes según API y GPU):

| Volumen mensual | Mistral batch ($2/1k) | Mistral síncrono ($4/1k) | Autohospedado |
|---|---|---|---|
| 10.000 págs | $20 | $40 | ~$200 | ← **la API gana con claridad** |
| 50.000 págs | $100 | $200 | ~$200 | ← empate contra el síncrono |
| **100.000 págs** | **$200** | $400 | **~$200** | ← **punto de cruce** |
| 500.000 págs | $1.000 | $2.000 | ~$200 | ← el autohospedado gana 5× |
| 1.000.000 págs | $2.000 | $4.000 | ~$200 | ← gana 10× |

**Cómo leer esta tabla honestamente**: los ~$200 son **solo la máquina**. No incluyen tu tiempo
de operación, ni el pico de trabajo del primer despliegue, ni la guardia cuando el proceso se
cae un domingo. Por debajo de ~100.000 páginas/mes, la API es más barata **y** mucho menos
trabajo, y decir lo contrario sería vender el open source por encima de lo que da.

**Y el matiz que anula toda la tabla**: si C4 dice que el documento no puede salir del
perímetro, esta comparación no se hace. No hay dos opciones que comparar — hay una.

---

## 6. Qué medir antes de decidir (extiende el piloto del documento anterior)

El piloto de `INVESTIGACION-OCR-MISTRAL.md` §8 no se cancela: se amplía. Mismo corpus
(100–200 páginas reales, estratificado, con transcripción de referencia), ahora con estos
contendientes:

| Contendiente | Papel en la prueba |
|---|---|
| **PaddleOCR-VL 1.5** | Candidato por defecto de la capa 1 |
| **GLM-OCR** | Su gemelo. Los separa el corpus propio, no el benchmark público |
| **Qwen3-VL** | Capa 2: solo sobre el estrato manuscrito y la cola de baja confianza |
| **Mistral OCR 4.1** (API) | El comparador de pago. Si el open source se le acerca, C4 decide sola |
| **Tesseract** | El suelo. Si algo no le gana, ese algo no vale |

Métricas: las cinco del documento anterior (CER/WER, % de campos correctos, **correlación
confianza↔error**, coste real por página, latencia p50/p95), más tres propias del autohospedado:

- **Páginas/hora reales** en la GPU elegida, con lotes, no en una prueba de una página.
- **VRAM pico** con el tamaño de lote de producción — es lo que decide si cabe en el GEX44.
- **Tasa de JSON inválido** con `guided_json` activado. Debería ser 0; si no lo es, la gramática
  está mal escrita y es un bug tuyo, no del modelo.

Y una prueba que sólo tiene sentido en abierto: **¿el manuscrito es de plantilla repetida?**
(el mismo formulario, la misma letra institucional, mes tras mes). Si la respuesta es sí, un
**fine-tune de TrOCR-Large sobre 500–2.000 líneas etiquetadas de tu propio corpus** puede batir
a cualquier VLM genérico, y es un camino que la API de pago no te ofrece en absoluto. Ahí está
la ventaja estructural del open source, y no es el precio.

---

## 7. Lo que el open source **no** te regala

Decirlo aquí es parte del trabajo; un informe que solo lista ventajas no es una investigación.

1. **La disponibilidad pasa a ser tuya.** No hay SLA. Un OOM de la GPU a las 3 de la madrugada
   es tu incidente, con el procedimiento de `.claude/gobernanza/plantillas/incidente.md`.
2. **C1 sigue aplicando, igual de duro.** El modelo se pinea **por el sha del commit de Hugging
   Face**, nunca por `main` ni por una etiqueta móvil. Cambiar de revisión es un CDC: diff,
   `npm run regresion`, aprobación y entrada en `BITACORA-CDC.md`. Que el modelo sea gratis no
   lo saca del control de cambios — cambia el comportamiento del sistema igual.
3. **El respaldo ahora incluye los pesos.** Si el repositorio de HF desaparece o cambia la
   licencia, "el modelo que usábamos" tiene que seguir siendo reproducible. El sha pineado y el
   procedimiento de descarga entran en el inventario de `BUSINESS_LOGIC.md` §4, junto a los
   originales y al texto extraído.
4. **La contabilidad cambia de forma, y el hueco no se cierra solo.** Con la API el problema era
   que `contabilidad.ts` cuenta tokens y el OCR cobra páginas. Con autohospedado es peor de
   modelar: **coste fijo mensual con coste marginal ~0**. Ni `costeUsd()` ni el precio por página
   propuesto sirven. Lo que toca registrar es *páginas procesadas* e **imputar el fijo del mes**,
   para que el coste por página sea un resultado medido y no una división de servilleta.
5. **La calidad sobre tu corpus sigue siendo desconocida.** Cambiar de proveedor no convierte un
   benchmark ajeno en una medición propia (principio 5).

---

## 8. Encaje con la fábrica

- **Golden Path intacto**: el stack de la app no cambia. El OCR es un **servicio aparte** en el
  `docker-compose.yml`, detrás del Caddy que ya existe, desplegado con `npm run deploy`. No hay
  stack paralelo, hay un servicio más.
- **C7**: el worker que consume la cola es un job de plataforma; puede usar `service_role`
  siempre que se declare. La superficie de subida del usuario, no.
- **C4**: con autohospedado real, el documento **no sale del perímetro** — que era el bloqueo
  entero. La AISIA se simplifica, no desaparece: sigue habiendo tratamiento de datos personales,
  solo que dentro de casa.
- **CLI-first**: no aplica. Esto es código de producto en un worker, no una tarea del agente
  contra una API externa. No se imprime CLI ni se añade MCP.

---

## 9. Veredicto

> **Para este caso de uso** — español, mezcla de PDF digital, escaneo, fotografía y manuscrito,
> carga masiva, y documentos que probablemente no pueden salir del perímetro:
>
> **PaddleOCR-VL 1.5** (Apache 2.0) como motor por defecto, con **GLM-OCR** (MIT) disputándole
> el puesto en el piloto; **Qwen3-VL** (Apache 2.0) como segunda pasada para manuscrito difícil;
> **Docling** (MIT) de orquestador; **vLLM + xgrammar** para JSON estructurado garantizado.
> Sobre una GPU de 20 GB, que es más que suficiente para modelos de 0,9 B.
>
> **Descartados y por qué**: `dots.ocr` por licencia contradictoria sin resolver · `Marker` por
> licencia comercial de pago · `olmOCR 2` por English-first y orientado a impreso, pese a ser el
> más barato del mercado · `MinerU` y `DeepSeek-OCR` utilizables pero con letra pequeña que hay
> que leer antes.
>
> **Y el criterio de decisión no es el precio**: por debajo de ~100.000 páginas/mes la API de
> Mistral sale más barata y da mucho menos trabajo. Lo que inclina la balanza es C4. Si el dato
> no puede salir, el autohospedado no es la opción barata: es la única.

**Siguiente paso**: sigue siendo la spec (`/spec-generator`), y con más motivo — la pregunta que
la spec tiene que cerrar antes que ninguna otra es la AISIA de C4, porque es la que decide entre
estos dos documentos.

---

## Fuentes

Modelos y licencias:
- [PaddleOCR-VL (Hugging Face)](https://huggingface.co/PaddlePaddle/PaddleOCR-VL) · [PaddleOCR-VL-1.5 (docs)](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/algorithm/PaddleOCR-VL/PaddleOCR-VL-1.5.html) · [paper/blog ERNIE](https://ernie.baidu.com/blog/posts/paddleocr-vl/)
- [GLM-OCR (GitHub)](https://github.com/zai-org/GLM-OCR) · [GLM-OCR (Hugging Face)](https://huggingface.co/zai-org/GLM-OCR)
- [Qwen3-VL (GitHub)](https://github.com/QwenLM/Qwen3-VL)
- [olmOCR 2 (Ai2)](https://allenai.org/blog/olmocr-2) · [olmOCR-2-7B-1025](https://huggingface.co/allenai/olmOCR-2-7B-1025) · [olmocr (GitHub)](https://github.com/allenai/olmocr)
- [Docling (GitHub)](https://github.com/docling-project/docling) · [granite-docling-258M](https://huggingface.co/ibm-granite/granite-docling-258M)
- [DeepSeek-OCR (GitHub)](https://github.com/deepseek-ai/DeepSeek-OCR) · [issue de licencia PyMuPDF](https://github.com/deepseek-ai/DeepSeek-OCR/issues/223)
- [MinerU — LICENSE.md](https://github.com/opendatalab/MinerU/blob/master/LICENSE.md)
- [dots.ocr — issue "two license files"](https://github.com/rednote-hilab/dots.ocr/issues/141) · [issue de licencia](https://github.com/rednote-hilab/dots.ocr/issues/142)

Benchmarks y comparativas:
- [OmniDocBench (OpenDataLab)](https://github.com/opendatalab/OmniDocBench) · [leaderboard](https://llm-stats.com/benchmarks/omnidocbench)
- [Spheron — OCR/VLM abiertos para autohospedar en 2026](https://www.spheron.network/blog/best-open-source-ocr-vlm-self-host-gpu-cloud-2026/)
- [Unstract — herramientas OCR open source 2026](https://unstract.com/blog/best-opensource-ocr-tools/)
- [CodeSOTA — manuscrito](https://www.codesota.com/ocr/best-for-handwriting) · [Benchmarking LLMs for HTR](https://arxiv.org/pdf/2503.15195) · [PyLaia + modelos de lenguaje](https://arxiv.org/pdf/2404.18722)
- [MarkTechPost — extracción PDF→JSON con modelos abiertos](https://www.marktechpost.com/2026/07/04/structured-pdf-to-json-a-guide-to-open-source-extraction-models-in-2026/)

Infraestructura y coste:
- [Hetzner GEX44](https://www.hetzner.com/dedicated-rootserver/gex44/) · [configuraciones de GPU server](https://docs.hetzner.com/robot/dedicated-server/server-lines/gpu-server/) · [review de precios 2026](https://gpuhosted.com/en/hetzner-gpu-review/)
- [vLLM — structured outputs](https://docs.vllm.ai/en/v0.8.2/features/structured_outputs.html)
- [Break-even de LLM local vs API](https://www.kunalganglani.com/blog/local-llm-cost-breakeven)
