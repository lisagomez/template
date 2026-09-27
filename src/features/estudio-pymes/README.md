# Estudio de marketing (`/estudio`) y aprobación en el celular (`/estudio/aprobar`)

La app del cliente pyme, derivada de las herramientas de `@tu-scope/pymes-marketing`. Usa **solo** lo que
aprobó el laboratorio (la página corre los casos y apaga las secciones que no pasan).

- **Todo lo que sube el cliente se lee en su navegador** (XML, CSV, reseñas): nada llega al servidor.
- **Excepción declarada**: el MP4 de la promo se genera en el servidor LOCAL (`/api/contenido/video`,
  navegador sin ventana + ffmpeg) con la marca y el producto, nunca con datos de clientes. Solo mismo
  origen, entrada validada con Zod, un render a la vez. En producción está bloqueado (PRP-006, fase 10).
- **El estado vive en memoria** (se va al cerrar la pestaña): trae datos de terceros.
- **Aprobar** guarda la huella SHA-256 de lo aprobado; si la pieza cambia, se revoca. Aprobar no publica
  ni sale a la red. El CSV del mes lista lo aprobado para que el dueño suba.

Guía para el dueño: [`docs/GUIA-DUENO-CONTENIDO.md`](../../../docs/GUIA-DUENO-CONTENIDO.md).
Diseño: [`docs/SDD-generacion-de-contenido.md`](../../../docs/SDD-generacion-de-contenido.md).
