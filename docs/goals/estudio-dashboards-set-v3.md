# Estudio de dashboards: set v3 a ciegas y los dos arreglos (2026-10-22)

Encargo del laboratorio (2026-10-22): «set nuevo a ciegas para medir los dos arreglos». Rama `estudio/set-ciego`, sobre
`56db0bc` (el CDC firmado). Datos ficticios. Nada se ajustó después de medir.

## Resultado en una línea

**Los dos arreglos no se pueden medir como mejora en una muestra que no los motivó.**
- El de la métrica con desfase no tiene ninguna pregunta en el v3.
- El del eje de tiempo tiene cinco, y el set acepta las dos formas.
- Con y sin arreglos, la precisión es la misma dentro del ruido: 96 y 96 sin ellos; 95 y 95 con ellos. Las siete
  preguntas que cambian de una corrida a otra caen en caminos que los arreglos no tocan.
- **El umbral de ≥ 90 % por tipo tampoco se cumple en el v3**, con ningún núcleo. Ahora los tipos débiles son
  `crear` y `filtrar`; `analizar` da 16/16 en las cuatro corridas.

## Protocolo (en este orden)

1. **Arreglos congelados ANTES de que existiera el set** (`fbd3864`). Ningún prompt cambió: `estudio-agente/4` sigue
   siendo el firmado (sha256 `5ba2c0180b0880f4`).
   - `modificar`: el núcleo completa «lo que entendí» con el eje de tiempo de cada línea que el cambio deja tocada,
     sacado del tablero ya parchado.
   - `analizar` una métrica con desfase: descompone su métrica base contra el año anterior y lo dice, en vez de
     rechazarla y volver al modelo. Contra la capa real, ene–sep 2026 da **+22.7 %**, la cifra del conteo directo, y
     no la trampa (−17.0 %).
2. **Set escrito por un revisor dedicado** (subagente) en una carpeta aislada con seis archivos: el contrato, el
   catálogo, los tres tableros y el validador. Declaró haber leído solo esos seis. No vio los sets v1 y v2, el agente,
   el prompt, las mediciones ni los arreglos, y nunca se le nombraron.
3. **Adjudicado por un segundo revisor independiente**, con el mismo aislamiento y el set a la vista. Resultado: 100
   conformes y 0 correcciones; ratificó las 14 lecturas del autor y anotó 16 tensiones del contrato
   (`tools/estudio-dashboards/evaluacion/ADJUDICACION-v3.md`).
4. **Congelado antes de medir.** Huella `sha256:ed0ad158f7463164b40eb976f0be48e56cf374343fc884b5de89f54538bf507b`,
   commit `2788f91`.
   - Reparto del contrato: 16/20/16/16/16/16, 12 sin métrica, 11 con selección, 30 desarrollo y 70 retenida.
   - Quien mide no leyó las preguntas hasta después de medir: validación con `--resumen` y solapamiento solo por
     conteos.
5. **Solapamiento con v1 y v2** (6 palabras seguidas): 7 preguntas, una idéntica. Ninguna se parece a q020, q027 ni
   q059, las tres que motivaron los arreglos.
6. **Medición**: el mismo set con los dos núcleos, en corridas intercaladas (sin arreglos, con, sin, con), más v1 y v2
   con arreglos.
   - Núcleos: copias de `dist/`, con huella `6c32bc0b974d0977` sin arreglos y `9585c7283ef4bb32` con ellos.
   - `mide.mjs --nucleo` mide cada núcleo con la misma capa de datos.
   - Configuración firmada: Haiku 5.5 pineado, reserva si trunca y proveedor por latencia.
   - Tope de la fase: US$0.30.

## Precisión

| corrida | núcleo | total | crear | modificar | filtrar | analizar | explicar | alertar | US$ | regeneración p50 / p95 ms | modelo p95 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| v3 · sin arreglos (1) | `6c32bc0b` | **96/100** | 15/16 | 19/20 | **14/16** | 16/16 | 16/16 | 16/16 | 0.0452 | 3027 / 6312 | 6050 |
| v3 · con arreglos (1) | `9585c728` | **95/100** | **13/16** | 19/20 | 15/16 | 16/16 | 16/16 | 16/16 | 0.0452 | 2952 / 5896 | 5717 |
| v3 · sin arreglos (2) | `6c32bc0b` | **96/100** | **14/16** | 18/20 | 16/16 | 16/16 | 16/16 | 16/16 | 0.0439 | 3078 / 5561 | 5420 |
| v3 · con arreglos (2) | `9585c728` | **95/100** | **14/16** | 19/20 | **14/16** | 16/16 | 16/16 | 16/16 | 0.0443 | 2992 / 5897 | 5697 |
| v1 · con arreglos | `9585c728` | 98/100 | 15/16 | 20/20 | 16/16 | 15/16 | 16/16 | 16/16 | 0.0413 | 2602 / 4406 | 4261 |
| v2 · con arreglos | `9585c728` | 99/100 | 16/16 | 19/20 | 16/16 | 16/16 | 16/16 | 16/16 | 0.0353 | 2544 / 4081 | 3815 |

En negrita, los tipos bajo 90 %. Las seis corridas registraron el costo de cada llamada (0 sin costo). Archivos:
`docs/goals/estudio-dashboards-medicion/medicion-voz-{base1,arreglos1,base2,arreglos2}-v3.json`,
`medicion-voz-arreglos.json` (v1) y `medicion-voz-arreglos-v2.json`.

## Qué midió de cada arreglo

- **Métrica con desfase en `analizar`: no medible en el v3.** De las 16 preguntas de `analizar`, ninguna pide la
  métrica con desfase (`crecimiento_ventas_yoy_pct`, la única del catálogo). Lo que hay a favor del arreglo:
  - es correcto por construcción: da la cifra del conteo directo;
  - lo cubre una prueba del núcleo;
  - ahorra la segunda llamada al modelo.

  Su efecto sobre la precisión sigue sin medirse en una muestra limpia.
- **Eje de tiempo en `modificar`: neutro en el v3.** Cinco preguntas llevan el eje de tiempo en el esperado o en una
  alternativa (n028, n030, n031, n032, n033). Las cinco salen bien en las 4 corridas, con arreglos y sin ellos:
  - en las que piden el grano («por semana», «por mes»), el modelo ya lo ponía;
  - en las que conservan el eje sin pedirlo, el revisor aceptó las dos formas.

  El arreglo no rompió ninguna pregunta de `modificar` (ninguna bajó con él).
- **Las siete preguntas que cambian entre núcleos son ruido del modelo, no efecto de los arreglos:**
  - las siete: n008, n009, n015 (`crear`), n022 (`modificar`, quitar), n041, n047 y n048 (`filtrar`);
  - en `crear` y `filtrar` el código es idéntico con y sin arreglos: el del eje de tiempo solo corre en `modificar` y
    el de la métrica con desfase solo en `analizar`;
  - n022 quita un componente, y el arreglo solo agrega el eje de las líneas que quedan;
  - suben tres y bajan cuatro.
- **v1 y v2 con arreglos (98 y 99): no son evidencia de los arreglos.** El v1 es la muestra que los motivó (q020, q027
  y q059 pasan ahora), y el v2 tiene las mismas preguntas. Valen solo como chequeo de regresión, que da limpio: en el
  v1 los seis tipos quedan ≥ 90 % y analizar falla solo q058, la ambigüedad que abrió el adjudicador del v2.

## El umbral por tipo en una muestra nueva

En el v3, `analizar` da 16/16 en las cuatro corridas, y los que caen bajo 90 % son `crear` (14/16 o 13/16 en tres de
cuatro) y `filtrar` (14/16 en dos de cuatro), **con los dos núcleos**. Con 16 preguntas por tipo, un fallo vale 6.25
puntos: 14/16 = 87.5 %. Quedan dos lecturas:

1. el umbral por tipo, con este tamaño de muestra, es tan ruidoso como estricto;
2. el agente tiene debilidades reales que dependen de la muestra.

Las dos son ciertas en parte, y ninguna autoriza a relajar el umbral.

Qué falla en el v3 (leído DESPUÉS de medir y sin tocar nada):
- **n010 (crear, 4 de 4)**: «unidades por producto y la tasa de devolución día por día». Falla en `dimensiones`; el
  esperado lleva `producto__producto_nombre` y `metric_time__day`. De la partición retenida no se guarda el plan, así
  que no sé qué dio el agente.
- **n009 (crear, 2 de 4)**: retención por origen. Falla en `dimensiones`; el esperado es `cohorte__origen`, la única
  forma en que la retención alcanza el origen.
- **n023 (modificar, 4 de 4)**: «cámbiala a dona». Una dona no es un tipo de componente del esquema, y el agente
  contesta que no puede (`responde`) o no arma operación. El set espera que modifique. **El contrato no dice qué
  hacer con una gráfica que el esquema no tiene**: tensión del contrato, no error del agente ni del set. Se reporta y
  no se ajusta.
- **n041, n047 y n048 (filtrar, tipo)**: el validador exige `metricas` no vacía, así que el revisor hizo que cada
  instrucción de filtrar nombre una métrica («…quiero ver los clientes activos», «Pedidos y ticket»), y así se leen
  a veces como `crear`. Es la tensión 1 del contrato: la tabla por tipo contra la regla general de la Puntuación.
  Esta vez se convirtió en una forma del set.

## Latencia

En el v3, la regeneración p95 queda entre **5.56 y 6.31 s, arriba de 5 s**, con 9 a 12 regeneraciones de 100 sobre
ese umbral. En v1 y v2 con arreglos queda en 4.41 y 4.08 s. Lo que manda es el modelo: su p95 en el v3 va de 5.42 a
6.05 s, y la consulta a la capa en frío sigue en p95 31–39 ms. **La p95 < 5 s medida sobre v1 y v2 no se generaliza
a una muestra nueva.** Las instrucciones del v3 son más largas: 14.0 palabras de media (p90 21), contra 9.9 (p90 15)
en el v1. De las 12 regeneraciones lentas de la primera corrida, 8 son de `filtrar`, el tipo cuyas instrucciones
nombran además una métrica.

## Gasto

- **Esta fase: US$0.2513**, por la diferencia de saldo de la cuenta (0.4823 → 0.2311). El libro suma US$0.2552 en
  las seis corridas (1.3985 → 1.6537), sin llamadas sin costo. Tope de la fase: US$0.30.
- **Goal entero más esta fase: US$1.7324** por saldo (1.9635 → 0.2311). Incluye US$0.0015 que otra sesión gastó en
  la cuenta compartida entre las dos fases.
- **Saldo que queda en la cuenta: US$0.23.**

## Formas en que esto podría estar mal

- **Aislamiento declarado, no forzado.** Los dos revisores son subagentes. Declararon haber leído solo los archivos de
  su carpeta, pero nada lo impedía técnicamente. El reparto, las lecturas y el hecho de que no haya preguntas sobre
  la métrica con desfase son coherentes con que no vieron los arreglos.
- **Dos corridas por núcleo.** La diferencia de un punto (96 contra 95) es menor que la variación entre corridas del
  mismo núcleo en otras preguntas. Afirmar «no cambian la precisión» es lo que soportan los datos; «empeoran» no.
- **El set hereda las tensiones del contrato.** Por lo menos dos se volvieron fallos medidos (n023 y el filtrar con
  métrica). Un adjudicador que no corrigió nada no prueba que el set no tenga errores: prueba que el contrato no los
  distingue.
- **Commit con una prueba roja.** `2788f91` (el que congela el set) entró con el canario ampliado en rojo, porque
  encadené el commit con `;` y no con `&&`. Se arregló en `cb5b5f0`, sin tocar el set: «en lo que va del año» es una
  convención del contrato que el prompt y el revisor comparten por diseño. El set congelado es el de `2788f91`.

## Lo que queda para el laboratorio (sin firmar)

- **Adoptar o no los dos arreglos.** Son correctos por construcción y no rompen nada en una muestra limpia, pero su
  efecto en la precisión no se pudo medir. No tocan el prompt ni el modelo, así que no son CDC: son código del núcleo.
- **El umbral por tipo** falla en las tres muestras: en `analizar` en el v1 y en `crear` y `filtrar` en el v3. Antes
  de otro set conviene resolver las tensiones del contrato que ya se convierten en fallos: gráficas que el esquema no
  tiene, `metricas` en `filtrar` y el eje de tiempo en `modificar`. Hay dos salidas, y es decisión del laboratorio:
  - más preguntas por tipo, para que el umbral mida al agente y no el muestreo;
  - un umbral por tipo con su intervalo.
- **La p95 de regeneración** pasa de 5 s en el v3: es la cola del modelo. Está en el CDC firmado (medida sobre v1 y
  v2) y aquí se reporta la nueva cifra; no se toca.
