# SDD — Extractor documental como herramienta enchufable

**Estado:** **especificado, no construido.** Este documento y la `spec 007` cierran el QUÉ; no
existe ni una línea de `tools/extractor-documental/`. La calidad de cualquier motor de OCR sobre
el corpus real sigue siendo **desconocida** — el piloto de medición
([`INVESTIGACION-OCR-MISTRAL.md`](./INVESTIGACION-OCR-MISTRAL.md) §8) no se ha corrido.
**Ámbito:** una herramienta de `tools/` que se empaqueta, se instala en otros proyectos y se
anuncia sola como plugin. El núcleo no importa React, Next ni Supabase; el contrato de
empaquetado es el de [`EMPAQUETAR-HERRAMIENTA.md`](./EMPAQUETAR-HERRAMIENTA.md) y **no se
reescribe aquí**.

---

## 1. El problema

Las dos investigaciones previas dejaron el motor resuelto y el producto sin empezar. Sabemos
**con qué** extraer (un puerto con adaptadores: Mistral API o PaddleOCR-VL autohospedado) y
sabemos **cuánto cuesta**. Lo que no existe es la pieza que un humano usa: arrastrar una carpeta
de expedientes, mirar lo que salió, corregir lo que está mal, y decirle al sistema *"así está
bien, guárdalo como plantilla"*.

Y hay un segundo problema, más caro y menos visible: **eso mismo hará falta en el siguiente
proyecto**. Un extractor documental escrito dentro de una app concreta es un extractor
documental que se reescribe entero la próxima vez. Por eso esto nace como herramienta, con
`package.json` propio, y no como una carpeta de `src/features/`.

## 2. Lo que se descubrió al escribirlo

### 2.1 Las dependencias del Golden Path no están instaladas

`AGENTS.md` declara Zustand en el stack y `components.json` está configurado para shadcn con
`iconLibrary: "lucide"`. **Nada de eso está en `package.json`.** Las dependencias reales son
`next`, `react`, `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`, `zod` y `tailwindcss`.
Ni un componente de shadcn, ni `lucide-react`, ni `react-hook-form`.

Para una feature interna daría igual — se instala y ya. Para una **herramienta** es
determinante: cada dependencia que el entry point de React dé por supuesta es una dependencia
que el proyecto consumidor tiene que tener, con la versión correcta. Por eso:

> **El icono del plugin viaja como SVG en línea dentro del manifiesto, no como import de una
> librería de iconos.** Un manifiesto que importa `lucide-react` obliga a instalar lucide en
> todo proyecto que solo quería leer el nombre de la herramienta.

### 2.2 "Carpetas" no es un input de HTML, son dos mecanismos distintos

El usuario pidió "arrastrar o seleccionar archivos y carpetas". Eso no es una casilla:

- **Seleccionar** una carpeta exige `<input type="file" webkitdirectory>`.
- **Arrastrar** una carpeta exige `DataTransferItem.webkitGetAsEntry()` y un recorrido recursivo
  del árbol, porque `event.dataTransfer.files` **no contiene** el contenido de un directorio
  arrastrado: contiene el directorio, y está vacío.

Los dos son API del DOM. Ninguno puede vivir en el núcleo. Lo que sí vive en el núcleo es la
función pura que decide qué hacer con cada archivo una vez aplanado el árbol — y esa se prueba
sin navegador, que es justo el punto.

### 2.3 El ERD derivado es salida de un modelo, y se estaba colando por la puerta de atrás

"Que prepare los catálogos de configuración de datos y el modelo de relación de entidades"
suena a automatización inofensiva. No lo es: **generar SQL a partir de campos que un modelo de
lenguaje extrajo de un escaneo es exactamente el caso que la regla de la casa prohíbe confiar.**
Un `CREATE TABLE` derivado de una alucinación no falla ruidosamente — crea una tabla plausible
con una columna de más, y nadie lo nota hasta que hay datos dentro.

De ahí la decisión que estructura toda la capa 6: **el ERD derivado se emite como propuesta
revisable en SQL, nunca se aplica.** Aplicarlo es una acción irreversible y va por gate humano.

### 2.4 El "todavía no" de la puerta se está saltando a propósito

[`CREAR-UNA-HERRAMIENTA.md`](./CREAR-UNA-HERRAMIENTA.md) es tajante: sin reuso real 3+ veces,
empaquetar solo añade una versión que mantener. Aquí el reuso es **cero** — la herramienta no
existe todavía.

No se omite el conflicto: se declara. El usuario pidió explícitamente que la herramienta sea
descargable y usable en otros proyectos desde el día uno, y esa es su decisión. Lo que sí impone
la regla es el coste: **una herramienta se versiona, y cambiar la forma de un `export` es un
major aunque el código haga lo mismo.** Se acepta ese coste a cambio de no reescribirla.

### 2.5 La numeración de las specs no es decorativa

`scripts/verifica-specs.mjs` exige numeración correlativa desde `001` sin saltos ni repetidos.
Existen `001`–`006`. Esta spec **tiene que ser la `007`** y su carpeta tiene que llamarse
`007-extractor-documental`. Un número saltado pone el gate en rojo para todo el repo, no solo
para la spec nueva.

---

## 3. Principio de diseño

> **El humano no revisa lo que el sistema extrajo. El humano decide qué significa, y el sistema
> aprende esa decisión.**

Un extractor que solo muestra texto obliga a leerlo entero cada vez. La diferencia entre eso y
una herramienta es que aquí la revisión **produce un artefacto**: la plantilla por defecto. La
segunda tanda de documentos del mismo tipo ya llega con los campos correctos, en el orden
correcto, con los irrelevantes apagados. El trabajo del humano se paga una vez.

Tres corolarios que se aplican sin excepción:

1. **El núcleo no toca el DOM ni la red.** Puertos e interfaces; las implementaciones viven en
   entry points aparte. Es lo que hace que se pueda probar sin navegador y sin claves.
2. **La confianza es un dato de primera clase, no un log.** Cada campo extraído lleva su score,
   y el umbral que manda un documento a revisión humana es configuración, no una constante.
3. **Nada derivado de un modelo se aplica solo.** Se propone, se revisa, se aplica.

---

## 4. Contrato del paquete

`tools/extractor-documental/` → `@tu-scope/extractor-documental`.

| Subpath | Qué contiene | peerDependency |
|---|---|---|
| `.` | Núcleo TypeScript puro: tipos, puertos, máquina de estados, clasificación de archivos, reducer de la plantilla, derivación del ERD. **Cero dependencias** | — |
| `./plugin` | Manifiesto: `id`, `nombre`, `descripcion`, `icono` (SVG en línea), `ruta`, `version`, `capacidades`. Importable **sin React** | — |
| `./react` | `ZonaDeIngesta`, `TablaDeRevision`, `EditorDeCampo`. `'use client'` la primera línea del archivo | `react` (opcional) |
| `./motores/mistral` | Adaptador de `MotorOcr` contra la API | `@mistralai/mistralai` (opcional) |
| `./motores/openai-compat` | Adaptador HTTP contra un vLLM autohospedado (PaddleOCR-VL, GLM-OCR) | — (`fetch`) |
| `./almacenes/supabase` | Adaptador de `AlmacenDocumentos` y `AlmacenPlantillas` | `@supabase/supabase-js` (opcional) |

Lo que el `package.json` debe declarar (§5 del runbook de empaquetado): `type: "module"`,
`sideEffects: false`, `engines.node`, `files: ["dist"]`, y `peerDependenciesMeta.<dep>.optional`
en **todas** las peer. El empaquetador comprueba que `'use client'` sobrevive al build y que el
tarball se instala e importa en un proyecto limpio; **publicar es gate humano**, no un paso del
script.

**Puertos del núcleo** — interfaces, sin una sola implementación:

```
MotorOcr           extrae(documento, opciones) → PaginaExtraida[]
AlmacenDocumentos  guarda / lee / lista documentos y sus extracciones
AlmacenPlantillas  guarda / lee la plantilla por defecto y los catálogos
```

**Máquina de estados** del documento, en el núcleo y probada como función pura:

```
pendiente → en_cola → procesando → extraido → en_revision → validado
                          │            │           │
                          └─ fallido   └─ revision_humana   └─ rechazado
```

`revision_humana` no es un error: es la salida normal cuando la confianza queda por debajo del
umbral. Tratarla como fallo es lo que hace que la gente suba el umbral hasta que la cola
desaparece, y con ella el control.

---

## 5. Las seis capacidades pedidas

| # | Lo que se pidió | Dónde vive | Nota que decide el diseño |
|---|---|---|---|
| 1 | Icono para seleccionarla, como plugin | `./plugin` | Manifiesto autodescriptivo; la app anfitriona lo descubre y lo pinta. SVG en línea (§2.1) |
| 2 | Botón de adjuntar, arrastrar o seleccionar PDF, imágenes y **carpetas** | `./react` + núcleo | Dos API del DOM distintas (§2.2). El aplanado del árbol y la clasificación son puros |
| 3 | Revisión de los datos | `./react` | La confianza por bloque se muestra siempre, no bajo un desplegable |
| 4 | Vista configurable: habilitar/deshabilitar y editar cada campo | núcleo + `./react` | `PlantillaDeRevision`: `visible`, `editable`, `orden`, `etiqueta` por campo. El reducer es puro |
| 5 | Botones guardar/modificar/eliminar por dato, y uno de pantalla | `./react` | Por campo, más `guardarComoDefecto` para la disposición entera |
| 6 | Al guardar: queda por defecto, prepara catálogos y el modelo E-R | núcleo | El ERD se **propone** en SQL; aplicarlo es gate humano (§2.3) |

---

## 6. Modelo de amenazas (C3)

**Activos**: los documentos originales (datos personales de terceros), el texto extraído, la
clave del motor de OCR, y la plantilla por defecto — que es la que decide qué se extrae mañana.

**Fronteras**: todo lo que cruza hacia adentro se valida. Aquí eso son tres cosas, y la tercera
es la que se olvida:

| Atacante | Cómo muerde aquí | Control |
|---|---|---|
| **O1** Usuario malicioso | Un PDF con texto que parece una instrucción, colado en el contexto del modelo que anota | Lo extraído se trata como **datos, jamás como instrucciones**. Validación Zod de toda anotación antes de tocar nada |
| **O3** Fatiga de aprobación | El sello de goma sobre la pantalla de revisión: tras 40 documentos correctos, se le da a guardar sin mirar | La confianza por campo va **arriba y visible**; el ERD propuesto se presenta como diff acotado, nunca como "aplicar todo" |
| **O4** Bots y externos | Denial-of-wallet: subir 10.000 páginas contra un motor que se paga por página | Límite de páginas por lote y presupuesto por periodo, con el aviso del 80% ya existente |
| **O5** Cadena de suministro | El modelo de OCR sin pinear, o un adaptador que trae una dependencia comprometida | El modelo va pineado (C1): `mistral-ocr-4-1`, o el sha del commit de Hugging Face. `mistral-ocr-latest` se rechaza |
| **O6** Compromiso de un servicio | El worker de ingesta con `service_role` convertido en palanca | C7: el worker es job de plataforma y se declara; la superficie de subida del usuario va con RLS y su sesión |

La frontera que se olvida: **la salida del propio motor**. No se confía por diseño. El `document
annotation` llega como string y se valida contra el esquema antes de existir como dato.

---

## 7. Evaluación de impacto (C4)

**Partes afectadas**: no son los usuarios de la app. Son **los titulares de los documentos** —
pacientes, clientes, empleados, solicitantes — que nunca eligieron estar aquí.

**Daños posibles sin ningún atacante**:

1. **Un dato mal extraído que nadie corrige.** El markdown sale bien maquetado, con un dígito
   cambiado. Pasa la revisión visual humana. Si ese dato decide algo sobre la persona (un
   importe, una fecha de vencimiento, una dosis), el daño es sobre ella y es difícil de rastrear
   hasta su origen.
2. **Un campo apagado en la plantilla que resulta ser el importante.** La plantilla por defecto
   es cómoda precisamente porque deja de mirarse. Un campo desactivado por conveniencia en el
   primer documento desaparece silenciosamente de los mil siguientes.
3. **El documento fuera del perímetro.** Con el adaptador de API, el original sale hacia un
   tercero.

**Mitigaciones**: bbox de origen obligatorio para todo dato promovido — un dato sin su
coordenada no se puede auditar después; la plantilla registra **quién** apagó cada campo y
**cuándo**; y el ERD derivado nunca se aplica solo.

**Decisión**: el daño 3 **no es firmable por el dueño** (límite de C5). Si los documentos llevan
datos personales de terceros, el adaptador de API no se usa: se usa el autohospedado, o se
rediseña. Ahí no se ofrece la vía del registro de riesgo, porque ofrecerla sugiere que una firma
bastaría.

---

## 8. Qué cierra y qué no

**Cierra**: la forma de la herramienta, sus entry points, sus puertos, la máquina de estados, y
dónde vive cada una de las seis capacidades pedidas. Cierra también quién decide qué: el humano
decide si se publica, con qué versión se pinea, y si el ERD propuesto se aplica.

**No cierra, y hay que decirlo**:

- **Qué motor gana.** Sigue siendo desconocido hasta correr el piloto. La herramienta está
  diseñada para no tener que saberlo todavía — ese es el motivo del puerto.
- **El umbral de confianza.** No se puede elegir a ojo: depende de la correlación entre el score
  y el error real, que nadie ha medido. Hasta entonces es configuración sin valor por defecto
  defendible.
- **Si el manuscrito del proyecto es de plantilla repetida.** De eso depende que haga falta un
  fine-tune, y es una pregunta empírica.
- **La herramienta no se ha construido.** Nada de lo de aquí está ejecutado. Un documento y una
  capacidad no son lo mismo, y esta capa ya se llevó esa lección.
