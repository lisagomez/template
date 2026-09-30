# Etiquetas GS1 y caducidades (`/etiquetas`)

Para el CEDIS y las sucursales de una cadena que controla caducidades: imprimir la etiqueta GS1-128 de cada caja y
tarima, leerla con el celular o la pistola, y saber qué retirar, qué surtir primero y qué pasó con cada lote.

## Qué hace

- **Etiqueta e imprime** (`/etiquetas`, `/etiquetas/impresoras`): arma la etiqueta de la caja o de la tarima, la
  revisa antes de imprimir y la manda a la Zebra por Zebra Browser Print o por el agente del sitio.
- **Lee** (`/etiquetas/leer`): qué producto, qué lote, cuántos días le quedan con semáforo y en qué sitio está; rechaza
  lo que llega con menos vida de la mínima de su categoría (2/3 por defecto).
- **Recibe con foto** (`/etiquetas/recibir`): la mercancía que no trae GS1-128 se recibe por su EAN y una foto de la
  caducidad; la fecha leída es una propuesta hasta que quien registra la confirma o la corrige.
- **Escanea por zona** (`/etiquetas/escanear`, `/etiquetas/dia`, `/etiquetas/mover`): cada escaneo hace lo de esa zona
  para el rol del dispositivo; la ronda del día dice qué retirar y qué resurtir, y el supervisor ve el día del sitio.
- **Cuenta a ciegas** (`/etiquetas/conteo`): el almacenista cuenta sin ver cantidades y el supervisor concilia.
- **Tablero, catálogo, rollos y ajustes** (`/etiquetas/caducidades`, `/catalogo`, `/rollos`, `/ajustes`): el semáforo
  por lote, el alta desde Excel o CSV con asignación de GTIN, el presupuesto de etiquetas, y el prefijo, los sitios y
  los umbrales.
- **Expediente** (`/etiquetas/expediente`, `/riesgo`, `/integridad`): la historia de cada lote en una cadena de hashes
  anclada, el agente de riesgo y la integridad del sitio.
- **Usa solo lo que aprueba su laboratorio** (`/laboratorio-etiquetas`): una pantalla cuya herramienta no está
  aprobada se apaga, con un aviso que lleva al laboratorio.

### Qué no hace

- No usa como dato una fecha leída en una foto sin confirmación humana, ni usa el motor si «Fecha por foto» no está
  aprobada: entonces la fecha se teclea y la foto queda como evidencia.
- No le da cantidades al almacenista en ninguna respuesta: nadie autoriza lo que contó.
- No toca la base de datos compartida: guarda en archivos locales; la integración al ERP es una propuesta de tablas,
  validada y no aplicada.
- No usa las cuentas de Supabase del template: el rol sale del código del dispositivo y el operador es el nombre que
  declara.
- No bloquea imprimir por el presupuesto de rollos: avisa.
- No manda nada a servicios externos por defecto (ver «Salida del perímetro»).

## Casos de uso

- **Recibo del CEDIS** (rol recibo): escanea una caja con (17)(10) y queda recibida; si solo trae el EAN del
  proveedor, la recepción con foto se abre ahí mismo.
- **Piso de venta** (almacenista): escanea una caja en rojo o vencida y el escaneo retira todas sus cajas de piso
  (rojo → almacén, vencido → merma); al resurtir, el aviso FEFO dice qué lote bajar primero.
- **Inventario ciego** (almacenista y supervisor): se cuentan solo las 3 ubicaciones de riesgo del día; el supervisor
  abre, concilia y autoriza.
- **Supervisor** (operación): el día del sitio, la ronda y lo atrasado como aviso alto.
- **Calidad o auditoría**: el expediente de un lote con su cadena, sus anclas firmadas y la integridad; si alguien
  tocó el estado sin evento, la proyección lo delata.
- **Alta de un sitio nuevo**: prefijo GS1, sitios y umbrales, catálogo, impresoras y celulares emparejados (pasos en
  «Instalar en un sitio nuevo» de `tools/etiquetas-gs1/README.md`).
- **Qué cadena la usa primero**: pendiente. Todo lo medido es con datos ficticios (prefijo 952, Sucursal Centro, la
  dulcería de ejemplo del SDD §8); lo decide el laboratorio.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines` del template) y la app Next.js; el núcleo es `tools/etiquetas-gs1`.
- **Dependencias del sistema**: https (o localhost) para la cámara del celular (`npm run dev:movil`); impresoras Zebra
  por Zebra Browser Print (la app de Zebra en el equipo) o por el agente `etiquetas-agente` en la red de las
  impresoras (TCP 9100); para leer fechas por foto, un Python aislado con RapidOCR (`motores/instala-rapidocr.sh` de
  la herramienta). Versiones pineadas del template: `sharp` 0.35.4, `bwip-js` 4.11.4, `@zxing/browser` 0.2.1,
  `read-excel-file` 9.3.10, `write-excel-file` 4.1.1, `zpl-renderer-js` 4.0.0.
- **CPU, GPU y memoria**: la lectura de fecha por foto con RapidOCR en CPU tarda 1-6 s por foto (banco del
  2026-09-27, SDD §11), y la corrida completa del laboratorio unos 9 s con motor y corpus (2026-09-28). CPU y memoria
  del servidor de la app: no medido. GPU: no se usa (no medido).
- **Servicios externos**: ninguno. Browser Print y el agente viven en la red del sitio, no fuera.
- **Variables de entorno**: `ETIQUETAS_TOKEN`, `ETIQUETAS_TOKEN_RECIBO`, `ETIQUETAS_TOKEN_ALMACEN`,
  `ETIQUETAS_TOKEN_CONTEO`, `ETIQUETAS_AGENTE_SECRETO`, `ETIQUETAS_DATOS`, `ETIQUETAS_ZONA`, `ETIQUETAS_LLAVE_<SITIO>`,
  `ETIQUETAS_CENTRAL`, `ETIQUETAS_MOTOR_PYTHON`, `ETIQUETAS_MOTOR_SCRIPT` y `ETIQUETAS_SEMILLA`; el laboratorio,
  además, `ETIQUETAS_CORPUS_REAL`. Sin `ETIQUETAS_TOKEN` el servidor responde que no está configurado.
- **Almacenamiento**: `ETIQUETAS_DATOS` (por defecto `.datos/etiquetas`): el estado en JSON con escritura atómica, las
  fotos por su huella (sin EXIF ni GPS) y el central de anclas (o `ETIQUETAS_CENTRAL`). Lo escribe un solo proceso:
  dos instancias sobre el mismo JSON emitirían el mismo SSCC, y para eso están las tablas del ERP (propuesta). Tamaño:
  no medido.
- **Salida del perímetro (C4)**: nada sale: la lectura de fechas y la vista previa son locales y no hay Supabase.
  Labelary solo si se activa en Ajustes y por uso, con aviso rojo cada vez.

## Cómo está hecha

- `components/`: una pantalla por ruta (`pantalla-*.tsx`) y las piezas que comparten (cámara, pistola, vista de la
  etiqueta, revisión, ronda, pieza suelta).
- `hooks/`: `use-etiquetas.ts` y `use-zona.ts`.
- `services/`: el cliente, la cola de escaneos sin señal (`cola.ts`, con `idCliente` para no aplicar dos veces), los
  esquemas Zod y lo que se presenta en pantalla.
- `services/servidor/`: la puerta (Bearer + operador, y el rol por el código del dispositivo en `roles.ts`), las
  acciones por tema (etiqueta, recepción, zona, conteo, expediente), el almacén, las fotos, la semilla ficticia y el
  veredicto del laboratorio.
- La API es `src/app/api/etiquetas/` (una ruta con Zod en toda acción, y las fotos por huella).

## Pruebas y evidencia

```bash
npm run prueba:etiquetas      # núcleo + app + laboratorio (dentro de validate)
npm run capturas:etiquetas    # capturas de escritorio y celular de cada flujo, y la tabla de agilidad
```

Decisiones, investigación, mediciones y riesgos: [`docs/SDD-etiquetas-gs1.md`](../../../docs/SDD-etiquetas-gs1.md).

## Pendiente

- Probar en físico: Zebra de 203 y 300 dpi reales, Browser Print instalado y pistolas con teclado en español (SDD §7).
- Integrar la identidad con el login y los roles del ERP (hoy, un código por dispositivo y el nombre declarado).
- Aplicar las tablas del ERP: es una propuesta, con gate humano al integrar.
