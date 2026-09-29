# Laboratorio pymes (`/laboratorio-pymes`)

Cada herramienta de `@tu-scope/pymes-marketing` probada caso por caso, con datos sintéticos y declarados
(la «Panadería La Espiga» de Puebla no existe). Los casos corren de verdad al abrir la página y en la
suite `npm run prueba:laboratorio-pymes` (dentro de `validate`), que exige que cada caso dé el estado que
declara. **Solo las herramientas con todos sus casos en «pasa» se usan en `/estudio`.**

## Cómo leerlo
- **pasa / falla / no medido**: estado real; «no medido» siempre dice por qué (hoy: el redactor con LLM
  sin llave).
- **Trampa**: el caso pone a prueba un error esperable (dato ausente, texto de terceros con órdenes,
  CSV roto, moneda mezclada, dato personal, texto que desborda, precio sin confirmar, persona en video…).
- **Referencia · actual**: en las piezas visuales, la imagen aprobada junto a la de ahora y el porcentaje
  de píxeles distintos (≤ 1 % = igual; lo que queda es el suavizado de las fuentes).
- **Video**: el MP4 renderizado, su hoja de cuadros y su `ffprobe`.

## Referencias visuales (cambiar el aspecto a propósito)
La huella de cada pieza de referencia vive en `datos/referencias.json` y su imagen en
`public/laboratorio-pymes/referencias/`. Un cambio visual rompe la huella y pone la suite en rojo **a
propósito**. Para aprobarlo:
1. `npm run contenido:referencias` (regenera huellas y PNG con Chromium sin red);
2. mira el diff de las imágenes en el commit;
3. si el video cambió: `npm run contenido:video` (renderiza dos veces y exige la misma huella).

## Archivos
- `services/catalogo.ts` — herramientas y casos; `aprobadas()` decide qué usa la app.
- `services/casos-*.ts` — los casos por herramienta; `services/referencias-visuales.ts` — las piezas de referencia.
- `datos/` — CFDI sintéticos, reseñas, anuncios y sitio de ejemplo; `referencias.json`.
- `components/` — la página: tabla de herramientas, tarjetas, comparación visual.
- `../../../scripts/laboratorio-pymes/` — capturas con Playwright, render de video y referencias.

## Reel del celular (PRP-007)
Cuatro herramientas más: **reel** (7 casos), **privacidad** (8), **tarjetas** (5) y **sala** (7), con las 6 trampas
firmadas (cliente al fondo, ticket con teléfono, precio que no coincide, clip horizontal, música ajena, dos
hablantes) y otras propias (retoma falsa, texto con código, consentimiento vencido, service_role, versión vieja…).
Los casos con motores leen la medición real de `npm run reel:laboratorio` (clips SINTÉTICOS: retratos al óleo de
dominio público y voces Piper locales) y de `npm run reel:rls` (dos cuentas @example.com contra la base); si falta
la medición, el caso dice `no-medido` y no afirma nada.
