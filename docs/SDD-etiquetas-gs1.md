# SDD · Control de caducidades con etiquetas GS1-128

> Rama `etiquetas-gs1`, 2026-09-25. Spec: [`docs/goals/etiquetas-gs1-caducidades.md`](goals/etiquetas-gs1-caducidades.md).
> Núcleo y agente: [`tools/etiquetas-gs1/`](../tools/etiquetas-gs1/README.md) · App: `src/features/etiquetas/`, rutas `/etiquetas/*`.
> Todo con datos **ficticios**: prefijo 952 (GS1 lo reserva para ejemplos), sitios, productos y lotes inventados.

## 1. Lo que se investigó y lo que cambió el diseño

| Fuente | Qué dice | Qué decidió aquí |
|---|---|---|
| GS1 GenSpecs R26.0 §5.4.4.3 | Máximo **48 caracteres de datos** por símbolo; cuentan AIs, datos y **cada FNC1 separador**; no cuentan inicio, FNC1 inicial, control ni parada. Largo físico máximo 165.10 mm con zonas. | `caracteresDeDatos()` exacto; pruebas en 48 y 49. |
| ídem | `(00)(02)(37)(17)(10)` en un solo código suma **56**. | La tarima va en **dos códigos**: `(02)(37)(17)(10)` y el SSCC `(00)` solo abajo, como en la guía de etiqueta logística. Las combinaciones se evalúan sobre la etiqueta entera. |
| GS1 Barcode Syntax Dictionary (Apache-2.0, commit `c63d8a1`) | Todas las AIs con longitud, juego de caracteres, `*` = sin FNC1, linters, `req=` y `ex=`. | Tabla de AIs **generada** de esa fuente (541 AIs, rangos expandidos); `(01)+(37)`, `(01)+(02)` y compañía salen de ahí, no de una lista a mano. Linters sin tabla (ISO, IBAN, cupones) se dicen «no verificado», nunca «válido». |
| GenSpecs §3.4, §7.12 | `DD=00` = último día del mes (130200 → 28/02/2013); siglo en ventana −49/+50. Salud regulada ya no admite 00 desde 2025. | Implementado con los ejemplos de la norma; aviso de salud regulada. |
| GenSpecs §5.12.3 Tablas 2 y 5 | GS1-128 en distribución general: X de 0.495 mm (máx. 1.016 caja / 0.940 tarima), barras ≥ 31.75 mm, zona 10X. Solo si la unidad es físicamente chica: X ≥ 0.250 y 12.70 mm. | Dos perfiles de lector: **automático** (exige 0.495) y **pistola** (0.250 es *aviso*, no «ok»: GS1 no tiene tabla para pistola). |
| GenSpecs Tabla 1-4 | **04** = circulación restringida *dentro de una empresa*; 02 y 20-29 = *regional*, las define GS1 México (peso variable). 952 = demostraciones. | El código interno sale por defecto con **04**; 02/20-29 elegibles con aviso. Ver §4, decisión 5. |
| Zebra ^BC (manual) + motor zebrash medido | Modo D arranca con FNC1 y quita paréntesis; su propio ejemplo pone `>8` entre AIs variables. **Medido**: sin `>8` tras (37) la tarima se lee corrupta; un lote `A(1)` sale `A1`; zebrash no corrige un dígito malo (las Zebra reales sí, según Zebra). | `>8` explícito tras cada AI variable que no es el último; lote con `( ) >` **bloqueado** para ZPL con arreglo propuesto; dígito malo bloqueado antes. |
| zebrash (medido) | Aplica `^LH` pero **ignora `^LS` y `^LT`**. | La vista previa local suma `^LS/^LT` a `^LH` y lo avisa; el ZPL que se imprime lleva los comandos reales. |
| Zebra Browser Print | Servicio local en `127.0.0.1:9100` (http) / `:9101` (https): `/available`, `/default`, `/write {device, data}`, cuerpo text/plain. | Cliente propio con `fetch` (el SDK de Zebra no se copia al repo) + simulador con las mismas rutas. |
| SAP EWM, Odoo, WMS de 3PL | FEFO por fecha de caducidad; EWM **surte lotes vencidos** si nadie los filtra; Odoo separa fecha de alerta y de retiro; los WMS exigen vida mínima al recibir. | Semáforo de 4 estados (vigente, por vencer, retirar, vencido) con umbrales por categoría; el FEFO excluye vencidos y retiro; la recepción rechaza vencidos y lo que no llega al mínimo. |

## 2. Arquitectura

- **Núcleo sin dependencias** (`tools/etiquetas-gs1/src`): diccionario, parser de lecturas
  (`]C1`, GS real o sustituido, paréntesis), validación, medidas, **un solo diseño en puntos**
  del que salen el ZPL y el SVG, revisión de 7 puntos, catálogo/importación, numeración, FEFO.
  El almacén se **inyecta** (`AlmacenEtiquetas`): memoria, archivo JSON, o tablas del ERP.
- **Entradas aparte**: `./svg` (bwip-js inyectado), `./navegador` (Browser Print y agente por
  `fetch`), `./almacenes/archivo`, `./agente` (Node + Zod).
- **App**: `src/features/etiquetas/` — un `route.ts` con Bearer (`ETIQUETAS_TOKEN`) + operador y
  Zod en toda acción; pantallas: etiqueta, leer, caducidades, catálogo, impresoras, ajustes.
- **Persistencia**: archivo JSON local con escritura atómica. La BD compartida **no se toca**.
  Propuesta de tablas para el ERP en `migraciones/`, validada en Postgres 17 efímero.

## 3. Evidencia (cómo se reproduce)

| Qué | Comando |
|---|---|
| Núcleo con vectores GS1, ida y vuelta SVG/ZPL, agente, importación, feature | `npm run prueba:etiquetas` (dentro de `npm run validate`) |
| Capturas de escritorio y celular de cada flujo, cámara falsa incluida | `npm run build && npm run capturas:etiquetas` |
| Propuesta de tablas para el ERP | `bash tools/etiquetas-gs1/migraciones/prueba-efimera.sh` |

## 4. Decisiones

1. **Tarima en dos códigos** (norma, no gusto): cinco AIs no caben en 48.
2. **Modo D con `>8` explícito**, y rechazo de valores con `( ) >` para ZPL: el modo D los altera y el SVG diría otra cosa.
3. **La revisión bloquea la impresión** ante cualquier error: dígito, combinación, 48, lote prohibido, no cabe, grosor bajo mínimo. Los avisos (grosor reducido, prefijo 952, DD=00) no bloquean.
4. **Grosor automático** = el mayor que cabe con zonas de 10X; se compara con GS1 según el lector del perfil. En 4" a 203 dpi la caja sale a 0.375 mm: suficiente para pistola, no para túnel. Se dice.
5. **Código interno con prefijo 04**. El spec decía «rangos 02/20-29»; la GenSpecs los reserva para circulación **regional** definida por GS1 México (en tienda: peso variable, básculas). La norma para «solo dentro de la cadena» es 04. Se dejó configurable con aviso: **el laboratorio decide**; si prefiere 02/20-29, es un cambio en Ajustes, no de código.
6. **Regla mixta por nivel** (pieza y caja): la caja necesita su propio GTIN-14. De marca propia se deriva con indicador 1-8; de un fabricante sin GTIN de caja **no se inventa nada** (prefijo ajeno): la caja recibe un interno 04 y una nota para pedírselo.
7. **Idempotencia de la importación**: un artículo sin código en el archivo conserva el que ya tenía; los números emitidos van a `emitidos` y nunca se reusan; los conflictos (GTIN en dos artículos, marca propia con prefijo ajeno, cambio de GTIN de fabricante) se detienen para decisión humana. El plan se recalcula dentro de la transacción al aplicar.
8. **Agente = superficie cerrada (C3)**: ticket HMAC-SHA256 por trabajo firmado por el servidor, atado a impresora + sitio + SHA-256 del ZPL + copias + nonce de un uso + vencimiento ≤ 10 min; la petición nombra la impresora por ID (host y puerto salen de la configuración); ZPL por **lista de comandos permitidos** (fuera `^JU`, `~JR`, red, `^KP`, cambio de prefijos `^CC/^CT/^CD`, descargas, todo `~`); Zod estricto; CORS a orígenes listados con soporte de Private Network Access; límite de peticiones; cola persistente con reintentos exponenciales y `~HS` (papel, cabezal, pausa).
9. **Labelary apagado** (C4): se activa en Ajustes y además por uso, con aviso rojo cada vez. No se ejercitó contra el servicio real. La vista local es SVG + zebrash en el navegador.
10. **Excel**: `read-excel-file`/`write-excel-file` (ligeros, mantenidos). Se descartó `xlsx@0.18.5` de npm (vulnerabilidades conocidas, versión congelada en npm).
11. **Versiones pineadas** exactas: bwip-js 4.11.4, @zxing/browser 0.2.1 (+ @zxing/library 0.23.0), zpl-renderer-js 4.0.0, read-excel-file 9.3.10, write-excel-file 4.1.1.

## 5. Formas en que esto podría estar mal o incompleto, y qué se hizo

| # | Riesgo | Resolución | Queda |
|---|---|---|---|
| 1 | El modo D de una Zebra real no inserta FNC1 donde creemos | Medido con zebrash; `>8` explícito como en el ejemplo de Zebra; ida y vuelta decodifica `<GS>` tras (37) | Confirmar con una Zebra física (firmware ≥ x.11) |
| 2 | La impresora "corrige" en silencio un dígito malo y el SVG no | El dígito malo bloquea antes de generar ZPL | — |
| 3 | Lote válido GS1 con `( ) >` se corrompe en ZPL | Bloqueado con explicación y arreglo | — |
| 4 | Regla de 48 mal entendida | Texto exacto §5.4.4.3; pruebas 48/49 | — |
| 5 | El ancho previsto no es el que dibuja la impresora | Mismos módulos que bwip-js en 5 casos; ±1 punto frente a zebrash | Medir con regla una etiqueta real |
| 6 | Excel se come ceros o pone notación científica | Normalización a 14 cifras; notación científica detectada y marcada inválida; Excel y CSV dan el mismo plan | — |
| 7 | Confundir GTIN de pieza y de caja | Modelo por nivel; conflicto si la caja con N>1 piezas usa el GTIN de la pieza | — |
| 8 | Numerar con prefijo ajeno | Solo el GCP configurado; conflicto si marca propia trae otro; prefijo de RCN rechazado como GCP | — |
| 9 | Reimportar duplica asignaciones | Idempotente; pruebas con v1 dos veces y v2 con cambios | — |
| 10 | Agente como relé abierto | Ticket por trabajo, lista de impresoras, lista de comandos, Zod, CORS; 13 rechazos probados | — |
| 11 | Replay de un ticket tras reiniciar el agente | Nonces en memoria + vida corta (120 s por defecto) | Un reinicio dentro de esa ventana permitiría reimprimir LA MISMA etiqueta autorizada; persistir nonces si se quiere cerrar |
| 12 | Impresora caída o sin papel pierde etiquetas | Cola persistente, reintentos, `~HS`; probado con impresora caída y sin papel | `~HS` real de cada modelo |
| 13 | Vista local engaña con `^LS/^LT` | Plegados en `^LH` con aviso | Calibrar con papel real |
| 14 | Browser Print real difiere del simulador | Rutas y formas del SDK de Zebra | Probar con la app de Zebra instalada (http y https/9101) |
| 15 | Pistola con teclado en español cambia `]` o `(` | Sustitutos de GS configurables; forma de la lectura mostrada en pantalla | Configurar cada pistola (teclado US o sustituto de GS) |
| 16 | Cámara no abre en el celular | Requiere https; `npm run dev:movil` o despliegue con TLS | — |
| 17 | Umbrales del semáforo tomados como regla | Marcados «valores de ejemplo» hasta que se editen | Fijarlos con calidad |
| 18 | Identidad débil en la app (un código por instalación + nombre declarado) | Traza con operador en cada acción | Integrar con el login/roles del ERP (propuesta §6) |
| 19 | Dos instancias de la app sobre el mismo JSON emiten el mismo SSCC | Escritura atómica y transacciones serializadas en UN proceso | Varias instancias ⇒ tablas del ERP (propuesta) |
| 20 | Día de "hoy" distinto entre servidor y navegador cerca de medianoche | Servidor en `America/Mexico_City` (configurable) | — |
| 21 | Linters GS1 que no se comprueban (ISO 3166/4217, IBAN, cupones) | Se reportan «no verificado» | Añadir tablas si se leen esas AIs |
| 22 | Integración ERP reabre el UPDATE de ledgers | **Hallazgo medido**: 004 debe listar `eti_asignacion`, `eti_emitido`, `eti_importacion` | Gate humano al integrar |

## 6. Integración al ERP (propuesta, no aplicada)

`tools/etiquetas-gs1/migraciones/propuesta-pack-etiquetas.sql`: pack `eti_*` en el esquema
`erp`, `cliente_id` en toda tabla, extiende `erp.inv_articulo` sin tocarla, dígito y CSET 82
validados también en la base, GTIN único por tenant en ambos niveles (trigger), ledgers
append-only. Validado con `prueba-efimera.sh` sobre `erp/migrations/001..005` de `origin/main`:
se instala dos veces, 004 le pone RLS forzada, y pasa (a)…(f). **No se aplicó a ninguna base.**

## 7. Qué falta probar en físico (no hay impresora ni Browser Print aquí)

Una Zebra 203 dpi y una 300 dpi reales: modo D con `>8`, `^LS/^LT`, `~HS`, oscuridad y
velocidad; Browser Print instalado (http y https); lectura con pistolas reales en teclado
español; verificación de calidad de símbolo (ISO/IEC 15416, grado 1.5/10/660) con un verificador.
