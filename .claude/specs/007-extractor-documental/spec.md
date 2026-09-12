# Spec 007 — Extractor documental como herramienta enchufable

> **Diseño**: [`docs/SDD-extractor-documental.md`](../../../docs/SDD-extractor-documental.md)
> **Investigación previa**: [`docs/INVESTIGACION-OCR-MISTRAL.md`](../../../docs/INVESTIGACION-OCR-MISTRAL.md)
> · [`docs/INVESTIGACION-OCR-OPENSOURCE.md`](../../../docs/INVESTIGACION-OCR-OPENSOURCE.md)
> **Contrato de empaquetado**: [`docs/EMPAQUETAR-HERRAMIENTA.md`](../../../docs/EMPAQUETAR-HERRAMIENTA.md)
> — fuente única, no se reescribe aquí.
>
> Esta spec cierra el **QUÉ**. El stack y la arquitectura viven en el plan; la calidad de
> cualquier motor sobre el corpus real es **desconocida** hasta correr el piloto de medición.

## Contexto y objetivo

Hace falta cargar de forma masiva documentos heterogéneos —PDF digitales, escaneos, fotografías
y manuscritos— y convertirlos en datos revisados por un humano. Las investigaciones previas ya
resolvieron con qué extraer y cuánto cuesta; falta la pieza que una persona usa.

El objetivo es una **herramienta empaquetable** (`tools/extractor-documental/`) que se instala
en otros proyectos, se anuncia sola como plugin con su icono, ingesta archivos y carpetas, deja
revisar y editar lo extraído campo por campo, y al guardar convierte esa disposición en la
plantilla por defecto, preparando los catálogos de configuración y una propuesta de modelo
entidad-relación.

El objetivo **no** es elegir el motor de OCR: la herramienta define un puerto y los adaptadores
se enchufan, para que la decisión de flujo de datos (C4) la tome cada proyecto y no la herramienta.

Y el proyecto que la instala **normalmente ya tiene sus catálogos** —`proveedores`, `clientes`,
`conceptos`— con datos dentro. Proponer ahí una tabla nueva no es útil: es el error. Por eso el
revisor relaciona lo extraído con lo que ya existe, sobre un lienzo gráfico, y un proyecto virgen
no es un caso aparte: es el mismo camino con un descriptor de esquema vacío.

## Usuarios / actores

- **Revisor** — persona que sube documentos, corrige lo extraído y decide qué se guarda. No es
  técnica y no ve rutas, esquemas ni SQL salvo cuando aprueba una propuesta.
- **Integrador** — quien instala el paquete en otro proyecto y le inyecta el motor y el almacén.
- **Titular del documento** — la persona sobre la que trata el papel. **No usa el sistema y no
  eligió estar aquí.** Es a quien protege la sección de impacto.
- **Operario** — escanea y sube documentos; **no valida lo que sube**.
- **Dueño del esquema** — quien mantiene los catálogos del proyecto. **No usa la herramienta**,
  pero es quien paga un duplicado mal dado de alta.
- **Agente de la fábrica** — implementa, empaqueta y verifica.

## Historias de usuario

- Como **revisor**, quiero arrastrar una carpeta entera de expedientes y ver qué se extrajo de
  cada uno, para no subirlos de uno en uno.
- Como **revisor**, quiero apagar los campos que no me sirven y corregir los que salieron mal,
  para que la pantalla muestre lo que de verdad importa.
- Como **revisor**, quiero guardar esa disposición una sola vez y que la siguiente tanda llegue
  ya así, para no repetir el mismo trabajo mil veces.
- Como **integrador**, quiero instalar el paquete y que la herramienta aparezca sola en el
  lanzador de mi app, sin cablear nada a mano.
- Como **integrador**, quiero elegir si el OCR corre contra una API o contra mi propio servidor,
  sin tocar el código de la herramienta.
- Como **revisor**, quiero enganchar lo extraído a los catálogos que ya tengo en vez de que me
  propongan tablas nuevas, para que los datos entren donde el resto del sistema los busca.
- Como **revisor**, quiero ver el modelo como un diagrama y arrastrar un campo sobre una columna
  para relacionarlos, en vez de describir la relación en un formulario.
- Como **dueño del esquema**, quiero que nadie dé de alta un proveedor que ya existía escrito de
  otra forma, para no acabar con el historial partido en dos.
- Como **titular del documento**, quiero que un dato mal leído no acabe decidiendo algo sobre mí
  sin que nadie lo haya mirado.

## Requisitos funcionales (criterios de aceptación en EARS)

> **Enmienda del 2026-09-10 (RF-83 a RF-97).** RF-6 se amplía a XML. Antes decía: *«EL SISTEMA
> aceptará PDF e imágenes, y rechazará cualquier otro tipo nombrando el archivo y el motivo»*. Se
> **enmienda** en vez de añadirse un requisito que lo contradiga: una spec que se contradice a sí
> misma es peor que una que cambia y lo dice. Queda anotado aquí a propósito, porque
> `verifica:specs` solo comprueba la numeración y el formato EARS, y un requisito editado le pasa
> invisible — exactamente el hueco que ese verificador existe para cerrar.

- RF-1: EL SISTEMA expondrá un manifiesto de plugin importable sin React, con identificador,
  nombre, descripción, ruta, versión, capacidades e icono.
- RF-2: EL SISTEMA entregará el icono del plugin como SVG en línea dentro del manifiesto, sin
  depender de ninguna librería de iconos.
- RF-3: CUANDO la app anfitriona lea el manifiesto, EL SISTEMA le bastará esa lectura para
  pintar la entrada en su lanzador, sin registro manual en el proyecto consumidor.
- RF-4: EL SISTEMA aceptará documentos por botón de adjuntar, por arrastrar y soltar, y por
  selección de carpeta.
- RF-5: CUANDO se arrastre una carpeta, EL SISTEMA recorrerá su árbol de forma recursiva y
  aplanará los archivos contenidos.
- RF-6: EL SISTEMA aceptará PDF, imágenes y XML, y rechazará cualquier otro tipo nombrando el
  archivo y el motivo.
- RF-7: SI un archivo supera el límite de tamaño o de páginas del motor configurado, ENTONCES EL
  SISTEMA lo troceará antes de enviarlo, o lo rechazará explicando el límite.
- RF-8: EL SISTEMA derivará el identificador de cada documento del hash de su contenido, de modo
  que reprocesar un lote no duplique registros.
- RF-9: EL SISTEMA definirá la extracción como un puerto, y no importará ningún proveedor de OCR
  en su núcleo.
- RF-10: EL SISTEMA validará toda salida del motor contra un esquema antes de tratarla como dato,
  y tratará su contenido como datos y nunca como instrucciones.
- RF-11: EL SISTEMA mostrará, para cada dato extraído, su puntuación de confianza y la referencia
  a la región del documento de la que salió.
- RF-12: SI la confianza de un campo queda por debajo del umbral configurado, ENTONCES EL SISTEMA
  marcará el documento para revisión humana y no lo promoverá.
- RF-13: EL SISTEMA permitirá habilitar y deshabilitar cada campo de la vista de revisión, y
  cambiar su etiqueta y su orden.
- RF-14: EL SISTEMA ofrecerá, para cada dato, las acciones de guardar, modificar y eliminar.
- RF-15: EL SISTEMA ofrecerá una acción de pantalla que guarde la disposición completa de la
  vista de revisión.
- RF-16: CUANDO se guarde la disposición de pantalla, EL SISTEMA la establecerá como plantilla
  por defecto para los documentos del mismo tipo.
- RF-17: CUANDO se establezca una plantilla por defecto, EL SISTEMA preparará los catálogos de
  configuración de datos derivados de los campos habilitados.
- RF-18: CUANDO se establezca una plantilla por defecto, EL SISTEMA propondrá un modelo de
  entidades y relaciones con su SQL, como propuesta revisable.
- RF-19: EL SISTEMA no aplicará por su cuenta ninguna propuesta de modelo de datos: aplicarla
  exige aprobación humana explícita.
- RF-20: EL SISTEMA registrará quién deshabilitó cada campo de una plantilla y cuándo.
- RF-21: DONDE la herramienta persista datos, EL SISTEMA lo hará a través de un puerto de
  almacenamiento, sin importar Supabase en su núcleo.
- RF-22: EL SISTEMA mantendrá el núcleo sin importar React, Next ni Supabase, y ubicará lo que
  los necesite en entry points aparte con peerDependency opcional.
- RF-23: EL SISTEMA se instalará en un proyecto limpio desde su tarball, exportando su API y sus
  tipos.
- RF-24: EL SISTEMA usará un identificador de modelo pineado, y rechazará cualquier alias
  autoactualizable.
- RF-25: EL SISTEMA obtendrá el esquema de destino a través de un puerto, admitiendo tanto un
  descriptor declarado por el integrador como una introspección asistida.
- RF-26: EL SISTEMA operará con el descriptor declarado sin exigir ninguna credencial con
  privilegio de esquema.
- RF-27: EL SISTEMA permitirá asociar cada campo extraído a una columna de una tabla ya existente
  en el proyecto que lo instala.
- RF-28: CUANDO un campo se asocie a una columna de catálogo, EL SISTEMA resolverá el valor
  extraído contra las filas existentes y mostrará los candidatos ordenados por similitud.
- RF-29: SI ninguna fila del catálogo coincide con el valor extraído, ENTONCES EL SISTEMA marcará
  el dato como sin resolver y propondrá el alta sin escribirla.
- RF-30: EL SISTEMA no dará de alta ninguna entrada de catálogo sin confirmación humana explícita.
- RF-31: EL SISTEMA no emitirá ninguna sentencia que altere una tabla preexistente del proyecto
  que lo instala.
- RF-32: EL SISTEMA presentará el modelo como un lienzo con una tarjeta por entidad y una línea
  por relación, indicando la cardinalidad en los extremos.
- RF-33: CUANDO se arrastre un campo sobre una columna del lienzo, EL SISTEMA abrirá el detalle de
  la relación para confirmar cardinalidad y sentido antes de crearla.
- RF-34: EL SISTEMA distinguirá visualmente en el lienzo las entidades preexistentes de las
  propuestas nuevas.
- RF-35: EL SISTEMA tratará un descriptor de esquema vacío como el caso de un proyecto sin
  catálogos, recorriendo el mismo camino que uno poblado y sin una ruta de código distinta.
- RF-36: SI el descriptor declarado nombra una tabla o una columna que la base ya no tiene,
  ENTONCES EL SISTEMA lo señalará antes de proponer ningún mapeo.
- RF-37: EL SISTEMA aceptará como fuente un código leído con cámara o con escáner óptico, además
  del documento subido.
- RF-38: EL SISTEMA leerá códigos QR, códigos de barras lineales, PDF417 y DataMatrix.
- RF-39: EL SISTEMA marcará la procedencia de cada dato como extraído por reconocimiento, leído de
  un código, o introducido por una persona.
- RF-40: EL SISTEMA no exigirá una región del documento en un dato leído con un escáner óptico,
  porque ese dispositivo no produce imagen.
- RF-41: EL SISTEMA distinguirá tres clases de fuente —documento, etiqueta de inventario y evento
  de trazabilidad— y derivará la identidad de cada lectura según su clase.
- RF-42: CUANDO se lea dos veces el mismo código como evento de trazabilidad, EL SISTEMA registrará
  dos hechos distintos y no descartará el segundo.
- RF-43: EL SISTEMA resolverá los campos marcados como identificador por igualdad exacta, y
  rechazará compararlos por similitud.
- RF-44: SI un identificador no aparece en el catálogo, ENTONCES EL SISTEMA responderá que no está
  y no ofrecerá el más parecido.
- RF-45: EL SISTEMA validará el dígito de control de los identificadores que lo lleven, y
  distinguirá «no válido» de «no se sabe validar».
- RF-46: EL SISTEMA extraerá los identificadores de aplicación de una carga GS1 como campos con
  clave, sin necesidad de reconocimiento óptico ni de anotación.
- RF-47: EL SISTEMA no abrirá ninguna dirección obtenida de un código: mostrará el destino para que
  una persona decida.
- RF-48: CUANDO un documento aporte datos por reconocimiento y por código a la vez, EL SISTEMA
  cotejará ambas fuentes y señalará los desacuerdos.
- RF-49: SI el cotejo entre reconocimiento y código arroja algún desacuerdo, ENTONCES EL SISTEMA
  marcará el documento para revisión humana aunque ambas fuentes tengan confianza alta.
- RF-50: MIENTRAS no haya conexión, EL SISTEMA conservará las lecturas en una cola local y las
  enviará al recuperarla.
- RF-51: EL SISTEMA sellará el instante de una lectura en el momento del escaneo y no en el de su
  envío.
- RF-52: EL SISTEMA conservará por separado el instante del dispositivo y el del servidor, y
  señalará un desfase relevante entre ambos.
- RF-53: SI hay lecturas pendientes de enviar y la aplicación no está instalada, ENTONCES EL
  SISTEMA advertirá de que el navegador puede descartarlas.
- RF-54: EL SISTEMA reintentará el envío de una lectura pendiente con esperas crecientes y acotadas.
- RF-55: EL SISTEMA agrupará el trabajo en lotes, y cada lote llevará un título obligatorio dado
  por una persona.
- RF-56: EL SISTEMA admitirá que dos lotes distintos compartan el mismo título.
- RF-57: CUANDO se vaya a titular un lote, EL SISTEMA propondrá un título derivado de su contenido
  que la persona podrá aceptar o cambiar.
- RF-58: SI un lote está cerrado, ENTONCES EL SISTEMA rechazará añadirle documentos o lecturas.
- RF-59: EL SISTEMA conservará el fichero original de cada documento como evidencia, además de los
  datos extraídos.
- RF-60: EL SISTEMA guardará los originales en un almacén privado y los entregará mediante enlaces
  temporales, nunca de acceso público permanente.
- RF-61: EL SISTEMA compondrá la ubicación de cada original de modo que su primer segmento sea la
  organización propietaria.
- RF-62: EL SISTEMA no compartirá un mismo original entre organizaciones distintas, aunque su
  contenido sea idéntico.
- RF-63: EL SISTEMA declarará un plazo de retención para los originales, y su vencimiento no
  borrará nada por sí solo.
- RF-64: EL SISTEMA no modificará en el sitio un dato ya validado: una corrección añadirá una
  versión nueva y conservará la anterior.
- RF-65: EL SISTEMA exigirá un motivo en toda corrección, además de quién la hizo y cuándo.
- RF-66: EL SISTEMA determinará el valor vigente de un campo por su número de versión.
- RF-67: EL SISTEMA permitirá recuperar un lote por su título.
- RF-68: EL SISTEMA indexará los identificadores extraídos de cada documento y permitirá recuperar
  por ellos.
- RF-69: EL SISTEMA normalizará un identificador de la misma manera al indexarlo y al resolverlo
  contra un catálogo.
- RF-70: EL SISTEMA no indexará el texto libre del documento como criterio de búsqueda.
- RF-71: EL SISTEMA distinguirá los roles de operario, revisor y consulta dentro de una
  organización.
- RF-72: SI quien actúa no tiene el rol necesario para una operación, ENTONCES EL SISTEMA la
  rechazará antes de ejecutarla.
- RF-73: EL SISTEMA reservará al rol revisor la corrección, la validación, el cierre de lote y la
  supresión.
- RF-74: EL SISTEMA permitirá al rol de consulta leer y exportar sin poder alterar nada.
- RF-75: CUANDO se suprima un registro a petición de su titular, EL SISTEMA borrará su contenido y
  conservará constancia de que existió.
- RF-76: EL SISTEMA registrará en cada supresión quién la pidió, quién la ejecutó, cuándo y por qué.
- RF-77: EL SISTEMA distinguirá un registro suprimido de uno que nunca existió.
- RF-78: CUANDO se vaya a lanzar un lote, EL SISTEMA mostrará el coste estimado antes de
  confirmarlo.
- RF-79: SI el motor no declara tarifa, ENTONCES EL SISTEMA presentará el coste como desconocido y
  no como cero.
- RF-80: EL SISTEMA exportará los datos validados de un lote a un fichero de valores separados por
  comas.
- RF-81: EL SISTEMA neutralizará en la exportación toda celda que una hoja de cálculo interpretaría
  como fórmula.
- RF-82: EL SISTEMA registrará cada exportación con quién la hizo, cuándo y cuántas filas salieron.
- RF-83: EL SISTEMA leerá comprobantes fiscales en XML sin llamar a ningún motor de
  reconocimiento, porque el XML es el documento fiscal y el PDF solo su representación impresa.
- RF-84: EL SISTEMA resolverá cada elemento y cada complemento por la dirección de su espacio de
  nombres y por su versión declarada, y nunca por el prefijo con el que venga escrito.
- RF-85: SI un complemento presente en el documento no tiene lector registrado, ENTONCES EL
  SISTEMA lo reportará con su espacio de nombres, su versión y el motivo, y leerá el resto del
  comprobante igualmente.
- RF-86: SI un complemento declara una versión distinta de la que admite el lector registrado,
  ENTONCES EL SISTEMA lo reportará nombrando ambas versiones y no lo leerá con ese lector.
- RF-87: EL SISTEMA permitirá al proyecto que lo instala registrar sus propios lectores de
  complemento sin modificar el código de la herramienta.
- RF-88: SI el registro recibe dos lectores para el mismo espacio de nombres, nombre y versión,
  ENTONCES EL SISTEMA fallará al construirlo en vez de elegir uno en silencio.
- RF-89: SI un XML declara un DOCTYPE, ENTONCES EL SISTEMA rechazará el documento nombrando el
  motivo, sin resolver ninguna entidad.
- RF-90: EL SISTEMA no resolverá entidades externas ni descargará ningún esquema por red para leer
  un XML.
- RF-91: EL SISTEMA marcará todo dato procedente de un XML con una procedencia propia, distinta de
  la del reconocimiento óptico y de la del código.
- RF-92: EL SISTEMA declarará en el resultado que el sello del emisor y el del SAT no han sido
  verificados, y no ofrecerá ninguna ruta que los verifique.
- RF-93: EL SISTEMA no consultará ningún servicio externo para comprobar el estatus de un
  comprobante, ni a partir de un código ni a partir de un XML.
- RF-94: CUANDO se disponga del XML y del PDF del mismo comprobante, EL SISTEMA cotejará sus datos
  con los del código impreso, y tratará cualquier discrepancia como motivo de revisión humana.
- RF-95: EL SISTEMA conservará los valores numéricos del XML tal como vienen, sin redondearlos ni
  reformatearlos, y emitirá los códigos del catálogo fiscal sin traducirlos a etiquetas.
- RF-96: SI el comprobante es de tipo pago o de tipo nómina y su complemento no se leyó, ENTONCES
  EL SISTEMA lo advertirá en español antes de que sus importes se traten como definitivos.
- RF-97: EL SISTEMA tratará la addenda como contenido sin esquema fiscal, reportando su presencia
  y sin convertirla en campos salvo que el proyecto declare un lector propio.

## Requisitos no funcionales

- **Portabilidad**: ESM, `type: "module"`, `sideEffects: false`, `engines.node` declarado, y
  todas las `peerDependencies` marcadas como opcionales en `peerDependenciesMeta`.
- **Comprobabilidad**: la máquina de estados, la clasificación de archivos, el reducer de la
  plantilla y la derivación del modelo son funciones puras, probables sin navegador, sin red y
  sin claves.
- **Idioma**: identificadores en inglés donde el ecosistema lo exija; mensajes, documentación y
  errores en español.
- **Seguridad de datos**: RLS activa en toda tabla que cree el adaptador de persistencia; sin
  `service_role` en la superficie de subida del usuario.
- **Trazabilidad**: ningún dato se promueve a una tabla de negocio sin su región de origen.
- **Privilegio mínimo**: la vía por defecto no pide más permiso que el que ya tiene la sesión del
  usuario. Ninguna funcionalidad exige una credencial con privilegio de esquema.
- **Comprobable sin base de datos**: el mapeo y la reconciliación se prueban sobre descriptores de
  ejemplo versionados, no contra una base viva.
- **Tamaño**: archivos por debajo de 500 líneas y funciones por debajo de 50.

## Casos límite

- Carpeta arrastrada que contiene subcarpetas vacías, o solo archivos no soportados.
- El mismo documento subido dos veces en el mismo lote, y en lotes distintos.
- PDF que ya trae capa de texto: no debería pagar OCR.
- Documento que supera a la vez el límite de tamaño y el de páginas.
- Escaneo ilegible del que el motor devuelve texto con confianza alta — el peor caso, porque no
  se distingue de un acierto.
- Plantilla por defecto guardada con todos los campos deshabilitados.
- Propuesta de modelo que colisiona con una tabla que ya existe en el proyecto consumidor.
- El motor configurado no responde, o responde con un error de cuota a mitad de un lote.
- Proyecto consumidor sin React que solo importa el núcleo y el manifiesto.
- Valor extraído que coincide con varias filas del catálogo por encima del umbral.
- Catálogo de decenas de miles de filas: la resolución no puede traerlas todas al navegador.
- Dos documentos del mismo lote que proponen exactamente la misma alta.
- Descriptor declarado que ya no cuadra con la base real del proyecto.
- Relación arrastrada en el lienzo que crearía un ciclo entre entidades.
- Proyecto virgen: descriptor sin ninguna tabla.
- La misma guía escaneada dos veces en el mismo puesto y el mismo segundo.
- Un GTIN que no está en el catálogo y se parece un 0,87 a uno que sí está.
- Un código cuya carga es una dirección web.
- Una etiqueta leída con escáner óptico: no hay imagen y por tanto no hay región.
- Un escáner mal configurado que no envía terminador.
- Una carga GS1 con un identificador de aplicación desconocido a mitad.
- Cola pendiente con la aplicación abierta en una pestaña y no instalada.
- Reloj del dispositivo desfasado respecto al del servidor.
- Cola que supera el presupuesto de almacenamiento local.
- Dos lotes distintos con exactamente el mismo título.
- Corrección sobre un campo de un lote ya cerrado.
- Original que ya no está al abrir un registro antiguo.
- Identificador buscado con espacios o en minúsculas.
- Lote vacío que se intenta cerrar o exportar.
- El mismo fichero subido por dos organizaciones distintas.
- Fichero que supera el límite del almacén.
- Enlace temporal ya caducado.
- Operario que intenta validar o cerrar.
- Supresión de un registro ya suprimido.
- Valor extraído que empieza por `=` y acaba en una exportación.
- Estimación de coste sin tarifa declarada por el motor.

## Impacto sobre terceros (control C4)

Los afectados no son los usuarios de la app: son **los titulares de los documentos**, que no
eligieron estar aquí.

| Daño, sin ningún atacante | Mitigación en esta spec |
|---|---|
| Un dato mal extraído que nadie corrige y que decide algo sobre la persona | RF-11, RF-12: confianza visible y umbral que corta antes de promover |
| Un campo apagado por comodidad que desaparece de mil documentos siguientes | RF-20: queda registrado quién lo apagó y cuándo |
| Un modelo de datos generado a partir de una alucinación | RF-18, RF-19: se propone, no se aplica |
| El documento sale del perímetro hacia un tercero | RF-9, RF-21: puerto y adaptadores, para que el proyecto decida |
| Un alta que debió ser coincidencia parte en dos el historial de una persona o empresa | RF-28, RF-29, RF-30: candidatos a la vista y ninguna alta sin confirmación |
| Una tabla ajena alterada por la herramienta rompe algo que ella no conoce | RF-31: no emite ninguna sentencia sobre lo preexistente |
| Un código sustituido desvía un pago: no cobra **el proveedor legítimo**, que no participó en nada | RF-47, RF-48, RF-49: no se abre la dirección, y el cotejo con el reconocimiento delata el cambio |
| La evidencia original se pierde porque el respaldo de la base no la incluía | RF-59, RF-60, RF-63: se guarda aparte, con retención declarada y línea propia en el inventario |
| Un CSV con datos de terceros sale del sistema y deja de estar protegido | RF-82: queda registrado quién exportó qué y cuándo |
| Un evento de trazabilidad perdido deja sin prueba a quien dependía de ella | RF-42, RF-50, RF-51, RF-53: identidad por hecho, cola local y aviso de riesgo de borrado |
| Una factura se da por auténtica porque su XML se leyó bien, y decide un pago | RF-92: el sello se declara no verificado, y el XML no gana por decreto sobre las otras fuentes |
| El identificador y los registros fiscales de **dos** terceros salen hacia un servicio externo, revelando su relación comercial | RF-93: no se consulta ningún servicio de verificación fiscal |
| Un XML enviado por un proveedor lee ficheros del servidor donde corre el lector | RF-89, RF-90: el DOCTYPE se rechaza por construcción, y no hay bandera que lo reactive |
| Un recibo de pago entra como factura de cero pesos y descuadra la cuenta de **un proveedor** que no participó en el error | RF-85, RF-96: el complemento sin leer se reporta y se advierte antes de dar los importes por definitivos |
| El recibo de nómina de un empleado, que no eligió estar aquí, se mapea a ciegas contra un esquema que nadie verificó | Hasta el 2026-09-12 nómina no se implementó y RF-85 la declaraba sin leer. Desde entonces tiene lector, escrito contra el XSD oficial y con el análisis de impacto (C4) en su cabecera; sigue **sin verificar contra un recibo real**, lo dice, y nombra en `CLAVES_SENSIBLES_NOMINA` lo que el proyecto trata como categoría especial (TAR-54) |

**Límite de C5**: si los documentos llevan datos personales de terceros, sacarlos del perímetro
**no es un riesgo firmable por el dueño del proyecto**. Se usa el adaptador autohospedado o se
rediseña. Esta spec no ofrece la vía del registro de riesgo para ese caso.

## Fuera de alcance

- Elegir qué motor de OCR gana: lo decide el piloto de medición, no esta spec.
- Entrenar o afinar un modelo.
- Aplicar migraciones sobre la base del proyecto consumidor.
- Publicar el paquete en un registro npm: es gate humano, no un paso de esta spec.
- Flujo de trabajo con varios revisores, asignación de cola o notificaciones.
- Soporte a consumidores CommonJS: el template es ESM, y el doble build sería un CDC aparte.
- Formatos de fichero que no sean PDF, imagen ni XML — en particular ofimática, hojas de cálculo
  y correo.
- Leer CFDI 3.3: se lee la 4.0, y una versión anterior se rechaza nombrándola.
- Validar el sello digital de un comprobante, o comprobar su estatus contra el SAT. Lo primero
  exige criptografía y certificados; lo segundo mandaría los datos de dos terceros a un servicio
  externo (RF-92, RF-93).
- Embarcar los catálogos del SAT para traducir códigos a etiquetas: envejecen, y resolverlos
  contra las tablas del proyecto ya es trabajo de la reconciliación (RF-95).
- Convertir la aplicación consumidora en PWA: eso lo hace el proyecto con su propio flujo; la
  herramienta solo aporta la cola y su adaptador de almacenamiento local.
- Consultar servicios externos de seguimiento o de verificación fiscal a partir de un código.
- Alterar el esquema preexistente del proyecto: la herramienta crea lo suyo y propone el resto.
- Deduplicar catálogos que ya vienen sucios: evita añadir duplicados, no limpia los existentes.
- Ser una herramienta de BI: no calcula medidas ni agregaciones, y no hay dirección de filtro
  cruzado — el lienzo modela integridad relacional, no propagación de filtros.

## Criterios de finalización

- **DoF-1**: existe `tools/extractor-documental/` con los seis entry points del plan, y el núcleo
  no importa React, Next ni Supabase.
- **DoF-2**: `npm run empaqueta extractor-documental` pasa en verde, incluida la prueba de
  integración real en un proyecto limpio.
- **DoF-3**: las funciones puras del núcleo tienen pruebas que corren sin red y sin claves.
- **DoF-4**: un revisor puede arrastrar una carpeta, corregir campos, guardar la disposición, y
  la siguiente tanda del mismo tipo llega ya con esa plantilla.
- **DoF-5**: la propuesta de modelo entidad-relación se emite en SQL y no se aplica sin
  aprobación humana.
- **DoF-6**: `npm run validate` en verde, con `verifica:specs` incluyendo esta spec.
- **DoF-7**: el modelo del adaptador que se use va pineado y con entrada en `BITACORA-CDC.md`.
- **DoF-8**: un campo se mapea a una columna existente y su valor se resuelve a una fila concreta,
  sin usar ninguna credencial con privilegio de esquema.
- **DoF-9**: ninguna ruta del código emite una sentencia que altere una tabla preexistente, y hay
  una prueba que lo demuestra.
- **DoF-11**: dos lecturas del mismo código como evento producen identidades distintas, con prueba.
- **DoF-12**: ninguna ruta compara un identificador por similitud, y hay una prueba que demuestra
  el emparejamiento erróneo que eso produciría.
- **DoF-13**: varias lecturas encoladas y enviadas en el mismo instante conservan instantes
  distintos y no se deduplican entre sí.
- **DoF-14**: un lote cerrado rechaza altas, y dos lotes pueden compartir título.
- **DoF-15**: la ruta de un original lleva la organización como primer segmento, y el mismo fichero
  de dos organizaciones distintas produce rutas distintas.
- **DoF-16**: una corrección conserva la versión anterior y exige motivo.
- **DoF-17**: el índice y la resolución contra catálogo normalizan un identificador igual, con
  prueba que ata ambos caminos.
- **DoF-18**: un operario no puede validar, cerrar ni suprimir, comprobado sobre la matriz entera.
- **DoF-19**: una supresión deja constancia y se distingue de un registro inexistente.
- **DoF-20**: la estimación sin tarifa devuelve desconocido y no cero; el CSV neutraliza una celda
  que empieza por `=` y escribe el BOM.
- **DoF-10**: las pruebas corren sin base de datos, sobre los tres descriptores de ejemplo, y el
  vacío recorre el mismo código que el poblado.

## Dudas abiertas

- El umbral de confianza por defecto: no se puede fijar hasta medir la correlación entre la
  puntuación del motor y el error real sobre el corpus propio.
- Si el manuscrito del proyecto es de plantilla repetida, lo que decidiría si hace falta un
  fine-tune o basta un modelo genérico.
- Cómo se identifica "el mismo tipo de documento" para reusar una plantilla: ¿lo elige el
  revisor, o se infiere? Afecta a RF-16.
- Si la propuesta de modelo debe emitirse como migración con marca de tiempo o como SQL suelto.
- El plazo de retención por defecto de los originales: depende del tipo de documento y de la
  jurisdicción, así que se declara por proyecto y no se fija aquí.
- Progreso y reanudación de un lote que tarda horas: importante en operación, pero no condiciona el
  modelo de datos.
- Los parámetros de la ráfaga del escáner: dependen del teclado y del lector concretos, y la vía
  buena mientras tanto es configurar prefijo y sufijo en el aparato.
- Qué se encola sin conexión además de los escaneos, y qué se le dice al usuario cuando el
  presupuesto de almacenamiento se agota.
- El umbral de similitud que separa "candidato" de "coincidencia": a ojo, o llena la cola de
  falsos ambiguos, o deja pasar duplicados. Se mide sobre catálogos reales.
- Si el descriptor se genera desde los tipos del proyecto en tiempo de build o se mantiene a mano:
  lo primero no se desincroniza, lo segundo no ata la herramienta al tipado de nadie.
- Cómo se resuelve un catálogo demasiado grande para traerlo al navegador: ¿búsqueda contra el
  almacén, o índice previo?
- Qué hace el consumidor cuando la herramienta sube de major y su plantilla guardada usa un
  campo que desapareció.
