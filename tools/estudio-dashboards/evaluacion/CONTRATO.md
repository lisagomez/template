# Contrato del set de referencia del Estudio

Se fija ANTES del set y antes de cualquier prompt del agente. El set lo escribe un revisor dedicado; quien escribe el
prompt no lo lee antes de congelarlo. Este contrato es lo único que comparten los dos.

## Qué se mide

El agente recibe una **instrucción en español** sobre un **tablero base** y responde con lo que entendió (métricas,
dimensiones, filtros, periodo, comparación) y, si toca, un **parche** al tablero. La pregunta es CORRECTA solo si todo
lo que su respuesta esperada declara coincide; no hay medio punto en el número final (las coincidencias por campo se
reportan aparte, como diagnóstico).

## Mundo del laboratorio (hechos fijos)

- Empresa ficticia **Distribuidora Golfo Norte**. Catálogo: `catalogo-golfo-norte.json` (31 métricas; dimensiones
  alcanzables por métrica; dominio de cada dimensión categórica). Nombres EXACTOS del catálogo.
- **Fecha de corte de los datos: 2026-09-30.** Los datos van de 2025-01 a 2026-09.
- Periodos (meses inclusivos `AAAA-MM`):
  - «2026», «este año», «en lo que va del año» → `2026-01..2026-09`
  - «2025», «el año pasado» → `2025-01..2025-12`
  - «último trimestre» → `2026-07..2026-09`; «el trimestre pasado» → `2026-04..2026-06`
  - «el mes pasado», «último mes» → `2026-09`; un mes por nombre sin año → el más reciente con datos
    («julio» → `2026-07`; «noviembre» → `2025-11`)
  - «últimos 6 meses» → `2026-04..2026-09`; «últimos 12 meses» → `2025-10..2026-09`
  - Si la instrucción no habla de tiempo, el periodo esperado es `null` (no se cambia el del tablero).
- «Compara con 2025», «contra el año pasado», «vs año anterior» → `comparar: "anio_anterior"`.

## Tableros base

`tablero` es uno de `growth`, `ejecutivo` o `vacio` (archivos en `../laboratorio/tableros/`). Sus ids de componente
son los únicos que una pregunta de MODIFICAR puede tocar. Una pregunta puede traer además `seleccion` (tiendas
seleccionadas en el mapa con clic o lazo): `{ "dimension": "tienda__tienda_nombre", "valores": [...] }`.

## Los seis tipos

| Tipo | Qué hace el agente | Qué se compara |
|---|---|---|
| `crear` | arma un tablero nuevo (KPI, tendencia, desglose) | métricas principales, dimensiones de desglose, filtros, periodo, comparar |
| `modificar` | cambia SOLO el o los componentes afectados | métricas y dimensiones del cambio, filtros, periodo, comparar y **los ids tocados, exactos** |
| `filtrar` | filtros globales (chips) y/o periodo | filtros, periodo, comparar; **ningún componente tocado** |
| `analizar` | descompone una variación y deja un hallazgo con cifras | métrica analizada, periodo analizado, filtros (o selección) |
| `explicar` | muestra la definición de una métrica | la métrica explicada; nada se toca |
| `alertar` | propone una regla de monitoreo (pide confirmación) | métrica, filtros, condición y ventana de la regla |

Una pregunta **sin métrica** (lo pedido no existe en el catálogo: p. ej. NPS, visitas web, días de inventario) lleva
`responde: false`: el agente debe decirlo y ofrecer proponer la métrica, sin inventar ni sustituir una parecida.

## Forma de cada pregunta

```json
{
  "id": "q001",
  "particion": "desarrollo | retenida",
  "tipo": "crear | modificar | filtrar | analizar | explicar | alertar",
  "tablero": "growth | ejecutivo | vacio",
  "seleccion": null,
  "instruccion": "texto en español, como lo escribiría quien dirige",
  "esperado": {
    "responde": true,
    "metricas": ["margen_bruto_pct"],
    "dimensiones": ["tienda__region"],
    "filtros": [{ "dimension": "linea__canal", "operador": "no_en", "valores": ["Mayoreo"] }],
    "periodo": { "desde": "2026-01", "hasta": "2026-09" },
    "comparar": null,
    "componentes_tocados": null,
    "alerta": null
  },
  "alternativas": [],
  "nota": "por qué esta es la respuesta, si no es obvio"
}
```

- `metricas`, `dimensiones`, `filtros`: conjuntos (el orden no importa). `dimensiones` incluye el eje de tiempo si la
  instrucción lo pide (`metric_time__month`, `metric_time__week`…), con el nombre exacto del catálogo.
- `filtros`: operadores `igual | distinto | en | no_en | mayor | menor | mayor_igual | menor_igual`. Se normaliza
  `igual` ≡ `en` con un valor y `distinto` ≡ `no_en` con un valor. Valores EXACTOS del dominio («Mérida», «Mayoreo»).
  Un filtro de selección del mapa se escribe como filtro `en` sobre `tienda__tienda_nombre`.
- `periodo`: `null` si la instrucción no lo fija. `comparar`: `"anio_anterior"` o `null`.
- `componentes_tocados`: SOLO en `modificar`, lista exacta de ids del tablero base (un componente nuevo agregado se
  cuenta con el id que le ponga el agente: se escribe `"+nuevo"` por cada componente que deba AGREGARSE). En los demás
  tipos, `null`.
- `alerta` (solo `alertar`): `{ "condicion": "cae_mas_de | sube_mas_de | debajo_de | encima_de", "valor": 5,
  "unidad": "% | pp | valor", "ventana": "diaria | semanal | mensual" }`.
- `alternativas`: otras respuestas esperadas igual de correctas (p. ej. `cliente_mes__origen` y `cliente__origen` si
  la pregunta no distingue). Cada alternativa es un `esperado` completo. Úsense solo para ambigüedad real.
- Si `responde: false`, `metricas` lista lo que se pidió en palabras (`["nps"]`), y el resto va `null` o vacío.

## Puntuación

CORRECTA si: el `tipo` coincide; `responde` coincide; y, cuando `responde`, coinciden como conjuntos `metricas`,
`dimensiones` y `filtros` normalizados, `periodo` (si el esperado no es `null`), `comparar` (si el esperado lo fija),
`componentes_tocados` (en `modificar`) y `alerta` (en `alertar`); y el parche, si lo hay, **valida** contra el esquema
y el catálogo. Basta con que coincida el esperado o UNA de sus alternativas.

Se reporta: precisión total, por tipo (los 6) y por partición; aciertos por campo; latencia; costo.

## Reparto del set (100)

`crear` 16 · `modificar` 20 · `filtrar` 16 · `analizar` 16 · `explicar` 16 · `alertar` 16. De las 100, **12 sin
métrica** repartidas entre los tipos (`responde: false`). **30 en partición `desarrollo`** (5 por tipo) y **70
`retenida`**. Cuando menos 8 preguntas con `seleccion` del mapa.
