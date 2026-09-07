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

Andamio a copiar: `tools/ejemplo-herramienta/` (package.json, tsconfig, la separación
núcleo/`react`). Referencia de una herramienta real con varios entry points: `tools/voz/`.

### Puertos del núcleo

```
MotorOcr           extrae(documento, opciones) → PaginaExtraida[]
AlmacenDocumentos  guarda / lee / lista documentos y extracciones
AlmacenPlantillas  guarda / lee plantilla por defecto y catálogos
```

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

## Estrategia de gates

- **Durante**: `npm run typecheck` y `npm run lint` tras cada módulo.
- **Al cerrar cada entry point**: `npm run empaqueta extractor-documental` — el contrato del
  paquete se rompe en silencio y solo aparece en el proyecto de destino.
- **Antes de promover**: `npm run validate` completo.
- **Gates humanos, no de script**: publicar el paquete, aplicar cualquier propuesta de modelo, y
  fijar el modelo de OCR (CDC con diff, regresión y firma).

## Nota de estado

**Nada de esto está construido.** Existen este plan, la spec y el SDD. Los cuatro fallos
preexistentes de `verifica-gobernanza` (rama `golden-sets` ausente en el clon, referencia muerta
`GOBERNANZA.md → corridas.md`, y el conteo 151 frente a 149 en los dos README) son anteriores y
ajenos a esta spec.
