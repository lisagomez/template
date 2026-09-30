# Estudio de marketing (`/estudio`) y aprobación en el celular (`/estudio/aprobar`)

Para el dueño de una pyme: su contenido de redes del mes, hecho con lo que de verdad vende, con su marca y su forma
de escribir, y una lista para aprobar desde el celular. Nada se publica: lo sube él.

## Qué hace

La app del cliente pyme, derivada de las herramientas de `@tu-scope/pymes-marketing`. Usa **solo** lo que
aprobó el laboratorio (la página corre los casos y apaga las secciones que no pasan).

Lo que entrega (guía: `docs/GUIA-DUENO-CONTENIDO.md`):

- **Qué publicar este mes y por qué**, a partir de sus facturas (XML) o del archivo de su caja (CSV).
- **Sus publicaciones ya hechas**, con sus colores y en su forma de escribir, en la medida de cada red; descargas en PNG.
- **Carruseles** de temporada, de un paquete o de tips, y **una promo en video** vertical de 6 segundos sin grabar a nadie.
- **Reseñas, visibilidad en buscadores y anuncios**, cada uno en su sección, si su herramienta pasó el laboratorio.
- **Una lista para aprobar desde el celular** (`/estudio/aprobar`) y el CSV del mes con lo aprobado.

### Qué no hace

- No publica ni programa: aprobar no es publicar.
- No inventa precios ni lo que no sabe: sin precio confirmado, la pieza sale sin precio y avisa.
- No graba personas: el video es de producto, texto y marca.
- No manda lo que sube el cliente a ningún lado (ver «Datos y aprobación»).

## Casos de uso

- **El dueño sube sus facturas o el archivo de su caja**: ve qué empujar, qué mantener, qué conviene poner en paquete y
  qué fechas vienen (Día de Muertos, Buen Fin, quincenas).
- **Quiere sus publicaciones del mes**: las descarga en PNG, en la medida de Instagram, Facebook y el estado de
  WhatsApp, con sus colores.
- **Quiere una promo sin grabarse**: una promo 9:16 de 6 segundos con su marca y su producto.
- **Aprueba desde el celular**: aprobar o pedir cambio pieza por pieza; si la pieza cambia después, la aprobación se
  cancela sola. Al final, el CSV del mes para subir cada pieza él.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines` del template) y la app Next.js del template; usa `tools/pymes-marketing`.
- **Dependencias del sistema**: solo para el MP4 de la promo, Chromium sin ventana (Playwright, dependencia de
  desarrollo) y ffmpeg en el servidor local. Lo demás corre en el navegador del cliente.
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: ninguno. El redactor es el de plantillas: el de LLM no está aprobado por el laboratorio.
- **Variables de entorno**: ninguna propia.
- **Almacenamiento**: nada persistente. El estado vive en la memoria de la pestaña y el render del MP4 usa un
  temporal del servidor que se borra al terminar.
- **Salida del perímetro (C4)**: lo que sube el cliente no llega ni al servidor; el MP4 se genera en el servidor local
  con la marca y el producto, nunca con datos de clientes, y en producción está bloqueado (PRP-006, fase 10).

## Datos y aprobación

- **Todo lo que sube el cliente se lee en su navegador** (XML, CSV, reseñas): nada llega al servidor.
- **Excepción declarada**: el MP4 de la promo se genera en el servidor LOCAL (`/api/contenido/video`,
  navegador sin ventana + ffmpeg) con la marca y el producto, nunca con datos de clientes. Solo mismo
  origen, entrada validada con Zod, un render a la vez. En producción está bloqueado (PRP-006, fase 10).
- **El estado vive en memoria** (se va al cerrar la pestaña): trae datos de terceros.
- **Aprobar** guarda la huella SHA-256 de lo aprobado; si la pieza cambia, se revoca. Aprobar no publica
  ni sale a la red. El CSV del mes lista lo aprobado para que el dueño suba.

Guía para el dueño: [`docs/GUIA-DUENO-CONTENIDO.md`](../../../docs/GUIA-DUENO-CONTENIDO.md).
Diseño: [`docs/SDD-generacion-de-contenido.md`](../../../docs/SDD-generacion-de-contenido.md).
