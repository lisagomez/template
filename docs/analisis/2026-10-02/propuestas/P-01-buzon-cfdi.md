# P-01 · Buzón de CFDI recibidos para el despacho contable

> El contador deja de teclear los CFDI recibidos del mes: los sube una vez, se leen exactos, se
> cotejan y quedan listos para contabilizar. Puntuación 9 · solidez 1 (declarada) · siguiente
> paso: `/spec-generator`.

## Usuario

El contador o administrador de un despacho que lleva la contabilidad de varias pymes mexicanas, y
la persona que opera el extractor. Los proveedores que emitieron cada CFDI son **terceros**: no
eligieron estar aquí.

## La tarea que hoy le cuesta

Cerrar el mes con todos los CFDI recibidos en el buzón, leídos, cotejados y contabilizados. Hoy
los recibidos **entran a mano**: el ERP arranca «por CARGA» y la descarga masiva del SAT queda
condicionada a custodiar las credenciales del cliente (D-21). La calidad del extractor solo está
medida con corpus sintético y sus umbrales no vienen puestos (D-05), y el OCR en CPU es lento
(D-06).

## Cuánto le cuesta

**No medido.** Ninguna fuente tiene las horas de captura de un despacho real ni su tasa de error.
Medirlas es el primer entregable del piloto (P-03).

## Promesa

Un CFDI recibido que llega como XML se lee **exacto** y se coteja contra el cliente del buzón sin
que nadie lo teclee. Un PDF o una foto sin XML pasa por el extractor con confianza por campo, y lo
dudoso va a revisión humana. **No hace:** autenticar el sello (leer bien no es autenticar), ni
descargar del SAT con las credenciales del cliente (vetado, P-07).

## Métrica de éxito

Horas de captura por mes y por cliente, antes y después, en el mismo despacho; y la proporción
de documentos que la regla de completitud del buzón deja «pendiente» al cierre. Referencia: el mes
anterior del mismo despacho.

## Qué se recombina

- `TPL-extractor-documental`: la lectura exacta del XML (skill `lectura-de-comprobante-xml`), el OCR
  con evidencia por campo y la revisión humana.
- `TPL-erp`: el buzón único por cliente (5B.2), con validación determinista de ingesta y la regla
  de completitud al cierre.
- `TPL-grafo-conocimiento` y `TPL-conocimiento`: las banderas 69-B adjuntas con su fuente, sin
  veredicto inventado.
- `TPL-feature-a2a`: el puente por el que Hermes pide la extracción sin tener llaves.
- `TPL-app-base`: cuentas y RLS.
- **Falta construir**: la arista del buzón al extractor (hoy el ERP carga por CLI), los umbrales
  medidos sobre el corpus del despacho, y la salida de `service_role` antes del segundo cliente
  (D-16).

## App o herramienta

Cambia dos contratos que ya existen: el del **ERP agéntico** (5B.2, el buzón) y el del
**extractor documental**. No es un producto nuevo: es la arista que falta entre los dos.

## Amenazas (C3)

Un XML o un PDF del proveedor es entrada no confiable: puede traer contenido que intente mover al
agente que lo lee. La frontera del puente A2A (ningún componente que corre un modelo tiene
credenciales) se conserva.

## Terceros (C4)

Los proveedores y empleados que aparecen en los CFDI. Mitigación: nada sale del perímetro del
despacho (el extractor corre en su VPS) y un campo dudoso nunca se contabiliza sin revisión.

## Fuera de alcance

La descarga masiva del SAT (P-07, vetada), la verificación del sello y la emisión de CFDI.

## Siguiente paso

`/spec-generator`: el QUÉ todavía depende de quién es el primer despacho y con qué corpus (la
pregunta 2 al laboratorio).
