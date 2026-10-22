# Rutas públicas al desplegar la app: revisión C3

> **Revisión del 2026-10-02 sobre `main` (`3cd8230`)**, antes del primer despliegue, que es el del
> estudio pymes para su piloto. Sirve para cualquier despliegue de la app. Sigue la estructura de
> `.claude/gobernanza/plantillas/modelo-amenazas.md`. **Recomienda, no apaga nada**: qué se cierra lo
> decide el laboratorio (§4).

## 0. En una línea

Caddy manda todo el dominio a la app, y el proxy de sesión solo cubre el reel. La mayoría de las rutas
se cierran solas en producción, porque el servidor no recibe su token y responden 503. **Dos no se
cierran:** el **puente A2A del extractor**, que queda abierto si `A2A_API_KEY` está vacía, y **el
registro de cuentas con la subida del reel**, que deja a cualquiera llenar el disco del servidor. Otras
dos rutas no tienen guarda y en producción no sirven para nada.

## 1. Lo que hace pública una ruta

- **Solo Caddy publica puertos** (80 y 443) y manda **todo** el dominio a `app:3000` (`Caddyfile`).
  El OCR y el puente de Hermes viven en la red interna (`docker-compose.yml`). Así que toda ruta de la
  app queda en internet, diga lo que diga su comentario.
- **La app solo recibe las variables que le pone `docker-compose.yml`**: Supabase, OpenRouter y la
  llave del puente A2A. No recibe `DICTADO_MOVIL_TOKEN`, `ETIQUETAS_TOKEN` ni las `VENTAS_WA_*`, así
  que esas rutas responden 503 en producción.
  > **Corrección (2026-10-07):** esta premisa **era falsa hasta el #226**. `.dockerignore` dejaba pasar
  > `.env.production`, y el build standalone de Next lo copiaba a la imagen y lo cargaba al arrancar: la
  > app recibía todo lo que hubiera en ese archivo, aunque el compose no se lo diera (PRP-010, H-29).
  > Desde el #226 es cierta, y la vigila `prueba:buzon` (`scripts/buzon/prueba-imagen.mjs`).
- **`src/proxy.ts`** refresca la sesión solo en `/reel`, `/api/reel`, `/login` y `/signup` (también
  nombra `/cuenta`, que hoy no existe). Las demás rutas se protegen solas o no se protegen.
- **Ninguna superficie usa `service_role`** (búsqueda en `src/`; lo vigila además el caso `priv-8`
  del laboratorio pymes). Ninguna página lee el disco.

## 2. Activos, fronteras y atacante

**Activos, por daño:** el disco y la CPU del servidor, que comparten todos los productos (si se
llenan, se cae todo); los documentos que pasarían por el extractor (datos de terceros); las cuentas
y los clips del reel (caras y voces de terceros).
**Fronteras:** todo lo que entra por el dominio público; los archivos subidos; las cabeceras, que
fuera de un navegador se falsifican (`Origin` incluido).
**Atacante relevante:** **O4**, bots y externos: abuso de recursos sin hackear nada. Y **O6**, cuando
una ruta interna queda alcanzable desde fuera.

## 3. Inventario

| Ruta | Qué hace | Guarda | En producción hoy | Riesgo |
|---|---|---|---|---|
| `POST /a2a`, `GET /.well-known/agent-card.json`, `GET /a2a/health` | puente JSON-RPC al extractor documental | `A2A_API_KEY` **solo si está definida**: vacía, no pide nada (`src/features/a2a/puente.ts`). `configura:deploy` solo informa si está «ausente» | **abierta** si falta la llave. Con el perfil `ocr` levantado, cualquiera manda documentos al OCR (~110 s de CPU por página). La tarjeta publica el nombre interno `http://app:3000` | **Alto.** El contrato del extractor y el propio `docker-compose.yml` dicen «solo red interna», y nada lo hace cumplir |
| `/signup` y `/login` (acción de servidor) más `POST /api/reel/proyectos` | registro con correo y contraseña; subida de clips de hasta 200 MB | sesión, mismo origen y RLS. Si el registro está abierto lo decide la configuración de Supabase Auth, **que no se ve desde el código** | quien abra una cuenta sube clips. **El bruto se guarda en disco antes** de saber si hay otro en proceso, y se queda aunque falle. El límite es por proceso, no por usuario ni por día (brecha ya declarada en el contrato del reel). El render del reel en producción está bloqueado hasta su fase 16, y el archivo se guarda igual | **Alto.** Llenar el disco tumba todos los productos del servidor |
| `GET /api/laboratorio/estado` | estado de los motores de voz | **ninguna** | lanza un proceso de Node (`maquina.mjs`) por petición. La caché de 10 s solo vale si sale bien, y en producción no hay motores: falla y vuelve a lanzar en cada petición | **Medio-bajo** (un proceso por petición) |
| `GET/POST /api/dictado` | habla con el dictado en `127.0.0.1:47124` | **ninguna** | dentro del contenedor no escucha nadie: responde «desconectado». En una máquina con el dictado corriendo, el `POST` enciende o apaga el micrófono sin credencial | **Bajo** en el servidor; es una ruta local por diseño |
| `POST /api/contenido/video` | render de la promo del estudio | sin cuenta; `Origin` del mismo sitio (falsificable fuera de un navegador), Zod y un render a la vez | **501**: la imagen no trae Chromium ni ffmpeg | **Bajo** hoy. **Medio** el día que llegue la fase 10: ~18 s de CPU por petición sin cuenta |
| `/api/dictado/movil`, `/api/ajustes`, `/api/historial`, `/api/laboratorio/*` (menos `estado`) | dictado, historial y laboratorio de voz | Bearer en tiempo constante; **sin token en el servidor, 503** | 503 | **Bajo.** `/api/dictado/movil` lee el cuerpo entero antes de medirlo (tope de 15 MB después): menor |
| `/api/etiquetas`, `/api/etiquetas/fotos*` | etiquetas GS1 | código por rol en tiempo constante; sin `ETIQUETAS_TOKEN`, 503 | 503 | **Bajo** |
| `/api/ventas-whatsapp/*` | webhook de Meta, Flows, pagos, panel, plataforma, pasarela A2A | firma de Meta, tokens por inquilino y tokens A2A firmados; sin configuración, 503 | 503 | **Bajo** hoy. Su goal ya dice que exponerlo es gate humano con C3 y C4 |
| `/api/crecimiento/a2a` y su `/.well-known/agent-card.json` (fila añadida el 2026-10-14, al entrar el crecimiento demostrado) | pasarela A2A del agente `crecimiento-demostrado` | token firmado con pyme y skills; sin `CRECIMIENTO_A2A_SECRETO` ni `CRECIMIENTO_A2A_LLAVE`, 503 (también la tarjeta) | 503: `docker-compose.yml` no le pasa esas variables | **Bajo** hoy. Su contrato dice que exponerla a un partner o a internet es gate humano con C3 y C4 |
| `POST /api/estudio-dashboards` (fila añadida el 2026-10-20, al entrar el Estudio de dashboards; propuesta sin firmar) | lienzo del Estudio: lee la capa semántica (lanza un MetricFlow local por proceso), versiona tableros en `~/.estudio-dashboards/` y, en la acción `instruccion`, llama a OpenRouter con el agente | **sin `ESTUDIO_LABORATORIO=1`, 503** en todas las acciones; la acción que gasta OpenRouter, además, **503 sin `OPENROUTER_API_KEY`** en el servidor y 503 al llegar el lienzo a su tope de US$0.25; mismo origen (`Origin`, falsificable fuera de un navegador), Zod en cada acción y un límite de 20 instrucciones y 240 lecturas por minuto por IP en memoria | 503: `docker-compose.yml` no le pasa `ESTUDIO_LABORATORIO`, y la imagen no trae el entorno de Python de MetricFlow | **Bajo** hoy. **Medio** el día que se encienda fuera del laboratorio: sin cuenta, una página ajena con `Origin` falsificado gasta OpenRouter y CPU; antes de exponerlo hace falta sesión y C3 |
| `/api/reel/[id]/*` | sala, decisiones, consentimientos, archivo | sesión, mismo origen y RLS por dueño | dependen del registro (fila 2) | **Bajo** por sí mismas |
| Páginas (las 33) | la interfaz | ninguna; los datos llegan por las rutas de arriba | `/estudio` y los laboratorios corren en el navegador | **Bajo** |
| `public/` | medios del laboratorio | — | se sirven tal cual. Revisado: clips sintéticos, sin correos ni identificadores | **Bajo** |

## 4. Recomendación: lo que decide el laboratorio

**Lo mínimo antes de desplegar el estudio para el piloto:**

1. **El puente A2A se cierra.** **Aprobado por el laboratorio el 2026-10-02 y hecho en el PR #210**:
   en producción y sin llave falla **cerrado** (503, como el dictado y las etiquetas), el borde no lo
   deja entrar desde fuera (Caddy responde 404 a `/a2a*` y a `/.well-known/agent-card.json`) y la
   llave se compara en tiempo constante. `configura:deploy` avisa que sin llave el puente queda
   apagado y **no deja desplegar** con una llave de menos de 32 caracteres: apagado ya es seguro, y
   la llave corta es lo que abre el puente con algo adivinable. El puente de Hermes lo sigue usando
   por la red interna.
2. **Lo que es local por diseño se apaga en producción**: el reel (`/reel` y `/api/reel/*`) hasta su
   fase 16, `/api/dictado` y `/api/laboratorio/estado`. Propuesta: una lista de
   rutas solo locales que en producción responden 404, en un solo lugar (el proxy) y con su prueba,
   para que una ruta local nueva no salga a internet por olvido.
3. **El registro de cuentas se cierra** en Supabase Auth mientras ningún producto con cuentas corra en
   producción. Hay que **verificar hoy** cómo está: no se ve desde el código.

**Antes de la fase 10 (render en producción):** el video pide cuenta o cupo.
**Cuando el reel salga a producción (fase 16):** cupo por usuario y por día, cuota de disco, y no
guardar el bruto si no se va a procesar.

Si el laboratorio aprueba 1 y 2, son cambios de código con prueba, en un PR aparte. El 3 es
configuración de Supabase y lo hace el laboratorio. Ninguno cambia un modelo, un skill ni un gate, así
que no es CDC. Si se agrega la prueba de las rutas solo locales al `validate`, **eso sí lo es**
(`.claude/gates.json`).

## 5. Lo que esta revisión no cubre

- **La configuración real de Supabase Auth** (registro abierto, confirmación de correo, límites).
- **Hermes y su puente** (perfil `hermes`): tienen su propia revisión.
- **Pruebas contra un servidor desplegado**: no hay ninguno todavía.
- **Dependencias y cadena de suministro** (O5), y cabeceras como la CSP, que Caddy no pone hoy.
