# Investigación — OCR de Mistral para extracción masiva de documentos

> Pregunta que origina este documento: ¿sirve Mistral OCR para extraer datos de documentos
> **escritos a mano**, **PDF digitales**, **imágenes/fotografías** y **documentos mixtos**, y
> para cargarlos de forma **masiva**?
>
> Respuesta corta: **sí como motor de extracción, no como decisión ya tomada.** El contrato de
> API cubre los cuatro casos y el modo masivo existe y es barato. Lo que **no** está resuelto es
> la calidad sobre *tus* documentos manuscritos, y ahí las fuentes se contradicen entre sí.
> Este documento dice qué está verificado, qué es afirmación del proveedor y qué falta medir.

**Fecha**: 2026-09-07 · **Estado**: investigación, no compromiso de implementación
**Constitución aplicable**: principio 5 (*nada se afirma sin medir*) y principio 6 (*el dato
ajeno no es del dueño*). Los dos muerden aquí, y muerden fuerte.

> **Continúa en** [`INVESTIGACION-OCR-OPENSOURCE.md`](./INVESTIGACION-OCR-OPENSOURCE.md): la
> alternativa open source y autohospedada, que es la salida cuando §7.3 concluye que los
> documentos no pueden salir del perímetro.

---

## 0. Advertencia sobre las fuentes (léela antes que nada)

`docs.mistral.ai` y `mistral.ai` están **bloqueados por la política de egress de esta sesión**.
No se pudo leer la documentación oficial de primera mano. Lo que hay debajo se construyó con:

| Fuente | Qué aporta | Fiabilidad |
|--------|-----------|------------|
| SDK oficial en GitHub (`mistralai/client-python`, `mistralai/client-ts`) | Contrato de API exacto: campos, tipos, obligatoriedad | **Alta** — es el contrato generado desde el spec, no un blog |
| Cookbook oficial en GitHub (`mistralai/cookbook`) | Código real de Batch OCR y anotaciones | **Alta** — código ejecutable del proveedor |
| Notas de prensa y docs de Mistral (vía buscador) | Precios, límites, versiones | **Media** — resumen de buscador, no la página |
| Benchmarks de terceros y del propio Mistral | Calidad por tipo de documento | **Baja para decidir** — ver §5 |

**Consecuencia práctica**: las cifras de precio y los límites de §3 deben re-confirmarse contra
`docs.mistral.ai/models/ocr-4-1` y la página de precios desde una red sin ese bloqueo, antes de
firmar un presupuesto. El contrato de API de §2 sí se puede dar por bueno: viene del SDK.

---

## 1. Veredicto por tipo de documento

| Tipo | ¿Sirve Mistral OCR? | Matiz que importa |
|------|--------------------|-------------------|
| **PDF digital** (texto nativo) | Sí, con holgura | Es el caso fácil. Ojo: si el PDF ya trae capa de texto, extraerla con una librería local cuesta **cero** y no saca el dato de tu perímetro. Pasar por OCR aquí es pagar por algo que ya tienes |
| **PDF escaneado / imagen impresa** | Sí, es su punto fuerte | Incluye escaneos degradados, tipografía antigua y maquetación compleja. Es donde el precio/calidad es mejor |
| **Fotografía** (móvil, con perspectiva y sombra) | Sí, con reservas | Acepta `image_url` y base64. En escaneos de baja resolución hay casos documentados de **texto inventado**, no de texto ausente — que es mucho peor (§6) |
| **Manuscrito** | **Depende, y nadie lo ha medido sobre tus documentos** | Buen compromiso en documentos *mixtos* (impreso + anotación a mano). En **cursiva pura** hay fuentes que lo colocan por debajo de modelos de visión frontera y de especialistas. Ver §5 |
| **Formularios y casillas** | **No, sin ayuda** | Modo de fallo documentado: formatea todo como tabla y **se pierde qué casilla estaba marcada**. Si tu caso es "extraer el valor marcado de un formulario", esto no se resuelve solo con OCR |

---

## 2. El contrato de API (verificado contra el SDK oficial)

### Endpoint

`POST /v1/ocr` — vía SDK: `client.ocr.process(...)`. Disponible también en el Batch API (§4).

### Petición — `OCRRequest`

| Campo | Tipo | Obl. | Para qué sirve aquí |
|-------|------|------|---------------------|
| `model` | `string` | **Sí** | El identificador del modelo. **Pinéalo** (§7.1) |
| `document` | union | **Sí** | `{type:"document_url", document_url}` para PDF, `{type:"image_url", image_url}` para imagen. La URL puede ser una URL firmada de un fichero subido (§4.1) |
| `pages` | `int[] \| string` | No | Páginas concretas: `"0,2-4"`. **Empieza en 0.** Clave para trocear (§4.3) |
| `include_image_base64` | `bool` | No | Devuelve las imágenes recortadas embebidas. Infla la respuesta muchísimo: enciéndelo solo si vas a guardar los recortes |
| `image_limit` | `int` | No | Tope de imágenes a extraer |
| `image_min_size` | `int` | No | Ignora imágenes por debajo de ese alto/ancho. Filtra logos y sellos de firma |
| `bbox_annotation_format` | `ResponseFormat` | No | Esquema JSON aplicado a **cada imagen/figura extraída**. Solo `json_schema` |
| `document_annotation_format` | `ResponseFormat` | No | Esquema JSON aplicado al **documento entero**. Solo `json_schema`. **Máximo 8 páginas** (§3) |
| `document_annotation_prompt` | `string` | No | Instrucción libre que guía esa extracción |
| `table_format` | `TableFormat` | No | Cómo se serializan las tablas |
| `extract_header` / `extract_footer` | `bool` | No | Saca cabecera y pie a campos propios y los quita del markdown. Útil para no ensuciar el texto que va a un índice |
| `include_blocks` | `bool` | No | Bounding boxes a nivel de párrafo, en orden de lectura. **Esto es lo que permite citar la fuente** de un dato extraído |
| `confidence_scores_granularity` | `"page" \| "block" \| "word"` | No | Granularidad de la confianza. **Es la palanca del control de calidad** (§4.5) |

### Respuesta — `OCRResponse`

```
OCRResponse
├── pages: OCRPageObject[]
│   ├── index            int      página, desde 0
│   ├── markdown         string   el texto, con la maquetación preservada
│   ├── images           []       recortes: id, top_left_x/y, bottom_right_x/y, [image_base64]
│   ├── tables           []       tablas extraídas
│   ├── hyperlinks       string[]
│   ├── header / footer  string?  si extract_header / extract_footer
│   ├── dimensions       {dpi, height, width}
│   ├── confidence_scores           según granularidad pedida
│   └── blocks           []       bboxes de párrafo en orden de lectura (si include_blocks)
├── model: string
├── document_annotation: string?   JSON serializado según tu esquema
└── usage_info: {pages_processed, doc_size_bytes}
```

Dos observaciones que condicionan el diseño:

1. **`document_annotation` llega como string**, no como objeto tipado. Hay que parsear y
   **validar con Zod** antes de tocarlo. Que el modelo prometa un `json_schema` no es garantía
   de que lo cumpla: es exactamente el caso de "la salida del LLM no se confía por diseño".
2. **`usage_info` cuenta páginas, no tokens.** Esto rompe el modelo de costes actual del repo.
   Ver §7.2 — es el hallazgo más accionable de toda la investigación.

---

## 3. Modelo, límites y precios

| Concepto | Valor | Confianza |
|----------|-------|-----------|
| Modelo actual | `mistral-ocr-4-1` (OCR 4.1) | Media |
| Alias móviles | `mistral-ocr-latest` y `mistral-ocr-4` apuntan a 4.1 | Media |
| Linaje | OCR 4 (jun-2026) trajo bounding boxes, clasificación de bloques y confianza en línea; 4.1 añadió granularidad `block` en la confianza | Media |
| Idiomas | ~170 | Afirmación del proveedor |
| Tamaño máximo de fichero | **50 MB** | Media |
| Páginas máximas por documento | **1.000** | Media |
| Páginas máximas con `document_annotation` | **8** | Media — límite duro, obliga a trocear |
| Precio OCR | **$4 / 1.000 páginas** ($0,004/pág) | Media |
| Precio con anotaciones | **$5 / 1.000 páginas** ($0,005/pág) | Media |
| Descuento Batch API | **−50%** → $2 / 1.000 páginas | Media |
| Autohospedaje | Contenedor único, **licencia enterprise**. NO son pesos abiertos descargables | Media |
| Límites de tasa | Por *workspace*, no por clave: RPS + TPM, y un límite de **páginas por minuto** para OCR | Media |

> El límite de 8 páginas para `document_annotation` es el que más condiciona la arquitectura y
> el que más gente descubre tarde. Un expediente de 40 páginas **no** se anota de una tacada:
> son 5 llamadas de ≤8 páginas y una reconciliación posterior. El precio sigue siendo por
> página (40 páginas = $0,20), pero el número de llamadas se multiplica y con él la exposición
> al límite de tasa.

---

## 4. Carga masiva: cómo se hace de verdad

### 4.1 Subir un fichero local (no hace falta hosting público)

```
files.upload(purpose="ocr")  →  files.get_signed_url(file_id, expiry)  →  ocr.process(document_url=…)
```

La URL firmada caduca: por defecto **24 h**, configurable entre **1 y 168 h**. El fichero nunca
queda públicamente accesible. Este es el camino correcto para documentos con datos personales:
nada de subirlos a un bucket público para pasarle la URL al OCR.

### 4.2 Batch API — el modo masivo

Verificado contra el cookbook oficial (`mistral/ocr/batch_ocr.ipynb`):

```python
# 1. JSONL: una línea por documento
{"custom_id": "<id estable>", "body": {"document": {"type": "document_url",
                                                    "document_url": "..."},
                                       "include_image_base64": False}}

# 2. subir el lote
batch_data = client.files.upload(file={"file_name": f, "content": open(f,"rb")}, purpose="batch")

# 3. lanzar el trabajo
job = client.batch.jobs.create(input_files=[batch_data.id],
                               model="mistral-ocr-4-1",
                               endpoint="/v1/ocr",
                               metadata={"job_type": "ingesta-nocturna"})

# 4. sondear hasta que salga de QUEUED / RUNNING
# 5. client.files.download(file_id=job.output_file)
```

Datos que importan para dimensionar:

- Endpoints soportados en batch incluyen `/v1/ocr`.
- Un lote admite **hasta ~1M de peticiones**.
- Es **asíncrono**: no sirve para "el usuario sube un PDF y espera". Sirve para digitalizar un
  archivo, una ingesta nocturna o un backfill. Y ahí el −50% es dinero real.

**Regla de reparto**: interactivo → síncrono; volumen → batch. Mezclarlos en la misma cola es
como se acaba pagando precio de tiempo real por trabajo que nadie estaba esperando.

### 4.3 Troceado obligatorio

Tres cortes distintos, por tres motivos distintos:

| Corte | Umbral | Motivo |
|-------|--------|--------|
| Por tamaño | 50 MB | Límite duro de la API |
| Por páginas | 1.000 | Límite duro de la API |
| Por anotación | **8** | Límite de `document_annotation`. Se resuelve con el campo `pages`: `"0-7"`, `"8-15"`… |

### 4.4 Idempotencia — el detalle que separa un piloto de una ingesta

`custom_id` debe ser **derivado del contenido** (p. ej. `sha256` del fichero), no un contador.
Con eso:

- Reprocesar un lote a medio fallar no duplica filas.
- Se detecta el mismo documento subido dos veces sin volver a pagarlo.
- Un fallo parcial se reintenta por `custom_id`, no relanzando el lote entero.

Con un índice autoincremental, el primer reintento te duplica el archivo y lo descubres al
tercer mes, con los datos ya cruzados.

### 4.5 Confianza → cola humana (esto es el control de calidad, no un adorno)

`confidence_scores_granularity: "block"` devuelve confianza por bloque además de por página.
El diseño que se sostiene es:

```
extracción → ¿confianza < umbral en algún bloque crítico?
                ├── sí → estado `revision_humana`, no toca las tablas de negocio
                └── no → validación Zod → staging → promoción
```

**Pero**: el umbral no se puede elegir a ojo. Un score de confianza solo sirve como disparador
si **correlaciona con el error real**, y esa correlación hay que medirla (§8). Un umbral puesto
a dedo produce dos daños simétricos: cola humana inútilmente llena, o errores que pasan con
confianza alta. Hasta medirlo, el umbral es "desconocido", no 0,8.

### 4.6 Máquina de estados sugerida

```
pendiente → en_cola → procesando → extraido → validado → promovido
                          ↓            ↓          ↓
                       fallido   revision_humana  rechazado
```

Con RLS en todas las tablas y el texto extraído viviendo en **staging** hasta que pasa la
validación. Nada escribe directo a las tablas de negocio desde la salida del modelo.

---

## 5. Manuscrito: por qué aquí no hay respuesta, y qué hacer con eso

Las fuentes se contradicen. Literalmente:

| Fuente | Qué dice | Qué es |
|--------|----------|--------|
| Benchmark interno de Mistral (OCR 3) | 88,9% en manuscrito vs 78,2% de Azure; 96,6% en tablas vs 84,8% de Textract | **Del vendedor, sobre su propio conjunto** |
| Benchmark interno de Mistral | ~94,9% global vs Google Document AI 83,4% y Azure 89,5% | **Del vendedor** |
| Reseña independiente de OCR 4.1 | *No* es la mejor opción en manuscrito, tipografías históricas ni escrituras con muchas ligaduras; sí un "muy buen compromiso" en impreso degradado y en **mixto impreso+manuscrito** | Tercero |
| Benchmark de 48 páginas (2026) | Inksight 92,78% · Gemini 3.6 Flash 91,85% · Claude Opus 5 90,50% de precisión mediana de carácter | Tercero — **Mistral no aparece** |
| Benchmark WER (2026) | Handwriting OCR 0,9% · Azure DI 8,67% · Textract 10,5% · Claude Sonnet 4.6 visión 11,2% · GPT-5 visión 14,4% · Google Document AI 23,3% | Tercero — **Mistral tampoco aparece** |
| Reseñas de uso real | "La cursiva o la letra descuidada a menudo no produce salida con sentido" | Tercero, cualitativo |

Nótese el patrón: **donde Mistral gana, mide Mistral**. Donde miden terceros, Mistral no está en
la tabla. Eso no prueba que sea malo — prueba que **no hay dato independiente utilizable**, que
es distinto y es peor, porque no se puede decidir con ello.

**Traducción operativa** (principio 5 de la constitución):

> La calidad de Mistral OCR sobre documentos manuscritos de este proyecto es **desconocida**.
> No se declara una cifra hasta correr el piloto de §8. Cualquier número de la tabla de arriba
> metido en una propuesta es una cifra sin fuente propia.

**Diseño que sobrevive a esa incertidumbre**: ruta híbrida. Mistral como primera pasada barata
sobre todo el corpus; los bloques por debajo del umbral de confianza escalan a un modelo de
visión frontera (Claude Opus 5, Gemini 3) o directamente a revisión humana. Así el 90% barato
paga $0,002/página y solo la cola difícil paga precio de razonamiento. Es exactamente la regla
de la casa: **eficiencia por reparto, no por recorte**.

---

## 6. Modos de fallo documentados

No son teóricos; están reportados por terceros que lo probaron:

1. **Alucinación en escaneos malos** — en imágenes de baja resolución genera texto *inventado*
   en vez de dejar el hueco. Un hueco se detecta; un párrafo plausible y falso, no.
2. **Estructura limpia que enmascara el error** — el markdown sale bien maquetado y se lee
   correcto aunque haya dígitos cambiados. En datos financieros esto es el peor caso posible:
   pasa la revisión visual humana. Obliga a validación por reglas, no por vistazo.
3. **Tablas complejas** — desalineación de columnas reportada en ~17% de tablas con subtotales
   anidados y multi-columna.
4. **Formularios y casillas** — se formatean como tabla y se pierde qué estaba marcado.
5. **Sellos y letra muy pequeña** — omitidos o sustituidos por ruido.
6. **El markdown pierde alineación espacial exacta** — si necesitas posición precisa, la fuente
   son los `blocks` y los bboxes, no el markdown.

De aquí sale una regla de diseño, no un aviso: **el markdown es para leer; los `blocks` con
bbox son para citar y auditar.** Un dato extraído sin su bbox de origen no se puede verificar
después, y a los seis meses nadie sabrá de dónde salió.

---

## 7. Dónde choca con las reglas de esta fábrica

### 7.1 C1 — el modelo va pineado (`latest` se rechaza)

`mistral-ocr-latest` es un **alias móvil**: hoy apunta a 4.1, mañana a lo que salga. La
constitución (principio 7) y C1 lo prohíben sin ambigüedad. Se usa `mistral-ocr-4-1`.

Y la consecuencia completa: **subir de versión de OCR es un CDC**. Cambia el comportamiento del
sistema sobre datos de terceros → diff + `npm run regresion` + aprobación humana + entrada en
`.claude/gobernanza/BITACORA-CDC.md`. Con un alias móvil ese CDC ocurre solo, sin diff y sin que
nadie lo apruebe, que es precisamente el fallo que C1 existe para impedir.

### 7.2 Contabilidad — hueco real, y hoy está abierto

`src/lib/ai/routing.ts` y `.claude/routing-modelos.json` modelan **precio por millón de tokens**.
`costeUsd()` toma `{entrada, salida, cacheados}`. **OCR se factura por página** y su
`usage_info` devuelve `pages_processed`, no tokens.

Qué pasa hoy si se registra una llamada de OCR tal cual: `registraUso(..., uso: null)` guarda
`costoUsd: null`. Eso es **correcto** — la regla 1 de `contabilidad.ts` dice que no se inventan
cifras — pero significa que **el 100% del gasto de OCR queda en `filasSinCosto`**. El resumen
seguiría siendo honesto ("la cifra real es MAYOR") y a la vez inútil: con una ingesta masiva, lo
no costeado sería la mayor parte de la factura.

**Propuesta** (requiere CDC, toca el catálogo de modelos):

- Añadir a `.claude/routing-modelos.json` un bloque de servicios con precio **por unidad de
  trabajo**, no por token: `{unidad: "pagina", precio_por_1000: 4.0, con_anotacion: 5.0,
  descuento_batch: 0.5}`.
- Extender `EventoDeUso` con `unidad: 'token' | 'pagina'` y un `costeUsdPorPaginas()` paralelo.
- Regla que se mantiene intacta: si el proveedor no devuelve `pages_processed`, sigue siendo
  `null`. Nunca cero.

Sin esto, la ingesta masiva es el mayor gasto del proyecto y el único que no aparece en el
presupuesto. Esa es la forma exacta en que "el ahorro se pierde en silencio", solo que al revés.

### 7.3 C4 — flujo de datos, y el límite de C5

Un corpus de documentos manuscritos casi nunca es del dueño: son formularios de clientes, actas,
recetas, expedientes. Es decir, **datos personales de terceros**.

- Mandar esos documentos a la API de Mistral **saca el dato del perímetro**. Es una decisión de
  flujo de datos (C4) con AISIA, no una decisión de precio.
- A favor de Mistral: es sociedad francesa bajo jurisdicción UE, lo que es materialmente distinto
  de un proveedor estadounidense que ofrece "residencia en Frankfurt" pero se rige por derecho de
  EE. UU. Y existe el contenedor autohospedado, con el que el documento no sale de tu
  infraestructura — pero es **licencia enterprise**, no un modelo descargable.
- **Límite de C5**: si el daño de una fuga recae sobre terceros que no firmaron —los titulares de
  esos documentos—, **ninguna firma del dueño lo autoriza**. Ahí no se ofrece la vía del
  `REGISTRO-RIESGO.md`: se rediseña (autohospedado, seudonimización previa, o consentimiento
  real) o no se hace.

### 7.4 C7 — `service_role`

El worker de ingesta masiva es un **job de plataforma**: puede usar `service_role`, y por eso
mismo hay que **declararlo** como uso permitido. La superficie donde el usuario sube el
documento **no** lo usa: va con RLS y la sesión del usuario.

### 7.5 Respaldo — el texto extraído no es un derivado barato

Reprocesar 1M de páginas cuesta ~$2.000 y horas de cola. El texto extraído y sus anotaciones
**no** son un caché regenerable: son dato caro. Si no entran en el inventario de
`BUSINESS_LOGIC.md` §4, no se respaldan, y el día que arda el servidor no existen. Van al
inventario junto con los originales.

### 7.6 CLI-first — la escalera, aplicada

La escalera de `AGENTS.md` se responde así, y conviene distinguir dos cosas que no son la misma:

- **Si el OCR es funcionalidad del producto** (la app ingesta documentos): esto es código de
  producto, no una tarea del agente contra una API. Va el **SDK oficial** (`@mistralai/mistralai`,
  v2, ESM-only, Zod v4) dentro del worker. La escalera CLI-first no aplica.
- **Si el agente va a lanzar lotes desde la terminal**: entonces sí aplica. Y el resultado es:
  (1) Mistral **no está** en `.claude/imprenta/manifiesto.json` → estado `sin-asignar`, que el
  auditor reporta como problema; (2) no hay CLI oficial de OCR — lo que hay en PyPI
  (`mistral-ocr-cli`) es de terceros, y adoptarlo sería **CDC** y entraría **sin grado**, es
  decir *no medido*, que no es lo mismo que aprobado; (3) imprimir uno solo se justifica tras
  3+ repeticiones reales.

**Acción mínima e inmediata**: dar de alta `mistral-ocr` en el manifiesto, aunque sea con estado
`sin-asignar` y la nota de por qué. Un servicio que no aparece es un servicio que nadie decidió.

Y para cerrar: **no se añade un MCP de Mistral**. Un MCP se paga en cada sesión, se use o no
(ver `.claude/presupuesto-contexto.json`); esto es una llamada HTTP desde un worker.

---

## 8. Lo que falta medir antes de comprometerse

Sin esto, cualquier promesa de precisión es una afirmación, no una capacidad (principio 5).

**Corpus**: 100–200 páginas **reales del proyecto**, estratificado a partes iguales:
PDF digital · escaneo impreso · fotografía de móvil · manuscrito. Con transcripción de
referencia hecha a mano. Es el trabajo aburrido y es el único que hace que el resto signifique
algo.

**Métricas, por estrato**:

| Métrica | Por qué |
|---------|---------|
| CER y WER | Calidad bruta, comparable con la literatura |
| % de campos correctos en `document_annotation` | Es lo que de verdad consume el negocio; el CER puede ser bueno y el campo estar mal |
| **Correlación confianza ↔ error real** | **La medición más valiosa de las cinco.** Decide el umbral de §4.5. Sin ella, la cola humana se dimensiona a ciegas |
| Coste real por página | Contrasta el precio de lista con la factura, incluyendo reprocesos |
| Latencia p50/p95 y páginas/min efectivas | Dimensiona el batch contra el límite de tasa del workspace |

**Comparadores** en el mismo corpus, solo en el estrato manuscrito: Claude Opus 5 y Gemini 3 por
visión, y Azure Document Intelligence. Con eso la ruta híbrida de §5 se decide con datos propios
en vez de con benchmarks de vendedor.

**Salida esperada**: una tabla de resultados versionada en el repo. Hasta entonces, RPO/RTO
documental: **desconocidos**.

---

## 9. Alternativas, y cuándo NO es Mistral

| Opción | Cuándo gana |
|--------|-------------|
| **Mistral OCR 4.1** | Volumen alto de impreso y escaneado, tablas, maquetación compleja, presupuesto ajustado, y jurisdicción UE como requisito |
| **Contenedor autohospedado de OCR 4** | Cuando el documento **no puede salir** del perímetro. Licencia enterprise |
| **Claude Opus 5 / Gemini 3 (visión)** | Manuscrito difícil, contexto semántico, documentos raros. Caro por página; ideal como **segunda pasada** sobre la cola de baja confianza |
| **Azure Document Intelligence** | Formularios y casillas, que es justo el punto flojo de Mistral. Buen resultado en mixto impreso+manuscrito |
| **Google Document AI** | Ecosistema GCP y modelos preentrenados por tipo de documento |
| **Transkribus** | Archivo histórico y paleografía. Otro problema, otra herramienta |
| **Extraer la capa de texto con librería local** | **PDF ya digital.** Coste cero, sin salir del perímetro. No pagues OCR por texto que ya tienes |

Esa última fila no es una nota al pie: en un corpus mixto suele ser el 30–50% de las páginas, y
enrutarlas antes de llamar a la API es el mayor ahorro disponible — sin tocar la calidad.

---

## 10. Próximo paso recomendado

Esta investigación cierra el **puede hacerse**. No cierra el **qué**: qué documentos exactamente,
qué campos se extraen, qué pasa con lo dudoso, quién revisa la cola humana, qué se promete al
usuario.

Por el árbol de decisión de `AGENTS.md`: sin el QUÉ acordado, **spec primero**
(`/spec-generator` → `.claude/specs/NNN-ingesta-documental/`) y PRP después. La spec tiene que
cerrar, como mínimo:

1. Los cuatro tipos de documento y su volumen esperado — decide síncrono vs batch.
2. Los campos a extraer y su esquema Zod — decide si hace falta `document_annotation` y, con
   ello, el troceado a 8 páginas.
3. **La AISIA de C4**: qué datos personales de terceros hay y si pueden salir del perímetro.
   Si la respuesta es que no, el resto del diseño cambia (contenedor autohospedado) y es mejor
   saberlo antes de escribir el primer worker.
4. Qué pasa con un documento de baja confianza: quién lo revisa, en cuánto tiempo, y qué ve el
   usuario mientras tanto.

Y en paralelo, sin esperar a la spec, dos cosas que ya se pueden hacer: el piloto de medición de
§8 y el alta de `mistral-ocr` en el manifiesto de la imprenta.

> **Cerrado el 2026-09-11.** El punto 3 se contestó: los documentos llevan datos de terceros y
> **no salen del perímetro**, así que Mistral OCR queda fuera para este corpus, y no por
> preferencia (límite de C5 en `AGENTS.md`). El resto vive en la spec 008
> (`.claude/specs/008-corpus-a-modelo/`): motor autohospedado inyectado, medido en CPU sobre un
> corpus sintético con verdad conocida —GLM-OCR en transcripción, Qwen2.5-VL 3b y 7b en campos—,
> y la inferencia del modelo desde el corpus entero. Las cifras están en `tareas.md` de esa spec
> y en el README de la herramienta.

---

## Fuentes

Contrato de API (fuente primaria, SDK oficial):
- [mistralai/client-python — `OCRRequest`](https://github.com/mistralai/client-python/blob/main/docs/models/ocrrequest.md)
- [mistralai/client-python — `OCRResponse`](https://github.com/mistralai/client-python/blob/main/docs/models/ocrresponse.md)
- [mistralai/client-python — `OCRPageObject`](https://github.com/mistralai/client-python/blob/main/docs/models/ocrpageobject.md)
- [mistralai/client-ts — SDK de OCR](https://github.com/mistralai/client-ts/blob/main/docs/sdks/ocr/README.md)
- [mistralai/cookbook — `batch_ocr.ipynb`](https://github.com/mistralai/cookbook/blob/main/mistral/ocr/batch_ocr.ipynb)
- [mistralai/cookbook — `structured_ocr.ipynb`](https://github.com/mistralai/cookbook/blob/main/mistral/ocr/structured_ocr.ipynb)

Modelo, precios y límites (secundarias — **re-confirmar**, el dominio estaba bloqueado):
- [Mistral OCR 4](https://mistral.ai/news/ocr-4/) · [OCR 4.1 (model card)](https://docs.mistral.ai/models/ocr-4-1) · [Endpoint OCR](https://docs.mistral.ai/api/endpoint/ocr) · [Precios](https://mistral.ai/pricing/api/) · [Batch](https://docs.mistral.ai/studio/batch-processing) · [Limitaciones conocidas](https://docs.mistral.ai/resources/known-limitations) · [Límites de uso](https://docs.mistral.ai/admin/billing-usage/usage-limits)

Terceros (calidad, comparativas y modos de fallo):
- [explainx — veredicto sobre OCR 4.1](https://www.explainx.ai/blog/mistral-ocr-4-bounding-boxes-document-ai-api-2026)
- [Eden AI — OCR 4 vs otras APIs de parsing](https://www.edenai.co/post/mistral-ocr-4-vs-top-document-parsing-apis-features-benchmarks-and-integration-guide)
- [PyImageSearch — revisión técnica de OCR 3](https://pyimagesearch.com/2025/12/23/mistral-ocr-3-technical-review-sota-document-parsing-at-commodity-pricing/)
- [Inksight — benchmark de manuscrito](https://www.inksight-app.com/handwriting-ocr-benchmark) · [HandwritingOCR — nueve herramientas](https://www.handwritingocr.com/blog/best-ai-handwriting-ocr) · [CodeSOTA — manuscrito](https://www.codesota.com/ocr/best-for-handwriting)
- [Pulse AI — pruebas reales](https://www.runpulse.com/blog/beyond-the-hype-real-world-tests-of-mistrals-ocr) · [Unstract — límites en tablas y formularios](https://unstract.com/blog/llm-whisperer-vs-mistral-ocr/)
- [VentureBeat — OCR 4 y el ángulo enterprise](https://venturebeat.com/data/mistral-launches-ocr-4-turning-document-extraction-into-a-full-enterprise-ai-play)
