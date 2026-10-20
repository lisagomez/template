# Adjudicación del set de referencia (v1 → v2)

Adjudicador independiente. Base: `set-referencia.json` v1 (sha256 `647b0b27…7676`, sin tocar). Resultado:
`set-referencia-v2.json`. Solo cambian `alternativas` (y la `nota` que las explica); ningún `esperado` principal cambia.

## Preguntas cambiadas

| id | Qué decía (v1) | Qué dice ahora (v2) | Cláusula que lo exige |
|---|---|---|---|
| q008 | Alternativa `pedidos_devueltos_m` («lectura tolerada», según la nota) para «qué porcentaje de los pedidos regresan» | Sin alternativas: solo `tasa_devolucion` | CONTRATO, `alternativas`: «otras respuestas esperadas **igual de correctas** … Úsense solo para **ambigüedad real**». Un conteo no responde un porcentaje, y la propia nota lo llama tolerancia, no ambigüedad |
| q012 | Alternativa con dimensión `tienda__region` para «qué tiendas tienen más productos por reordenar» | Sin alternativas: solo `tienda__tienda_nombre` | La misma cláusula: «qué tiendas» no admite el desglose por región como respuesta igual de correcta |
| q029 | Solo `margen_bruto_pct` para «gráfica de barras de **margen** por categoría» | + alternativa `margen_bruto` (lo demás igual) | Criterio de segunda lectura: el catálogo tiene `margen_bruto` («Margen bruto», MXN) y `margen_bruto_pct`, y «margen» a secas no distingue. El mismo set ya lo admite en q053 y q061 |
| q058 | Solo el filtro `cohorte__origen en [Campaña]` para «por qué los de campaña retienen menos **que los orgánicos**» | + alternativa con `filtros: []` | Tabla «Los seis tipos», `analizar`: se comparan los filtros. La pregunta descompone la brecha ENTRE los dos orígenes; analizarla sin filtro es igual de razonable que enfocar en Campaña (filtrar quita el grupo de referencia) |
| q085 | Solo el filtro `tienda__tienda_nombre en [Oaxaca]` para «las ventas **de Oaxaca**» | + alternativa con `tienda__estado en [Oaxaca]` | CONTRATO, `filtros`: «valores EXACTOS del dominio». «Oaxaca» está en el dominio de las dos dimensiones del catálogo y la instrucción no dice «tienda»; el estado Oaxaca tiene solo esa tienda, así que las dos lecturas dan la misma cifra |
| q094 | Solo `dimensiones: []` para «si el ROAS incremental **de una campaña** sale menor a 1» | + alternativa con `dimensiones: ["campana__campana_nombre"]` | CONTRATO, Puntuación: `dimensiones` se compara como conjunto. «De una campaña» pide la regla a nivel de campaña (el ROAS agregado de todas no es lo mismo), y `roas_incremental` alcanza esa dimensión en el catálogo |

**94 conformes, 6 corregidas.**

## Tensiones del contrato (sin cambio en el set)

No son defectos de una pregunta: son reglas del contrato que chocan entre sí. Se dejan como estaban y se señalan aquí
para que el laboratorio las resuelva en el contrato, no en el set:

- **La tabla contra la Puntuación.** La tabla «Los seis tipos» no compara `metricas` en `filtrar`, ni `dimensiones` en
  `analizar`, `explicar` ni `alertar`. La sección «Puntuación» las compara siempre que `responde`. El set pone
  `ventas_netas` como relleno en `filtrar` y `[]` en esas dimensiones: está bien si `mide` aplica la tabla, y castiga
  respuestas correctas si aplica la Puntuación.
- **q061** («frente al año pasado»). La convención de periodos manda `comparar: "anio_anterior"`, pero la tabla no
  compara `comparar` en `analizar`. Se deja en `null`, que no se puntúa: fijarlo endurecería la pregunta más de lo
  que pide la tabla.
- **La unidad de un umbral de nivel sobre una métrica en %.** El contrato no define `pp` frente a `%` y `valor`. q086
  acepta `pp`; q088 y q092, que tienen la misma forma, no. Se deja así porque el contrato no decide el caso.

## Método

Leí completos el contrato, el catálogo (las 31 métricas, qué dimensiones alcanza cada una y los dominios), los tres tableros y las 100 preguntas. No abrí nada de `docs/goals/`, `src/` ni `medicion-*`.
Juzgué cada `esperado` y cada alternativa contra una cláusula escrita. Cuando dudaba, dejaba la pregunta como estaba; la equivalencia de tiendas de q043 (Cancún y Querétaro son las únicas tiendas no comparables) la comprobé en el generador de datos (`laboratorio/golfo_norte`).
Para cada corrección hice el cambio mínimo con un script sobre v1 (que no se tocó: su sha256 coincide), y validé v2 con `valida-set.mjs` hasta «✓ set válido».
