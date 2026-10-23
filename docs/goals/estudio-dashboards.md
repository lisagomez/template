# Estudio de dashboards con agente sobre una capa semántica — Spec

> Compilado con `/goal-compiler` el 2026-10-20 desde `main` (`417bc57`), en el worktree
> `.claude/worktrees/estudio-dashboards`, rama `estudio/dashboards`.
>
> **Forma: GRAFO** (4 de 4 en el diagnóstico). Hay tres especialidades con herramientas distintas: el plano
> de datos (dbt y SQL), el agente (prompts y medición) y el lienzo (UI). El plano de datos y el lienzo avanzan
> en paralelo y convergen en el contrato semántico. El flujo se lee como diagrama: instrucción → parche →
> validación → consulta → render, más el ciclo detectar → aprender. Y el criterio cambia por nodo: cifras que
> cuadran, precisión de al menos 90 %, recorridos en el navegador y reglas de CLI.
> **El test de colapso no lo absuelve**: el set de referencia lo escribe un revisor dedicado y queda congelado
> ANTES de que exista el prompt del agente. Si lo escribe el mismo agente que lo va a aprobar, el 90 % es un
> auto-sello.
>
> **Decidido por el laboratorio (20/10):**
> 1. **El agente se mide con un LLM real.** Va por OpenRouter, con el modelo pineado y un **tope duro de US$2**.
>    Se mide primero el nivel más barato de `.claude/routing-modelos.json` y solo se sube de nivel si no llega
>    al 90 %. La clase de routing nueva y los prompts entran en la rama como CDC: nada se mergea sin la firma.
>    Los datos son ficticios, así que no hay decisión C4 de por medio.
> 2. **«Luego lo pasas a CLI».** Una vez medido el agente, sus herramientas salen como **CLI**, no como el
>    servidor MCP que proponía el documento: un MCP se paga en cada sesión, se use o no, y un CLI solo cuando se
>    invoca (AGENTS.md, CLI-first). Que un arnés lo adopte como herramienta suya es un CDC aparte, y queda como
>    propuesta.

## Cómo se leyó el encargo (si algo está mal, se corrige el spec, no el código)

- **«Nueva herramienta»** se leyó así: un `tools/<nombre>/` reutilizable sobre **cualquier** capa semántica
  MetricFlow. Golfo Norte es el dataset del laboratorio, no el producto. El reúso ya es real: este sería el
  **tercer** proyecto del repo con dbt y MetricFlow (`tools/soporte-sap/semantica`,
  `tools/clinica-dental/semantica`), y ninguno de los dos tiene hoy forma de preguntarle nada a su capa en
  lenguaje natural. Eso pasa la puerta de `docs/CREAR-UNA-HERRAMIENTA.md` §1.
- El roadmap de 16 semanas con 6 personas, el ELT a fuentes reales y el warehouse en la nube son **contexto**,
  no alcance. El laboratorio es la «opción C» de la propuesta: los CSV dummy en local, con dbt y MetricFlow
  encima.
- La propuesta es la vara de las **cifras**. El prototipo publicado es la vara de la **experiencia**, no de los
  números: calcula en JavaScript sobre un arreglo preagregado y no consulta ninguna capa semántica.

## Lo que hay hoy (hechos, comprobados el 2026-10-20)

**Los insumos**, en el worktree y fuera de git (`.datos/` está en `.gitignore`):

| Insumo | Dónde | Qué es |
|---|---|---|
| Propuesta | `docs/goals/estudio-dashboards-propuesta.md` | El documento entero: growth por área, catálogo de métricas, diseño del agente, herramientas, guardrails, hallazgos y KPI |
| Proyecto dbt | `.datos/estudio-dashboards/golfo_norte/` (y el zip original al lado, sha256 `273f07d93ff6c414…`) | 22 modelos (staging 7, intermediate 3, core 8 con la time spine, marketing 1, growth 3), 3 pruebas singulares y un macro `margen_pct`; semántica en `models/semantic/sem_{modelos,metricas,growth}.yml` |
| Datos crudos | `.datos/estudio-dashboards/golfo_norte/data/raw/*.csv` (27 MB) | Filas: lineas_pedido 520,825 · pedidos 165,515 · clientes 21,938 · inventario 735 · productos 35 · tiendas 21 · campanas 6. **Coinciden con la propuesta** |
| Generadores | `golfo_norte/scripts/gen_data.py` (numpy, semilla 42) y `lifecycle.py` (semilla 7, reescribe pedidos y clientes) | Requieren numpy y pandas, sin versión declarada |
| Prototipo | `https://claude.ai/artifact/HLxmd1kLiRqo3hkLE65rHY` (compartido con cualquiera que tenga el enlace) | Lienzo con navegación, barra de instrucciones con chips, filtros como chips, rejilla de 12 columnas, 14 tipos de componente, mapa de matriz de puntos arrastrable, tablero detectar-diagnosticar-actuar-aprender de 4 columnas, perfil de tienda, versiones, especificación JSON visible, catálogo y dos motores (Claude o reglas locales) |

sha256 de los CSV (primeros 16): campanas `c48b6741d8b345aa` · clientes `6daf0305ff9b03b0` · inventario
`fced659b5d6797e8` · lineas_pedido `ade7b3f3b3eddf70` · pedidos `bec80bfed9356efd` · productos
`d6f3245a12866f4a` · tiendas `c7d74e698996e1f9`.

**El SQL está en dialecto DuckDB**: `strftime(mes, '%Y-%m')`, `date_diff('month', …)`, `mes - interval 1 month`,
`any_value`, y fuentes leídas con `read_csv_auto` desde `meta.external_location`. El perfil es `dbt-duckdb`.

**La casa:**

- **dbt y MetricFlow ya se corren aquí**, con Python 3.12 por `uv` y un lock con hashes
  (`tools/clinica-dental/semantica/requirements.{in,lock}`: dbt-core 1.12.5, dbt-postgres 1.11.0,
  dbt-metricflow 0.15.0). El venv vive en `~/.cache/<x>-semantica/venv-<huella del lock>` y lo maneja
  `corre.mjs`, sin telemetría. **No hay lock para `dbt-duckdb`**: o se pinea uno nuevo igual, o se porta el
  dialecto a Postgres (Docker 29.1.3 está, con imagen pineada por digest en `semantica/imagen.mjs`).
- **En la máquina**: Node 22.23, `uv` y Docker. No están instalados dbt, duckdb ni mf. El Python del sistema es
  3.14.
- **El LLM**: `OPENROUTER_API_KEY` está presente en `.env.local` del repo principal (el worktree no lo trae).
  En `routing-modelos.json` (precios consultados el 2026-08-23, vigencia 90 días): `voz` = Haiku 5.5 a
  0.1/0.5, `ligero` = Haiku 4.5 a 1/5, `capaz` = Sonnet 5 a 2/10 y `razonamiento` = Opus 5. **Ninguna clase de
  tarea existente** describe «interpretar una instrucción y parchear un dashboard»: hace falta una nueva, y
  eso es CDC. La contabilidad de tokens vive en `src/lib/ai/contabilidad.ts`: sin datos de uso, el coste es
  `null`, nunca cero.
- **Supabase de la app está pausado** desde el 14/10 y su MCP es de solo lectura. Las versiones de los
  dashboards no pueden depender de él: van por un puerto inyectado (memoria o archivo en el laboratorio).
- **Rutas**: `/estudio` ya es de `estudio-pymes`. Los laboratorios (`/laboratorio-*`) no pasan por el proxy de
  sesión. Una ruta que gasta OpenRouter no puede quedar abierta al desplegar: lleva su fila en
  `docs/REVISION-rutas-publicas.md`.
- **Herramientas**: `npm --prefix tools/<x> run prueba` corre la suite de una sola herramienta
  (`prueba:tools -- <x>` no filtra). `npm run empaqueta <x>` instala el tarball en un proyecto limpio. Modelo de
  forma: `tools/calendario` o `tools/clinica-dental` (núcleo, subpaths, simuladores y `pruebas/`).
- **Prior art que conviene leer, no copiar**: `tools/crecimiento-demostrado` (narración restringida: los
  números del texto son un subconjunto de los hechos verificados; LMDI de clientes × frecuencia × ticket) y
  `tools/grafo-conocimiento` (el veredicto lo da un motor determinista y el LLM solo estructura).
- En el puerto 3000 corre otro `next-server`: `npm run dev` busca uno libre.

**Cifras de referencia de la propuesta** (ene–sep 2026 frente a ene–sep 2025, pedidos completados, ventas netas
de descuento). Son la vara de `l-cifras`:

| Bloque | Cifras |
|---|---|
| Foto | ventas netas 60.7 M → 74.5 M (+22.7 %) · comparables (19 tiendas) +18.5 % · margen 24.8 % → 23.8 % (−0.9 pp) · pedidos 60,283 → 72,554 (+20.4 %) · ticket 1,007 → 1,027 (+2.0 %) · activos 9,692 → 14,234 (+46.9 %) · frecuencia 6.2 → 5.1 (−18.0 %) · bajo reorden 119 de 735 |
| Catálogo | e-commerce 10.0 % · devolución 2.5 % · ROAS incremental de −0.17× (Hot Sale 2026) a 15.6× (Verano Bebidas) · nuevos 7,418 · recurrentes 6,816 · retención M+3 70.0 % · base inicial 3,395 |
| Growth por área | Mérida y Oaxaca: los establecidos compran en 28–30 % menos meses; Mérida pasa de 23 a 42 días entre compras · 70 % de los nuevos llega en meses de campaña; retienen 66.3 % frente a 82.7 % y valen 4,636 frente a 6,730 MXN en 6 meses · 20,134 salidas frente a 10,710 reactivaciones · Tampico +34.8 % con 10 de 35 SKU bajo reorden; Polanco 7 · digital de 7.3 % a 10.0 % |
| Hallazgos | Occidente +33.7 %, Centro +32.7 %, Sureste +14.0 %; Mérida −2.4 %, Oaxaca +2.8 % · Mayoreo: 4.1 % de los pedidos y 52.7 % de las ventas · e-commerce +67.4 % · margen por categoría: Cuidado personal 35.6 %, Limpieza 32.1 %, Lácteos 15.1 %, Frescos 12.0 % · julio: 100 % de los días en campaña, el margen cae 7.8 pp |

Ojo con los redondeos: 24.8 → 23.8 se publica como −0.9 pp. Se compara contra el valor sin redondear y se
reporta tal cual.

## MISION

Que exista **el Estudio**: el lugar donde quien dirige una empresa le pide a un agente, en una frase, la vista
que necesita, y la ve en segundos. **Cada número sale de una métrica gobernada**: «ventas» significa lo mismo
en cada componente, y cada componente dice de dónde salió. Es una herramienta de growth, no un generador de
gráficas. Cada vista se ata a una palanca (adquisición, frecuencia, retención o ticket) y el margen funciona
como guardarraíl.

**El contrato que lo hace confiable (lo que no cambia):**

- **El agente no dibuja HTML ni escribe SQL.** Edita una **especificación declarativa** del dashboard, validada
  por esquema y versionada, y pide los datos a la capa semántica **por nombre de métrica**. El lienzo solo
  renderiza la especificación. Así cada regeneración es predecible, reversible y comparable.
- **Toda cifra tiene procedencia a un clic**: métrica, definición, dueño, filtros y SQL compilado.
- **Si no se puede responder con las métricas que existen, lo dice** y ofrece proponer una. No inventa
  cálculos. Toda cifra que aparezca en su texto sale de una consulta de esa misma vuelta.
- **Lo que mueve algo fuera del lienzo se propone, no se ejecuta.** Una alerta queda como regla registrada y en
  el laboratorio no envía nada. Una métrica nueva sale como diff del proyecto dbt, listo para un PR que abre
  una persona.

**La experiencia, al horizonte:**

- **El lienzo, en tres zonas**: la barra de instrucciones arriba, el dashboard al centro y el panel de contexto
  a la derecha (métrica, definición, consulta, historial). Responde a los **seis tipos de instrucción** de la
  propuesta:
  - **Crear**: un tablero completo de KPI, tendencia y desglose.
  - **Modificar**: solo el componente afectado. Un parche que toca de más es un fallo.
  - **Filtrar**: filtros globales que se ven como chips.
  - **Analizar**: descompone una variación (precio, volumen y mezcla; nuevos y recurrentes; campaña y orgánico)
    y deja una tarjeta de hallazgo con cifras.
  - **Explicar**: la definición del modelo semántico.
  - **Alertar**: una regla de monitoreo, que pide confirmación antes de registrarse.
- **«Lo que entendí» antes de aplicar**: la métrica, la dimensión, los filtros y el periodo, visibles. El
  usuario corrige con otra frase o con clics (filtro, orden, tipo de gráfica), y las dos vías editan la misma
  especificación.
- **Versiones de verdad**: cada cambio es una versión. Se puede volver atrás, comparar dos versiones lado a lado
  (qué componentes y qué cifras cambiaron) y fijar una como oficial.
- **El mapa como instrumento**, componente de primera clase: matriz de puntos oscura con las tiendas como nodos
  cuadrados, que se arrastra y se acerca. Se selecciona con clic o con **lazo**, y la selección filtra todo el
  tablero y el agente la entiende como contexto («¿por qué estas tres bajaron?»). Los nodos se dimensionan por
  la métrica activa y se colorean por la variación contra el año anterior. Las capas de inventario bajo reorden
  y de cobertura se pueden encender. Las tarjetas de señal (vigilando, hipótesis, experimento) se unen con
  líneas a las tiendas que las originan.
- **El ciclo de growth**: detectar → diagnosticar → actuar → aprender.
  - Detectar: el motor de señales recorre frecuencia, retención, valor y riesgo por tienda, cohorte y origen, y
    publica una tarjeta «vigilando» cuando un cambio pasa su umbral.
  - Diagnosticar: separa causas con consultas semánticas y redacta la hipótesis con cifras.
  - Actuar: propone un experimento con métrica guía, guardarraíl, población y duración, priorizado en un
    backlog ICE.
  - Aprender: registra el resultado.
  - **Tiene que reencontrar solo las tres señales sembradas** en los datos: los establecidos del Sureste compran
    menos, los clientes de campaña abandonan antes, y una tienda crece sin inventario.
- **Contabilidad de clientes y cohortes**: nuevos + retenidos + reactivados − perdidos por tienda y mes, y la
  curva de retención por origen, tal como la definen los marts de growth (con la base inicial de enero de 2025
  fuera de las cohortes).

**La herramienta, al horizonte:**

- **El núcleo no sabe de Golfo Norte.** Recibe un catálogo semántico y un puerto de consulta. Hoy lo prueban
  Golfo Norte y **un segundo catálogo del repo** (el de soporte-sap o el de clinica-dental), cargado sin cambiar
  una línea del núcleo.
- **Una sola superficie de herramientas, con dos puertas**:
  - **en proceso**, para el agente del lienzo;
  - **como CLI**, para cualquier otro agente o persona: `listar_metricas`, `describir_metrica`,
    `consultar_metricas`, `leer_dashboard`, `editar_dashboard`, `analizar_variacion`, `ver_senales`,
    `crear_alerta` y `proponer_metrica`, más un subcomando que corre el agente sobre una instrucción.
  - Los nombres son los de la propuesta; puedes cambiarlos si lo justificas.
- **Medido, no prometido**:
  - precisión sobre 100 preguntas de referencia, por nivel de modelo y por tipo de instrucción;
  - latencia de regeneración (objetivo de menos de 5 s p95 con caché caliente) y de consulta (menos de 3 s);
  - gasto por instrucción;
  - qué nivel de modelo basta. Eficiencia por reparto: si Haiku 5.5 llega al 90 %, no se paga Sonnet.

## GRAFO DEL SISTEMA

Topología completa en `docs/grafos/estudio-dashboards.json`: nodos = artefactos, aristas = transformaciones
tipadas (script, agente, mixta, manual), lazos = comparadores con su referencia. Estados honestos: **morado** lo
validado (spec, insumos, piezas de la casa), **ámbar** lo que existe sin estreno (los CSV fijados) y **gris**
todo lo que falta. Un estado se cambia solo con evidencia: al cerrar un lazo, actualiza su `estado` y su
`evidencia` en el JSON.

Plan derivado en `docs/goals/estudio-dashboards-plan.md` (9 fases, 4 con paralelismo). Dos agentes coexisten
solo si escriben artefactos distintos. ⚠ marca una convergencia: varias aristas que llegan al mismo artefacto
las hace el mismo worker, o un merge explícito.

| Fase | Produce | Gates al cerrar |
|---|---|---|
| 1 ⚡ | CSV fijados · esquema de la especificación ⚠ | hashes = zip |
| 2 | proyecto dbt con entorno pineado ⚠ | — |
| 3 | catálogo semántico y cifras reproducidas | dbt build · cifras = propuesta y = conteo directo |
| 4 ⚡ | **set de 100 congelado** (revisor dedicado) ⚠ · núcleo ⚠ | set antes del prompt · parches que se rechazan · empaqueta |
| 5 ⚡ | motor de señales · agente ⚠ · segundo catálogo ⚠ | 3 señales sin nombrarlas · no inventa · diff vacío en el núcleo |
| 6 ⚡ | medición ⚠ · lienzo ⚠ · **CLI** ⚠ | ≥ 90 % · gasto ≤ US$2 · latencia · accesibilidad · reglas de CLI |
| 7 | evidencias ⚠ | — |
| 8 | propuestas para firmar | validate completo |
| 9 | ⏸ firma del laboratorio: **fuera del HECHO** | — |

## LIBERTAD TECNICA

Tú eliges arquitectura, nombre de la herramienta (que no choque con `/estudio`), forma del esquema de la
especificación, librería de gráficas y de mapa, cómo se dibuja la matriz de puntos, DuckDB o Postgres para el
laboratorio, cómo se habla con MetricFlow (CLI `mf`, su API de Python o un compilador propio sobre el manifiesto),
cómo se cachea y cómo se puntúa la precisión. Lo que nombran este spec y la propuesta (Vega-Lite, ECharts,
MapLibre, FastAPI, MCP) son **sugerencias descartables**, salvo §RESTRICCIONES REALES y el stack de la casa
(AGENTS.md, Golden Path). Si una pieza de la casa no sirve, dilo con evidencia y propón otra; no la rodees en
silencio. Optimiza por el mejor resultado, no por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

- **Producto**: 2-3 referencias de nivel mundial de BI conversacional sobre una capa de métricas. Por ejemplo,
  Hex (Magic y Threads), Lightdash (nativo de dbt y MetricFlow, código abierto) y ThoughtSpot Spotter u Omni.
  De ahí sacas cómo muestran «lo que entendí», la procedencia y las versiones, no la marca.
- **Capa semántica**: la especificación abierta de MetricFlow (Apache 2.0), cómo compila métricas derivadas, de
  razón y con desfase temporal, y Open Semantic Interchange, para que el núcleo no quede atado a una
  herramienta.
- **Evaluar text-to-métrica**: cómo se arma y se puntúa un set de referencia (coincidencia de métricas,
  dimensiones, filtros y periodo; parches mínimos) sin que el set se contamine con el prompt.

Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Datos fijados**: los 7 sha256 pegados, iguales a los de este spec. La regeneración con semilla da lo mismo,
  o se declara «no reproducible» con las versiones de numpy y pandas que se usaron. Nunca se reemplazan los CSV
  del zip por los regenerados.
- **Plano de datos en verde**:
  - el output de `dbt build` pegado (22 modelos y 45 pruebas, o el conteo real explicado) y `mf validate-configs`;
  - el entorno pineado con lock y hashes.
- **Tabla de cifras**: cada cifra de §Cifras de referencia junto a su `mf query` y a un **conteo directo
  independiente** (SQL sobre los CSV que no pasa por los marts), con la diferencia. Lo que no cuadra se explica:
  la definición, el redondeo o un error de la propuesta. **Nunca se ajusta la definición para que cuadre.**
- **Suites del núcleo en verde, pegadas con su conteo.** Incluyen los casos malos:
  - métrica inventada, dimensión inválida, SQL libre, filtro fuera de dominio;
  - un parche que borra o cambia un componente que no se pidió;
  - deshacer y comparar versiones;
  - pregunta sin métrica → lo dice y ofrece proponerla;
  - números del texto ⊆ resultados de la consulta.
- **Señales**: las 3 sembradas reencontradas sin nombrarlas en ningún prompt ni en ninguna regla, y ninguna
  señal inventada.
- **Medición del agente con el LLM real**:
  - el hash del set y el commit que lo congela, **anterior** al primer prompt;
  - la precisión por nivel, empezando por el más barato, y por tipo de instrucción (los 6);
  - la lista de fallos;
  - latencia p50 y p95 de la regeneración y de la consulta;
  - el saldo de OpenRouter antes y después, **≤ US$2**;
  - **≥ 90 %** en el nivel que se proponga para la clase nueva.
- **Capturas con Playwright, en escritorio y celular**:
  1. «Muéstrame margen por región en 2026, sin mayoreo, y resalta las tiendas debajo del 23 %», con antes,
     después y «lo que entendí»;
  2. «ahora por mes y compáralo con 2025»;
  3. el mapa arrastrado y acercado, y una selección por lazo que filtra el tablero, seguida de «¿por qué estas
     bajaron?»;
  4. la procedencia abierta: métrica, filtros y SQL compilado;
  5. volver a una versión y comparar dos;
  6. el tablero detectar-aprender con tarjetas enlazadas a tiendas en el mapa;
  7. una pregunta sin métrica.
  Más axe-core con 0 violaciones serias en escritorio y celular.
- **CLI**: el recorrido pegado de cada subcomando.
  - Escrituras: dry-run por defecto y aplicar solo con bandera explícita.
  - La salida es idéntica a la del núcleo sobre las mismas entradas (paridad probada).
  - Códigos de salida distintos para error de uso, rechazo del esquema y falla de la capa.
  - Lee la capa real y jamás inventa una respuesta.
  - Grado: «no medido» hasta que se puntúe.
- **Portabilidad**: el segundo catálogo del repo cargado; métricas listadas y un tablero válido sobre él, con el
  **diff vacío** en el núcleo.
- `npm run empaqueta <nombre>` verde, y **`npm run validate` completo verde tras el último commit**, pegado.
- **Reporte de decisiones** (qué elegiste y por qué), la lista de formas en que esto podría estar mal o
  incompleto (resuelve las que se puedan), el post-mortem y las **propuestas para firmar sin firmar**:
  - el CDC (clase de routing, prompts y la superficie CLI);
  - el README product first;
  - la fila del inventario;
  - la fila de rutas públicas.
  El grafo se actualiza con sus estados ganados.

## COMANDO DE VALIDACION

Declara en el primer checkpoint tu comando de validación y córrelo tras cada cambio grande, pegando su salida:
la suite del núcleo (`npm --prefix tools/<nombre> run prueba`) más la corrida semántica que armes (dbt build,
mf validate y la tabla de cifras). Al cerrar cada fase corre sus gates (§GRAFO). Antes de declarar el HECHO,
`npm run validate` completo, después del último commit.

## RESTRICCIONES REALES

- **El núcleo va sin React, Next ni Supabase.** Lo que los necesite va en un entry point aparte, con
  peerDependency opcional (docs/EMPAQUETAR-HERRAMIENTA.md).
- **Todo va pineado exacto**: dbt, el adaptador, MetricFlow (lock con hashes), las dependencias npm y el id del
  modelo. Nada de `latest` ni de rangos.
- **Las cifras solo vienen de la capa semántica.** Ni el lienzo ni el agente leen tablas crudas. El conteo
  directo existe solo como comparador.
- **LLM**:
  - tope duro de US$2, con el saldo medido antes y después;
  - la llave solo del lado del servidor, nunca `NEXT_PUBLIC_`, y su valor jamás impreso (presente o ausente,
    a lo sumo 4 caracteres);
  - la contabilidad de tokens registra cada llamada, con coste `null` si falta el uso;
  - la ruta que llama al modelo cierra sin su secreto (503, como las otras) y lleva su fila en rutas públicas.
- **CDC**: la clase de routing nueva, los prompts y la superficie CLI entran en la rama como **propuesta fuera
  del registro**. Nunca va una entrada «pendiente» en la bitácora, y la firma la escribe el laboratorio.
- **CLI**: dry-run por defecto, llama a la capa real o lee el store local, jamás inventa. Que un arnés lo
  adopte como herramienta suya (skill, settings o manifiesto de la imprenta) es CDC: queda como propuesta.
- **Datos**: Distribuidora Golfo Norte es ficticia y así se queda. En este goal no entran datos reales. Los 27
  MB de CSV no entran a git: van en `.datos/` fijados por hash, como las semillas de soporte-sap y
  clinica-dental.
- **Nada sale del laboratorio**: ninguna alerta se envía por ningún canal y `proponer_metrica` no abre ningún PR.
  Lo irreversible pasa por gate humano.
- **Sin Supabase**: está pausado. Las versiones van por un puerto (memoria o archivo). Si propones tablas, la
  migración va con RLS, validada en un Postgres efímero y **sin aplicar**.
- **Git**: se trabaja solo en este worktree, sin tocar la copia principal. Sin push, PR ni merge: los hace el
  laboratorio.

## FUERA DEL HECHO (fases aparte, cada una la abre el laboratorio)

Firmar el CDC y adoptar el CLI en el arnés. Fuentes reales (ELT, warehouse en la nube, ERP del monorepo) con su
C3 y su AISIA. Seguridad por fila por región heredada del usuario sobre un warehouse real. El job nocturno de
detección programado. Alertas por un canal externo (C3 + C4). Publicar el paquete. Desplegar. El piloto con
usuarios reales.

## RED DE SEGURIDAD

- Si una cifra de la propuesta no se reproduce tras dos intentos honestos, **no ajustes**: repórtala como
  divergencia, con las dos consultas, y sigue.
- Si el gasto llega a US$2, la medición se detiene y se reporta lo medido hasta ahí. Si ningún nivel llega al
  90 %, no se relaja el set: se reporta el fallo por tipo de instrucción.
- Si tras 40 turnos una fase no cierra sus gates, detente y reporta el bloqueo con evidencia.

## Formas en que esto puede salir mal (vigílalas)

- **El set contaminado**: el set y el prompt los escribe el mismo agente, en el mismo contexto, y el 90 % mide
  memoria, no comprensión.
- **El merge silencioso**: un parche que regenera el tablero entero y tira un componente que nadie pidió quitar.
- **Métricas que no suman**: `combinaciones_bajo_reorden` no es aditiva en el tiempo, el YoY usa desfase de un
  año y `clientes_activos` de un periodo no es la suma de los meses. Un lienzo que las suma como ventas miente
  con buena cara.
- **El ROAS incremental**: su baseline de 14 días no controla estacionalidad, y la propuesta lo advierte. El
  agente lo tiene que decir cuando lo use.
- **La base inicial**: los 3,395 clientes de enero de 2025 no son «nuevos». Si se olvidan, el crecimiento de
  clientes se infla.
- **Portar el dialecto**: si eliges Postgres, cada `strftime`, `date_diff` e `interval` cambia de forma. La
  tabla de cifras es la que lo caza.
