# Laboratorio pymes (`/laboratorio-pymes`)

Para el laboratorio: cada herramienta de marketing para pymes probada caso por caso con su estado real, y la puerta
de lo que la app `/estudio` puede usar.

## Qué hace

Cada herramienta de `@tu-scope/pymes-marketing` probada caso por caso, con datos sintéticos y declarados
(la «Panadería La Espiga» de Puebla no existe). Los casos corren de verdad al abrir la página y en la
suite `npm run prueba:laboratorio-pymes` (dentro de `validate`), que exige que cada caso dé el estado que
declara. **Solo las herramientas con todos sus casos en «pasa» se usan en `/estudio`.**

### Qué no hace

- No usa datos reales: todo es sintético y declarado.
- No gasta ni sale a la red con el redactor con LLM: su corrida real se hace con firma; aquí queda «no medido».
- No afirma sin medición: si falta la medición de un caso con motores, el caso dice `no-medido`.

## Casos de uso

- **El laboratorio decide qué entra a `/estudio`**: abre la página y ve, por herramienta, qué casos pasan, cuáles fallan
  y cuáles no están medidos y por qué; solo lo que pasa entero se usa.
- **Un cambio visual a propósito**: la suite se pone roja, se regeneran las referencias y se aprueba mirando el diff de
  las imágenes (ver «Referencias visuales»).
- **Antes de integrar**: `npm run prueba:laboratorio-pymes`, dentro de `validate`, exige que cada caso dé el estado que
  declara.
- **Revisar el reel del celular**: las trampas firmadas del PRP-007 contra la medición real de los clips sintéticos.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines` del template) y la app Next.js; usa `tools/pymes-marketing` y `tools/reel`.
- **Dependencias del sistema**: Chromium de Playwright (referencias y capturas, sin red) y ffmpeg con `ffprobe` para
  el video. Los casos del reel leen la medición de `npm run reel:laboratorio`, que necesita los motores de
  `tools/reel`.
- **CPU, GPU y memoria**: no medido para el laboratorio. La del reel, en `tools/reel` (≈ 45–50 s por clip de 25 s).
- **Servicios externos**: ninguno para la página. `npm run reel:rls` habla con la base de Supabase del proyecto, con
  dos cuentas @example.com.
- **Variables de entorno**: `OPENROUTER_API_KEY` solo se mira por presencia, sin leer su valor, para decir por qué el
  redactor con LLM es «no medido»; `reel:rls` lee `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Almacenamiento**: `datos/` (con `referencias.json`) en el repo, y las imágenes y mediciones en
  `public/laboratorio-pymes/` (`referencias/`, `reel/`, `video/`).
- **Salida del perímetro (C4)**: nada con datos de nadie: los datos son sintéticos y las referencias se generan sin red.
  Solo `reel:rls` sale, a la base del proyecto y con cuentas sintéticas.

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
Cuatro herramientas más: **reel** (7 casos), **privacidad** (10), **tarjetas** (5) y **sala** (7), con las 6 trampas
firmadas (cliente al fondo, ticket con teléfono, precio que no coincide, clip horizontal, música ajena, dos
hablantes) y otras propias (retoma falsa, texto con código, consentimiento vencido, service_role, versión vieja, un
corte que parte lo que dijo otra persona…).
Los casos con motores leen la medición real de `npm run reel:laboratorio` (clips SINTÉTICOS: retratos al óleo de
dominio público y voces Piper locales) y de `npm run reel:rls` (dos cuentas @example.com contra la base); si falta
la medición, el caso dice `no-medido` y no afirma nada.
