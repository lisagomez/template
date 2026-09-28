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

### 10.2 Ventas del ERP para el agente de riesgo (`ventas-erp.ts`)

El agente puede leer las ventas del ERP en lugar de las ficticias, con el mismo contrato
(`FuenteVentas`). Se probó contra el esquema REAL del ERP (001..005) en el Postgres desechable, con
ventas de PRUEBA sembradas (`migraciones/prueba-ventas-erp.mjs`, fase 5 de `prueba-efimera.sh`).
No se leyó producción.

- **Solo lectura.** Un `select` con la RLS del tenant (`app.cliente_id`) y un rol que no escribe:
  `rol_swm`, el que hereda `erp_lector`. La prueba intenta escribir con ese rol y comprueba el
  `permission denied`. La conexión se inyecta (`ConsultaSql`): el núcleo sigue sin dependencias.
- **Qué cuenta como venta.** Partidas de pedidos `confirmado` o `facturado`, en los 28 días
  completos anteriores a hoy. No cuentan borrador, cancelado, fuera de ventana, el día en curso ni
  otro tenant; la prueba siembra un caso de cada uno.
- **Unidades.** Si la `clave_unidad` del SAT es caja (`XBX`), la cantidad ya son cajas; en pieza se
  divide entre las unidades por caja del catálogo. Si el ERP tiene el artículo y no lo vendió, la
  venta es cero; si no lo tiene, es `undefined` y el agente no lo evalúa.
- **Sitio.** El ERP no tiene sucursal: el tenant corresponde a UN sitio, que se declara. Por eso,
  con esta fuente, el agente no sugiere transferencias: no sabe cuánto vende otro sitio.

Conectarlo en la app es otro paso: hace falta un cliente de Postgres pineado y decidir leer la
base del ERP, que es PRODUCCIÓN compartida, con datos reales (decisión de flujo de datos, C4). Hoy
el ERP tampoco tiene los productos de prueba ni sucursales, así que el agente no encontraría ventas
que cuadren con el laboratorio.

## 11. Recepción con foto de la caducidad (`/etiquetas/recibir`)

Spec: `docs/goals/foto-articulo-y-caducidad-leida.md`. Pantallas: `/etiquetas/recibir` (escanear →
foto → revisión → etiqueta, y la bandeja «por confirmar»), la ficha del artículo en
`/etiquetas/catalogo`, y la foto en el lector, mover, conteo, tablero y expediente.

**Decisión del laboratorio**: la caducidad leída es una PROPUESTA. Cuenta para semáforo, FEFO y
cadena solo cuando quien registra la confirma o la corrige; si la deja pendiente, las cajas se
quedan en recibo y el servidor no deja moverlas, venderlas ni transferirlas.

**Lo que se investigó y cómo cambió el diseño**

| Fuente | Qué dice | Qué decidió aquí |
|---|---|---|
| ISO/IEC 15424 + GenSpecs (EAN/UPC, ITF-14) | La pistola manda `]E0` (EAN-13; UPC-A como EAN-13 con un 0), `]E3` (con suplemento), `]E4` (EAN-8), `]I1` (ITF). `]C0`, `]d1` y `]Q1` son Code 128, DataMatrix y QR **sin** GS1. | `codigos.ts` lee los cuatro, con y sin identificador; lo que no es GS1 se rechaza con su motivo («parece publicidad»), no se adivina un producto. La cámara les antepone el identificador según el formato que decodificó zxing. |
| GS1 Digital Link 1.4 | La clave va en la ruta (`/01/…`), los calificadores también (`/10/`), los atributos en la consulta (`?17=`). Cualquier dominio. | Se lee la forma sin comprimir; con (17)(10) se recibe **sin foto**. La comprimida no se lee (se dice). |
| NOM-051-SCFI/SSA1-2010 | En México la etiqueta declara «fecha de caducidad» o «consumo preferente», con día y mes (vida corta) o mes y año (vida larga), con abreviaturas (CAD, Cad., Cons. Pref.). | Los dos tipos se distinguen y se dicen en pantalla; mes y año vale hasta el último día del mes. |
| Sistemas de visión en líneas de empaque y WMS con captura por cámara | Leen fechas con OCR especializado y **reglas de formato por SKU**; lo dudoso va a una persona. | El formato se APRENDE por artículo con la primera confirmación; la ambigüedad nunca se resuelve sola. |
| Fotos reales del laboratorio (7) y corpus sintético (60 × 2 tomas) | Ver «Medición». | Motor, cascada, reglas del analizador. |

**Medición (banco `tools/etiquetas-gs1/banco/`, 2026-09-27)** — `node banco/mide-caducidades.mjs`.
Corpus sintético: 12 textos × 5 fondos (blanco, burbuja de aire, líquido oscuro, luz rasante, letra
sólida), tinta de puntos 5×7 con el cero con diagonal, dos tomas por imagen; es **sintético** y
sirve para comparar motores, no para fijar umbrales reales. Corpus real: 7 fotos del laboratorio
(fuera de git; varias de catálogo web, baja resolución), 2 marcadas `por_confirmar` que no cuentan.

| motor | corpus | n | exacta | con opción correcta | ambigüedad marcada | **EQUIVOCADA** | opciones sin la correcta | no leyó | inventada (sin fecha) | sin fecha, correcto | error | lote exacto / equivocado | ms mediana |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qwen-completa | real (foto entera) | 5 | 1 | 0 | 0 | **1** | 0 | 0 | 0 | 3 | 0 | 1 / 0 | 17807 |
| qwen | sintético | 60 | 20 | 2 | 6 | **0** | 1 | 21 | 0 | 10 | 0 | 12 / 20 | 9933 |
| qwen | real (recorte) | 5 | 2 | 0 | 0 | **0** | 0 | 0 | 0 | 3 | 0 | 0 / 1 | 14292 |
| rapidocr-2tomas | sintético | 60 | 6 | 3 | 5 | **0** | 0 | 36 | 0 | 10 | 0 | 7 / 3 | 3151 |
| rapidocr-cascada | sintético | 60 | 25 | 4 | 15 | **0** | 2 | 4 | 0 | 10 | 0 | 26 / 9 | 1526 |
| rapidocr-cascada | real (recorte) | 5 | 2 | 0 | 0 | **0** | 0 | 0 | 0 | 3 | 0 | 0 / 1 | 992 |
| rapidocr-completa | real (foto entera) | 5 | 2 | 0 | 0 | **0** | 0 | 0 | 0 | 3 | 0 | 0 / 0 | 952 |
| rapidocr-producto | sintético | 60 | 13 | 17 | 15 | **0** | 2 | 3 | 0 | 10 | 0 | 18 / 4 | 5691 |
| rapidocr-producto | real (recorte) | 5 | 2 | 0 | 0 | **0** | 0 | 0 | 0 | 3 | 0 | 0 / 1 | 1674 |
| rapidocr-puntos | sintético | 60 | 25 | 4 | 15 | **0** | 2 | 4 | 0 | 10 | 0 | 25 / 9 | 1484 |
| rapidocr-puntos | real (recorte) | 5 | 0 | 0 | 0 | **0** | 0 | 2 | 0 | 3 | 0 | 0 / 0 | 831 |
| rapidocr | sintético | 60 | 6 | 0 | 4 | **0** | 0 | 40 | 0 | 10 | 0 | 7 / 4 | 1625 |
| rapidocr | real (recorte) | 5 | 2 | 0 | 0 | **0** | 0 | 0 | 0 | 3 | 0 | 0 / 1 | 1105 |
| tesseract-puntos | sintético | 60 | 9 | 12 | 7 | **0** | 0 | 22 | 0 | 10 | 0 | 4 / 11 | 351 |
| tesseract-puntos | real (recorte) | 5 | 0 | 0 | 0 | **0** | 0 | 2 | 0 | 3 | 0 | 0 / 0 | 348 |
| tesseract | sintético | 60 | 5 | 0 | 3 | **0** | 1 | 41 | 0 | 10 | 0 | 5 / 0 | 438 |
| tesseract | real (recorte) | 5 | 0 | 0 | 0 | **0** | 0 | 2 | 0 | 3 | 0 | 0 / 0 | 236 |

Cómo se lee: «EQUIVOCADA» = se propuso UNA fecha y no era (la peligrosa); «con opción correcta» y
«ambigüedad marcada» = la persona elige entre opciones y la buena está; «inventada» = propuso algo
en una foto sin fecha. `rapidocr-producto` es la cascada que usa la app (`leeYPropone`) con DOS tomas
en el sintético y una en el real. Latencia: mediana en CPU (WSL2, sin GPU), incluye lanzar el proceso.

- **Ningún motor inventó una fecha** en las 13 fotos sin fecha (10 sintéticas, 3 reales). Qwen, con
  la foto entera, sí devolvió números que no están en la foto («20240202») o la clave del
  proveedor; el analizador no los aceptó (cifras sin rótulo no son fecha).
- **La única propuesta equivocada es de Qwen con la foto entera**: la lata «14/06/26» leída
  «14.06.28», fecha válida y plausible. Recortada, la leyó bien. Por eso se lee el recorte.
- **Tesseract** no lee la tinta de puntos (41/60 sin leer) ni las fotos reales (0 de 2); uniendo
  puntos lee 9. Antes de las reglas de rótulo y ventana de años, esa variante proponía **10 fechas
  equivocadas** (medido en la primera corrida: años 2827, fechas armadas con el lote); con las
  reglas, 0.
- **RapidOCR** tal cual lee la letra sólida y las fotos reales (2 de 2); uniendo puntos lee la
  tinta de inyección (25 exactas + 15 ambigüedades marcadas) pero estropea las fotos reales (0 de
  2). La cascada se queda con lo mejor de las dos.
- **El cotejo de dos tomas cuesta clics, no errores**: de 25 exactas con una toma pasa a 13 exactas +
  17 con opción, porque la segunda toma (girada y con más ruido) lee distinto y entonces no se
  propone una sola. Con una toma ya había 0 equivocadas en el sintético; se mantiene el cotejo porque
  un clic cuesta menos que una fecha mal leída en el anaquel, y la medición en uso dirá si conviene
  relajarlo.
- **El lote falla más que la fecha** (Qwen 20 lotes equivocados en 60; RapidOCR 4 en la cascada,
  la «A» de Abuelita como «H» en la real): se confirma igual que la fecha.
- Lo que falta medir en real: fotos de celular del andén a resolución normal (las 7 reales son
  miniaturas; 2 están `por_confirmar` y no cuentan). Los umbrales no se fijan con este corpus.

**Decisiones**

| Decisión | Por qué |
|---|---|
| **Motor: RapidOCR (PP-OCRv4 en ONNX Runtime, CPU) por proceso local**, versiones exactas en `motores/requirements-rapidocr.txt` | Medido: es el único que lee la tinta de puntos (uniendo puntos) Y las fotos reales, con 0 propuestas equivocadas y 0 inventadas, en 1-6 s. Tesseract casi no lee la tinta de puntos ni las fotos reales; Qwen2.5-VL 3B lee bien recortado, pero con la foto entera propuso una fecha equivocada y tarda 10-18 s por imagen en CPU (y sería C8: es un modelo de lenguaje). RapidOCR no es un modelo de lenguaje: no pasa por C8. |
| **Cascada**: recorte tal cual → uniendo puntos si no vio fecha → foto entera si ninguna toma vio nada | Medido: los puntos unidos salvan la tinta de inyección y estropean la letra sólida; la foto entera ayuda con miniaturas que el motor detecta solo. `leeYPropone` es la misma función en la app y en el banco. |
| **No se reusa `MotorOcr` del extractor**: se reusa su patrón | Aquel devuelve páginas con campos para documentos; esto, líneas con su caja de un recorte chico. Reusar el puerto obligaba a depender de otra herramienta para un contrato distinto. Sí se reusó: proceso por lectura, directorio temporal borrado siempre, modelo pineado, errores sin el texto leído, confianza que no decide nada. |
| **El analizador decide, el motor transcribe** (`fechas-impresas.ts`) | Cifras sin rótulo no son fecha (la clave del proveedor también son cifras); el rótulo vale si no hay otras cifras entre él y la fecha; año fuera de ventana no se propone; un día imposible se marca y, si cambiando UNA cifra 8/9/6 por 0 sale una sola fecha, se sugiere (cero con diagonal). |
| **Dos tomas se cotejan** | Si no dicen lo mismo, `discrepancia`: se enseñan las dos y no se propone ninguna. El lote se compara carácter por carácter. |
| **`EN_REVISION` en la cadena, antes de que la persona decida** | La propuesta queda anclada: no se puede reescribir después para que parezca que la máquina acertó (probado: alterar la propuesta rompe el hash en esa secuencia). Su clave es el folio, sin caducidad; no mueve existencias. La resuelve un `RECIBIDO` (o `RECHAZADO`) con `revision` = su hash; «otra foto» abre un `EN_REVISION` que la `reemplaza`. |
| **Confirma quien registró** | Lo exige el núcleo y la base (trigger). Si esa persona no puede, otra la descarta con motivo y se registra de nuevo. |
| **`corregida` la calcula el servidor** | Compara lo confirmado con la propuesta guardada en la cadena; el navegador no puede decir «tal cual». |
| **Pendiente = no es inventario** | No está en existencias, FEFO ni semáforo; mover, vender o transferir ese artículo en el sitio devuelve «caducidad por confirmar: N cajas… (hace X)». |
| **Fotos por huella, fuera de la cadena** | Se normalizan en el servidor (sharp: orienta, reduce a 2000 px, **quita EXIF y GPS**) y se guardan en `ETIQUETAS_DATOS/fotos/` por su SHA-256; la cadena cita la huella. Un SVG, un HTML o lo que no tenga firma de imagen se rechaza por sus bytes; se sirven con `nosniff` y `sandbox`, pedidas con el código del dispositivo. |
| **Carga masiva por nombre de archivo** (`SKU.jpg`, `SKU-caja.jpg`) | El servidor nunca descarga URLs (SSRF) y la foto no sale de la red de quien la sube. |
| **Formato aprendido por artículo** | La primera confirmación que elige una lectura fija el formato (p. ej. DDMMAA); la siguiente sale sin ambigüedad, y se sigue confirmando. |
| **Dónde viene la caducidad** | Una foto y una nota por artículo (vista `caducidad`); la primera persona que la encuentra la guarda al confirmar y las siguientes la ven antes de buscarla. |
| **Motor externo: no existe** | La herramienta no trae ningún adaptador que saque la foto (C4). Conectar uno es decisión de flujo de datos y, si es un modelo de lenguaje, pasa por el routing (C8) y la contabilidad. |

**Dónde viven y cuánto se retienen las fotos.** En `ETIQUETAS_DATOS/fotos/<2 cifras>/<huella>.jpg|png`,
junto al estado (misma política de respaldo: inventario de BUSINESS_LOGIC.md §4). Las que cita la
cadena (evidencia de una recepción o de una corrección) viven lo que el expediente: la cadena es
solo-agregar, así que en la práctica se conservan; las de la ficha, mientras estén en el historial.
Solo las que nadie cita (una subida que no se usó) pueden podarse con `poda(huellasReferidas(e), fecha)`;
**no hay un job que lo haga solo**: borrar es irreversible y queda como gate humano (y como job de
plataforma declarado, C7, en el ERP). Tamaño medido: ~150-300 KB por foto normalizada.

**Instalación en un sitio**

1. `bash tools/etiquetas-gs1/motores/instala-rapidocr.sh /opt/etiquetas/rapidocr` en el servidor de
   la app (Python 3.11 aislado, versiones exactas, modelos dentro del paquete: nada se descarga al
   leer) y `ETIQUETAS_MOTOR_PYTHON=/opt/etiquetas/rapidocr/bin/python`. Sin él, la recepción
   funciona igual pero sin propuesta: se teclea y la foto queda como evidencia.
2. La cámara del celular exige https (o localhost), como la del lector.
3. Respaldar `ETIQUETAS_DATOS/fotos/` con `estado.json`.
4. Documentar, artículo por artículo, dónde viene la caducidad (se hace solo al confirmar).

**El andén.** La subida reintenta cuatro veces con espera creciente y dice en pantalla qué intento
va («Subiendo foto 1 de 2 · intento 3…»); la foto sigue en el equipo mientras la página esté
abierta. **No hay cola que sobreviva a recargar la página** (IndexedDB + reintento en segundo
plano): queda pendiente, dicho aquí en lugar de a medias.

**ERP (propuesta, no aplicada)**: `eti_foto` (metadatos por huella; los bytes en un almacenamiento
de objetos privado), `eti_articulo_foto` y `eti_formato_fecha` (solo-agregar), `EN_REVISION` en
`eti_evento` con caducidad nula solo para la revisión, un trigger que exige la foto, que la
confirme quien registró y que se resuelva una vez, y la vista `eti_revision_abierta`. Validado en el
Postgres 17 efímero, pruebas (m) a (p), dos instalaciones seguidas. 004 debe listar también las
tres tablas nuevas.

**Formas en que esto podría estar mal o incompleto, y qué se hizo**

| Riesgo | Qué se hizo | Queda |
|---|---|---|
| La máquina propone una fecha equivocada con confianza alta | Nada cuenta sin confirmación humana (límite de C5: el daño sería de quien compra); ventana de años, calendario, cotejo de dos tomas, aviso de vida útil. | La tasa real de «equivocada» solo se sabe con fotos reales en uso: la bandeja mide confirmadas tal cual contra corregidas por motor y formato. |
| El motor inventa en una foto sin fecha | Medido: RapidOCR 0 de 3; y el analizador no acepta cifras sin rótulo. | — |
| Ambigüedad resuelta en silencio (03/04, 241123) | Se enseñan las opciones; el formato se aprende solo cuando una persona elige. | Un formato aprendido mal elegido se arrastra: se ve en la ficha y se cambia con la siguiente confirmación. |
| El lote se lee mal (A/H, 2/3) | El lote se confirma igual que la fecha; las tomas se comparan carácter por carácter y se avisa. | El lote no tiene dígito verificador: solo la persona lo valida. |
| Alguien confirma por otro | Núcleo y base exigen el mismo seudónimo. | La identidad sigue siendo «código del dispositivo + nombre declarado» (§5, riesgo 18). |
| Se borra una revisión pendiente del almacén | Es un evento de la cadena: se delata como cualquier borrado (ancla y testigos). | — |
| Esquivar la foto con el etiquetado manual (`etiquetado`) | Sigue existiendo: teclear la fecha es una confirmación humana. | No se bloquea el etiquetado de un artículo con revisión abierta: se podría registrar dos veces lo mismo. |
| La foto completa captura a una persona | La guía encuadra la fecha; lo que se lee es el recorte. | La foto completa se guarda como evidencia: si capta a alguien, es dato personal dentro de lo inmutable (su huella en la cadena; la foto se puede quitar del almacén, y la cadena seguiría verificando). |
| Tamaño de las fotos | 2000 px JPEG q85 (~150-300 KB). | Sin poda automática (gate humano). |
| El motor falla o no está | La recepción sigue: sin propuesta, se teclea; el error se dice sin el texto leído. | — |
| Corpus sintético optimista | Se dice en cada tabla; los umbrales no se fijan con él. | Medir con fotos de celular reales del andén (resolución normal, encuadradas). |
| Códigos que no se leen | Digital Link comprimido (se dice «no es GS1 Digital Link»); UPC-E sin expandir (da «el dígito no cuadra»: la pistola debe mandarlo expandido a UPC-A); la cámara no busca GS1 DataBar (por pistola con `]e0` sí se lee, es GS1). | Añadir DataBar a la cámara si un proveedor lo usa. |

## 12. Escanear por zona, rondas del día y conteo cíclico (`/etiquetas/escanear`, `/etiquetas/dia`)

Spec: `docs/goals/escaneo-por-zona-y-rondas.md`. Pantallas: `/etiquetas/escanear` (el día con el
celular) y `/etiquetas/dia` (el supervisor); `/etiquetas/conteo` muestra las ubicaciones del cíclico.

**Decisión del laboratorio**: cuenta el ALMACENISTA, a ciegas; el SUPERVISOR abre, concilia y
autoriza. Nadie autoriza lo que contó. Consecuencia: el almacenista **no recibe cantidades del
sistema en ninguna respuesta** (estado, escaneos, ronda, conteos, pieza suelta). Le basta el lote,
dónde está y su semáforo.

**Lo que se investigó y cómo cambió el diseño**

| Fuente | Qué hace | Qué decidió aquí |
|---|---|---|
| SAP EWM (conteo cíclico por ubicación, intervalos por clase ABC) | Cuenta pocas ubicaciones al día según su clase, no el almacén entero. | `conteo-ciclico.ts`: 3 ubicaciones al día por **riesgo** (caducidad, diferencias previas, faltante repetido, volumen, días sin contar), con la razón escrita. A falta de precio, el volumen hace de «valor». |
| Odoo (frecuencia de conteo por ubicación) | La ubicación lleva su frecuencia y su último conteo. | La vista `eti_ubicacion_conteo` del ERP da último conteo y conteos con diferencia por ubicación. |
| Tareas dirigidas (Zebra Workcloud y WMS con «task interleaving») | Lista de tareas por recorrido, cerradas por escaneo, con escalamiento de lo atrasado. | `rondas.ts`: la ronda se genera una vez por sitio y día del estado, se congela, va en orden de recorrido (recibo → almacén → piso → merma) y cada tarea se cierra con el escaneo que la prueba (`TAREA_CERRADA`). Lo atrasado pasa a aviso alto del supervisor. |
| UX de escaneo continuo en celular | Respuesta a pantalla completa por color, háptica y sonora; una mano. | Destello de 1,6 s con el color del semáforo o del resultado, vibración y tono distintos para bien, aviso y error; contador de la sesión; «deshacer». |
| Offline-first en navegador | IndexedDB + reintento; llave de idempotencia para no aplicar dos veces. | `cola.ts`: el escaneo sin señal se guarda con su `idCliente` y su contexto de zona, se sube en orden al volver, y el servidor guarda la respuesta por `idCliente` (1000 últimas). |

**Arquitectura**

- Núcleo (`tools/etiquetas-gs1/src/`), puro y probado con `node --test`:
  - `escaneo.ts`: `ejecutaEscaneo` (la acción de la zona según el rol), `vistaSinCantidades`, `deshazMovimiento`;
  - `rondas.ts`: `generaRonda`, `estadoDeTareas`, `aseguraRonda`, `avanceDeRonda`;
  - `conteo-ciclico.ts`: `eligeConteoCiclico`; `conteo.ts` gana `ubicaciones` y `vistaConteoSinCantidades`;
  - `pieza-suelta.ts`: `identificaPieza` y `registraHallazgo` (evento `HALLAZGO`);
  - `dia.ts`: `diaDelSitio` (tablero y avisos del supervisor).
- App: `servidor/acciones-zona.ts` (escanea, deshaz, ronda, dia, identifica-pieza, registra-hallazgo),
  `servidor/roles.ts` (cuatro roles), `services/cola.ts`, `hooks/use-zona.ts` y las pantallas.

**Roles (los decide el servidor por el código del dispositivo)**

| Rol | Variable | Zonas | Qué puede pedir |
|---|---|---|---|
| operación (supervisor) | `ETIQUETAS_TOKEN` | todas | todo: abre y concilia conteos, autoriza, ve el día |
| recibo | `ETIQUETAS_TOKEN_RECIBO` | recibo | escanear, recibir (directo o con foto), confirmar, vincular códigos |
| almacenista | `ETIQUETAS_TOKEN_ALMACEN` | almacén, piso, merma | escanear, deshacer, ronda, pieza suelta, hallazgo, contar a ciegas |
| conteo | `ETIQUETAS_TOKEN_CONTEO` | — | solo contar |

El menú de cada rol solo enseña lo suyo y recibo y almacenista entran directo a «Escanear»; pero la
frontera es el servidor: fuera de la lista es 403, y una zona que no es del rol se rechaza aunque la
pantalla la mande (probado en `pruebas/zonas-app.ts`).

**Qué hace cada escaneo**

| Zona | Lo escaneado | Resultado |
|---|---|---|
| cualquiera | etiqueta (414)(254) de zona o rack | fija el contexto (se olvida a los 30 min sin escanear) |
| recibo | GS1-128 / DataMatrix / Digital Link con (17)(10) | recibido directo (regla 2/3 incluida) |
| recibo | EAN/UPC/ITF del proveedor | la recepción con foto AHÍ MISMO (§11), sin cambiar de pantalla |
| almacén | caja que viene de recibo | entra (y se ubica en el rack del contexto); cierra «ubicar» |
| almacén | caja ya en almacén | lote, semáforo, rack y «baja primero ése» si otro vence antes |
| piso | caja en rojo o vencida | RETIRA todas sus cajas de piso (rojo → almacén, vencido → merma); cierra «retirar» |
| piso | caja de almacén | sube (aviso FEFO); cierra «resurtir» / «promover» |
| piso | caja ya en piso | ¿se vende? con el color; naranja cierra «promover»; si la ronda pide resurtir ese lote y quedan cajas arriba, baja otra |
| piso | EAN de una pieza suelta | foto de su fecha → lote identificado, o HALLAZGO |
| merma | caja | baja con su motivo (vencido no lo pide) |

**Medición de agilidad** — Playwright en celular (390×844), Sucursal Centro, semilla ficticia.
Toque = click, elegir en una lista o escribir un valor; escaneo = una lectura; pantalla = una ruta
abierta. Cada «después» empieza sin zona recordada (cuenta el escaneo de la etiqueta de la zona):
es el peor caso.

| Tarea | Antes (pantallas de hoy) | Después («Escanear» por zona) |
|---|---|---|
| Recibir una caja con (17)(10) | 2 toques · 1 escaneo · 1 pantalla | 0 toques · 2 escaneos · 1 pantalla |
| Retirar de piso un lote en rojo | 3 toques · 1 escaneo · 2 pantallas | 0 toques · 2 escaneos · 1 pantalla |
| Resurtir en orden FEFO | 2 toques · 1 escaneo · 2 pantallas | 0 toques · 2 escaneos · 1 pantalla |
| Contar (inventario ciego) | 27 toques · 25 escaneos · 2 pantallas | 15 toques · 14 escaneos · 2 pantallas |

Los escaneos de «después» incluyen la etiqueta de la zona (uno por cambio de zona, no por tarea).
«Antes» de retirar hay que decir cuántas cajas hay en piso (se ve en el tablero): «después», el
escaneo retira todas y el almacenista no necesita saber cuántas. En contar, casi todos los toques
son «cajas por lectura»; el ahorro viene de contar solo las ubicaciones de riesgo del día (3) y no
la zona entera, y de abrirlo con un toque desde el día.

Lo que la tabla no dice: «antes» la persona además tenía que SABER qué retirar o resurtir (lo veía
en el tablero y lo recordaba al ir a mover); «después» la ronda se lo dice y se cierra sola.

**Formas en que esto podría estar mal o incompleto, y qué se hizo**

| Riesgo | Qué se hizo | Queda |
|---|---|---|
| Una cantidad del sistema se cuela al almacenista (un texto de error, un campo nuevo) | Vistas por lista blanca (`vistaSinCantidades`, `vistaConteoSinCantidades`, `lotesSinCantidad`), textos pasados por `sinCantidades`, y una prueba de app con un lote CENTINELA de 137 cajas: ese número no aparece en ninguna respuesta del almacenista (estado, escaneos, deshacer, ronda, conteos) y el supervisor sí lo ve. | Un campo nuevo que alguien agregue sin pasar por la lista blanca: la prueba del centinela lo atrapa si lleva el número. |
| El almacenista deduce cantidades («todas» sube 137 y ve cuánto bajó) | «Todas» no dice cuántas; lo que ve es lo que él mismo movió físicamente. | Contar con los ojos no se puede impedir: es lo que hace ciego el conteo del sistema, no la bodega. |
| El rol lo decide el navegador | El rol sale del código del dispositivo en el servidor (comparación en tiempo constante; un código repetido vale solo el rol de más poder). | La identidad sigue siendo débil (§5, riesgo 18): código compartido por dispositivo + nombre declarado. |
| Una tarea se da por hecha sin hacerla | No hay botón «hecho»: la cierra un `TAREA_CERRADA` con el escaneo del lote correcto en la zona correcta; en la base, el trigger exige que la tarea exista en la ronda, que el lote sea el suyo, que la acción esté en la cadena y que no se cierre dos veces. | Escanear el lote correcto sin haberlo movido de verdad (la etiqueta en la mano, la caja en su lugar): el conteo cíclico es el que lo destapa. |
| Deshacer borra historia | Deshacer = `CORRECCION` con `deshace`, solo el propio movimiento y dentro de 15 min, sin nada posterior sobre ese lote; la tarea se reabre. | — |
| La ronda cambia a media mañana | Se congela al generarse (con la cabeza de la cadena de ese momento); lo que ya no aplica se calcula con su motivo, no se reescribe. | Lo que aparece DESPUÉS de generarla (un lote que entra hoy a rojo) no entra a la ronda de hoy: lo avisa el tablero del día («entró hoy a rojo»). |
| Selección del cíclico injusta u opaca | Regla determinista con sus razones escritas en la tarea y en la pantalla del contador. | Sin precio en el sistema de etiquetas, «valor» es volumen; con el ERP integrado, usar costo. |
| Nadie autoriza lo que contó | Núcleo: el autorizador no puede ser quien contó ni recontó (capturado: autorizar con el almacenista que contó se rechaza). | — |
| La cola sin señal aplica dos veces o fuera de orden | `idCliente` por escaneo y respuesta guardada en el servidor; subida en orden; lo que el servidor rechaza se dice y sale de la cola. | Solo se encolan escaneos: las fotos (pieza suelta, recepción) necesitan señal. La cola vive en el navegador de ese equipo; si se borra el almacenamiento antes de subir, se pierde (se ve «por subir»). Sin Service Worker: la página tiene que estar abierta para subir. |
| La cola se queda con escaneos de alguien que ya no está | El contexto de zona caduca a los 30 min; la cola no caduca (se sube cuando haya señal). | Un escaneo viejo puede ya no aplicar: el servidor lo decide contra el estado de ese momento y lo dice. |
| Un artículo cambia de GTIN (medido en las capturas: el flujo 30 vincula el ITF-14 del proveedor y sustituye la caja interna de la leche) y las cajas con la etiqueta vieja se vuelven invisibles | **Resuelto (decisión del laboratorio, 2026-09-28): el catálogo recuerda los GTIN anteriores.** La fuente es el libro de asignaciones (solo-agregar), que ya guardaba el `anterior` de cada sustitución: `identificaGtin` da el artículo del código vigente o del anterior, el escaneo y el lector dicen «código ANTERIOR», el conteo lo acepta, el FEFO, el «baja primero» y el agente comparan por ARTÍCULO (lote viejo y nuevo juntos), las ventas del ERP con el código viejo son del artículo, y la ficha y la exportación los enseñan. Un código anterior no se le da a OTRO artículo sin decisión de catálogo (importación y vínculo lo detienen; en el ERP, un trigger). Pruebas: `pruebas/codigos-anteriores.ts` (5) y (u) en el Postgres efímero; captura 45. | Si por decisión de catálogo otro artículo toma ese código, el vigente gana y las etiquetas viejas del primero se leen como el nuevo dueño: por eso se detiene y lo decide una persona. Un GTIN del fabricante que él mismo reasigna años después se trata igual. |
| Pieza suelta con fecha mal leída | La identificación es una propuesta: se pide confirmarla con la pieza en la mano; si no cuadra es HALLAZGO (con la foto), no un ajuste. | El hallazgo no mueve inventario: lo resuelve el supervisor (recepción, corrección o merma). |
| Avisos fuera de la app | No se hicieron: web push pasa por servidores ajenos (C4). Los avisos viven en `/etiquetas/dia`. | Web push solo con contenido sin datos del negocio y como decisión aparte. |
| El escaneo del supervisor en piso retira sin querer | Retirar es el escaneo SOLO para rojo y vencido, y se puede deshacer. | — |

**Códigos anteriores en el ERP**: la vista `eti_codigo_anterior` sale de `eti_asignacion` (sin tabla
nueva: no se desincroniza) y el trigger `eti_gtin_no_anterior_de_otro` impide dar a otro artículo un
código anterior; devolvérselo al mismo sí se puede. Prueba (u).

**ERP (propuesta, no aplicada)**: `tools/etiquetas-gs1/migraciones/propuesta-pack-etiquetas-zona.sql`
(va después del pack): `eti_ronda` y `eti_tarea` (solo-agregar; las instrucciones no aceptan
«N cajas»), `eti_dispositivo` (rol de la lista y solo la HUELLA del código; se da de baja, no se
borra), el trigger de `TAREA_CERRADA` y `HALLAZGO`, y las vistas `eti_ronda_avance` y
`eti_ubicacion_conteo`. En el pack, los tipos `TAREA_CERRADA` y `HALLAZGO` entran a la lista única de
`eti_evento` y un hallazgo sin fecha legible va sin caducidad. Validado en el Postgres 17 efímero,
pruebas (q) a (t), dos instalaciones. 004 debe listar también `eti_ronda` y `eti_tarea`.

**Evidencia**: `npm run prueba:etiquetas` (núcleo `pruebas/zonas.ts` + app `pruebas/zonas-app.ts`),
`npm run capturas:etiquetas` (flujos 37 a 44 y la tabla de agilidad al final del output),
`bash tools/etiquetas-gs1/migraciones/prueba-efimera.sh`.
