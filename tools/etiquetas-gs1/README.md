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
| `.` | núcleo: diccionario de AIs, parser (pistola/cámara), validación y combinaciones, fechas, medidas, diseño, ZPL, revisión, catálogo e importación, FEFO, zonas y movimientos (recibo, almacén, piso, merma), rollos y presupuesto, almacén en memoria; **expediente de lote**: SHA-256, JCS (RFC 8785), Merkle (RFC 6962), cadena por sitio, proyección, anclaje, central y agente de riesgo | ninguna |
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
npm run prueba                         # build + node --test pruebas/*.ts (77 pruebas)
npm run demo:manipulacion              # cuatro manipulaciones sobre archivos reales, antes/después y veredicto
bash migraciones/prueba-efimera.sh     # propuesta de tablas para el ERP, en Postgres 17 desechable, (a)…(k)
```

`pruebas/ida-y-vuelta.ts` rasteriza el SVG con el Chromium de Playwright y dibuja el ZPL con
zebrash (motor ZPL local, WebAssembly); los decodifica con zxing y compara contra la cadena.

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

7. **Expediente** (ver `docs/SDD-etiquetas-gs1.md` §10): una llave Ed25519 por sitio en
   `ETIQUETAS_LLAVE_<SITIO>`, el central donde la sucursal no escriba, y un cron nocturno que pida
   el ancla (`{"accion":"ancla"}`) y otro matutino para el agente (`{"accion":"agente"}`).

Variables del servidor de la app: `ETIQUETAS_TOKEN` (≥16), `ETIQUETAS_AGENTE_SECRETO` (≥32),
`ETIQUETAS_DATOS` (carpeta del almacén), `ETIQUETAS_ZONA` (por defecto America/Mexico_City),
`ETIQUETAS_LLAVE_<SITIO>` (llave privada Ed25519 del sitio; nunca se imprime),
`ETIQUETAS_CENTRAL` (archivo del central), `ETIQUETAS_SEMILLA=ficticia` solo para demostración.

## Licencias de terceros

`fuentes/gs1-syntax-dictionary.txt` y `src/diccionario/datos.ts` (generado de él):
GS1 Barcode Syntax Dictionary, © BWIPP, Zint y GS1 AISBL, Apache License 2.0.
