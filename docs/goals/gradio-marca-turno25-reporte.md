# Reporte: Turno 25 × la idea de Gradio (goal del 2026-11-02)

Spec: `docs/goals/gradio-marca-turno25.md`. Rama `turno25/marca-banco` (worktree propio), sin push ni merge.
Propuesta de CDC sin firmar: `docs/goals/gradio-marca-turno25-propuesta-cdc.md`.

## Decisiones

| Decisión | Qué elegí | Por qué |
|---|---|---|
| Formato de tokens | JSON propio (`tokens.json`) con referencias `familia.tono` y `mezcla(a, b, t)` | Un solo archivo legible que proyecta a dos runtimes. Style Dictionary sumaba una dependencia para dos salidas |
| Generador | `scripts/marca/genera.mjs`, Node sin dependencias, con `--comprueba` y `--contraste` | El patrón de la casa (`GEMINI.md`, diccionario GS1): una fuente, una proyección y una comparación |
| Fuentes | Las del paquete de la propia guía (Source Sans 3 variable y Plex Mono 400/500/600, latin), con `next/font/local` y su OFL | Cero peticiones a Google al construir y al servir |
| Forma del banco | Núcleo en `tools/banco-motores` (TS puro, solo Zod) y pantalla en `src/features/banco` | La pantalla depende del design system de la app; un entry `./react` con un solo consumidor era YAGNI. Declarado en el primer checkpoint |
| Esquema → bloques | `z.toJSONSchema` (Zod 4) y metadata `.meta({ bloque, unidad, title })` | El JSON Schema es estándar y es el mismo que publica la API |
| Motores | Tesseract por `motorPorProceso` (Python), `leeCodigoDeProducto` de etiquetas GS1 (TS) y el generador de peor caso | Son los adaptadores que ya usa producción. RapidOCR y faster-whisper no están instalados aquí, y no los fingí |
| Cierre del banco | Fail-closed: `BANCO_LABORATORIO=1` y no producción | El criterio del puente A2A (#210) |
| Laboratorio migrado | Los dos (etiquetas y pymes) a una `TarjetaCaso` compartida | Las dos tarjetas eran la misma; migrar solo una dejaba la duplicación a medias |
| Marca blanca | Turno 25 en la capa del laboratorio; Ágora, Soporte SAP, Recepción y clínicas conservan su acento | Soporte SAP está desplegado y los otros tienen identidad propia |
| Skills | Se cargan `humanizer` y `emil-design-eng`; diez de Emil al estante; cinco fuera | Presupuesto de contexto: 11 477 de 12 000 |
| Revisores | Trinquete de color: lo heredado (4276 literales) al inventario con motivo; lo nuevo, a cero | Un rojo de 4000 hallazgos el primer día no lo arregla nadie; un trinquete no deja subir |

## Evidencia medida

| Qué | Antes | Después |
|---|---|---|
| Colores literales en `src/` (regla del revisor) | 4368 en 236 archivos | 4276 en 230 archivos |
| Naranja por pantalla (8 capturas, claro y oscuro) | 0,03 a 0,68 % | 0,79 a 1,73 % (todas bajo 10 %) |
| Peticiones fuera de `localhost` | 0 | 0 (también en el recorrido del banco: 37 o 38 por corrida, todas locales) |
| Errores de consola en las superficies capturadas | 0 | 0 (hubo 6 en el banco; arreglados, ver abajo) |
| Contexto por sesión | 11 308 de 12 000 | 11 477 de 12 000 |
| Título del login en oscuro | invisible (texto claro sobre `bg-white`) | legible (tokens) |

## Humanizer: antes y después de un texto de este goal

Texto: el veredicto de la ronda 2 del spec. Muestra de voz: la tabla Sí/No de Turno 25.

**Antes**

> **Veredicto: herramienta propia.** Gradio pasa a ser **la referencia que se estudia, no una dependencia**. El
> banco vive en `tools/`, con el núcleo en TypeScript puro (sin React, sin Next y sin Node en el núcleo) y lo
> visual en un entry aparte, como pide `docs/EMPAQUETAR-HERRAMIENTA.md`. Todavía **no** se empaqueta ni se
> publica: tiene un solo repo consumidor.

**Después**

> Veredicto: herramienta propia. Gradio se estudia y no se instala. El banco vive en `tools/` con un núcleo en
> TypeScript puro que no importa React, Next ni Node, y la parte visual va aparte, como pide
> `docs/EMPAQUETAR-HERRAMIENTA.md`. Todavía no se empaqueta ni se publica, porque tiene un solo repo consumidor.

Patrones quitados: el contraste escenificado «X, no Y» (§1), las tres negritas de adorno (§19), la tríada
«sin React, sin Next y sin Node en el núcleo» con su repetición (§6) y los dos puntos dramáticos antes de la
razón. Datos: 12 de 12 conservados, ninguno añadido. El revisor de voz no marcó nada en el «antes»: esos
patrones son juicio, por eso el skill se carga y el gate solo cubre lo mecánico.

## Lo que podría estar mal (y qué hice)

| Riesgo | Estado |
|---|---|
| El JSON Schema de Zod no era «plano» para React Server Components: 6 errores de consola en el banco | **Resuelto**: `esquemaJson` hace ida y vuelta por JSON; 0 errores |
| Una URL larga (Digital Link) quedaba escondida en un input de una línea | **Resuelto**: textarea de una fila con `field-sizing: content`; el recorrido mide 0 desbordes |
| Mi chequeo de desborde no veía lo que se esconde tras un scroll dentro del bloque | **Resuelto**: ahora mide cada elemento del bloque. Siembra (quitar `overflow-wrap`): cae en 2 pasos; sin siembra, 0 |
| El revisor de interfaz encontró dos inputs con `text-sm` y dos hex en mi propio código | **Resuelto** antes de escribir la línea base |
| El primer `--inventario` se negaba con la línea base vacía | **Resuelto**: la creación inicial escribe; después se niega si algo sube |
| Reescribir `inventario/activos.json` con `json.dump` cambiaba el formato de todo el archivo | **Resuelto**: revertido e insertado respetando el formato (24 líneas) |
| Cancelar en el banco dejaba de esperar, pero Tesseract seguía hasta su tope de 120 s | **Resuelto**: el banco inyecta su propio `ejecuta` (el punto que el extractor documenta) que lanza el proceso en su grupo y lo mata entero al cancelar. Medido en vivo: sin cancelar, Python vive hasta ~450 ms; cortando a los 223 y a los 445 ms, a los 50 ms siguientes no queda Python, ni Tesseract, ni temporal. Llevar la señal al extractor mismo toca una herramienta empaquetada y va aparte |
| `fg-3` en claro da 4,04:1 y no pasa AA en texto normal | **Resuelto en lo comprobable**: regla `sutil-chico` en el revisor de interfaz (`text-sutil` sin `text-2xl` o mayor). Hoy hay 0 usos; sembrada en disco tumba el gate (exit 1) y sin ella vuelve a 0. La prueba de la prueba ahora exige que cada regla, no solo cada familia, caiga con su siembra: 11 de 11. Subir el valor es de la guía, v1.1 del laboratorio |
| Los estados en oscuro son derivados, no de la guía | **Resuelto en lo medible**: los cuatro pasan AA en oscuro, de 6,80:1 a 8,33:1 (`npm run marca:contraste`). Adoptarlos en la guía es la v1.1 del laboratorio |
| El naranja se mide por tono y cuenta también el ámbar de los avisos | Aceptado: cuenta de más, nunca de menos |
| Fuera del laboratorio la marca solo llegó a lo migrado; 230 archivos siguen con color literal | Aceptado: es el inventario, con motivo por módulo |
| Las cifras de los laboratorios (componente `Metrica` de laboratorio-voz) seguían en sans | **Resuelto**: `font-mono tabular-nums`, como `Cifra` |
| El revisor de voz cubre diez superficies, no todo el repo | Aceptado: el alcance crece cuando un archivo se pasa por el humanizer |
| `public/banco/ejemplos/factura-sintetica.png` no es reproducible byte a byte | Declarado `fuera` en el registro de generados, con su motivo |
| `audita:secretos` tomó las sha256 de los `ORIGEN.md` (64 hex sueltos) por tokens estilo HCLOUD | **Resuelto**: escritas como `sha256:<hex>`, el ancla pública que el auditor reconoce; commit local enmendado antes de empujar nada |
| `verifica:inventario`: `.claude/design-systems/turno-25` tenía dos dueños (`TPL-design-systems` y `TPL-marca-turno25`) | **Resuelto**: el design system sigue en su activo; `TPL-marca-turno25` cubre el generador y lo generado |
| `prueba:a2a`: `/api/banco` y `/api/banco/[id]` no estaban declaradas en `RUTAS_FUERA_DEL_BRIDGE` | **Resuelto**: declaradas con su nota RF-20; 15 de 15 |
| El banco no comprobaba de qué máquina venía la petición, y `next dev` escucha en la red aunque no uses `dev:movil` | **Resuelto en lo que se puede desde la app**: 404 si el Host no es local o `x-forwarded-for` no es loopback. Medido con curl: localhost y 127.0.0.1 dan 200; la IP de eth0, 10.255.255.254 y un `X-Forwarded-For` ajeno dan 404, en la API y en la página. Queda dicho lo que no cierra: quien falsea las dos cabeceras a propósito pasa (200); esa barrera es la red |
| `prueba:tools` en rojo por `tools/agora` (2 de 133): el gasto sembrado tiene fechas fijas de octubre y el «gasto del mes» mira noviembre desde el 1/11 | **Resuelto en rama aparte**: `agora/gasto-del-mes` (280995f), desde `main` y apilada aquí. Ver «Validate» abajo |

## Validate

| Corrida | Commit | Resultado |
|---|---|---|
| 1 | antes de enmendar | Rojo en `audita:secretos` (sha256 sin prefijo). Resuelto |
| 2 | `2b77e81` | Rojo en `verifica:inventario` (design system con dos dueños). Resuelto |
| 3 | `2b77e81` | El sistema la mató por memoria dentro de `prueba:tools` |
| 4 | `462d9be` | 29 pasaron y 1 en rojo: `prueba:tools`, por `tools/agora` (2 de 133). Los 6 gates que quedaron sin correr, sueltos: 5 en verde; `prueba:a2a` en rojo por las rutas del banco, ya declaradas |
| 5 | `112f13b`, con Ágora apilado | **Verde: 36 de 36** activos, 12 inactivos declarados, 2497 pruebas de `tools/` |
| 6 | la punta, tras cerrar la lista de riesgos y con `npm ci` real | Corre después de este commit: el resultado va en la conversación y en el PR |

Las dos pruebas de Ágora que fallan (`sobre el tope: 429…` y `el vigía avisa al 80 %…`) cuentan el gasto del
periodo abierto. La siembra del laboratorio de Ágora lo registra con fechas fijas de octubre
(`HOY_DEL_PROTOTIPO = '2026-10-26'`), así que desde el 2026-11-01 el gasto del mes de Medios Norte es 0 y ningún
tope de gasto dispara. En `main` (2181fcc) fallan las mismas dos. Arreglarlo toca Ágora, un producto firmado, y
cabe hacerlo de dos formas: que esas pruebas siembren su propio gasto en el periodo abierto o que la siembra use
fechas relativas a hoy. El laboratorio eligió la primera, en rama aparte: `agora/gasto-del-mes` (280995f) agrega
`gastaHoy` al marco de pruebas (gasto de hoy con el tipo de cambio de hoy; sin él costaría `null` MXN pasados
cinco días del último publicado) y no toca la siembra. Suite de Ágora 133 de 133; los sabotajes de puerta (PU1–PU5)
y vigía (V1–V5) siguen cayendo. Esta rama la apila con un merge para que los SHA de arriba sigan existiendo.
Queda abierto lo que ve quien abre el laboratorio de Ágora en noviembre: el gasto del mes en 0.
