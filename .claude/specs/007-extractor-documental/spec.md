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
- RF-6: EL SISTEMA aceptará PDF e imágenes, y rechazará cualquier otro tipo nombrando el archivo
  y el motivo.
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
- Formatos que no sean PDF ni imagen.
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
- El umbral de similitud que separa "candidato" de "coincidencia": a ojo, o llena la cola de
  falsos ambiguos, o deja pasar duplicados. Se mide sobre catálogos reales.
- Si el descriptor se genera desde los tipos del proyecto en tiempo de build o se mantiene a mano:
  lo primero no se desincroniza, lo segundo no ata la herramienta al tipado de nadie.
- Cómo se resuelve un catálogo demasiado grande para traerlo al navegador: ¿búsqueda contra el
  almacén, o índice previo?
- Qué hace el consumidor cuando la herramienta sube de major y su plantilla guardada usa un
  campo que desapareció.
