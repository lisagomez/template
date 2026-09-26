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

## 8. Rollos: presupuesto contra gasto (`/etiquetas/rollos`)

- **De dónde sale el gasto**: cada impresión exitosa (editor, lote, calibración) anota sus etiquetas
  (`etiquetasDeZpl`: cada `^XA` por su `^PQ`) contra la impresora del perfil y el rollo que tiene
  puesto EN ESE MOMENTO. Costo por etiqueta = precio del paquete / rollos / etiquetas por rollo.
- **Sin precio no es cero**: lo impreso en una impresora sin rollo asignado queda «sin costo» y el
  sitio sale **Incompleto: falta precio**, nunca «en rango» con $0 (misma regla que la contabilidad
  de tokens del repo).
- **Aviso, no bloqueo**: aviso al 80 % o si la proyección lineal a fin de mes pasa del presupuesto;
  excedido al 100 %. Nunca bloquea imprimir: dejar una caja sin etiqueta de caducidad por un
  presupuesto de papel es una decisión de operación.
- **Precios de referencia** (`ROLLOS_REFERENCIA`) con fuente y fecha de consulta (2026-09-25); la
  tienda no aclara IVA. Se sustituyen por los del proveedor.
- **Ejemplo de dulcería** (`ESCENARIO_DULCERIA`, ficticio): CEDIS con 150 cajas/día hábil sin
  GS1-128 del proveedor y 6 tarimas/día con etiqueta en dos caras; 3 sucursales con 80 bolsas de
  granel/día; 3 % de merma → **10,432 etiquetas y $2,306.96 al mes (~$27,684 al año)**. Cajas y
  bolsas en 2000D (Zebra lo califica para interior 1 año+, y el dulce caduca a 6-18 meses); con
  1000D en bolsas, $1,940.74/mes pero con riesgo de que la etiqueta pierda legibilidad antes de la
  caducidad. Sin IVA confirmado, desgaste de cabezal ni envío.
- Propuesta ERP: el consumo y los presupuestos no están en `propuesta-pack-etiquetas.sql` todavía
  (viven en el almacén JSON); se añadirían como otro ledger append-only si se integra.

## 9. Zonas dentro del sitio: recibo → almacén → piso de venta (`/etiquetas/mover`)

- **Misma etiqueta**: la caja se mueve por su (01)(17)(10) —GTIN, lote y caducidad exactos— y la
  tarima entera por su SSCC (00). La zona sale de una **etiqueta de ubicación** GS1-128:
  (414) GLN del sitio + (254) componente de extensión con la zona (`RECIBO`, `ALMACEN`, `PISO`,
  `MERMA`). GS1 reserva el (254) para ubicaciones internas por acuerdo (GenSpecs §3.5.12 y §1.1.1):
  no viaja a terceros. Medidas por la Tabla 9 (GLN): X de 0.250 mm, 12.70 mm de alto, y hasta 1.016
  mm para marcar ubicaciones. La etiqueta entra en la ida y vuelta SVG/ZPL.
- **Reglas del movimiento**: lo vencido o en días de retiro no sube a piso (se manda a merma); al
  resurtir piso, si en almacén o recibo hay un lote surtible que vence antes, **aviso FEFO**; las
  cajas se toman de la zona anterior del flujo y primero de existencias sueltas que de una tarima;
  sin existencias suficientes no se mueve nada. Cada movimiento queda en una bitácora.
- **Tablero por zona**: «retirar del anaquel» = en piso y vencido, en retiro o venciendo en 7 días;
  «resurtido» = qué lote bajar primero del almacén; lo que está en merma sale de todas las listas.
- **Límite, dicho claro**: al abrir la caja en piso, su etiqueta ya no identifica cada pieza. Se
  sabe qué lote está en el anaquel porque se movió su caja; el control pieza por pieza pediría
  etiquetar la pieza con un código de caja de cobro (GS1 DataBar o DataMatrix), no con GS1-128.
- **GLN del sitio**: se captura en Ajustes → Sitios (13 cifras con dígito verificador, numerado con
  el prefijo de la casa). La semilla usa GLN ficticios del prefijo 952.
- **ERP**: la propuesta añade `zona` a `eti_existencia`, `gln` a `eti_sitio` y la bitácora
  append-only `eti_movimiento`; validada en Postgres 17 efímero, (a)…(g). 004 debe listar también
  `eti_movimiento`.

## 10. Expediente de lote: cadena de hashes, anclaje y agente de riesgo

Spec: `docs/goals/expediente-lote-cadena-hash.md`. Pantallas: `/etiquetas/expediente`,
`/etiquetas/riesgo`, `/etiquetas/integridad`; el rechazo 2/3 vive en `/etiquetas/leer` y las
acciones por color en `/etiquetas/caducidades`.

**Lo que se investigó y cómo cambió el diseño**

- **RFC 8785 (JCS)**: el hash cubre el registro COMPLETO canonicalizado (sitio, secuencia, fecha,
  tipo, lote, datos, operador y los dos enlaces). Con `SHA-256(datos + hash_anterior)` se podría
  cambiar el operador o la fecha sin romper nada. Se prueba con el ejemplo de §3.2.2 y el orden de
  claves de §3.2.3.
- **RFC 6962 / 9162** (Certificate Transparency, lo que usan Trillian y Rekor): hoja `0x00`, nodo
  `0x01`, MTH, PATH y el algoritmo de verificación de §2.1.3.2. Probado contra los vectores
  publicados de `transparency-dev/merkle` (raíces de 0 a 8 hojas y sus pruebas de inclusión).
- **GS1 EPCIS 2.0**: su hash de evento (`ni:///sha-256`) canonicaliza el evento y advierte que el
  hash solo no prueba autenticidad: hay que sumarle firma y sello de tiempo confiable. De ahí la
  firma Ed25519 del ancla y el central que no controla la sucursal. Las transferencias se modelan
  como en EPCIS (salida en origen, entrada en destino) y se enlazan por hash.
- **Regla de 1/3 y 2/3**: en Japón el fabricante entrega dentro del primer tercio de vida (llega
  con ≥ 2/3) y el ministerio (MAFF) empuja a relajarla; las cadenas piden entre 60 y 75 %. Por eso
  la fracción es un parámetro por categoría (2/3 por defecto) y, sin vida útil en el catálogo, se
  cae al mínimo absoluto de la categoría.

**Decisiones**

| Decisión | Por qué |
|---|---|
| Una cadena **por sitio**, el expediente es un índice por lote | Si la cadena fuera por lote, borrar un lote entero no dejaría rastro. `anteriorLote` enlaza cada evento con el anterior del mismo lote (o con el TRANSFERIDO del origen). |
| El estado es una **proyección** de la cadena | Cada evento lleva su huella (`cambios`: cajas por zona y tarima). Reconstruir y comparar dice dónde tocaron el estado sin evento. |
| **CORRECCION**, no edición | Referencia el evento corregido por hash; un cambio de caducidad re-etiqueta el lote y el expediente sigue las dos claves. |
| **Anclaje**: raíz de Merkle diaria firmada (Ed25519 de `node:crypto`) en un central aparte | La cadena sola no detiene a quien puede recalcularla entera. El central acepta el ancla solo con la llave registrada del sitio y si continúa la anterior. |
| **Testigos de cabeza** | Borrar el ÚLTIMO evento antes de anclar deja una cadena coherente. El sitio avisa su cabeza al crecer; el central la recuerda y el ancla siguiente (o la auditoría) no la encuentra. La ventana queda en segundos, no en un día. |
| Semáforo de **cinco colores con acción** | Amarillo = prioridad FEFO y transferencia sugerida; naranja = promoción y exhibición (sí sube a piso); rojo = bloqueo de venta normal en el sistema (la caja no lee lote en EAN-13): solo liquidación, donación o merma, y liquidar o donar exige quién lo autoriza; vencido = merma. |
| **Agente determinista** | Días de inventario acumulados en orden FEFO contra días VENDIBLES (hasta el rojo, no hasta la caducidad). Sin dato de venta no evalúa (no es lo mismo que vender cero). Recomienda transferir a la sucursal con más capacidad de venta, promoción escalonada o exhibición; no repite lo pendiente ni lo decidido en 7 días. Sin modelo de lenguaje: no pasa por C8. |
| **Ventas ficticias detrás de `FuenteVentas`** | Leer ventas reales del ERP (solo lectura) es una propuesta con gate humano. Sin fuente configurada, el agente no evalúa nada. |
| **Seudónimos** (`op-` + 8 hex aleatorios) | La cadena es inmutable: no puede guardar lo que alguien tenga derecho a cancelar. El mapeo vive en `operadores.json` y `olvida()` lo borra; la cadena sigue verificando. Aleatorio y no un hash del nombre, que se revierte probando nombres. |
| Ubicación **rack-nivel-posición** en (254) | `ALMACEN-B-04-2` cabe en los 20 caracteres de (254); la etiqueta de ubicación sigue siendo (414)+(254). |

**Instalación en un sitio**

1. **Llave del sitio**: generar un par Ed25519 (`generaLlaves()` de `@tu-scope/etiquetas-gs1/firma`)
   en la máquina del sitio y ponerla en `ETIQUETAS_LLAVE_<SITIO>` (PKCS#8 DER en base64, `-` → `_`).
   Nunca se imprime: la pantalla de integridad muestra presente/ausente, su largo y la huella de la
   llave PÚBLICA. La pública se registra sola en el central al primer anclaje; cambiarla queda
   como incidente de rotación.
2. **Central**: `ETIQUETAS_CENTRAL` apunta a su archivo (por defecto `central.json` junto al
   estado). En producción debe vivir donde la sucursal no escriba: otra máquina o la tabla
   `eti_ancla` del ERP, escrita solo por el job del central (C7).
3. **Horario**: el ancla se pide cada noche (y, si se quiere acortar la ventana, cada hora) con
   `POST /api/etiquetas {"accion":"ancla"}` desde un cron con el código del dispositivo; el agente
   de riesgo, cada mañana, con `{"accion":"agente"}`. Los testigos de cabeza salen solos tras cada
   operación.
4. **Almacenes anteriores**: al primer arranque se abre la cadena de cada sitio con un RECIBIDO de
   apertura por existencia. Lo anterior a la apertura no tiene prueba, y el expediente lo dice.

En esta demostración un solo servidor hace de todos los sitios y del central (tiene todas las
llaves). Separarlos —firma en el agente de cada sitio y envío al central por HTTP— usa las mismas
funciones (`preparaAncla`, `firmaAncla`, `recibeAncla`) pero **no está construido**: es el
siguiente paso si se instala con sitios en otras redes.

**Evidencia**: `npm --prefix tools/etiquetas-gs1 run prueba` (cadena, anclaje, firma, Merkle,
JCS, SHA-256, expediente y agente), `npm --prefix tools/etiquetas-gs1 run demo:manipulacion`
(antes y después de cuatro manipulaciones sobre archivos reales, con veredicto),
`npm run capturas:etiquetas` (flujos 19 a 24) y `bash tools/etiquetas-gs1/migraciones/prueba-efimera.sh`
((h) a (k): cadena, solo-agregar y anclas en Postgres, calculando en la base el génesis y el hash
JCS del ancla y comparándolos con los del núcleo).

**Formas en que esto podría estar mal o incompleto, y qué se hizo**

| Riesgo | Qué se hizo |
|---|---|
| Quien escribe el almacén recalcula toda la cadena | La delata el ancla firmada (probado: «la raíz de Merkle recalculada no es la anclada»). |
| Borrar el último evento antes del ancla | Testigo de cabeza: el central ya lo vio y rechaza el ancla que no lo contiene o que trae otro en su lugar (probado). La ventana que queda es entre el evento y su aviso. |
| Tocar existencias sin evento | La proyección no cuadra y dice sitio, lote, zona y cajas (probado). |
| Borrar un evento y devolver el estado a mano antes del aviso | Indetectable localmente en esa ventana de segundos. Lo reducen el testigo inmediato, los enlaces de transferencia (la otra mitad vive en otro sitio) y el ancla por hora. Se dice, no se esconde. |
| Robo de la llave del sitio | Con la llave se firman anclas nuevas, pero no se reescriben las ya aceptadas: el central solo agrega y exige continuidad. Rotarla queda como incidente. |
| El dueño de la base desactiva los triggers | `session_replication_role = replica` lo permite (la prueba efímera lo usa para vaciar). Por eso el ancla vive donde la sucursal no escribe. |
| La base no recalcula el hash del evento | jsonb no ordena claves como JCS; el encadenado y el solo-agregar sí se exigen al insertar, y el hash lo re-verifica el núcleo. El hash del ANCLA sí se recalcula en SQL. |
| Datos personales en lo inmutable | Solo seudónimos; la base rechaza un nombre como operador (prueba (h)). |
| Ventas ficticias | Detrás de un adaptador; con la fuente real el agente no cambia. Conectar el ERP es gate humano. |
| El agente actúa sobre una cadena rota | Verifica cadena, proyección, anclas y testigos antes de cada corrida y decisión; si falla, no actúa y abre incidente (probado y capturado). |
| Un umbral mal puesto manda a promoción lo que no | Los umbrales siguen marcados como ejemplo hasta que calidad los fija; los porcentajes de la promoción escalonada (10/20/30 %) también son de ejemplo. |

### 10.1 Inventario físico (`/etiquetas/conteo`)

Un conteo no corrige un evento: concilia lo que hay contra lo que dice la cadena. Por eso tiene su
propio flujo y su propio evento, `CONTEO`, en lugar de la CORRECCION lote por lote.

| Paso | Qué hace y por qué |
|---|---|
| **Abrir** (sitio, zonas, tolerancia en cajas) | Exige la integridad COMPLETA del sitio (cadena, proyección, anclas, testigos). Si el estado no es la proyección de la cadena, no se abre: se abre un incidente. Contar sobre un estado manipulado lo legalizaría. |
| **Punto de corte** | Se guarda la cabeza de la cadena al abrir, y cada lectura guarda la cabeza del momento. Lo esperado de cada lote y ubicación es la proyección hasta su última lectura: lo que se vende o se mueve después se suma encima y no aparece como faltante. No hay que parar la tienda. |
| **Conteo ciego** | Se lee la etiqueta de ubicación (zona o `ALMACEN-B-01-1`) y luego las cajas. El servidor no devuelve lo esperado mientras se cuenta; en la ronda 2 tampoco lo que contó la ronda 1. |
| **Reconteo** | Lo que sale de la tolerancia se recuenta, sin cantidades, por OTRA persona (el núcleo rechaza al mismo seudónimo). |
| **Conciliación** | Por lote, zona y tarima: lo que dice la cadena, lo contado, la diferencia y la clase (cuadra, faltante, sobrante, lote desconocido). Se ve hasta cerrar las rondas. |
| **Autorizar y aplicar** | Si tras el reconteo algo sigue fuera de tolerancia, autoriza alguien que no contó. Se aplica un `CONTEO` por lote, también cuando cuadra, con el hash del acta (todas las lecturas y la conciliación) y la huella de cajas. La diferencia se aplica como delta, así que las ventas posteriores a la lectura se conservan. Lo que no aparece queda en cero y su expediente se cierra por conteo; si algo se encontró en otro rack, un `UBICADO`. |
| **Patrones** | Faltantes que se repiten en la misma ubicación en dos conteos distintos abren un incidente en el central: un patrón no se arregla con otro ajuste. |

**Rol de conteo.** El rol lo decide el SERVIDOR por el código con que se emparejó el dispositivo,
nunca el navegador: `ETIQUETAS_TOKEN` es operación (todo) y `ETIQUETAS_TOKEN_CONTEO` es un
dispositivo de conteo. Los dos se comparan en tiempo constante. Un dispositivo de conteo:

- solo puede pedir `conteos`, `conteo-lee` y `conteo-cierra`; el resto responde 403 (abrir, aplicar,
  cancelar, expediente, integridad, riesgo, recepción, movimientos…);
- recibe el estado SIN cantidades: sin existencias, movimientos, consumo ni devoluciones;
- nunca recibe lo esperado ni la conciliación, tampoco al cerrar ni aplicado, y en el reconteo no ve
  la ronda 1; una tarima leída solo por su SSCC entra completa con la cantidad registrada, que no se
  le dice;
- ve en el menú solo «Conteo»; las demás pantallas muestran que es un dispositivo de conteo.

La pantalla no es la frontera: el servidor sí (capturas: `informe.rolConteo` con los 403 y el
estado vacío de cantidades). Quien supervisa abre, concilia, autoriza y aplica desde un dispositivo
de operación. Aplicar la diferencia a la contabilidad del ERP es una acción irreversible: sigue
siendo gate humano. En el ERP, `eti_evento` admite `CONTEO` y
`eti_existencia` el origen `conteo` (prueba efímera (l)).
