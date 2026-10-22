# Adjudicación del set de referencia v3

Adjudicador independiente (no escribió el set). Fecha: 2026-10-22.
Documento para leer **después** de congelar el set: aquí sí van los detalles de cada pregunta.

## Resultado

- **100 preguntas revisadas: 100 conformes, 0 corregidas.** No se tocó `esperado`, `alternativas`, `nota` ni
  instrucción alguna; el archivo `set-referencia-v3.json` queda byte a byte como lo entregó el autor.
- Validador: `node valida-set.mjs set-referencia-v3.json` → `✓ set válido` (100 preguntas; crear 16, modificar 20,
  filtrar 16, analizar 16, explicar 16, alertar 16; desarrollo 30, retenida 70; 12 sin métrica; 11 con selección;
  7 con alternativas).

## Método

1. Lectura completa de las únicas fuentes permitidas: `CONTRATO.md`, `catalogo-golfo-norte.json` (31 métricas, sus
   dimensiones alcanzables y los dominios), los tres tableros base y `valida-set.mjs`. No se leyó nada fuera de la
   carpeta del encargo.
2. Validación de forma antes de empezar (`✓ set válido`).
3. Revisión **una por una** de las 100 preguntas, campo por campo, contra el contrato:
   - `tipo` y `responde` (una métrica inexistente → `responde: false`, sin sustituto, l. 45-46 y 86);
   - `metricas`: nombre exacto del catálogo, contrastado con su etiqueta, descripción y unidad;
   - `dimensiones`: que **cada** métrica a la que se aplica la alcance (el validador solo exige que la alcance
     *alguna*), y el eje de tiempo solo si la instrucción lo pide (l. 73-74);
   - `filtros`: operador, valor **exacto** del dominio con mayúsculas y acentos (comprobación estricta aparte: el
     validador compara sin distinguir mayúsculas), y que la selección del mapa entre como `en` sobre
     `tienda__tienda_nombre` con los mismos valores (l. 75-77);
   - `periodo` con corte 2026-09-30 y las convenciones de l. 18-25; `comparar` con l. 26 y 78;
   - `componentes_tocados`: ids reales del tablero base y `+nuevo` por componente agregado (l. 79-81);
   - `alerta`: condición, valor, unidad, ventana, y que la ventana sea compatible con el grano temporal de la métrica
     (diaria/semanal solo en métricas con `metric_time__day`);
   - `alternativas`: comparación campo a campo contra el `esperado` para confirmar que cada una difiere SOLO en el
     campo ambiguo (l. 84-85).
4. Comprobaciones mecánicas sobre todo el archivo: claves completas en cada `esperado` y alternativa; preguntas
   `responde: false` sin dimensiones, filtros, periodo, comparación, componentes ni alerta; valores de la selección
   dentro del dominio; reparto (l. 97-101).

## Correcciones

| id | campo | antes → después | cláusula |
|---|---|---|---|
| — | — | ninguna | — |

## Veredicto por pregunta

Todas conformes. Fundamento breve (l. = línea de `CONTRATO.md`):

| id | tipo | veredicto | fundamento |
|---|---|---|---|
| n001 | crear | conforme | «este año» (l. 19), «contra el año pasado» (l. 26), «mes a mes» → `metric_time__month` (l. 73-74), «cada región» → `tienda__region` |
| n002 | crear | conforme | «por mes» es eje, no periodo → `null` (l. 25); segmento solo existe como `cliente__segmento` |
| n003 | crear | conforme | NPS no está en el catálogo → `responde: false` (l. 45) |
| n004 | crear | conforme | «de cada campaña» → `campana__campana_nombre`; plataformas exactas con `en`; «año pasado» (l. 20) |
| n005 | crear | conforme | tablero aparte = crear; selección → filtro `en` (l. 77); «últimos 6 meses» (l. 24) |
| n006 | crear | conforme | «en pesos» → `margen_bruto` (MXN), «%» → `margen_bruto_pct`; «sin mayoreo» → `no_en` sobre `linea__canal`; l. 19 |
| n007 | crear | conforme | `participacion_ecommerce_pct` + `ventas_ecommerce`; «semana a semana» → `metric_time__week`; l. 21 |
| n008 | crear | conforme | solo KPI, sin desglose; «julio» → 2026-07 (l. 22-23); comparar (l. 26) |
| n009 | crear | conforme | el origen de la retención solo es `cohorte__origen`; «últimos 12 meses» (l. 24) |
| n010 | crear | conforme | «otro» tablero = crear; «día por día» → `metric_time__day`; «mes pasado» → 2026-09 (l. 22) |
| n011 | crear | conforme | etiqueta «Tienda-SKU bajo punto de reorden»; desglose tienda y producto; Norte; sin tiempo (l. 25) |
| n012 | crear | conforme | categorías exactas; «trimestre pasado» (l. 21); «comparado con el año anterior» (l. 26) |
| n013 | crear | conforme | entrega y envío no existen → `responde: false` |
| n014 | crear | conforme | «vs año anterior» es parte del nombre de la métrica; `comparar: null` no se evalúa (l. 91) |
| n015 | crear | conforme | pedidos y ticket solo alcanzan `cliente__origen`; «desde enero» → 2026-01..2026-09 (extensión de l. 22-23) |
| n016 | crear | conforme | «la tienda de Mérida» → `tienda__tienda_nombre`; «ventas» → `ventas_netas`; «2025» (l. 20) |
| n017 | modificar | conforme | componente agregado → `+nuevo` (l. 79-80) |
| n018 | modificar | conforme | el medidor es `retencion_meta`; métrica del componente quitado |
| n019 | modificar | conforme | filtro de un solo componente con los valores exactos de la selección (l. 77) |
| n020 | modificar | conforme | NPS → `responde: false`; nada se toca (l. 86) |
| n021 | modificar | conforme | un componente en `vacio` → `+nuevo` (l. 79-80) |
| n022 | modificar | conforme | quitar → métricas y dimensión que tenía la tabla `tiendas` |
| n023 | modificar | conforme | cambio de tipo: métrica y dimensión de `por_categoria` como queda |
| n024 | modificar | conforme | la dimensión pasa a `linea__canal` |
| n025 | modificar | conforme | filtro de componente `no_en Mayoreo` sobre `por_region` |
| n026 | modificar | conforme | reordenar toca solo el componente que se mueve (ver tensiones) |
| n027 | modificar | conforme | comparación pedida (l. 26) en `por_region` |
| n028 | modificar | conforme | «x semana» → `metric_time__week` en `tendencia` de ejecutivo |
| n029 | modificar | conforme | el mapa no declara dimensión; alternativa con tienda, que es su unidad implícita (l. 32) |
| n030 | modificar | conforme | serie → `tienda__region`; eje mensual no pedido pero conservado: alternativa legítima |
| n031 | modificar | conforme | `+nuevo`; métrica de clientes: `cliente__origen` o `cliente_mes__origen` (l. 84-85) |
| n032 | modificar | conforme | selección → filtro; «semanales» → `metric_time__week`; `+nuevo` |
| n033 | modificar | conforme | ids exactos `tendencia` y `canales`; eje mensual de la tendencia como alternativa |
| n034 | modificar | conforme | un indicador en `vacio` → `+nuevo`; «este año» y comparación |
| n035 | modificar | conforme | «número principal de hasta arriba» → `principal`; «en pesos» → `margen_bruto` |
| n036 | modificar | conforme | visitas web → `responde: false` (ejemplo de l. 45) |
| n037 | filtrar | conforme | Golfo; «último trimestre»; métrica nombrada «ventas» → `ventas_netas` |
| n038 | filtrar | conforme | `no_en Mayoreo` global; dos métricas nombradas |
| n039 | filtrar | conforme | selección → filtro (l. 77); «este año» |
| n040 | filtrar | conforme | «julio» → 2026-07; «contra julio del año pasado» (l. 26) |
| n041 | filtrar | conforme | `tienda__es_comparable` con el valor exacto `"True"` |
| n042 | filtrar | conforme | `no_en` con dos tiendas exactas |
| n043 | filtrar | conforme | estados exactos «Ciudad de México» y «Nuevo León»; «trimestre pasado» (l. 21) |
| n044 | filtrar | conforme | métrica de clientes: alternativa de origen legítima (l. 84-85); «últimos 6 meses» |
| n045 | filtrar | conforme | dos filtros exactos que `margen_bruto_pct` alcanza |
| n046 | filtrar | conforme | «en lo que va del año» (l. 19) + «contra 2025» (l. 26) |
| n047 | filtrar | conforme | selección → filtro; «últimos 12 meses» (l. 24) |
| n048 | filtrar | conforme | «septiembre» → 2026-09 (l. 22-23); `linea__canal en E-commerce` |
| n049 | filtrar | conforme | «noviembre» → 2025-11 (l. 23) |
| n050 | filtrar | conforme | `linea__en_campana "True"`; «de enero a junio» → 2026-01..2026-06 |
| n051 | filtrar | conforme | merma → `responde: false` |
| n052 | filtrar | conforme | puntualidad de entrega → `responde: false` |
| n053 | analizar | conforme | «último trimestre» + comparación |
| n054 | analizar | conforme | selección → filtro; «mes pasado» → 2026-09 |
| n055 | analizar | conforme | «mayo» → 2026-05; desglose pedido explícitamente |
| n056 | analizar | conforme | «este año vs el año pasado» |
| n057 | analizar | conforme | tráfico web → `responde: false` |
| n058 | analizar | conforme | «últimos 6 meses»; sin comparación pedida |
| n059 | analizar | conforme | «se nos fueron clientes» → `clientes_perdidos` (descripción del catálogo); Golfo; l. 21 |
| n060 | analizar | conforme | «qué región explica» pide el desglose; «agosto» → 2026-08; comparación |
| n061 | analizar | conforme | selección de una tienda → filtro; l. 19 |
| n062 | analizar | conforme | la campaña es filtro; el año es parte del nombre, no periodo → `null` |
| n063 | analizar | conforme | «noviembre» → 2025-11; `no_en Mayoreo` |
| n064 | analizar | conforme | `cohorte__origen`; «2025» (l. 20) |
| n065 | analizar | conforme | «segundo semestre del año pasado» → 2025-07..2025-12 |
| n066 | analizar | conforme | selección; «este año» + «contra el año pasado» |
| n067 | analizar | conforme | Abarrotes; «septiembre» + comparación; «descompón» sin dimensión explícita |
| n068 | analizar | conforme | CAC → `responde: false`; no se arma con otras métricas (l. 46) |
| n069 | explicar | conforme | métrica explicada |
| n070 | explicar | conforme | métrica explicada |
| n071 | explicar | conforme | las dos métricas que se contrastan |
| n072 | explicar | conforme | métrica explicada |
| n073 | explicar | conforme | rotación de inventario → `responde: false` |
| n074 | explicar | conforme | métrica explicada |
| n075 | explicar | conforme | métrica explicada |
| n076 | explicar | conforme | «margen %» → `margen_bruto_pct` |
| n077 | explicar | conforme | métrica explicada |
| n078 | explicar | conforme | métrica explicada |
| n079 | explicar | conforme | etiqueta exacta del catálogo |
| n080 | explicar | conforme | la selección no se vuelve filtro: explicar no toca nada (l. 42) |
| n081 | explicar | conforme | métrica explicada |
| n082 | explicar | conforme | nombre de la métrica; `comparar: null` no se evalúa |
| n083 | explicar | conforme | «ventas por cliente activo» → `ventas_por_cliente` |
| n084 | explicar | conforme | LTV → `responde: false`; no se sustituye |
| n085 | alertar | conforme | caída relativa → `cae_mas_de 10 %`, semanal; Golfo |
| n086 | alertar | conforme | «puntos» sobre métrica en % → `pp`; mensual |
| n087 | alertar | conforme | «más de 50» → `encima_de 50 valor`; diaria (la métrica tiene grano diario) |
| n088 | alertar | conforme | selección → filtro; nivel → `debajo_de 200 valor`; mensual (la métrica es mensual) |
| n089 | alertar | conforme | pedidos del canal E-commerce; `debajo_de 300 valor`; diaria |
| n090 | alertar | conforme | nivel sobre métrica en escala 0-100: `valor` o `%` (alternativa) |
| n091 | alertar | conforme | proporción 0-1: `0.05 valor` o `5 %` (alternativa) |
| n092 | alertar | conforme | «por debajo de 2» es nivel, no caída relativa; Meta Ads |
| n093 | alertar | conforme | «500 mil pesos» → `500000 valor`; mensual |
| n094 | alertar | conforme | subida relativa → `sube_mas_de 15 %`, mensual; Norte |
| n095 | alertar | conforme | `sube_mas_de 20 %`, semanal; `no_en Mayoreo` |
| n096 | alertar | conforme | selección; `cae_mas_de 5 %`, mensual |
| n097 | alertar | conforme | producto exacto «Huevo 30»; `cae_mas_de 25 %`, diaria |
| n098 | alertar | conforme | «1.5 puntos» → `pp`; semanal |
| n099 | alertar | conforme | quejas → `responde: false` |
| n100 | alertar | conforme | días de inventario → `responde: false` (ejemplo de l. 45-46) |

Conteo por tipo: crear 16/16, modificar 20/20, filtrar 16/16, analizar 16/16, explicar 16/16, alertar 16/16
conformes. Por campo corregido: `responde` 0, `metricas` 0, `dimensiones` 0, `filtros` 0, `periodo` 0,
`comparar` 0, `componentes_tocados` 0, `alerta` 0, `alternativas` 0, `nota` 0, instrucción 0.

### Riesgos vistos que NO se corrigen (el contrato no da base para cambiarlos)

- **n015 — frontera de tipo.** Es la única pregunta `crear` sobre `vacio` que no dice «tablero». Un agente podría
  leerla como agregar componentes (`modificar` con `+nuevo`). Se deja en `crear` porque pide varias métricas con
  filtro, eje y periodo (un tablero entero, l. 38) y porque el encargo prohíbe cambiar tipos; queda como tensión 9.
- **n026 — reordenar.** Correcta bajo la lectura del autor; el contrato no define qué id toca un reordenamiento
  (tensión 4).
- **n004, n006, n041 — filtros equivalentes por complemento.** `en [Meta Ads, TikTok Ads]` ≡ `no_en [Google Ads]`,
  `no_en [Mayoreo]` ≡ `en [E-commerce, Tienda]`, `en ["True"]` ≡ `no_en ["False"]`. El contrato no los normaliza
  (l. 75-76) y la redacción de cada instrucción elige el operador. No se agregan alternativas: no es ambigüedad de
  lectura sino de representación (tensión 11).
- **n005, n015, n034, n040, n048, n060, n089 — `pedidos`** a secas frente a `pedidos_clientes` («vista clientes»);
  igual para «ventas» frente a `ventas_clientes`. Se mantiene la métrica comercial (tensión 12).
- **n044 — chip global con `cliente_mes__origen`.** Esa alternativa no alcanza a `ventas_netas`, que domina el
  tablero `growth`. Se ratifica porque la métrica nombrada es de clientes (l. 84-85) y porque el parche se valida
  aparte (l. 92-93), pero el contrato no dice si un filtro global debe alcanzar a todas las métricas del tablero
  (tensión 10).

## Lecturas del autor

| # | Lectura | Veredicto | Cláusula |
|---|---|---|---|
| 1 | La selección del mapa solo va en `growth` | **Ratificada** | l. 31-32: la selección es de «tiendas seleccionadas en el mapa»; de los tableros base solo `growth` tiene un componente `mapa`. El contrato no lo prohíbe en otros tableros, pero ahí la selección no tendría de dónde salir |
| 2 | En `filtrar`, cada instrucción nombra la métrica y `metricas` lleva solo esas | **Ratificada** | l. 90-91: la Puntuación compara `metricas` en todo tipo con `responde`; validador l. 40: `metricas` no vacía. Las 14 de `filtrar` que responden nombran su métrica. Choca con la tabla de l. 40, que no lista métricas para `filtrar` (tensión 1) |
| 3 | En `modificar`, métricas y dimensiones del cambio = las del componente como queda; si se quita, las que tenía | **Ratificada** | l. 39 («métricas y dimensiones del cambio») no define el alcance; es la única lectura que da `metricas` no vacía en cambios de tipo, de orden o de filtro (validador l. 40). Tensión 2 |
| 4 | Reordenar toca solo el id del componente que se mueve | **Ratificada, con tensión** | l. 39 («cambia SOLO el o los componentes afectados») y l. 79: el que se mueve es el único que cambia; el contrato no define si cuentan los que cambian de posición (tensión 4) |
| 5 | Eje de tiempo en `modificar` solo si se pide; una línea que conserva su eje mensual se acepta con o sin él | **Ratificada** | l. 73-74 («incluye el eje de tiempo si la instrucción lo pide») frente a la lectura 3 (el componente como queda conserva su grano): las dos cláusulas chocan y la alternativa es ambigüedad real (l. 84-85). Tensión 3 |
| 6 | El mapa no declara dimensión: con o sin `tienda__tienda_nombre` | **Ratificada** | `growth.json`: el componente `mapa` no tiene `dimension`; l. 32: su unidad es la tienda. Ambigüedad real (l. 84-85) |
| 7 | Origen: `cliente__origen` / `cliente_mes__origen` como alternativas en clientes; ventas y pedidos solo `cliente__origen`; retención solo `cohorte__origen` | **Ratificada** | l. 84-85 da exactamente ese ejemplo; el catálogo confirma el alcance: las métricas de ventas y pedidos no tienen `cliente_mes__origen`, y la retención solo `cohorte__origen` |
| 8 | En `analizar`, dimensiones vacías salvo desglose explícito | **Ratificada, con tensión** | l. 41 compara métrica, periodo y filtros; l. 90-91 compara además `dimensiones`; l. 73-74 («dimensiones de desglose» que la instrucción pide). Tensión 1 |
| 9 | En `explicar`, la selección no se convierte en filtro | **Ratificada** | l. 42: «la métrica explicada; nada se toca»; l. 77 convierte la selección en filtro solo cuando hay filtro que aplicar |
| 10 | «Ventas» = `ventas_netas`; «margen en pesos» = `margen_bruto`; «margen %» = `margen_bruto_pct`; «puntos» sobre % = `pp` | **Ratificada** | Catálogo: etiquetas y unidades (MXN frente a %); l. 83 define `pp`. «Ventas» a secas no está en el contrato: lo sostiene la descripción de `ventas_netas` y que es la métrica de los tableros base (tensión 12) |
| 11 | «vs año anterior» en el nombre de `crecimiento_ventas_yoy_pct` no es comparación pedida | **Ratificada** | l. 26 lo mapea literalmente a `anio_anterior`, pero l. 91 hace que un `comparar: null` no se evalúe: la lectura es neutral y no castiga ninguna de las dos respuestas (tensión 7) |
| 12 | «desde enero» → 2026-01..2026-09; «de enero a junio» → 2026-01..2026-06; «segundo semestre del año pasado» → 2025-07..2025-12 | **Ratificada** | l. 22-23 (mes sin año → el más reciente con datos), l. 17 (corte) y l. 20 («el año pasado» → 2025). Tensión 6 |
| 13 | Umbral de nivel sobre métrica en %: `valor` o `%`; tasa de devolución «5 %»: `0.05 valor` o `5 %` | **Ratificada** | l. 82-83 enumera las unidades sin definirlas; catálogo: `tasa_devolucion` es proporción 0-1 y las demás métricas en % van de 0 a 100. Las alternativas descartan la única lectura errónea (`5 valor` sobre una proporción). Tensión 5 |
| 14 | Agregar un componente a `vacio` es `modificar` con `+nuevo`; un tablero completo es `crear` | **Ratificada, con tensión** | l. 38 (crear «arma un tablero nuevo») y l. 79-80 (`+nuevo` por componente agregado). El contrato no fija la frontera cuando la instrucción no dice ni «tablero» ni «agrega» (tensión 9) |

Ninguna lectura del autor se contradice.

## Tensiones del contrato que su texto no resuelve

1. **Tabla de tipos frente a Puntuación.** La tabla de l. 36-43 dice qué se compara por tipo (sin métricas en
   `filtrar`, sin dimensiones en `analizar` ni `alertar`, solo la métrica en `explicar`), pero l. 90-91 compara
   `metricas`, `dimensiones` y `filtros` en todos los tipos que responden.
2. **«Métricas y dimensiones del cambio»** (l. 39) no dice si son solo lo que cambió o el componente como queda, ni
   qué son en un cambio sin métrica (tipo de gráfica, orden, filtro, quitar).
3. **Eje de tiempo.** «Solo si la instrucción lo pide» (l. 73-74) choca con un componente de línea que conserva su
   eje cuando se modifica otra cosa.
4. **Reordenar.** `componentes_tocados` (l. 79-81) no dice si cuentan solo el componente movido o todos los que
   cambian de posición.
5. **Unidad de la alerta.** `%`, `pp` y `valor` (l. 83) no tienen semántica; además las métricas en % usan escalas
   distintas (0-100 en la mayoría, proporción 0-1 en la tasa de devolución).
6. **Periodos fuera de la lista** (desde un mes, rango de meses, semestres) no están definidos; se resuelven
   extendiendo la regla del mes sin año.
7. **«vs año anterior»** se mapea a `comparar` (l. 26), pero también forma parte del nombre de una métrica.
8. **`null` significa «no se evalúa»** en `periodo` y `comparar` (l. 91): no hay forma de exigir que el agente NO
   fije periodo ni comparación.
9. **Frontera crear / modificar en `vacio`.** No se define cuándo pedir varias cosas sobre un tablero vacío es
   armar un tablero o agregar componentes.
10. **Alcance de un filtro global.** No se dice si un chip global debe alcanzar a todas las métricas del tablero; el
    validador solo exige que lo alcance alguna.
11. **Normalización de filtros.** Solo cubre `igual`≡`en` y `distinto`≡`no_en` con un valor (l. 75-76), no las
    equivalencias por complemento del dominio.
12. **Métricas duplicadas por vista.** El catálogo trae `ventas_clientes` y `pedidos_clientes` junto a `ventas_netas`
    y `pedidos`, y el contrato no fija cuál es la canónica «a secas».
13. **Nombre del eje de tiempo.** El contrato muestra `metric_time__*`, pero varias métricas tienen dimensiones de
    tiempo propias (`cliente_mes__mes`, `pedido__fecha_pedido`, `cohorte__cohorte_mes`) que también validan.
14. **Selección sin mapa.** `seleccion` se permite en cualquier pregunta (l. 31-32), pero solo un tablero tiene mapa.
15. **Peticiones mixtas.** No se define qué hacer con una instrucción que pide una métrica existente y otra
    inexistente (el set no trae ninguna).
16. **Validador frente a contrato.** El contrato exige valores EXACTOS del dominio (l. 16 y 76), pero el validador
    los compara sin distinguir mayúsculas; y exige que una dimensión la alcance *alguna* métrica, no la métrica a la
    que se aplica. En este set se comprobaron las dos cosas a mano y no hay casos.

## Archivos leídos

- `evaluacion/CONTRATO.md`
- `evaluacion/catalogo-golfo-norte.json`
- `evaluacion/valida-set.mjs`
- `evaluacion/set-referencia-v3.json`
- `laboratorio/tableros/growth.json`, `laboratorio/tableros/ejecutivo.json`, `laboratorio/tableros/vacio.json`

(Durante la revisión se hizo una copia de respaldo temporal del set dentro de la carpeta del encargo para comprobar
que no cambiaba; se verificó idéntica byte a byte y se borró.)
