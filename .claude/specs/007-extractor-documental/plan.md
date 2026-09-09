# Plan 007 — Extractor documental como herramienta enchufable

> Cierra el **CÓMO** de [`spec.md`](./spec.md). El diseño largo, con hallazgos, modelo de
> amenazas y AISIA, vive en [`docs/SDD-extractor-documental.md`](../../../docs/SDD-extractor-documental.md).

## Módulos

`tools/extractor-documental/` → `@tu-scope/extractor-documental`.

| Subpath | Contenido | peerDependency | Cubre |
|---|---|---|---|
| `.` | Núcleo TS puro, **cero dependencias**: tipos, puertos, máquina de estados, `clasificaArchivo`, reducer de `PlantillaDeRevision`, `derivaModelo` | — | RF-6..RF-10, RF-13, RF-16..RF-22 |
| `./plugin` | Manifiesto autodescriptivo con icono SVG en línea. Importable sin React | — | RF-1..RF-3 |
| `./react` | `ZonaDeIngesta`, `TablaDeRevision`, `EditorDeCampo`. `'use client'` en la primera línea | `react` (opcional) | RF-4, RF-5, RF-11, RF-14, RF-15 |
| `./motores/mistral` | Adaptador de `MotorOcr` contra la API | `@mistralai/mistralai` (opcional) | RF-9, RF-24 |
| `./motores/openai-compat` | Adaptador HTTP contra vLLM autohospedado, vía `fetch` | — | RF-9, RF-24 |
| `./almacenes/supabase` | Adaptador de `AlmacenDocumentos` y `AlmacenPlantillas`, con RLS | `@supabase/supabase-js` (opcional) | RF-21 |
| `./react/lienzo` | Lienzo de modelado: tarjeta por entidad, relación arrastrable, cardinalidad en los extremos | `@xyflow/react`, `react` (ambas opcionales) | RF-32..RF-34 |
| `./react/camara` | Lectura con cámara: `BarcodeDetector` nativo, respaldo wasm donde no exista | `zxing-wasm`, `react` (ambas opcionales) | RF-37, RF-38 |
| `./almacenes/indexeddb` | Adaptador de `AlmacenLocal` para la cola sin conexión | — | RF-50 |
| `./almacenes/supabase-storage` | Adaptador de `AlmacenDeOriginales`: bucket privado, URL firmada | `@supabase/supabase-js` (opcional) | RF-59..RF-62 |

Andamio a copiar: `tools/ejemplo-herramienta/` (package.json, tsconfig, la separación
núcleo/`react`). Referencia de una herramienta real con varios entry points: `tools/voz/`.

### Puertos del núcleo

```
MotorOcr           extrae(documento, opciones) → PaginaExtraida[]
AlmacenDocumentos  guarda / lee / lista documentos y extracciones
AlmacenPlantillas  guarda / lee plantilla por defecto y catálogos
EsquemaExistente   describe() → DescriptorDeEsquema  (tablas, columnas, tipos, claves)
LectorDeCodigos    lee(imagen) → cargas crudas
AlmacenLocal       cola de lecturas mientras no hay conexión
RepositorioDeRegistros  guarda lote, lo lee, busca por criterios
AlmacenDeOriginales     guarda el binario, URL firmada, borrado explícito
```

Módulos puros nuevos: `roles.ts` (matriz declarada como dato), `registros.ts` (lote, ciclo y título
sugerido), `versiones.ts` (append-only con motivo), `busqueda.ts` (`normalizaIdentificador`
compartida con `reconciliacion.ts`), `originales.ts` (ruta y retención), `supresion.ts` (lápida),
`costes.ts` (`null` sin tarifa, nunca cero) y `csv.ts` (BOM y neutralización de fórmulas).

Módulos puros nuevos del núcleo: `codigos.ts` (clasificación de la carga, AIs de GS1, dígitos de
control, ráfaga del escáner), `corroboracion.ts` (cotejo OCR↔código) y `cola.ts` (cola sin conexión
con el instante sellado al escanear).

La implementación por defecto de `EsquemaExistente` **no consulta nada**: devuelve el descriptor
declarado. La resolución por similitud (`resuelveValor`) es **función pura del núcleo** — recibe
el valor y las filas candidatas, devuelve `resuelto | ambiguo | sin_resolver`. Se prueba sin base
de datos, y eso es lo que la hace comprobable en un template.

### Descriptores de ejemplo

En `tools/extractor-documental/pruebas/fixtures/`, versionados:

| Fixture | Para qué |
|---|---|
| `descriptor-vacio.json` | Proyecto virgen. Existe para demostrar que **recorre el mismo código** que el poblado (RF-35), no para probar una rama aparte |
| `descriptor-con-catalogos.json` | Proyecto real con `proveedores`, `clientes` y sus claves |
| `descriptor-desalineado.json` | Declara una columna que ya no existe (RF-36) |

Son el sustituto de la base que este template no tiene, y el motivo por el que "funciona con
catálogos existentes" puede ser una capacidad verificada y no una afirmación.

### Modelo entidad-relación fijo de la herramienta

```
documentos ──1:N── extracciones ──1:N── campos_extraidos
     │                                        │
     │                                   (bbox, confianza, valor, valor_corregido)
     │
tipos_documento ──1:1── plantillas ──1:N── campos_plantilla
                              │                  (visible, editable, orden, etiqueta,
                              │                   deshabilitado_por, deshabilitado_en)
                              └──1:N── catalogos ──1:N── entradas_catalogo
```

Migraciones siguiendo `supabase/migrations/20260826231500_create_project_settings.sql`: RLS
activa, policies por `owner_id`, y el esquema Zod como **espejo exacto** de cada `CHECK` — si se
toca uno, se toca el otro en el mismo commit.

## Decisiones, con la alternativa descartada

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Icono como SVG en línea en el manifiesto | `lucide-react` como en `components.json` | Lucide **no está instalado** en este repo, y una herramienta no puede exigir una librería de iconos a todo proyecto que solo lee su nombre |
| Manifiesto en su propio subpath, sin React | Manifiesto dentro de `./react` | Un lanzador que solo quiere pintar el icono no debería arrastrar React |
| Motor como puerto con adaptadores | Motor cocido dentro | Cocido, la herramienta impone la decisión C4 a todo consumidor. Con puerto, cada proyecto decide si el documento sale del perímetro |
| ERD derivado como **propuesta** en SQL | Aplicarlo automáticamente | Es salida de un modelo. Un `CREATE TABLE` alucinado no falla ruidosamente: crea una tabla plausible |
| `revision_humana` como estado normal | Tratarla como fallo | Si es fallo, la gente sube el umbral hasta que la cola desaparece, y con ella el control |
| `custom_id` derivado del hash del contenido | Contador autoincremental | Con contador, el primer reintento duplica el archivo y se descubre meses después |
| Capa 0: extraer la capa de texto de un PDF digital antes de llamar al motor | Mandarlo todo a OCR | Es entre el 30 % y el 50 % del corpus, cuesta cero y no sale del perímetro |
| Descriptor declarado como vía por defecto | Introspección obligatoria del esquema | El OpenAPI por anon key está bloqueado desde marzo de 2026 y la introspección GraphQL viene desactivada; lo que queda exige clave secreta y ampliaría el privilegio en todo proyecto que instale la herramienta (C7) |
| Descriptor vacío como caso normal | Una rama `sinCatalogos` | Dos caminos divergen en cuanto alguien arregla un bug en uno solo, y el que se queda roto es el que nadie mira |
| Cardinalidad sí, dirección de filtro no | Copiar el modelo semántico de Power BI entero | La dirección de filtro cruzado es propagación de filtros para agregaciones de BI, no integridad relacional: sería una perilla que no gobierna nada |
| Lienzo en `./react/lienzo` | Meterlo en `./react` | Quien solo revisa documentos no debería instalar la librería de grafos |
| Nunca `ALTER` sobre lo preexistente | Proponer y aplicar migraciones al esquema ajeno | Alterar una tabla con datos dentro es irreversible y ajeno: lo decide el dueño de ese esquema |
| Alta de catálogo solo con confirmación | Alta automática al no encontrar coincidencia | Es cómo acaban "ACME SA" y "ACME S.A. de C.V." como dos proveedores, con las facturas repartidas |
| Identidad según la clase de fuente | Una sola regla de idempotencia por contenido | Escanear la misma guía dos veces son dos eventos. La regla única habría descartado el segundo en silencio, y perder un evento vuelve inútil la trazabilidad |
| Identificadores por igualdad exacta, con barrera en el tipo | Comparar todo por similitud | Medido: dos GTIN a un dígito se parecen 0,87. Si el correcto no está en el catálogo, la vía difusa afirma `resuelto` sobre otro producto |
| `LectorDeCodigos` separado de `MotorOcr` | Un solo puerto de extracción | Unificarlos obligaría a inventarle una confianza al código, que es el error que se quiere evitar |
| Nunca navegar a la URL de un código | Abrirla, que es lo cómodo | Es el fraude entero: pegatina encima de la legítima, o QR insertado en el PDF del proveedor |
| El instante se sella al escanear | Sellarlo al recibir en el servidor | Varios eventos sincronizados a la vez compartirían instante y se deduplicarían entre sí: se borraría la trazabilidad de toda una mañana |
| La PWA la hace la app consumidora | Meter el service worker en el paquete | Una librería no instala un service worker; el paquete aporta la cola pura y su adaptador |
| El lote lleva el título, no el documento | Titular cada documento | Con carga masiva nadie escribe miles de títulos: acaban autogenerados y vacíos de significado |
| Título obligatorio y **no único** | Forzar unicidad | El segundo día alguien escribe «Conteo 2», que es peor que dos homónimos distinguibles por fecha |
| Buscar por identificadores extraídos | Solo por título y fecha | Un título a mano es un índice pésimo; los identificadores ya se extrajeron |
| Ruta `{organizacion_id}/{sha256}` | Ruta por persona o por documento | La RLS del bucket se escribe sobre el primer segmento: con la persona ahí, el revisor no lee lo del operario |
| No deduplicar entre organizaciones | Deduplicar globalmente por hash | Ahorraría almacenamiento y filtraría que otra organización tiene la misma factura |
| Corrección como versión nueva | Editar en el sitio | Sin historial no se puede responder «¿qué decía esto en marzo?» |
| Supresión con lápida | Borrado limpio | Sin lápida, una auditoría no distingue «nunca existió» de «se borró» |
| Coste `null` sin tarifa | Estimar cero | Un cero inventado da un presupuesto que parece completo y no lo está |
| Neutralizar fórmulas en el CSV | Exportar el valor tal cual | Excel ejecuta una celda que empieza por `=`; es el remate del ataque de la pegatina |
| Empaquetar desde el día uno | Esperar al reuso 3+ de `CREAR-UNA-HERRAMIENTA.md` | Decisión explícita del usuario. Se acepta el coste: versionado semver y un `export` cambiado es major |

## Cobertura de la DEFINICIÓN DE HECHO

| DoF | Cómo se cubre |
|---|---|
| DoF-1 | Los seis entry points de la tabla de Módulos; el núcleo con `dependencies: {}` |
| DoF-2 | `npm run empaqueta extractor-documental` — valida `exports`, que `'use client'` sobrevive al build, `npm pack`, e instala el tarball en un proyecto limpio |
| DoF-3 | `node --test pruebas/*.ts` sobre máquina de estados, `clasificaArchivo`, reducer y `derivaModelo` |
| DoF-4 | Recorrido manual con Playwright CLI: arrastrar carpeta → corregir → guardar → segunda tanda con la plantilla aplicada |
| DoF-5 | La propuesta se emite como texto SQL y ninguna ruta la ejecuta |
| DoF-6 | `npm run validate`, con `verifica:specs` viendo la carpeta `007-extractor-documental` |
| DoF-7 | Entrada en `.claude/gobernanza/BITACORA-CDC.md` al fijar el modelo del adaptador |
| DoF-8 | Recorrido sobre `descriptor-con-catalogos.json`, con la clave anónima y nada más |
| DoF-9 | Prueba que recorre la salida SQL del generador y falla si aparece `ALTER` sobre una tabla del descriptor |
| DoF-10 | `node --test` sobre los tres fixtures; el vacío y el poblado entran por la misma función |
| DoF-11 | `pruebas/trazabilidad.ts`: dos lecturas del mismo código como evento dan identidades distintas |
| DoF-12 | `pruebas/trazabilidad.ts`: `resuelveValor` lanza sobre un identificador, y se demuestra el emparejamiento erróneo que produciría |
| DoF-13 | `pruebas/cola.ts`: dos entradas sincronizadas en el mismo instante conservan instantes de dispositivo distintos |
| DoF-14 a DoF-16 | `pruebas/registros.ts` y `pruebas/recuperacion.ts` |
| DoF-17 | `pruebas/recuperacion.ts`: el mismo valor escrito de tres formas resuelve y normaliza igual por los dos caminos |
| DoF-18 y DoF-19 | `pruebas/roles.ts` recorre la matriz entera; `pruebas/recuperacion.ts` cubre la lápida |
| DoF-20 | `pruebas/costes-y-csv.ts` |

## Estrategia de gates

- **Durante**: `npm run typecheck` y `npm run lint` tras cada módulo.
- **Al cerrar cada entry point**: `npm run empaqueta extractor-documental` — el contrato del
  paquete se rompe en silencio y solo aparece en el proyecto de destino.
- **Antes de promover**: `npm run validate` completo.
- **Gates humanos, no de script**: publicar el paquete, aplicar cualquier propuesta de modelo, y
  fijar el modelo de OCR (CDC con diff, regresión y firma).

## Nota de estado

**El núcleo puro está construido y probado: 119 pruebas**, sin red, sin base de datos y sin
navegador. Faltan los entry points de React, la cámara, y los adaptadores de OCR, de persistencia y
de storage.

Una comprobación va antes que el lienzo: `@xyflow/react` arrastra `zustand`, y la
incompatibilidad reportada con React 19 venía de depender de zustand 4. Se verifica que monta en
React 19 **antes** de comprometer el subpath; si no monta, la salida es SVG propio y el resto del
plan no cambia.

Los cuatro fallos
preexistentes de `verifica-gobernanza` (rama `golden-sets` ausente en el clon, referencia muerta
`GOBERNANZA.md → corridas.md`, y el conteo 151 frente a 149 en los dos README) son anteriores y
ajenos a esta spec.
