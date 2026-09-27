# Control de caducidades con etiquetas GS1-128 — Spec

> Compilado con `/goal-compiler` el 2026-09-25. Forma: **LOOP**. Núcleo, UI, agente de impresión
> e importación son un mismo trabajo con una sola línea de meta: si se juntan en un solo agente,
> no se pierde nada (test de colapso).
> Decidido por el laboratorio: **asignación mixta de GTIN** (ver MISION §6).
> Punto de partida: el visualizador https://claude.ai/artifact/2yB19HAG211Z14dwTwJ4X8. Ya genera
> ZPL, previsualiza, corrige el dígito, calcula el semáforo y hace varias revisiones. Léelo y
> reusa lo que sirva; no es techo.

## MISION

Cuando termines, debe existir **el sistema de control de caducidades por etiqueta GS1-128 que
usaría una cadena seria de CEDIS y sucursales**: cada caja y cada tarima lleva un código que
cualquier lector entiende, la fecha y el lote viajan dentro del código, y cualquiera con un
celular sabe en un segundo qué tiene en la mano y cuánto le queda de vida.

1. **Núcleo GS1 correcto por norma.** Arma, parsea y valida cadenas de elementos
   GS1. Cubre (00) SSCC, (01) GTIN-14, (02) GTIN del contenido, (17) caducidad AAMMDD (con la
   regla de DD=00 = último día del mes), (37) cantidad y (10) lote, más la tabla de AIs que haga
   falta para leer etiquetas ajenas sin romperse. Sabe cuándo lleva FNC1, cuáles AIs son de
   longitud fija y cuáles variable, el juego de caracteres permitido (CSET 82) y el límite de 48
   caracteres. También aplica las **reglas de combinación de AIs de las GS1 General
   Specifications**. Estructuras: caja → (01)(17)(10); tarima → (00)(02)(37)(17)(10); el lote
   (10), siempre al final.
2. **Una etiqueta, dos salidas equivalentes.** De la misma cadena de elementos sale el **SVG**
   (bwip-js/BWIPP) y el **ZPL** para impresoras térmicas Zebra (`^BC` en modo D o el que
   corresponda). Tienes que demostrar que codifican lo mismo: decodificas las dos y las comparas.
   El formato de etiqueta del laboratorio (abajo) es un ejemplo del estilo que se busca, no una
   plantilla fija:
   ```
   ^XA
   ^CI28
   ^FO30,20^A0N,30,30^FDYogurt natural 1 kg^FS
   ^FO30,60^A0N,25,25^FDLote: L4471   Cad: 30/10/2026^FS
   ^FO30,100^BY2
   ^BCN,150,Y,N,N,D
   ^FD(01)07501234567893(17)261030(10)L4471^FS
   ^XZ
   ```
3. **Lectura en cualquier punto.** Con la cámara del celular (@zxing/browser) y también con
   pistolas USB en modo teclado. Esas mandan el identificador de simbología `]C1`, el separador
   GS como `\x1d` o sustituido, o el texto con paréntesis, y el parser acepta todas esas formas.
   Al leer: qué producto es, qué lote, cuántos días le quedan con **semáforo**, y en qué sitio
   está. Los umbrales del semáforo son configurables por categoría (un yogurt no es una lata).
   Los valores por defecto se marcan como ejemplo y no se presentan como regla.
4. **Revisión antes de imprimir**, cada punto con explicación en lenguaje llano y, cuando se
   pueda, con arreglo en un clic:
   - que el código GS1-128 sea válido (AIs, longitudes, combinaciones, fechas);
   - el dígito verificador del GTIN (y del SSCC), con **botón para corregirlo**;
   - los días de vida restante con **semáforo**;
   - que el lote vaya **al final** y no tenga **caracteres prohibidos**;
   - el **límite de 48 caracteres**;
   - que el código **quepa en la etiqueta real con su zona en blanco** a cada lado;
   - el **grosor de barra (X) en milímetros**, comparado con lo que pide GS1 según quién lo lea
     (pistola o escáner logístico automático).
5. **Impresión real, de punta a punta.** Dos caminos para que el ZPL llegue a la Zebra:
   - **Zebra Browser Print**, desde el navegador;
   - un **agente local de impresión**: recibe los trabajos del sistema, los encola, reintenta, reporta
     el estado y los manda a la impresora por red (TCP 9100 en crudo). Varias impresoras por
     sitio.

   También una **pantalla de configuración de impresora**: dpi, tamaño real de la etiqueta,
   desplazamientos (`^LH`/`^LS`/`^LT`), oscuridad, velocidad, y **etiqueta de calibración** para
   ajustar las coordenadas contra el papel real. Se guarda un perfil por impresora y por sitio.
   Además, un **visor Labelary embebido**, como opción, para ver el ZPL como lo dibuja un motor
   real (ver RESTRICCIONES: es un flujo de datos hacia fuera).
6. **Asignación de GS1 a los artículos del almacén**, con un layout (plantilla) que tú diseñas con
   las columnas que haga falta, y que se sube desde **Excel o CSV**:
   - Varios sitios: **CEDIS** (tarimas, SSCC, recepción y surtido) y **sucursales** (cajas y piezas).
     Un artículo puede existir en varios sitios.
   - Al subir: los artículos que **ya tienen** código se **validan** (dígito, longitud, formato)
     y se marca cuáles están mal. A los que **no tienen**, se les **asigna** con la regla **mixta**
     que decidió el laboratorio:
     1. si trae el **GTIN del fabricante**, se conserva;
     2. si es **marca propia**, se numera con el **prefijo de empresa de GS1 México**, que es un
        parámetro de instalación. Se respeta su capacidad y nunca se reutiliza un número;
     3. si no hay ni lo uno ni lo otro, recibe un **código interno de circulación restringida**
        (rangos GS1 02/20-29), marcado como que solo vale dentro de la cadena.
   - **Resubir el archivo es seguro**: muestra el diff (nuevos, cambiados, sin cambio, conflictos),
     no duplica asignaciones y deja traza de quién asignó qué y cuándo.
   - Se exporta el resultado (Excel/CSV) y se imprimen las etiquetas por lote desde ahí.
7. **Tablero de caducidades por sitio**: lo que vence esta semana y este mes, el orden FEFO
   sugerido para surtir, y lo ya vencido. Es la razón de ser de todo lo anterior.

Horizonte: que un CEDIS con tres sucursales pueda cargar su catálogo en Excel, calibrar su Zebra,
imprimir las etiquetas de un lote y leerlas con el celular el mismo día, sin hablar con nadie.

## LIBERTAD TECNICA

Tú eliges la arquitectura, cómo repartir el núcleo, la UI y el agente, la librería para leer Excel,
el almacén y la cola del agente. Sugerencia que puedes descartar si justificas algo mejor: el
núcleo en `tools/etiquetas-gs1/` con el contrato de `docs/EMPAQUETAR-HERRAMIENTA.md` (sin React,
Next ni Supabase en el núcleo; almacén **inyectado**, como `tools/extractor-documental/`), la UI
como feature de la app Next del template, y el agente local como binario de la herramienta.
Salvo RESTRICCIONES, nada aquí es receta.

## INVESTIGA ANTES DE CONSTRUIR

- GS1 General Specifications (AIs, reglas de combinación, X y altura para GS1-128, zona en blanco),
  la guía de etiqueta logística GS1 y la documentación de GS1 México sobre prefijos y numeración
  de circulación restringida.
- Manual de programación ZPL (`^BC`, `^BY`, `^FD` en modo D, `^LH`/`^LS`/`^LT`, `^PW`/`^LL`),
  el SDK de Zebra Browser Print y el comportamiento del puerto 9100 en crudo.
- 2-3 sistemas serios de etiquetado y WMS con control por caducidad (cómo manejan calibración,
  FEFO y reimpresión).
- `docs/CREAR-UNA-HERRAMIENTA.md` y `docs/EMPAQUETAR-HERRAMIENTA.md`.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Pruebas del núcleo** pegadas, en verde. Incluyen vectores de la norma GS1: dígitos
  verificadores, fechas con DD=00, combinaciones prohibidas (incluido (01)+(37)), lote con
  carácter fuera de CSET 82, más de 48 caracteres, FNC1 solo donde toca, y las formas de
  entrada de una pistola (`]C1`, GS, paréntesis).
- **Ida y vuelta**: cadena → SVG → decodificado, y cadena → ZPL → render → decodificado. Las
  tres coinciden. Se pega la tabla de casos.
- **Playwright** (escritorio y viewport de celular), con capturas pegadas de:
  - una etiqueta de caja y una de tarima de CEDIS;
  - un GTIN con dígito malo y el mismo después del botón «corregir»;
  - el semáforo en sus cuatro estados;
  - un lote prohibido o mal colocado, un código de más de 48 caracteres y un código que no cabe,
    cada uno con su aviso;
  - el grosor en mm;
  - la configuración de impresora antes y después de mover los desplazamientos;
  - un **escaneo con la cámara falsa de Chromium** alimentada con un video de la etiqueta, que
    muestre el parseo y el semáforo.
- **Importación**: un CSV y un Excel de ejemplo, **ficticios**, con artículos de CEDIS y de
  sucursal, unos con GTIN válido, otros inválidos, sin GTIN, de marca propia y sin nada. Se pega
  el resumen: validados, inválidos y asignados, cada uno con su regla. Después se sube de nuevo
  con cambios y se pega el diff, que prueba que no se duplicó nada.
- **Agente de impresión**: un trabajo llega a un listener TCP 9100 simulado y los bytes recibidos
  son iguales al ZPL. Se pega también un trabajo **sin credencial rechazado**, y un reintento con
  la impresora caída.
- **Tablero de caducidades** con datos ficticios en dos sitios, con captura.
- Último output del comando de validación, en verde.
- Reporte de decisiones: qué elegiste y por qué, y cómo se instala en un sitio nuevo.
- Lista de las formas en que esto podría estar mal o incompleto, y cómo las resolviste.

## COMANDO DE VALIDACION

`npm run validate` (el gate completo del repo) más las pruebas propias de la herramienta. En
tu primer checkpoint, declara el comando exacto que corre las dos cosas. Córrelo tras cada
cambio grande y pega el output.

## RESTRICCIONES REALES

- **bwip-js** genera el código y **@zxing/browser** lee con cámara: lo eligió el laboratorio.
  Versiones **pineadas**; nada de `latest`.
- Todo se implementa según la **norma GS1**.
- **Nunca inventar un GTIN con un prefijo ajeno.** El prefijo de GS1 México es un parámetro. En
  el repo solo hay prefijos, productos, sitios y lotes **ficticios**; nada real de la casa.
- **Labelary es un servicio externo**: mandarle el ZPL saca datos del negocio fuera del perímetro
  (C4). Va **apagado por defecto**, se activa a propósito, con aviso visible, y se declara en el
  reporte. La vista previa local es la de siempre.
- **El agente local es una superficie de entrada a la red de impresoras** (C3). Pide credencial por
  trabajo, escucha solo donde está configurado y manda solo a impresoras de una lista permitida.
  Nunca es un relé abierto al 9100. Todo lo que entra se valida con Zod.
- **No hay impresora real ni Browser Print instalado**: se prueba con simuladores, y el reporte
  dice qué queda por probar en físico.
- **La base de datos compartida es producción: no se toca.** La persistencia va detrás de un
  adaptador inyectado con una implementación local. Si propones integrarlo al ERP (p. ej. GTIN y
  sitios junto a `erp.inv_articulo`), la migración se valida en un Postgres efímero y **no se
  aplica**: es gate humano.
- **El visualizador está compartido por enlace.** Si lo actualizas como demo, lleva solo datos
  ficticios.
- Reglas de código del repo: sin `any`, Zod en toda entrada, archivos de ≤500 líneas, y nunca
  imprimir secretos.
- No toques skills, prompts, `settings.json`, `.mcp.json` ni `AGENTS.md` (sería CDC, C1).
- Rama propia que sale de `main`, sin merge. Empaquetar, publicar y conectar impresoras reales
  son decisiones del laboratorio.
