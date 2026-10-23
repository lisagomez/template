# Estudio de dashboards

Pides la vista que necesitas en una frase y la ves en segundos, con cada cifra sacada de una métrica gobernada y con su procedencia a un clic.

## Qué hace

- **Regenera un tablero desde una frase** editando una especificación declarativa (`estudio.dashboard/1`), validada por esquema y por el catálogo, y versionada: cada cambio es una versión que se puede deshacer, comparar con otra (componentes y cifras) o fijar como oficial.
- **Muestra «lo que entendí» antes de aplicar**: tipo de instrucción, métricas, dimensiones, filtros, periodo y los componentes que toca. Quien dirige corrige con otra frase o con clics; las dos vías editan la misma especificación.
- **Responde a seis tipos de instrucción**: crear (KPI, tendencia y desglose), modificar (solo el componente afectado), filtrar (filtros globales como chips), analizar (descompone una variación en mezcla y tasa, volumen y precio, y deja un hallazgo con cifras), explicar (la definición de la capa) y alertar (una regla que pide confirmación).
- **Toda cifra sale de la capa semántica** (MetricFlow) por nombre de métrica, con la definición, el dueño, los filtros que aplicaron y el SQL que compiló la capa.
- **Detecta señales de growth** recorriendo frecuencia, valor, retención y riesgo por entidad y por origen, con umbrales estadísticos declarados (z robusto ≤ −3, brecha ≥ 10 pp o 15 %, crecimiento sobre la mediana con riesgo sobre el p75), las diagnostica con consultas y propone experimentos priorizados por ICE.
- **Las mismas herramientas como CLI** (`estudio-dashboards`) para cualquier otro agente o persona.

### Qué no hace

- No dibuja HTML ni escribe SQL: el agente edita la especificación y pide métricas por nombre. Un parche que toca un componente que la instrucción no pidió se rechaza entero.
- No inventa cálculos: si lo pedido no existe en el catálogo, lo dice y ofrece proponer la métrica como diff del YAML semántico; no sustituye por una parecida.
- No suma en el cliente lo que no suma (clientes distintos, razones, fotos de inventario) ni usa una métrica con desfase sobre un periodo de varios meses.
- No envía nada: una alerta registrada no tiene canal; `proponer_metrica` no abre ningún PR ni toca el proyecto dbt.
- No guarda en Supabase: las versiones y alertas van por un puerto (memoria o archivo).

## Casos de uso

- **Quien dirige una empresa**, cuando necesita una vista que hoy le pide a un analista («margen por región sin mayoreo, resalta las tiendas debajo del 23 %»): la ve en segundos, con lo que el agente entendió a la vista antes de aplicarla (spec `docs/goals/estudio-dashboards.md`, §MISION).
- **Quien dirige un área**, cuando una cifra cambió y quiere saber por qué («¿por qué cayó el margen en julio?», «¿por qué estas tiendas bajaron?» sobre una selección del mapa): un hallazgo que separa mezcla y tasa con cifras de sus consultas.
- **Growth y operación**, cada vez que abren el tablero: las señales que pasan su umbral, ligadas a las tiendas del mapa, con hipótesis, experimento, métrica guía y guardarraíl.
- **Otro agente o una persona en la terminal**, cuando quiere consultar o editar la misma capa sin el lienzo: el CLI, en seco por defecto.
- **Otro proyecto del repo con capa MetricFlow** (soporte-sap, clinica-dental), cuando quiere preguntarle a su capa: el núcleo no sabe de ninguna empresa; se midió sobre `tools/soporte-sap/semantica` sin cambiar una línea del núcleo.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines.node`).
- **Dependencias del sistema**: para el adaptador de MetricFlow, Python 3.12 por `uv` con el lock con hashes `semantica/requirements.lock` (dbt-core 1.12.5, dbt-duckdb 1.11.0, duckdb 1.5.5, dbt-postgres 1.11.0, dbt-metricflow 0.15.0 → metricflow 0.213.0). El núcleo no necesita ninguna (solo `zod` 4.6.1).
- **CPU, GPU y memoria**: sin GPU. El proceso de MetricFlow sobre golfo_norte ocupa 216–227 MB de RSS (observado con `ps` el 2026-10-20); arranca en ~0.45 s y una consulta en frío tarda p95 33 ms (medición del 2026-10-20, `docs/goals/estudio-dashboards-medicion/`). Con `procesos: 3` (el lienzo y la medición) son tres: 212, 182 y 178 MB de RSS, ~570 MB juntos (`ps`, 2026-10-20), y regenerar un tablero con un filtro nuevo baja de p50 354 a 141 ms. CPU: no medido.
- **Servicios externos**: OpenRouter, solo para el agente (`./openrouter`); el núcleo, el CLI sin `agente` y el adaptador de MetricFlow no llaman a ninguno.
- **Variables de entorno**: `OPENROUTER_API_KEY` (subcomando `agente` del CLI), `ESTUDIO_MF_VENV` (entorno de Python alterno, opcional); el laboratorio: `ESTUDIO_GN_DATOS`, `GN_DATOS`, `GN_DUCKDB`, `GN_DBT_TARGET`.
- **Almacenamiento**: el entorno de Python en `~/.cache/estudio-dashboards-semantica/venv-<huella del lock>` (362 MB el 2026-10-20); la base DuckDB del laboratorio en `~/.cache/estudio-dashboards-semantica/golfo_norte/` (29 MB); versiones, alertas y gasto en el almacén que se configure (`~/.estudio-dashboards/<nombre>` en el CLI); `target/` y `logs/` del proyecto dbt, ignorados por git. Se borra quitando esas carpetas.
- **Salida del perímetro (C4)**: el agente manda a OpenRouter el prompt (catálogo de métricas con sus dominios), la especificación del tablero y la instrucción. En el laboratorio los datos son ficticios (Distribuidora Golfo Norte) y no hay decisión C4 de por medio; con datos reales hace falta una antes de encender el agente. Las cifras y las tablas no salen de la máquina.

## Uso

```ts
import { cargaCatalogo, consultor, ejecutaHerramienta, interpreta, memoriaVersiones, memoriaAlertas } from '@tu-scope/estudio-dashboards'
import { puertoMetricFlow } from '@tu-scope/estudio-dashboards/metricflow'
import { modeloOpenRouter } from '@tu-scope/estudio-dashboards/openrouter'

// `procesos` (por defecto 1): varios lectores en paralelo, solo sobre un perfil de solo lectura.
const puerto = puertoMetricFlow({ proyecto: 'ruta/al/proyecto-dbt', perfiles: 'ruta/al/proyecto-dbt', procesos: 3 })
const ctx = { consultor: consultor(puerto, await cargaCatalogo(puerto)), versiones: memoriaVersiones(), alertas: memoriaAlertas(), fechaCorte: '2026-09' }
await ejecutaHerramienta(ctx, 'consultar_metricas', { metricas: ['ventas_netas'], agrupar: ['tienda__region'], periodo: { desde: '2026-01', hasta: '2026-09' } })
```

Subpaths: `.` (núcleo: esquema, validación, parches, versiones, consultor, resolver, análisis, señales, alertas, propuestas, herramientas, agente), `./metricflow` (adaptador de proceso), `./openrouter` (modelo pineado, razonamiento y proveedor explícitos; `conReserva` repite con razonamiento propio si la respuesta trunca), `./almacenes/archivo`.

### CLI

`estudio-dashboards <subcomando> --config <archivo.json> [--entrada '<json>'] [--aplicar] [--confirmada-por <nombre>]`, con `listar_metricas`, `describir_metrica`, `consultar_metricas`, `leer_dashboard`, `editar_dashboard`, `analizar_variacion`, `ver_senales`, `crear_alerta`, `proponer_metrica`, `comparar_versiones`, `volver_version`, `fijar_oficial` y `agente "<instrucción>" --tablero <t>`. Lo que escribe va en seco salvo `--aplicar`. Códigos: 0 bien · 2 uso · 3 rechazo del esquema o del catálogo · 4 falla de la capa · 5 modelo no disponible. Grado: **no medido**.

## Laboratorio

`laboratorio/` trae el proyecto dbt `golfo_norte` (datos ficticios; los 7 CSV fuera de git en `.datos/`, fijados por sha256 en `datos.json`), su configuración (`estudio.config.json`, `perfil.json`, `geografia.json`, tableros base) y:

- `corre.mjs`: verifica los hashes, `dbt build`, `mf validate-configs` y la tabla de cifras (propuesta · MetricFlow · conteo directo).
- `catalogo.mjs`: la foto del catálogo que usan las pruebas y el set de referencia.
- `segundo-catalogo.mjs`: el Estudio sobre la capa de soporte-sap, sin tocar el núcleo.

`evaluacion/` tiene el contrato del set de referencia, el set congelado (100 preguntas, huella en `set-referencia.sha256`), el set v2 adjudicado por un revisor independiente y ciego (`set-referencia-v2.json`, `ADJUDICACION.md`), su validador y `mide.mjs` (medición con el LLM real, con tope de gasto).

## Pruebas

`npm --prefix tools/estudio-dashboards run prueba`: 50 pruebas (2026-10-20). Cubren los casos malos (métrica inventada, dimensión inválida, SQL libre, filtro fuera de dominio, parche que toca de más), versiones, consultor, resolver (también con respuestas desordenadas y con dos procesos reales), narración con cifras respaldadas, alertas, propuestas, agente con modelo doble (incluido el canario de contaminación del set), CLI (paridad y códigos) y, si están el entorno y los datos, la capa real (tablero, las 3 señales sembradas y el análisis de julio).

## Mediciones

Del 2026-10-20, en `docs/goals/estudio-dashboards-medicion/`: tabla de cifras (`cifras.md`), regeneración de los datos con semilla (`regeneracion.json`), precisión del agente por nivel y por tipo (`medicion-*.json`), libro de llamadas con el gasto (`llamadas.jsonl`) y el segundo catálogo (`segundo-catalogo.json`).

## Cambios

- 0.1.0 (2026-10-20): primera versión, en laboratorio.
