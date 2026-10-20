# Soporte SAP: la mesa de pruebas del experto — Spec

> Compilado el 2026-10-20 con `/goal-compiler`. Forma: **loop**, con paradas en los gates humanos. Decisiones del
> laboratorio de ese día:
> - El objetivo es que el experto ingrese **sus propios casos de uso** para validar su interacción con el agente.
> - El laboratorio **deja de vivir en la máquina del laboratorio**. Se analizó Cloudflare y se recomienda alojarlo ahí,
>   con Containers detrás de Access (ver «EL LABORATORIO ALOJADO»).

## MISIÓN

Cuando termines, un experto SAP (el HIL del laboratorio, N1) entra con su correo, cuando quiera y desde su computadora.
**La máquina del laboratorio puede estar apagada.** Sin que nadie se lo explique, pasa una sesión probando al agente de
Soporte SAP con **sus** casos. Debe ser la mejor mesa de pruebas posible para que un experto de dominio pruebe un
agente: muy visual, intuitiva, y escrita en su idioma de experto SAP, no en el de la gobernanza del laboratorio.

1. **Ingresa un caso como se lo contaría a un colega.** Da el módulo, la transacción, el mensaje de error, el sistema (ECC
   o S/4HANA), el síntoma y lo que ya intentó. Si quiere, añade como evidencia una de las muestras sintéticas.
   - La pantalla lo guía para describir el caso sin datos de clientes ni de personas.
   - Si algo tiene forma de dato personal, se lo dice ANTES de enviar, y le dice por qué.
2. **Ve al agente trabajar paso a paso**, en vivo y en el orden real:
   - lo recibe y lo protege (lo anonimiza o lo manda a cuarentena);
   - lee la evidencia;
   - lo entiende (categoría y prioridad);
   - busca en el conocimiento: una regla con su fuente y su grado, o «no lo sé»;
   - arma el plan y lo lleva a la sala, donde decide una persona;
   - el simulador aplica (antes y después) y el SLA corre.

   Cada paso dice qué entró, qué salió, por qué (la fuente) y cuánto tardó. **Los pasos salen de la cadena de eventos
   real del runtime.** Nada se dibuja aparte, y si el producto cambia, la vista cambia con él.
3. **Ve la solución y decide.**
   - Si hay regla, ve la propuesta con su fuente y, como HIL, la aprueba, la rechaza o la manda a revisión con su motivo.
     Si la manda a revisión, ve la versión corregida.
   - Si el agente no sabe, lo dice con honestidad, y el experto le enseña conversando. El caso ya está en contexto: no
     tiene que escribir un identificador interno. Al final ve la propuesta de regla y de CLI que quedó, y sabe que es
     una **propuesta**: la firma el laboratorio, no él (D2).
   - Si el caso va a cuarentena (RR. HH. o nómina, D14), la pantalla le explica por qué no entra al sandbox y qué sigue
     igual: la atención y el SLA.
4. **Retroalimenta sin fricción.**
   - En cada paso, un gesto (bien o mal) y, si quiere, qué esperaba.
   - Por caso, un veredicto: resuelto, parcialmente, incorrecto, o «debió decir no lo sé». Si el agente se equivocó, da
     la solución correcta.
   - La retroalimentación **es durable**: sobrevive a que el contenedor se duerma, se reinicie o se redespliegue. En la
     siguiente sesión el experto ve sus casos anteriores y lo que dijo de cada uno.
5. **El laboratorio la lee y la usa.** Una vista que **solo abre la identidad del laboratorio** (ni el experto ni un
   invitado) muestra lo que dijo el experto:
   - caso por caso, y en agregado: en qué paso falla más el agente, cuántas veces dijo «no lo sé» y cuántas enseñanzas
     esperan firma;
   - con un export para convertirlo en un PRP o en reglas firmadas.

   Cada número sale de la retroalimentación guardada: ninguno se inventa.
6. **Un kit de una página para el experto y una guía para el laboratorio.**
   - El kit dice cómo entrar, qué probar, qué significa cada paso y qué NO hace la herramienta: no se conecta a su SAP
     (D6), no aprueba sin una persona y no manda lo crudo a un modelo externo (D7).
   - La guía dice cómo invitar al experto y cómo quitarle el acceso, cómo desplegar, cuánto se gasta y dónde leer su
     retro.

## EL LABORATORIO ALOJADO (análisis del 2026-10-20)

**Lo que sube es el laboratorio sintético, no el producto.** El producto, con Supabase y `auth.uid()`, sigue esperando la
lista de salida de la AISIA §5 (GATE 3 y las demás).

**La guarda que lo frena hoy se corrió y está viva.** `node tools/soporte-sap/evidencia/firmas.ts --fila c3-ruta-deploy`
dio verde sin sabotaje y rojo con él. `configura:deploy` rechaza `SOPORTE_SAP_LABORATORIO=1` por dos motivos: las
identidades elegibles y el estado en memoria. Corre en `predeploy` (CDC firmado, H-26). **Esa guarda no se toca:** la vía
de compose y VPS sigue cerrada al laboratorio. La vía nueva tiene que **neutralizar los dos motivos**, no esquivarlos:

- **Las identidades elegibles se acaban en lo alojado.**
  - Cloudflare Access (Zero Trust; el plan gratuito sirve para menos de 50 usuarios) pide el correo y un PIN de un solo
    uso. Al origen le llega la identidad verificada en `Cf-Access-Jwt-Assertion`.
  - El Worker **y** el laboratorio verifican ese JWT (firma, audiencia y caducidad). La identidad sale del correo: el
    experto es experto, el laboratorio es laboratorio y nadie elige.
  - Sin un JWT válido, todo responde como si no existiera.
- **El estado en memoria se declara y se diseña.** El disco del contenedor es efímero: al dormirse, arranca con un disco
  nuevo de la imagen, y el snapshot no guarda memoria ni procesos.
  - El laboratorio sintético se vuelve a sembrar al arrancar.
  - Lo que el experto hizo vive en un almacén durable fuera del contenedor (R2, Durable Objects o D1: lo eliges tú).
  - Ese almacén solo guarda texto que pasó el filtro, y su ubicación se fija en EE. UU.

**Una imagen Docker portable: Cloudflare solo pone la puerta.** Cloudflare Containers corre una imagen OCI normal
(`linux/amd64`), así que el laboratorio es **una imagen Docker** que corre igual con `docker run` en esta máquina, en
Cloudflare o, mañana, en cualquier host:

- **Se construye sobre lo que ya existe**, no desde cero:
  - las guardas del `Dockerfile` de la app: falla con un `.env*` en el contexto, corre sin root, standalone sin código
    fuente, y `NUNCA_EN_LA_IMAGEN` (H-31) en `next.config.ts`;
  - Tesseract como lo instala la imagen OCR del extractor (`tools/extractor-documental/servicio/Dockerfile`):
    `tesseract-ocr`, `-spa` y `-eng` sobre `node:22-bookworm-slim`, **pineada por el mismo digest**. Esa imagen dice que
    cambiar la base es CDC: no metas una base nueva.
- **Se prueba en local antes de pagar.** El recorrido y el OCR de una muestra tienen que pasar contra el contenedor con
  `docker run`. Así sale gratis la duda que la documentación de Cloudflare no responde (si Tesseract corre), y se mide la
  memoria que de verdad pide.
- **Lo propio de Cloudflare queda en el borde**: el Worker, Access y el almacén durable. El almacén se usa por una
  interfaz que tenga otra implementación (por ejemplo, la API S3, que R2 habla), para que la imagen no quede atada al
  proveedor.
- **El candado revisa la imagen**, no solo el script. `revisaImagen` y `revisaConstruible` (`scripts/despacho/reglas.mjs`)
  son el punto de partida.

**Lo medido en la documentación de Cloudflare el 2026-10-20** (vuelve a medirlo antes de pagar):

- Containers es GA desde el 13 de abril de 2026.
  - Exige Workers Paid: US$5 al mes, con 25 GiB-h de memoria, 375 vCPU-min y 200 GB-h de disco incluidos.
  - Más allá de eso cobra US$0.0000025 por GiB-s, US$0.000020 por vCPU-s de uso activo y US$0.00000007 por GB-s.
- Tipos de instancia: `lite` (1/16 vCPU y 256 MiB), `basic` (1/4 y 1 GiB), `standard-1` (1/2, 4 GiB y 8 GB), `standard-2`
  (1, 6 GiB y 12 GB), `standard-3` (2, 8 GiB y 16 GB) y `standard-4` (4, 12 GiB y 20 GB).
  - La imagen debe ser `linux/amd64` y caber en el disco de la instancia.
  - El arranque en frío suele tardar 1–3 s, según la imagen.
- El contenedor no tiene URL propia: todo pasa por un Worker. Cloudflare termina el TLS y **ve el contenido**, a
  diferencia de Tailscale Funnel.
- Ubicación: por defecto, el sitio más cercano a la petición. Se fija con `constraints` (`jurisdiction = "us"` o
  `regions = ["ENAM"]`). No hay un equivalente exacto de `us-east-1`.
- **No está documentado:** si Tesseract corre dentro de la imagen, y qué pasa con la memoria al dormirse. Mídelo.
- Estimado, no cotización: unas 20 h de sesiones al mes en `standard-2` quedan en ~US$5–8 al mes. Un EC2 encendido todo
  el mes cuesta varias veces eso. Mide el tamaño real de la instancia antes de pedir el sí.

**Por qué Cloudflare y no las otras vías:**

| Vía | Lo bueno | Lo que pesa |
|---|---|---|
| **Cloudflare (Access + Worker + Containers)** | Sin servidor que administrar (ni SSH, ni parches, ni root propio); se paga por uso y duerme sin sesión; Access da identidad real por correo, que es la que neutraliza el primer motivo de la guarda | Un tercero nuevo que ve el contenido; el estado es efímero; su vía de deploy no pasa por `configura:deploy`, así que lleva su propio candado |
| AWS us-east-1 (EC2), D12 | El proveedor y la región ya declarados; disco y memoria persistentes | Un servidor que administrar, encendido todo el mes, y la guarda de compose habría que abrirla (CDC) |
| El Hetzner de Hermes y el ERP | Sin contratar | El portero quedaría junto a la producción del ERP y de Hermes, que tienen llaves, con el mismo root. Descartado |
| Cloudflare Tunnel | Gratis | Sigue viviendo en la máquina del laboratorio: no es lo que se pidió |

**Sobre la vitrina de Vercel:** su contrato firmado (revisión 10) sigue en pie. Que su sección en vivo apunte al
laboratorio alojado (la firma HMAC la verifica el Worker en vez del portero), o que se quede con el túnel local, lo
decides tú. La vía que no se use se declara apagada, sin borrarla. El experto no necesita pasar por Vercel.

## LO QUE YA EXISTE (hechos, verificados el 2026-10-20)

- **Dónde se trabaja**:
  - Worktree `/home/gsore/code/template/.claude/worktrees/soporte-experto`, rama `soporte/vista-experto`, creada desde
    `main` (`417bc57`, al día con `origin/main`).
  - `npm ci` y `prepara:gate` ya están hechos (con `npm ci` real, no enlazado).
  - Ya tiene `.vercel/project.json`, copiado del worktree `soporte-vitrina`. Son solo los ids, sin ningún `.env*`, y
    `.vercel` está en `.gitignore`.
- **Cloudflare, nada todavía**: no hay `wrangler`, ni cuenta enlazada, ni menciones en el C3 o en el manifiesto.
- **El agente es determinista, sin modelo.**
  - `respondeHil` (`tools/soporte-sap/src/chat.ts`) reconoce la intención con expresiones (aprobar, enseñar, métrica,
    solución) y consulta `MATRIZ_LABORATORIO`, que es sintética, con `consultaMatriz`.
  - Para enseñar, hoy hay que nombrar la incidencia en el texto y tener el rol `experto`.
  - Con casos propios, lo esperable es mucho «no lo sé»: ese es el camino que más hay que cuidar.
- **El runtime**: `src/features/soporte-sap/services/runtime.ts`. Vive en memoria, con identidades elegibles, el OCR local
  por `child_process` y la cadena de eventos (`anota`). Ya tiene **470 líneas**, así que lo nuevo va en su propio módulo.
  No corre en un Worker sin reescribir un núcleo firmado, y no se reescribe: por eso va en un contenedor.
- **La vista del experto de hoy**: el botón «N1 · Experto HIL» de `/soporte-sap`, con la sala y el chat lado a lado
  (`components/sala-chat.tsx`) y dos sugerencias fijas.
- **La vitrina**: https://soporte-vitrina.vercel.app.
  - Es el proyecto `soporte-vitrina`, en el plan Hobby, con Vercel Authentication en All Deployments.
  - Lo en vivo: la API `/api/vitrina/soporte-sap/en-vivo` firma con HMAC (`vitrina/en-vivo/proxy.ts`) y pasa por el
    túnel (hoy apagado) al portero (`vitrina/en-vivo/portero.ts`).
  - El portero solo deja pasar `/api/soporte-sap` con `rol` y `export`, en JSON y con las muestras, y filtra con
    `datoRealEn` los campos `titulo`, `descripcion`, `texto`, `pide` y `motivo`.
  - El laboratorio local se enciende con `bash scripts/vitrina/en-vivo.sh` (127.0.0.1:3011).
  - El deploy es `bash scripts/vitrina/despliega.sh`, con el candado contra `.env*`. La guía está en
    `docs/VITRINA-SOPORTE-SAP.md`.
- **Lo que ya está en su sitio** (comprobado que existe y con permisos 600, sin leer los valores):
  - `~/.soporte-sap-en-vivo.env` y `~/.soporte-sap-vitrina.env`;
  - Tailscale;
  - Tesseract, en `~/.local/tesseract`.
- **Las muestras**: `tools/soporte-sap/documentos/`. Son tres: `captura-migo.png`, `cfdi-rechazado.xml` y `spool-job.pdf`.
- **Los recorridos y la matriz**:
  - `node src/features/soporte-sap/pruebas/recorrido.mjs <url> <carpeta>`: hoy son 34 pasos.
  - `src/features/soporte-sap/vitrina/recorrido-vitrina.mjs`: corre contra Vercel.
  - La matriz: `node tools/soporte-sap/evidencia/firmas.ts [--fila <id>] [--md docs/goals/soporte-sap-firmas-matriz.md]`.
    Tiene unas 330 filas y entera tarda cerca de una hora.
  - Hay filas que no pueden caer: `c3-ruta-deploy`, `c3-ruta-404*` y `c3-vitrina-sin-laboratorio`. Y está la brecha
    `c3-ruta-sin-autenticar`, que en lo alojado puede pasar a probada.
- **El contrato**:
  - `src/features/soporte-sap/BUSINESS_LOGIC.md` y `productos/soporte-sap.json`, que tiene la lista de terceros que
    reciben datos;
  - la AISIA, `.claude/gobernanza/AISIA-soporte-sap.md` (§1, §4, §5 y la revisión 10, que es la última). La §1 dice hoy
    que el laboratorio no se despliega;
  - el C3, `.claude/PRPs/PRP-008-soporte-sap.md`;
  - el manual, con una sola fuente (`vitrina/contenido/manual.ts`) que genera `MANUAL.md`.
- **Las reglas**:
  - **D2**: el experto valida y el laboratorio firma.
  - Las reglas reales van firmadas en `tools/conocimiento`, y la matriz sintética no se siembra ahí (H-20).
- **El entorno**:
  - El puerto 3000 es de otro proyecto.
  - Playwright corre con la librería del repo y el Chromium de `~/.cache/ms-playwright`; el MCP no tiene Chrome.
  - Docker funciona en local (servidor 29.1.3, comprobado el 20/10) para construir y correr la imagen.
- **Las piezas Docker que ya existen**:
  - `Dockerfile`: la imagen de producción de la app, `node:22-alpine`, en tres etapas. Lleva la guarda contra `.env*`, el
    usuario sin privilegios y el healthcheck;
  - `tools/extractor-documental/servicio/Dockerfile`: el OCR con Tesseract, sobre `node:22-bookworm-slim` pineado por
    digest;
  - `docker-compose.yml`, con sus perfiles (`app`, `caddy`, `ocr`, `semantica`, `hermes`). Es la vía de VPS, la que
    `configura:deploy` le cierra al laboratorio;
  - `revisaImagen` y `revisaConstruible`, en `scripts/despacho/reglas.mjs`.
- **El runtime llama a Tesseract** por `TESSERACT_CMD`, `TESSDATA_PREFIX` y `LD_LIBRARY_PATH` (`runtime.ts`, líneas
  96–99), no por el servicio HTTP del OCR.
- **Matar `next dev`** puede corromper `.next/dev/types/validator.ts`: borra `.next/dev` antes del validate.

## LIBERTAD TÉCNICA

Tú eliges el diseño, la arquitectura y las librerías. Eso incluye:

- el lenguaje visual. La vitrina usa bento-grid (`.claude/design-systems/bento-grid/`), y la coherencia con ella es
  deseable, no obligatoria;
- cómo se pinta la línea de tiempo;
- cómo se recorre el caso de punta a punta;
- cómo se construye la imagen;
- qué almacén durable usar;
- cómo se organizan el Worker y el contenedor;
- qué pasa con lo en vivo de la vitrina.

Lo que se nombre aquí es una sugerencia descartable, salvo las RESTRICCIONES. Si al medir sale que Cloudflare no sirve
(por ejemplo, porque Tesseract no corre o la memoria no alcanza), **detente y reporta** con la medición: no cambies de
proveedor por tu cuenta.

## INVESTIGA ANTES DE DISEÑAR

- Busca 2 o 3 referencias world-class de:
  - vistas de traza de agentes con anotación humana (colas de revisión, gestos por paso);
  - formularios guiados para expertos de dominio;
  - líneas de tiempo de procesos con varios actores.
- Mide, no supongas:
  - el tamaño de la instancia que necesita el laboratorio con OCR, y su costo al mes con las horas de uso;
  - si Access protege el `workers.dev` o si hace falta un dominio;
  - cómo verificar el JWT de Access;
  - dónde vive cada almacén con `jurisdiction = "us"`.
- Reafirma el objetivo en una línea antes de cada edición grande.

## LO QUE CAMBIA EN EL RIESGO (por eso se revisa antes de abrir)

- **El laboratorio se despliega.** La AISIA §1 y el C3 dicen hoy que no. Por eso hacen falta la **revisión 11 de la
  AISIA** y una **nota del C3**, en borrador en `docs/goals/`, que el laboratorio firma **antes de que el experto
  entre**. Las dos declaran:
  - **un tercero nuevo, Cloudflare**, que ve el contenido y guarda la retroalimentación en EE. UU. También va en la lista
    de terceros de `productos/soporte-sap.json`;
  - que el experto escribe **sus** casos: la probabilidad de un dato real sube, y un dato sin forma (el nombre de una
    empresa) pasa el filtro;
  - que la retroalimentación se guarda: qué, dónde, cuánto tiempo y quién la lee;
  - y qué cambia frente a la revisión 10.
- **La identidad sale de Access**, verificada en el Worker y en el laboratorio. Lo que se haga en nombre del N3 o del N2
  para correr el caso de punta a punta queda marcado como tal, en la cadena y en la pantalla. Esa consultora y ese
  cliente son sintéticos.
- **El filtro de datos cubre TODO texto de las acciones**, antes de llegar al laboratorio y antes de guardarse. No basta
  una lista de campos de la que un campo nuevo se escape.
- **La vía de deploy nueva lleva su propio candado**, dentro del script que la ejecuta: si depende de acordarse, es una
  costumbre. Comprueba antes de subir, por lo menos:
  - que no viajan `.env*`, llaves de Supabase ni de producción;
  - que la imagen solo trae lo del laboratorio;
  - que Access está puesto (sin sesión no abre);
  - que la ubicación está fijada.

  Un `wrangler deploy` a mano lo esquiva: es la misma brecha que `vercel deploy` y se declara igual.
- **El respaldo es contrato.** El almacén de la retroalimentación entra al inventario (`BUSINESS_LOGIC.md` §4) con lo que
  se respalda y lo que no. Su RPO/RTO es «desconocido» hasta probar una restauración.
- **Sin subidas.** Solo las muestras sintéticas. Que el experto suba sus propias capturas pediría otra revisión del C3
  (H-22) y queda fuera de este goal.
- **Sin modelo.** El agente sigue siendo determinista.
  - Si la sesión demuestra que hace falta un modelo para entender el texto libre, se declara como hallazgo, con su
    evidencia, y no se conecta.
  - Conectarlo es CDC (C1/C8) y está acotado por D7.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. **El comando de validación en verde**, con el output pegado.
2. **Una fila nueva en la matriz por cada afirmación nueva de seguridad**:
   - la identidad sale del JWT de Access y nadie la elige;
   - sin un JWT válido no hay respuesta;
   - el filtro sobre todos los campos de texto;
   - la retroalimentación, filtrada y solo en su almacén;
   - la vista del laboratorio, solo para su identidad;
   - el candado del deploy;
   - sin subidas.

   Cada fila, verde sin su sabotaje y roja con él (`--fila <id>`), con el output pegado. Además, `c3-ruta-deploy`
   sigue verde (la guarda de compose intacta). Al final, la matriz entera en verde, con su conteo pegado.
3. **La revisión 11 de la AISIA y la nota del C3, firmadas por el laboratorio** antes de que el experto entre, con la
   línea firmada pegada.
4. **La imagen Docker en local, ANTES de pedir el pago**: el `docker build` y el `docker run`, el recorrido contra el
   contenedor en verde, el OCR de una muestra leído dentro de él, la memoria que usa y el tamaño de la imagen. Todo
   pegado.
5. **Capturas de Playwright contra la URL alojada, con la máquina del laboratorio sin lo en vivo encendido** y 0 errores
   de consola:
   - un caso conocido, de punta a punta: lo ingresa, los pasos, la solución con su fuente, la aprobación en la sala, el
     antes y el después, y la retroalimentación por paso y por caso;
   - un caso desconocido: «no lo sé», la enseñanza conversando y la propuesta de regla y de CLI;
   - la evidencia de una muestra leída con OCR dentro del contenedor;
   - un texto con forma de dato personal, rechazado antes de enviarse, con su motivo;
   - un caso de nómina en cuarentena, explicado;
   - la retroalimentación, que sigue ahí después de que el contenedor se duerma y vuelva a arrancar, y después de un
     redespliegue;
   - la vista a ancho de teléfono.
6. **Las negativas, pegadas**:
   - sin sesión de Access no abre;
   - un JWT falso, viejo o de otra audiencia no pasa;
   - la identidad del experto no puede ser superadministrador ni abrir la vista del laboratorio;
   - el contenedor no se alcanza sin pasar por el Worker.
7. **La vista del laboratorio** con la retroalimentación de las pruebas, más su export.
8. **En verde**:
   - el recorrido local (`recorrido.mjs`), con los pasos nuevos;
   - `npm run validate`, corrido en primer plano después del último commit, con su output pegado.
9. **Los documentos al día**: el kit del experto, la guía del laboratorio, el manual (`manual.ts` → `MANUAL.md`), el
   manifiesto con el tercero nuevo y el inventario de respaldo.
10. **El reporte de decisiones**:
   - el diseño y las referencias que investigaste;
   - cómo sale la línea de tiempo de la cadena de eventos;
   - el almacén y su ubicación;
   - cómo se verifica la identidad;
   - qué pasó con lo en vivo de la vitrina;
   - la instancia elegida y su costo medido.
11. **La lista de lo que podría estar mal o incompleto**, cada punto resuelto o declarado.
12. **Lo que el laboratorio corre, en comandos `!` de una línea**: la cuenta y Workers Paid, `wrangler login`, la
    política de Access con el correo del experto, los secretos, el deploy y el push. Y el PR listo, con su texto en
    `~/pr.md`.

## COMANDO DE VALIDACIÓN

```
npx tsc --noEmit -p . && npm --prefix tools/soporte-sap run -s build && npm --prefix tools/soporte-sap run -s prueba
```

Córrelo después de cada cambio grande y pega su output. Después de cada cambio de UI, corre también el recorrido contra
el laboratorio local. Después de cada cambio de la imagen o del Worker, corre también su candado.

## RESTRICCIONES REALES

- **La gobernanza del repo (`AGENTS.md`)**:
  - Responde en español.
  - Nunca imprimas un secreto: solo presente o ausente, y su largo.
  - Los CLIs, las imágenes y las dependencias van pineados. Eso incluye `wrangler`, la imagen base (por digest) y la
    etiqueta de la imagen que sube a Cloudflare: nunca `latest`, que es el valor por defecto de `APP_VERSION` en el
    compose.
  - No toques `gates.json`, skills, settings ni prompts sin CDC.
- **Las firmas son del laboratorio.** Nunca edites `.claude/gobernanza/`: los borradores van en `docs/goals/`, y el
  laboratorio los firma y los mueve.
- **Las guardas no se tocan**:
  - la 404 sin `SOPORTE_SAP_LABORATORIO`;
  - `configura:deploy`, que sigue rechazando el laboratorio en compose y VPS;
  - el build de la vitrina, que falla con esa variable;
  - el candado `.env*` de `despliega.sh`;
  - el portero.

  Ninguna fila de la matriz puede caer.
- **Ni Hetzner ni AWS** en este goal: el servidor de Hermes y el ERP no se toca.
- **El agente no siembra reglas.** Las enseñanzas y la retroalimentación son propuestas, y el veredicto lo da siempre el
  motor. Lo que cambia un veredicto lo firma el laboratorio en `tools/conocimiento` (D2, H-20).
- **No generes entradas de estrés para el lector de PDF** (H-22).
- **Los gates humanos los corre el laboratorio con `!`**: la cuenta de Cloudflare y su pago, `wrangler login`, Access,
  los secretos, la firma, cada deploy y el push.
  - Cada uno va en una línea corta, con ruta relativa.
  - `! cd` no siempre persiste: usa rutas o `git -C`.
  - El PR lo abres tú con `gh pr create -F ~/pr.md`; el merge, solo cuando el laboratorio lo escriba.
- **Nada de pago sin el sí del laboratorio**, con la medición del costo delante.
- **Solo datos sintéticos.** Lo que escribe el experto pasa el filtro. Producción sigue esperando la AISIA §5.
- **El código**:
  - archivos de 500 líneas como máximo y funciones de 50;
  - cada archivo nuevo, con su asiento en `inventario/activos.json` y `npm run inventario:vista`;
  - los commits, en la rama `soporte/vista-experto`.

## RED DE SEGURIDAD

- Si un paso necesita al laboratorio (cuenta, pago, login, Access, secreto, firma, deploy o push), detente, da el comando
  y espera. No lo simules ni lo esquives.
- Detente y reporta el bloqueo si en 40 turnos no convergiste. Detente también si, para pasar, hay que tocar una guarda,
  una fila de la matriz o el núcleo de forma que cambie un veredicto, o si Cloudflare resulta no servir.
