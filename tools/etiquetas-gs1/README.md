# @tu-scope/etiquetas-gs1

Control de caducidades por etiqueta GS1-128: arma, parsea y valida cadenas GS1 según las
**GS1 General Specifications (Release 26.0)**, genera **SVG** (bwip-js) y **ZPL** (Zebra) que
codifican exactamente lo mismo, revisa la etiqueta antes de imprimir, asigna GTIN con la regla
mixta desde Excel/CSV, calcula el tablero FEFO y trae un **agente local de impresión** (TCP 9100).

Decisiones, investigación y riesgos: [`docs/SDD-etiquetas-gs1.md`](../../docs/SDD-etiquetas-gs1.md).
La app que lo usa: `src/features/etiquetas/` (rutas `/etiquetas/*`).

## Puntos de entrada

| Entrada | Qué trae | Dependencias |
|---|---|---|
| `.` | núcleo: diccionario de AIs, parser (pistola/cámara, **EAN-13/UPC-A/EAN-8/ITF-14 y GS1 Digital Link** además de GS1-128), validación y combinaciones, fechas, medidas, diseño, ZPL, revisión, catálogo e importación, FEFO, zonas y movimientos (recibo, almacén, piso, merma), rollos y presupuesto, almacén en memoria; **expediente de lote**: SHA-256, JCS (RFC 8785), Merkle (RFC 6962), cadena por sitio, proyección, anclaje, central, agente de riesgo e inventario físico (conteo ciego conciliado contra la cadena); **recepción con foto de la caducidad**: analizador determinista de fechas impresas, propuesta que coteja dos tomas, `EN_REVISION` en la cadena, confirmación de quien registró, fotos del artículo y formato aprendido | ninguna |
| `./imagenes` | normalizar fotos (orientar, **quitar EXIF y GPS**, 2000 px) y recortar la guía de encuadre | `sharp` (peer opcional, **inyectado**) |
| `./almacenes/fotos` | fotos por su huella SHA-256 en una carpeta, con poda de lo que nadie cita | Node |
| `./motores/proceso` | motor LOCAL de lectura de fechas: RapidOCR (PP-OCRv4, ONNX, CPU) por proceso | Node + el Python de `motores/` |
| `./firma` | Ed25519 para firmar y verificar anclas | Node (`node:crypto`) |
| `./almacenes/central` | el central de anclas, testigos e incidentes en un archivo JSON | Node |
| `./almacenes/seudonimos` | seudónimos de operador, borrables | Node |
| `./svg` | SVG de la etiqueta | `bwip-js` (peer opcional, **inyectado**) |
| `./navegador` | clientes de Zebra Browser Print y del agente (solo `fetch`) | ninguna |
| `./almacenes/archivo` | almacén en un archivo JSON con escritura atómica | Node |
| `./agente` | agente de impresión + `emiteTicket` para el servidor | Node, `zod` |

El núcleo **no importa nada**; el almacén se inyecta (`AlmacenEtiquetas`), como en
`tools/extractor-documental`.

## Pruebas

```bash
npm run prueba                         # build + node --test pruebas/*.ts (121 pruebas)
npm run demo:manipulacion              # cuatro manipulaciones sobre archivos reales, antes/después y veredicto
bash migraciones/prueba-efimera.sh     # propuesta de tablas para el ERP en Postgres 17 desechable, (a)…(p), y ventas del ERP para el agente (fase 5)
```

`pruebas/ida-y-vuelta.ts` rasteriza el SVG con el Chromium de Playwright y dibuja el ZPL con
zebrash (motor ZPL local, WebAssembly); los decodifica con zxing y compara contra la cadena.

## Recepción con foto de la caducidad

Para la mercancía cuya caja no trae GS1-128 (`/etiquetas/recibir`):

1. se escanea su código (EAN-13, UPC-A, EAN-8, ITF-14);
2. se fotografía dónde viene la caducidad, con guía de encuadre y ráfaga;
3. el motor local propone la fecha y el lote;
4. **quien registra confirma o corrige**, y solo entonces el lote entra con su etiqueta de la casa.

Decisiones, medición de motores y riesgos: [`docs/SDD-etiquetas-gs1.md` §11](../../docs/SDD-etiquetas-gs1.md).

```bash
bash motores/instala-rapidocr.sh <carpeta>     # Python aislado con versiones EXACTAS (requirements-rapidocr.txt)
ETIQUETAS_MOTOR_PYTHON=<carpeta>/bin/python    # en el servidor de la app; sin ella no hay propuesta: se teclea
node banco/sintetico.mjs <carpeta>             # corpus sintético determinista (tinta de puntos, 5 fondos, 2 tomas)
node banco/mide-caducidades.mjs --real <carpeta-real> --sintetico <carpeta> --salida medicion.md
```

## Escanear por zona, rondas y conteo cíclico

El día con el celular sin navegar menús (`/etiquetas/escanear`): se escanea la etiqueta de la zona
y cada escaneo hace lo de esa zona para el rol del dispositivo (lo decide el servidor). La ronda
del día sale del estado (`generaRonda`) y cada tarea se cierra con su escaneo (`TAREA_CERRADA`); el
conteo cíclico elige pocas ubicaciones por riesgo (`eligeConteoCiclico`) y lo cuenta el
almacenista a ciegas (`vistaSinCantidades`, `vistaConteoSinCantidades`). La pieza suelta de piso
se identifica por la foto de su fecha (`identificaPieza`) o queda como `HALLAZGO`.

Roles, decisiones, medición de agilidad y riesgos: [`docs/SDD-etiquetas-gs1.md` §12](../../docs/SDD-etiquetas-gs1.md).

## Instalar en un sitio nuevo

1. **Prefijo de empresa**: en `/etiquetas/ajustes`, el GCP del certificado de GS1 México. Sin él
   no se numera marca propia ni SSCC. Nunca uno ajeno; el 952 es solo para pruebas.
2. **Sitios y umbrales**: alta del CEDIS y sucursales; fijar con calidad los días de alerta,
   retiro y mínimo de recepción por categoría (los de fábrica son **ejemplos**).
3. **Catálogo**: bajar la plantilla (Excel o CSV) en `/etiquetas/catalogo`, llenarla, subirla,
   revisar el diff y aplicar. Columna GTIN **como texto** en Excel.
4. **Impresoras**: un perfil por Zebra (dpi, tamaño real, perfil de lector); imprimir la
   etiqueta de calibración, medirla contra el papel y ajustar `^LH`/`^LS`/`^LT`.
5. **Camino de impresión**, uno o los dos:
   - *Browser Print*: instalar la app de Zebra en el equipo; en https aceptar una vez su
     certificado abriendo `https://127.0.0.1:9101/available`.
   - *Agente del sitio*: en un equipo de la red de las impresoras,
     `ETIQUETAS_AGENTE_SECRETO=<32+ caracteres> etiquetas-agente --config agente.json`
     (ver `agente.ejemplo.json`). El MISMO secreto va en el servidor de la app. La URL del
     agente se pone en el sitio (Ajustes → Sitios).
6. **Celulares**: la cámara exige https (o localhost). Emparejar cada equipo con el código
   `ETIQUETAS_TOKEN` del servidor y el nombre de quien opera.

7. **Lectura de fechas** (opcional; ver §11 del SDD): `bash motores/instala-rapidocr.sh /opt/etiquetas/rapidocr`
   en el servidor de la app y `ETIQUETAS_MOTOR_PYTHON=/opt/etiquetas/rapidocr/bin/python`. Las fotos
   viven en `ETIQUETAS_DATOS/fotos/` (por huella, sin EXIF ni GPS): respaldarlas con el estado.

8. **Expediente** (ver `docs/SDD-etiquetas-gs1.md` §10): una llave Ed25519 por sitio en
   `ETIQUETAS_LLAVE_<SITIO>`, el central donde la sucursal no escriba, y un cron nocturno que pida
   el ancla (`{"accion":"ancla"}`) y otro matutino para el agente (`{"accion":"agente"}`).

Variables del servidor de la app: `ETIQUETAS_TOKEN` (≥16, operación), `ETIQUETAS_TOKEN_CONTEO` (≥16,
opcional: dispositivos que solo cuentan y no ven cantidades), `ETIQUETAS_TOKEN_RECIBO` y
`ETIQUETAS_TOKEN_ALMACEN` (≥16, opcionales: recibo, y almacenista que no ve cantidades),
`ETIQUETAS_AGENTE_SECRETO` (≥32),
`ETIQUETAS_DATOS` (carpeta del almacén), `ETIQUETAS_ZONA` (por defecto America/Mexico_City),
`ETIQUETAS_LLAVE_<SITIO>` (llave privada Ed25519 del sitio; nunca se imprime), `ETIQUETAS_MOTOR_PYTHON`
(motor local de fechas, opcional),
`ETIQUETAS_CENTRAL` (archivo del central), `ETIQUETAS_SEMILLA=ficticia` solo para demostración.

## Licencias de terceros

`fuentes/gs1-syntax-dictionary.txt` y `src/diccionario/datos.ts` (generado de él):
GS1 Barcode Syntax Dictionary, © BWIPP, Zint y GS1 AISBL, Apache License 2.0.
