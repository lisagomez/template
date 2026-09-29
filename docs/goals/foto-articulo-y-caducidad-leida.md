# Foto del artículo y caducidad leída de una foto — Spec

> Compilado con `/goal-compiler` el 2026-09-27. Forma: **LOOP** (catálogo, lector, lectura de la
> foto, revisión y expediente comparten una sola línea de meta; test de colapso: juntos en un
> agente no se pierde nada).
> Se construye ENCIMA de lo que ya existe: `tools/etiquetas-gs1/`, `/etiquetas/*`,
> `docs/SDD-etiquetas-gs1.md` (§9 zonas, §10 expediente). No es un sistema paralelo.
> **Decidido por el laboratorio: la caducidad leída es una PROPUESTA.** Cuenta para semáforo, FEFO
> y cadena solo cuando quien registra la confirma o la corrige. Si la deja pendiente, el lote se
> queda en recibo y no se surte.

## Lo que hay hoy (hechos medidos al compilar, no suposiciones)

- `Articulo` (`tools/etiquetas-gs1/src/modelo.ts`) **no tiene foto**; la plantilla de catálogo
  (`COLUMNAS_PLANTILLA` en `catalogo.ts`) tampoco.
- La acción `recepcion` exige una lectura GS1 con **(10) lote y (17) caducidad**
  (`existencias.ts`, `recibe`: «la lectura no trae lote y caducidad»). El código normal de un
  proveedor (EAN-13/UPC-A en la pieza, ITF-14 en el corrugado) **no entra**.
- `LectorCamara` solo busca `CODE_128`, `DATA_MATRIX` y `QR_CODE` con `ASSUME_GS1`: un EAN-13 o un
  ITF-14 **ni se decodifica**. `parseaLectura` trata unos dígitos sueltos como GS1 crudo (AI al
  inicio): un EAN-13 pistoleado se malinterpreta o falla.
- La salida de hoy para una caja sin GS1-128 es `etiquetado`: lote y caducidad **tecleados a
  mano**, y luego se imprime la etiqueta de la casa. Eso es lo que esta pieza vuelve rápido y
  con evidencia.
- La cadena del expediente es **solo-agregar**: un cambio de caducidad es un evento `CORRECCION`
  que referencia el evento corregido por hash y re-etiqueta el lote. No existe el UPDATE.
- `tools/extractor-documental` ya trae un puerto `MotorOcr` inyectado (motores `proceso-local`,
  `mistral`, `openai-compat`) y un `LectorDeCodigos` separado a propósito del OCR. Su regla vale
  aquí: los umbrales de confianza **no se ponen a ojo**, se miden (TAR-17, TAR-25).
- Entorno: WSL2 sin GPU; Tesseract instalado en `~/.local`. En CPU, un modelo de visión local
  midió ~110 s por página: demasiado lento para un andén. Hay que medir las alternativas.
- **Medido al compilar (2026-09-27): el motor local del extractor, tal cual, no basta.** Tesseract
  5.5.0 (`spa`) sobre «CAD 30/10/26 / L4471» sintético:
  - en letra sólida lee bien la fecha, pero el lote sale «14471» (confunde L con 1);
  - en tinta de puntos 5×7 no lee nada útil, **ni sobre fondo blanco**;
  - uniendo los puntos antes de leer (contraste, dilatar la tinta, umbral), lee en los cuatro
    fondos probados, incluido el oscuro de un refresco, pero **en los cuatro da «38/10/26»**: el
    cero con diagonal de estas impresoras sale como 8.
  
  Un 38 lo detecta el calendario; un «10» leído como «18» pasaría. Por eso la confirmación humana
  no es opcional. Se reusa el **puerto** y la regla de revisión del extractor, no su configuración
  de documentos.
- **Medido con 7 fotos reales del laboratorio (2026-09-27).** Corpus en `/home/gsore/code/template/.claude/worktrees/etiquetas-gs1/.datos/corpus-caducidades/`
  (fuera de git), con `esperado.json` transcrito a ojo. Las fotos son botella de Pepsi, yogur, fondo
  de lata, caja de Abuelita, caja de Crunch y dos bolsas de dulces.
  - **Tesseract**, aun recortado, con contraste y uniendo puntos: 0 de 4 fechas completas.
  - **Qwen2.5-VL 3B** local (Ollama, CPU):
    - con la **zona recortada**, transcribe las 4 fechas tal cual, en 6-24 s;
    - con la **foto completa**, falla: en la lata lee «14.06.28» donde dice 14/06/26, en Pepsi y
      Abuelita solo encuentra el lote, y en dos fotos **sin fecha visible devuelve un número**
      (la clave del proveedor, y un «20240202» que no se ve en la foto);
    - el lote cambia entre corridas («2F»/«3F», «…0408815»/«…0406316»).
  - GLM-OCR no carga en Ollama 0.12.6: queda sin medir aquí.
  - **Códigos**: a la resolución de la miniatura no decodifica ninguno. Ampliando 3×, zxing lee los
    EAN-13 de Pepsi (7501031302741) y Crunch (7501059229464), y también un QR de mercadotecnia que
    **no es GS1**. El ITF-14 de la caja de Abuelita se lee a ojo, pero sus barras son demasiado
    finas para decodificarlo.
  - **Formatos reales**:
    - «CAD 241123», seis cifras sin separador: puede ser DDMMAA (24/11/23) o AAMMDD (23/11/24);
    - «11.01.25» con puntos y sin rótulo (¿caducidad o fabricación?);
    - «BEST BEFORE:14/06/26» girado en el fondo de la lata;
    - «CAD31AGO27», donde la O del mes se imprime igual que un cero;
    - cajas y bolsas que solo dicen «FECHA DE CADUCIDAD Y LOTE INDICADOS EN EL ENVASE», y dulces
      con **consumo preferente**.
  - En la Pepsi, la fecha está en el **cuello, por encima del líquido**: con aire detrás, no con el
    refresco.

## MISION

Cuando termines, una persona en el andén de un CEDIS o en la trastienda de una sucursal, con su
celular, recibe mercancía de cualquier proveedor **aunque la caja no traiga GS1-128**, en segundos
y sin teclear fechas:

1. **escanea el código que trae la caja**, el que sea;
2. **ve la foto del artículo** y confirma con los ojos que es lo que tiene enfrente;
3. **toma foto de donde viene impresa la caducidad** (y el lote);
4. el sistema **le propone** la fecha y el lote leídos, con la zona de la foto marcada y la fecha
   dicha sin ambigüedad («jueves 30 de octubre de 2026 · le quedan 398 días»);
5. **confirma o corrige**, y solo entonces el lote entra, con su etiqueta GS1-128 de la casa
   impresa. Desde ahí la caja se lee por código y ya no por foto.

La foto queda como **evidencia en el expediente del lote**: cualquiera que audite ve qué decía la
caja, qué propuso la máquina, qué confirmó la persona y quién fue.

### 1. Foto del artículo en el catálogo

- Se toma con la cámara del celular o se sube de un archivo, desde el catálogo y desde la ficha del
  artículo. Una foto principal y, si lo ves útil, más vistas (frente, etiqueta, caja).
- Se normaliza al guardar: tamaño y peso razonables, miniatura, **metadatos EXIF fuera (GPS
  incluido)**, orientación corregida. Se guarda **por contenido** (SHA-256): la misma foto no se
  duplica y su huella se puede citar.
- Aparece donde se identifica el producto: el lector, la recepción, mover, conteo, el tablero de
  caducidades, el catálogo y el expediente. En el andén, la foto responde «¿es esto lo que tengo
  enfrente?».
- **Dónde viene la caducidad**, por artículo: una foto y una nota de dónde está impresa (cuello de
  la botella, tapa, fondo de la lata, película del paquete, etiqueta de la tarima) y cómo se ve
  mejor. La primera persona que la encuentra la documenta; las siguientes la ven en la pantalla de
  captura antes de buscarla.
- Cambiar la foto deja rastro (quién y cuándo) y no borra la anterior de golpe.
- **Carga masiva opcional**: si la plantilla de Excel/CSV acepta una referencia a foto, el servidor
  **no descarga URLs arbitrarias** (SSRF). Decide tú el mecanismo (zip junto al Excel, carpeta,
  etc.) y justifícalo.
- La exportación del catálogo dice qué artículos tienen foto y cuáles no.

### 2. Escanear el código que trae el proveedor

- La cámara y la pistola aceptan lo que de verdad llega en una caja: **EAN-13, UPC-A, EAN-8,
  ITF-14** (DUN-14 del corrugado), GS1-128, GS1 DataMatrix y QR (incluido **GS1 Digital Link**).
  Con identificador de simbología (`]E0`, `]I1`, `]C1`, `]d2`, `]Q3`…) cuando la pistola lo manda,
  y **sin él** también, sin romper ninguno de los vectores GS1 que ya pasan.
- Todo se normaliza a GTIN-14 y se busca en el catálogo **por nivel**. La pantalla dice si leyó la
  pieza o la caja, y pide lo que falte para saber cuántas cajas entran: la regla del catálogo
  sigue viva (el GTIN de la pieza no es el de la caja).
- **Si el código ya trae (17) y (10)** (GS1-128, DataMatrix o Digital Link), no hace falta foto: se
  recibe como hoy. La foto es para lo que no los trae.
- **GTIN desconocido**: se ofrece **vincularlo** a un artículo existente, que se busca por
  descripción **viendo las fotos**. Es un cambio de catálogo con traza, y respeta los conflictos
  que ya existen (el mismo GTIN en dos artículos, un prefijo ajeno como marca propia). Nunca se
  asigna solo.

### 3. Foto de la caducidad → lectura propuesta

- La cámara toma la foto de la zona impresa (con una guía en pantalla para encuadrarla) y el sistema
  propone **fecha y lote**, marcando en la foto de dónde salió cada uno y qué texto leyó tal cual
  («CAD 30/10/26  L4471»).
- Lo que hay en una caja real, y hay que leerlo: DD/MM/AA, DD/MM/AAAA, MM/AA y MM/AAAA, el mes en
  letras en español y en inglés («30 OCT 26», «OCT 2026»), las marcas CAD / CADUCIDAD / EXP /
  VENCE / CONS. PREF. / BEST BEFORE, códigos julianos, tinta de puntos de inyección, grabado
  láser, relieve, superficies curvas o con brillo, foto movida o inclinada.
- **Superficies difíciles** (el caso que pidió el laboratorio: tinta negra sobre PET con refresco
  de cola detrás). El orden es:
  1. **leer el paquete o la tarima antes que la pieza**: es el mismo lote para todas las botellas
     y se registra una vez;
  2. si hay que leer la botella, la pantalla guía la toma: buscar el código donde hay **aire
     detrás** (cuello, o inclinar la botella para que la burbuja quede detrás de la fecha);
     **flash apagado de frente** (rebota en el PET); **luz de lado, rasante**, para que la tinta
     brille distinto del plástico;
  3. **ráfaga**: varias tomas mientras se gira la botella, y el sistema usa la más nítida.
  
  Si ni así se lee, la persona la lee con sus ojos y la teclea, y la foto queda como evidencia de
  lo que vio.
- **Lo que enseñaron las fotos reales**, y que la lectura tiene que resolver:
  - **se lee la zona encuadrada, nunca la foto entera**: la guía de encuadre es parte de la
    lectura, no un adorno;
  - **dos lecturas independientes** (dos tomas de la ráfaga o dos recortes) se cotejan. Si la
    fecha o el lote no coinciden carácter por carácter, se marca la diferencia;
  - **el motor puede inventar**: la foto sin fecha tiene que terminar en «no encontré una fecha»,
    y lo que devuelva el motor solo vale si el analizador determinista encuentra ahí una fecha;
  - **O y 0 en el mes** («AG0» es AGO);
  - **seis cifras sin separador** son ambiguas (DDMMAA o AAMMDD);
  - un texto que **remite a otra cara** («…INDICADOS EN EL ENVASE») se reconoce y se dice: «la
    fecha no está en esta cara»;
  - un QR de mercadotecnia se ignora, no se toma por código del producto.
- **Formato aprendido por artículo**: la primera confirmación fija cómo imprime la fecha ese
  artículo (Pepsi: DDMMAA o AAMMDD) junto con dónde viene. Desde ahí la propuesta sale sin
  ambigüedad, y se sigue confirmando.
- **Fabricación contra caducidad**: ELAB / FAB / PROD no es caducidad. Si solo se lee la
  fabricación y el artículo tiene `vidaUtilDias`, se **propone** fab + vida útil, marcada como
  derivada. Si no hay vida útil, se dice que no se puede derivar.
- **Ambigüedad a la vista, nunca resuelta en silencio**: «03/04/26» puede ser 3 de abril o 4 de
  marzo (el producto importado de EE. UU. usa MM/DD). Se muestran las dos lecturas y la persona
  elige. «Consumo preferente» y «caducidad» no significan lo mismo: se dice cuál se leyó.
- **Plausibilidad**: una fecha pasada es un lote vencido (la regla de recepción sigue: no entra).
  Una fecha más lejana de lo que permite la vida útil se avisa. La regla de 2/3 y el mínimo de
  recepción se aplican **sobre la fecha confirmada**.
- **Si no se lee nada**, se dice: «no encontré una fecha», con la opción de volver a tomar la foto
  o de teclearla. Nunca se inventa una lectura para llenar el campo.
- **Motor de lectura detrás de un puerto inyectado**, local por defecto (ver RESTRICCIONES).
  Investiga y **mide** las opciones que corren en el navegador del celular o en el servidor del
  sitio sin GPU, y elige. Si reusar `MotorOcr` del extractor sirve, reúsalo; si no, justifícalo.

### 4. Revisión: confirma antes (decisión del laboratorio)

- **Pantalla de revisión**: la foto con zoom a la zona leída, la fecha dicha sin ambigüedad con sus
  días restantes y su semáforo, el lote, el texto leído tal cual y las alternativas si hay
  ambigüedad. Acciones: **confirmar**, **corregir** (teclear o elegir la fecha, con la foto a la
  vista), **tomar otra foto** y **dejar pendiente**.
- **Nada cuenta hasta confirmar.** Mientras la caducidad no esté confirmada, el lote no entra al
  semáforo ni al FEFO como vigente.
- **Pendiente**: el lote se queda en **recibo** con «caducidad por confirmar». No se puede mover a
  almacén ni a piso, ni venderse, transferirse o surtirse, y el servidor lo rechaza (la pantalla no
  es la frontera). Hay una **bandeja «por confirmar»** para quien lo registró, y quien supervisa
  ve cuánto tiempo lleva cada pendiente.
- **Lo que queda registrado**: el evento que da de alta el lote (o el evento nuevo que diseñes)
  lleva la **huella SHA-256 de la foto**, el texto leído, la propuesta, el valor confirmado, si se
  corrigió, el motor y su versión, y quién confirmó (seudónimo, como el resto de la cadena). La
  foto vive **fuera** de la cadena; su huella, **dentro**. La cadena y el anclaje siguen
  verificando.
- **Si después resulta mal**: `CORRECCION` con una foto nueva y el motivo, re-etiquetado del lote,
  y el expediente enseña las dos lecturas y las dos fotos.
- **Medición en uso**: cuántas lecturas se confirmaron tal cual y cuántas se corrigieron, por motor
  y por formato. Es el corpus real que hoy no existe; la pantalla lo enseña.
- Tras confirmar se imprime la etiqueta GS1-128 de la caja (01)(17)(10) con el flujo que ya existe
  (`etiquetado`, perfiles, Browser Print o agente).

### 5. El andén

La señal en un andén es mala. Al horizonte, una foto tomada no se pierde por un corte de red: se
reintenta y la persona ve qué quedó pendiente de subir. Si esto no cabe con calidad, dilo en el
reporte en lugar de dejarlo a medias.

### 6. Integración al ERP (propuesta, no aplicada)

Extiende `tools/etiquetas-gs1/migraciones/propuesta-pack-etiquetas.sql`: la foto del artículo
(referencia y huella; los bytes en un almacenamiento que propongas), la lectura de caducidad
**solo-agregar** y el estado de pendiente. Todo con `cliente_id`, RLS y la regla de 004 para los
ledgers nuevos. Se valida en el Postgres efímero junto a `erp/migrations` con casos nuevos, y **no
se aplica**.

## LIBERTAD TECNICA

Tú eliges el motor de lectura (y si corre en el celular, en el servidor o en los dos), la librería
de códigos, cómo se guardan y sirven las fotos, el modelo del evento de lectura y la UI. Lo que
nombra este spec (zxing, `MotorOcr`, Tesseract) es contexto, no receta. Optimiza por el mejor
resultado en un andén real, no por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

- GS1 General Specifications: EAN/UPC, ITF-14, identificadores de simbología, y **GS1 Digital
  Link**. También la transición a 2D en punto de venta (fechas y lote dentro del código).
- NOM-051-SCFI/SSA1-2010 y afines: cómo se declaran en México la caducidad y el consumo
  preferente en la etiqueta.
- 2-3 sistemas serios que leen fechas impresas en empaque (visión en líneas de empaque, WMS con
  captura por cámara) y cómo tratan la ambigüedad y la confirmación humana.
- Motores de OCR que corren sin GPU o en el navegador, **medidos** sobre fechas de tinta de puntos.
- Next.js 16 cambió: lee la guía relevante en `node_modules/next/dist/docs/` antes de escribir
  código de Next.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Pruebas en verde, pegadas**, que incluyan:
  - EAN-13, UPC-A, EAN-8 e ITF-14, con y sin identificador de simbología, por cámara y por
    pistola, sin romper los vectores GS1 existentes;
  - pieza contra caja;
  - GTIN desconocido vinculado, y el mismo en conflicto;
  - Digital Link con (17)(10) recibido sin foto;
  - normalizador de fechas con su tabla de formatos: mes en letras es/en, MM/AA, juliano, ELAB
    contra CAD, ambigüedad DD/MM y MM/DD **marcada y no resuelta**, derivada de fabricación +
    vida útil, «no se leyó nada», y el cero con diagonal leído como 8 (un día 38 rechazado por
    calendario);
  - un lote pendiente que **no** se mueve, vende, transfiere ni surte (rechazo del servidor);
  - confirmación que registra la propuesta, lo confirmado, si se corrigió y la huella de la foto,
    **con la cadena y el anclaje verificando**;
  - `CORRECCION` con foto nueva;
  - EXIF/GPS eliminado;
  - un archivo que no es imagen (o un SVG) rechazado.
- **Medición del motor**, una tabla por motor probado sobre un corpus de fotos de caducidad. Lleva
  la tasa de fecha exacta, la de **fecha equivocada propuesta** (la peligrosa, con su
  confianza), la de «no leyó» y la latencia en CPU. El corpus dice qué es **sintético** y qué es
  real, y trae tinta de puntos sobre fondo claro, sobre líquido oscuro y con luz rasante. La línea
  base es Tesseract con y sin unir puntos, y Qwen2.5-VL 3B recortado y sin recortar (ver «Lo que
  hay hoy»). **El corpus real de `/home/gsore/code/template/.claude/worktrees/etiquetas-gs1/.datos/corpus-caducidades/` entra en la tabla**, y en él las tres
  fotos sin fecha visible deben dar **cero fechas propuestas**. Lo marcado `por_confirmar` no
  cuenta como acierto ni como error. Los umbrales salen de la medición, nunca a ojo, y lo que falte medir en real se declara
  pendiente.
- **Playwright** (escritorio y viewport de celular, con cámara falsa), capturas pegadas de:
  - catálogo con foto: tomarla o subirla, y verla en la ficha y en el lector;
  - EAN-13 del proveedor escaneado, con la foto del artículo y el nivel leído;
  - GTIN desconocido vinculado;
  - foto de caducidad con la propuesta y la zona marcada;
  - una lectura ambigua con sus dos opciones;
  - corrección por el usuario, antes y después;
  - dejar pendiente → mover a piso **rechazado** → confirmar → mover permitido;
  - etiqueta GS1-128 lista tras confirmar;
  - expediente del lote con la foto, lo leído contra lo confirmado y una `CORRECCION` posterior.
- **Propuesta ERP** validada en Postgres efímero con casos nuevos, **no aplicada**.
- Último output del comando de validación, en verde.
- Reporte de decisiones: motor elegido y por qué, dónde viven las fotos, cuánto se retienen, y el
  camino de instalación en un sitio.
- Lista de formas en que esto podría estar mal o incompleto, y cómo se resolvió cada una.

## COMANDO DE VALIDACION

`npm run validate` (el gate completo, ya incluye `prueba:etiquetas`). Tras el build,
`npm run capturas:etiquetas`. Al tocar la propuesta ERP,
`bash tools/etiquetas-gs1/migraciones/prueba-efimera.sh`. Córrelos tras cada cambio grande y
pega el output.

## RESTRICCIONES REALES

- **Extiende lo que existe** (`tools/etiquetas-gs1`, `/etiquetas/*`, sus pruebas y capturas).
  Rama propia desde `expediente-lote` (aún sin mergear), sin merge.
- **La máquina propone, la persona decide**: ninguna caducidad cuenta sin confirmación humana, sea
  cual sea la confianza del motor. Una fecha mal leída que se surte es un riesgo para un tercero
  (quien compra), y eso no se firma (límite de C5).
- **Lectura local por defecto.** Un motor externo (API de OCR o modelo de visión de un proveedor)
  solo va detrás del puerto, **apagado**, con aviso en cada uso como Labelary: la foto sale del
  perímetro (C4). Si se usa un modelo de lenguaje, pasa por `.claude/routing-modelos.json` (C8),
  la contabilidad de tokens y un modelo **pineado**.
- **La cadena es solo-agregar y sin datos personales**: nada de UPDATE, las correcciones son
  `CORRECCION`, el operador va con seudónimo, y dentro de la cadena va la **huella** de la foto,
  no la foto.
- **Solo datos ficticios** (prefijo 952). Fotos generadas o del laboratorio, **sin personas**. Las
  fotos reales (`/home/gsore/code/template/.claude/worktrees/etiquetas-gs1/.datos/corpus-caducidades/`, fuera de git: si trabajas en otra copia, léelo de ahí) **no entran a git** (varias son de catálogo web) ni
  salen de la máquina.
- La BD compartida no se toca; el ERP es propuesta validada en efímero.
- Dependencias nuevas con **versión exacta**.
- No toques skills, prompts, `settings.json`, `.mcp.json` ni `AGENTS.md` (sería CDC, C1). Ningún
  secreto se imprime.
