# @tu-scope/extractor-documental

Carga masiva de documentos (PDF, imagenes, carpetas), revision humana de lo extraido, y mapeo
contra los catalogos que el proyecto **ya tiene**.

> **Estado: 45 de 48 tareas, 372 pruebas en verde** sin red, sin base de datos y sin navegador.
> Los ocho entry points se instalan e importan en un proyecto limpio (`npm run empaqueta`).
> **Lo que falta y por que**, en `.claude/specs/007-extractor-documental/tareas.md`: tres umbrales
> que se MIDEN y no se inventan (TAR-17, TAR-25, TAR-34) y el enrutado desde `AGENTS.md`, que es
> un CDC pendiente de aprobacion.

## La regla que ordena todo

El nucleo **no importa nada**: ni React, ni Next, ni Supabase, ni ningun proveedor de OCR. Eso es
lo que lo hace instalable en cualquier proyecto. Lo que necesita React vive en `./react`, detras de
un `peerDependency` opcional; los adaptadores reciben su cliente **inyectado** en vez de importarlo.

Hay pruebas que lo vigilan, y no de adorno: `pruebas/contrato.ts` recorre **todo** `src/` —incluidas
las subcarpetas y los `.tsx`— y falla si algo importa lo que no debe, usa `any`, pasa de 500 lineas,
o declara en `exports` un subpath que no existe.

## Entry points

| Subpath | Que es | peer |
|---|---|---|
| `.` | Nucleo: tipos, puertos, estados, clasificacion, identidad, codigos, cola, plantilla, esquema, reconciliacion, versiones, busqueda, costes, CSV, supresion, **capa 0** y **propuesta de modelo E-R** | — |
| `./plugin` | Manifiesto con icono SVG en linea. Importable **sin React** | — |
| `./xml` | Lector de XML sin dependencias y **registro de esquemas**: CFDI 4.0, timbre y pagos. El vocabulario del SAT vive aqui, no en el nucleo | — |
| `./motores/openai-compat` | `MotorOcr` contra un vLLM autohospedado. **Solo `fetch`**, cero dependencias | — |
| `./motores/mistral` | `MotorOcr` contra la API de Mistral, con troceo por paginas | — |
| `./motores/proceso-local` | `MotorOcr` que lanza un PROCESO local (Tesseract por zonas, `motores-locales/tesseract.py`) por el mismo puerto y la misma barrera de validacion. Node | — |
| `./lectores/zxing` | `LectorDeCodigos` de SERVIDOR: los QR y codigos de barras que ya estan en la imagen de pagina. El wasm sale del paquete, nunca de un CDN. Node | `zxing-wasm` opcional |
| `./almacenes/supabase` | `AlmacenDocumentos` + `AlmacenPlantillas`. Cliente inyectado | opcional |
| `./almacenes/supabase-storage` | `AlmacenDeOriginales`: bucket privado, URL firmada | opcional |
| `./almacenes/indexeddb` | `AlmacenLocal` para la cola sin conexion | — |
| `./react` | `ZonaDeIngesta`, `TablaDeRevision`, `LienzoDeModelado` y las decisiones puras que las gobiernan | `react` |

El esquema va en `migraciones/001-extractor-documental.sql`, **dentro del paquete**: un adaptador
sin su esquema no sirve de nada.

## Los puertos

Interfaces, sin implementacion. Es lo que deja que cada proyecto decida si el documento sale de su
perimetro (control C4) en vez de venir cocido aqui.

```
MotorOcr           extrae(documento, opciones) -> PaginaExtraida[]
LectorDeCodigos    lee(imagen) -> cargas crudas        (separado de MotorOcr, a proposito)
AlmacenDocumentos  guarda / lee / lista
AlmacenPlantillas  guarda / lee la plantilla por defecto
AlmacenLocal       cola de lecturas mientras no hay conexion
AlmacenDeOriginales  guarda el binario, devuelve URL firmada y caduca
RepositorioDeRegistros  guarda un lote, lo lee, busca por criterios
EsquemaExistente   describe() -> DescriptorDeEsquema
```

`EsquemaExistente` **no consulta nada** por defecto: devuelve el descriptor que el integrador
declaro. No hay via sin privilegio para introspeccionar un esquema de Supabase (el OpenAPI por
anon key esta bloqueado y la introspeccion GraphQL viene desactivada), y exigir una clave secreta
ampliaria el privilegio en todo proyecto consumidor.

`LectorDeCodigos` esta **deliberadamente separado** de `MotorOcr`: el OCR devuelve confianza y
region, un decodificador devuelve una carga que decodifico o no. Unificarlos obligaria a inventarle
una confianza al codigo.

## Capa 0: el PDF que ya trae su texto

Entre el 30 % y el 50 % de un corpus tipico son PDF generados por software. Pasarlos por un motor
es pagar dos veces: la llamada y la fidelidad, porque el texto nativo es exacto y el reconocido es
una estimacion.

```ts
import { extraeConCapaCero } from '@tu-scope/extractor-documental'

const { paginas, porCapaCero, motivo } = await extraeConCapaCero(motor, bytes)
// porCapaCero: true  -> no se llamo al motor
// motivo: por que SI hubo que llamarlo (cifrado, escaneo, texto ilegible...)
```

Toda duda resuelve **llamando al motor**. La asimetria manda: un falso negativo cuesta una llamada;
un falso positivo mete datos corruptos con apariencia de exactos **y sin pasar por la cola**.

Y un matiz que decide su correccion: **pedir anotaciones llama al motor aunque el PDF traiga
texto**. La capa 0 da texto, no campos con confianza y region.

## Leer un XML: el esquema se registra, no se codifica

Para una factura, el XML es el documento fiscal y el PDF solo su representacion impresa. De ahi
salen los campos exactos, sin motor y sin estimar nada.

Pero un CFDI **no es un formato**: es un tronco comun mas un conjunto **abierto** de complementos
autorizados, cada uno con su esquema y su version. Si la herramienta llevara cada esquema escrito
dentro, cada publicacion del SAT seria una version nueva de la herramienta. Aqui no: el paquete trae
lo que todo CFDI tiene, y **cada proyecto registra lo que su caso necesita**.

```ts
import {
  leeCfdi40, registroDeEsquemas, lectorDeTimbre11, lectorDePagos20, lectorDeComercioExterior20, lectorDeCartaPorte31, lectorDeNomina12, avisoDelComprobante,
} from '@tu-scope/extractor-documental/xml'

// Nada se registra por defecto. Lo que no registres, sale DECLARADO como no leido.
// Registrar nomina es una decision con analisis de impacto: lee la cabecera de su lector antes.
const registro = registroDeEsquemas([lectorDeTimbre11, lectorDePagos20, lectorDeComercioExterior20, lectorDeCartaPorte31, lectorDeNomina12])

const lectura = leeCfdi40(bytesDelXml, registro)
if (!lectura.esCfdi) console.warn(lectura.motivo)   // nunca lanza: el fallo es un motivo

lectura.campos              // el tronco: total, rfc_emisor, rfc_receptor, folio...
lectura.conceptos           // los renglones, cada uno con sus campos
lectura.complementos.leidos // lo que si se leyo
lectura.complementos.sinLector  // lo que NO, con su direccion, su version y el motivo
avisoDelComprobante(lectura)    // el aviso en espanol, o `null` si no hay nada que decir
```

### Los cinco lectores que trae el paquete

| Lector | Que lee | Evidencia |
|---|---|---|
| `lectorDeTimbre11` | El timbre fiscal digital 1.1: UUID, fecha de timbrado, PAC, sellos | Confirmado contra un CFDI real |
| `lectorDePagos20` | Pagos 2.0: totales, cada pago y cada documento relacionado, numerados | Direccion confirmada contra el XSD; mapeo sin recibo real |
| `lectorDeComercioExterior20` | Comercio Exterior 2.0, el de una factura de EXPORTACION: clave de pedimento, INCOTERM, tipo de cambio y total en dolares, emisor, propietarios, receptor y destinatarios con sus domicilios, y cada mercancia con fraccion arancelaria, valor en dolares y descripciones especificas (marca, modelo, serie), todo numerado | Estructura cotejada contra el XSD oficial con `medicion/deriva.mjs` (2026-09-12: sin deriva); mapeo sin factura de exportacion real |
| `lectorDeNomina12` | Nomina 1.2, el recibo de pago de un EMPLEADO: raiz (tipo, periodo, dias, totales), patron, la persona (CURP, NSS, antiguedad, contrato, puesto, salario, banco y cuenta), percepciones con horas extra, deducciones, otros pagos con subsidio y compensacion, e incapacidades, todo numerado y con `resumen_del_recibo`. Es el unico lector con **analisis de impacto (C4) escrito por delante**: expone `CLAVES_SENSIBLES_NOMINA` y `PREFIJOS_SENSIBLES_NOMINA` (cuenta bancaria, salario, sindicato, incapacidades) para que el proyecto decida quien las ve y cuanto se conservan | Estructura cotejada contra el XSD oficial (2026-09-12: sin deriva); mapeo sin recibo real |
| `lectorDeCartaPorte31` | Carta Porte 3.1, el del traslado de mercancias: identificador CCP, regimenes aduaneros, ubicaciones de origen y destino con domicilio y fecha, mercancias con peso, valor, fraccion arancelaria, documentacion aduanera, guias y cantidades transportadas, el medio (autotransporte con vehiculo, seguros y remolques; maritimo con contenedores; aereo; ferroviario con carros) y las figuras de transporte con licencia, partes y domicilio. Los 25 elementos y ~150 atributos del esquema, con claves derivadas del nombre del SAT (`PlacaVM` → `..._placa_vm`) y un contador por lista | Estructura cotejada contra el XSD oficial con `medicion/deriva.mjs` (2026-09-12: sin deriva); mapeo sin carta porte real |

Del comercio exterior se mapea el esquema **entero**, y los identificadores (registro fiscal
extranjero, fraccion arancelaria, numero de serie, clave de pedimento, certificado de origen) van
marcados para compararse exactos. Los codigos de catalogo (`FOB`, `A1`, `06`) se emiten tal cual:
resolverlos es del proyecto, como siempre.

Carta porte y nomina no llevan tablas a mano: declaran el **arbol** de su esquema una vez y
`lectorDeArbol` lo recorre (claves derivadas del nombre del SAT con `claveDeAtributo`, listas
numeradas con contador, `noLeido` para lo que el esquema no anticipa). El inventario que compara
`medicion/deriva.mjs` sale del mismo arbol, asi que no puede divergir del lector. Sirve tambien
para un esquema tuyo: `lectorDeArbol({ clave, nombre, atributosDeRaiz, ramas, identificadores })`.

### Registrar un esquema propio

Es la razon de ser del modulo. No conoce el SAT: sirve para cualquier esquema, incluido uno tuyo.

```ts
const mio: LectorDeComplemento = {
  clave: { espacio: 'http://mi-empresa/addenda', nombreLocal: 'OrdenDeCompra', version: '1.0' },
  nombre: 'Orden de compra interna',
  lee: (nodo) => ({
    campos: [{ clave: 'orden', valor: atributo(nodo, 'Numero') ?? '', confianza: 1, procedencia: 'xml' }],
    noLeido: [],
  }),
}
const registro = registroDeEsquemas([lectorDeTimbre11, mio])
```

Tres reglas, y ninguna es de estilo:

- **Se resuelve por la direccion del espacio de nombres, jamas por el prefijo.** `cfdi:` es
  convencion del emisor: el mismo comprobante puede venir con otro prefijo y es el mismo esquema.
- **La version va pineada, sin comodin**, y la direccion sola no basta: las dos versiones del timbre
  comparten direccion y solo se distinguen por su atributo `Version`.
- **Declarar, no descartar.** Lo que no se lee se reporta, y el motivo distingue "no hay lector" de
  "hay lector de otra version" — que para quien integra son dos acciones distintas.

### Que NO hace, y no es temporal

| No hace | Por que |
|---|---|
| Verificar el sello del emisor ni el del SAT | Exige criptografia y certificados. **Analizar no es validar, y validar no es autenticar**: el campo `verificado` es el literal `false`, asi que ponerlo a `true` ni siquiera compila |
| Aceptar un `DOCTYPE` | Es lo que permite que la factura de un proveedor lea ficheros de tu servidor. No hay bandera: **no existe el codigo** que resolveria la entidad |
| Descargar esquemas por red | Una herramienta que necesita internet para leer un fichero local deja de servir donde estos documentos se procesan |
| Consultar el estatus en el SAT | Mandaria el identificador y los registros fiscales de **dos terceros** a un servicio externo |
| Traducir codigos a etiquetas | Emite `03`, nunca "Transferencia electronica". Un catalogo embarcado envejece; resolverlo contra **tus** tablas es trabajo de `resuelveIdentificador` |
| Convertir importes a numero | `1160.00` se conserva como cadena: pasar por `number` pierde el cero y abre la puerta al redondeo binario |
| Leer CFDI 3.3 | Esta fuera de alcance. Los cuatro complementos comunes (pagos, comercio exterior, carta porte, nomina) vienen cotejados contra su XSD, y su mapeo espera igual un documento real de cada uno |
| Decidir por ti que hacer con los datos de un empleado | El lector de nomina lee el recibo entero (uno a medias es un recibo falso) y NOMBRA lo sensible; retencion, acceso y supresion son del proyecto, y cruzar recibos para perfilar a una persona es un dano que ninguna firma autoriza (limite de C5) |

### Que la estructura no envejezca en silencio

El lector es una traduccion a mano de un esquema oficial, y **una traduccion a mano diverge sola**.
Es el mismo problema que `pruebas/banco-espejo.ts` resuelve para la migracion de la base, con una
diferencia que decide el diseno: aquella fuente es un fichero del repositorio, y esta vive **fuera
del perimetro**, en la red.

Tres cosas pueden desalinearse, y cada una tiene su respuesta:

| Que cambia | Que lo caza |
|---|---|
| El SAT publica una **version nueva** de un complemento | La version va pineada: el documento se reporta con las dos versiones nombradas, no se lee mal |
| Aparece un **elemento o atributo nuevo** sin cambiar la version | `LecturaDeCfdi.noLeido` lo declara. Nada se pierde en silencio, ni en el tronco ni en los complementos |
| Aparece o desaparece un **codigo** de un catalogo | `npm run catalogos` lo dice, y para los doce catalogos de los que depende una regla dice QUE codigo entro o salio, por su nombre |
| Cambia el **significado** de un codigo que sigue ahi | **Nada automatico.** Medido: el catalogo publicado son 5,8 MB con 162.233 codigos y CERO descripciones legibles. Dice que codigos valen, no que quieren decir |

Y para cotejar contra el esquema publicado, a mano y fuera del gate:

```bash
npm run deriva -- --documento factura.xml   # estructura: sigue el schemaLocation del propio CFDI
npm run deriva -- ruta/o/url/del.xsd        # o un esquema concreto
npm run catalogos                           # codigos: compara contra la ultima referencia
npm run catalogos -- --sella                # acepta lo de ahora como nueva referencia
```

La referencia de catalogos ocupa **4 KB** frente a los 5,8 MB de la fuente: de los doce catalogos
que significan algo se guarda la lista entera, y del resto solo la cuenta, porque un codigo postal
nuevo es rutina y un codigo nuevo en uso de comprobante no lo es. El corte esta MEDIDO: esos doce
tienen 25 codigos o menos y el siguiente ya es geografia con 66.

Va **fechada por quien publica**, no por el dia en que miraste: el servidor declara su
`last-modified` y su identificador de version, y los dos se guardan. Eso da dos cosas. La fecha que
afirma la fuente, que es la unica que sirve para decir "esto valia entonces". Y una comprobacion
barata: si el identificador no cambio, no se descarga nada — **una decima de segundo en vez de
5,7 MB**, y una comprobacion cara es una que se deja de correr.

Y la consecuencia que mas rendimiento da: **la serie historica no hay que construirla**. Cada
sellado deja la referencia anterior en el historial de git, fechada por la fuente. `git log` sobre
ese fichero ES el repositorio de versiones, sin una sola pieza nueva.

Compara en **las dos direcciones**: lo que el esquema declara y el lector no mapea, y lo que el
lector mapea y el esquema no declara — que es la peor senal, porque significa que se invento algo o
que lo quitaron. Distingue los huecos de las **omisiones deliberadas**, para no pedir que arregles
lo que ya esta decidido.

Sale a la red **a proposito**, y por eso vive en `medicion/` y no en el paquete, no corre en el
camino de lectura de ningun documento, y **no esta encadenado a `npm run validate`**: un gate que
falla porque alguien no tenia conexion es un gate que la gente aprende a ignorar.

Lo mas barato sigue siendo otra cosa: **tus propios documentos**. Cada cosa que un comprobante real
trae y el lector no traduce ya se declara, y eso te dice que recibes de verdad, no que dice la norma.

Y una consecuencia que conviene tener presente: **el significado de un codigo no vive aqui**. Vive
en las tablas de tu proyecto, o en su grafo. Esta herramienta emite `03` y nunca "Transferencia
electronica" justamente para que ese significado tenga un solo sitio donde envejecer, y para que
el dia que cambie se pueda fechar. La spec 004 lleva anotado ese hueco.

### El cotejo a tres bandas sale gratis

El lector emite `uuid`, `rfc_emisor`, `rfc_receptor` y `total` con **las mismas claves** que
`analizaCarga` saca del QR impreso. Asi que `corrobora` cotea las tres fuentes sin una linea nueva:

```ts
corrobora(camposParaCotejo(lectura), camposDelQr)   // discrepancia -> revision humana
cotejaSelloConQr(lectura.sello.emisor, campoFeDelQr) // el sello va APARTE: base64 distingue mayusculas
```

Y la regla del modulo cotejado vale igual: **ninguna fuente gana por decreto**. El XML no es mas
fiable por venir estructurado, precisamente porque su sello no se verifica.

### Sin cotejo no se auto-valida

`puedeValidarseSinRevision(filas, cotejado)` lleva un segundo argumento **obligatorio y sin valor
por defecto**, igual que el umbral. Un campo de XML o de un codigo llega con confianza 1 y sin
region que citar, asi que pasaria solo las otras dos barreras.

Lo destapo el banco: `node banco/cli.mjs xml` promovia **doce comprobantes de doce sin que nadie
los mirara**. Para el DATO estaba bien —es una transcripcion, no hay lectura que revisar— pero para
el DOCUMENTO no decia nada: el sello no se verifica, y un CFDI inventado analiza igual de limpio.

Lo que hace fiable a una fuente determinista no es su confianza: es que **otra fuente independiente
diga lo mismo**. Si el documento no tiene con que cotejarse, va `false` y se manda a revision, que
es la respuesta correcta cuando no hay segunda fuente.

El argumento es obligatorio a proposito. Un default seria la puerta por la que un proyecto
auto-validaria comprobantes sin cotejar nada, sin haberlo decidido nunca.

La demo lo tiene cableado entero en su seccion 7: sueltas el XML, pegas la carga del QR impreso en
ese mismo comprobante, y ves el cotejo a tres bandas con sus acuerdos y sus discrepancias. Una sola
discrepancia manda a revision, y **el cotejo solo cuenta si sale sin ninguna**.

### Verificar la demo

```bash
npm run demo            # levanta la pagina
npm run verifica:demo   # la recorre en un navegador de verdad
```

La demo es el unico artefacto del paquete SIN red de seguridad: `npm run prueba` no la ve, `tsc` no
la typechequea y el gate no la toca. Ya se cobro dos piezas — un boton con `hidden` que se veia
siempre porque una regla de clase le ganaba por especificidad, y una llamada que se quedo con un
argumento cuando la funcion paso a exigir dos. Ninguna revision del codigo vio ninguna de las dos.

`verifica:demo` necesita Playwright y por eso **no esta en el gate**: este paquete no lo declara
como dependencia, porque su nucleo no tiene ninguna. Si no esta instalado lo dice y sale, en vez de
fallar como si la demo estuviera rota.

La demo esta en un **bento grid** de diez tarjetas (`.tarjeta.span-N` sobre `.bento`, doce
columnas). `verifica:demo` lo comprueba con geometria real, no con la clase declarada: en un
viewport ancho dos tarjetas de medio ancho quedan lado a lado; bajo 760px la misma pareja se apila,
porque `.tarjeta{grid-column:1/-1!important}` gana por especificidad sin tocar el HTML.

### Catalogos configurables por el usuario, y uso de tokens: solo en la demo

Dos tarjetas nuevas viven **enteramente en el navegador**, sin backend propio:

- **Catalogos** (`localStorage['bdp:catalogos']`, forma `{ [nombre]: {id,etiqueta}[] }`): crear,
  añadir fila, quitar fila, eliminar el catalogo. La tarjeta de Reconciliacion los usa con
  «Cargar catalogo activo» / «Guardar como catalogo» — sin duplicar la logica de `resuelveValor`.
- **Uso de tokens** (`localStorage['bdp:uso-tokens']`): un registro por cada llamada al motor de
  la seccion 9, con lo que el **servidor** declaro en `usage` — nunca una estimacion propia.

Esto ultimo obligo un cambio en el nucleo, no solo en la demo: `OpcionesDeExtraccion` gano un
callback opcional `alConsumirTokens?: (uso: UsoDeTokens | null) => void`, y `motorCompatible` lo
llama con lo que lea de `respuesta.usage` (o `null` si el servidor no lo declara, o si lo declara
a medias — un total que mezcla lo real con lo desconocido es peor que admitir que no se sabe). Es
**aditivo**: la firma de `extrae()` no cambio, así que ningun llamador existente se rompe.

> **Estado de la evidencia.** Las direcciones de CFDI 4.0 y del timbre estan **confirmadas** contra
> un CFDI real de honorarios (2026-09-10). La de **pagos sigue sin confirmar**: no ha pasado ningun
> recibo de pago real. `src/xml/cfdi/espacios.ts` distingue las tres.
>
> Ese documento real destapo un defecto que ninguna prueba sintetica veia: el bloque de impuestos se
> perdia entero y en silencio. De ahi sale `LecturaDeCfdi.noLeido`, que declara todo hijo del tronco
> que el lector no traduce — la regla de los complementos, aplicada donde menos se notaba.

## Motores

```ts
import { motorCompatible } from '@tu-scope/extractor-documental/motores/openai-compat'

const motor = motorCompatible({
  base: 'http://localhost:8000/v1',
  modelo: 'paddleocr-vl-0.9.1',   // PINEADO: `...:latest` se rechaza al construir (C1)
})
```

Los dos motores validan la respuesta **campo a campo** antes de devolverla: una `confianza: "alta"`
o un `95` en escala 0-100 descartan el campo en vez de romper la comparacion contra el umbral en
silencio. Ni la clave ni el cuerpo de la respuesta aparecen en un mensaje de error.

`./motores/mistral` habla por `fetch` y no por el SDK — desviacion declarada de la tabla §4 del
SDD; el motivo esta escrito en el fuente.

## Reconciliar valores contra un catalogo

Lo dificil no es mapear el campo a la columna: es resolver que `"ACME S.A. de C.V."` **es la fila
1874** y no una nueva.

```ts
import { resuelveValor, parecidosA } from '@tu-scope/extractor-documental'

const r = resuelveValor('ACME SA', filasDeProveedores, {
  umbral: 0.6,              // OBLIGATORIO: no hay default defendible sin medirlo
  margenDeAmbiguedad: 0.08,
})
// r.estado: 'resuelto' | 'ambiguo' | 'sin_resolver'
// r.elegida es null salvo en 'resuelto'. Nunca se ofrece "el mejor" en los otros dos.
```

**Dos preguntas distintas, y confundirlas cuesta duplicados**: `resuelveValor` responde *«¿es esta
fila?»* —ahi el umbral manda— y `parecidosA` responde *«¿te suena de algo?»*, **sin filtrar**. Al
proponer un alta hay que enseñar los segundos: si se propone es porque nadie llego al umbral, asi
que la lista de la resolucion viene vacia por definicion, y el revisor daria de alta «ACME
Servicios Industriales» sin ver que «ACME S.A. de C.V.» ya existe.

Y los **identificadores no se parecen: son o no son**. `resuelveValor` **lanza** ante
`formato: 'identificador'`; van por `resuelveIdentificador`, por igualdad exacta. Dos GTIN que
difieren en un digito se parecen un 95 % y emparejarlos mete stock en el SKU equivocado.

## La propuesta de modelo E-R

```ts
import { proponeModelo } from '@tu-scope/extractor-documental'

const { sql, avisos, entidades } = proponeModelo(plantilla, descriptor)
// `sql` es TEXTO. Aqui no hay cliente de base de datos ni forma de ejecutarlo.
```

Se emite, **no se aplica** (RF-19), y eso no se cumple prometiendolo: hay una prueba que lee el
fuente y falla si aparece `execute(`, `query(`, `rpc(` o `.from(`. Sobre las tablas que ya existen
en tu proyecto **no se emite una sola sentencia** (RF-31), y una barrera en el propio codigo lanza
si alguna vez se emitiera.

## Del corpus al modelo: leer miles de documentos y proponer las entidades

Spec: `.claude/specs/008-corpus-a-modelo/`. Lo que 007 no tenia: nada miraba N documentos a la
vez. `proponeModelo` proyecta UNA plantilla a UNA tabla; las relaciones las ponia un humano.

```ts
import { leeCorpus, infiereModelo, revisaSql } from '@tu-scope/extractor-documental'
import { motorCompatible } from '@tu-scope/extractor-documental/motores/openai-compat'

// 1. Cada documento por la via que le corresponde, decidida por sus BYTES.
const { lecturas, porRuta } = await leeCorpus(archivos, {
  motor: motorCompatible({ base: 'http://127.0.0.1:11434/v1', modelo: 'glm-ocr:q8_0', modo: 'transcripcion' }),
  registro: registroDeEsquemas([lectorDeTimbre11, lectorDePagos20, lectorDeComercioExterior20, lectorDeCartaPorte31, lectorDeNomina12]),
  patrones: [{ clave: 'rfc_emisor', expresion: /RFC emisor:\s*([A-Z0-9]{12,13})/, formato: 'identificador' }],
  identificadores: new Set(['rfc_emisor', 'rfc_receptor', 'uuid', 'folio']),
  enVuelo: 1, // se MIDE; ver abajo
})
// porRuta → { 'capa-cero': 6, xml: 8, motor: 7, ninguna: 1 }  — y la de `ninguna` trae su motivo

// 2. La inferencia sobre el corpus entero. Pura, sin red.
const { propuesta, entidades, dudas, documentos } = infiereModelo(
  lecturas.map((l) => ({ documentoId: l.documentoId, tipoDocumento: l.tipoDocumento, campos: l.campos })),
  descriptorDelProyecto,
)
// propuesta es una PropuestaDeModelo: el lienzo y revisaSql sirven sin tocarlos. NADIE la aplica.
```

Tres reglas gobiernan la inferencia, y ninguna lleva umbral:

1. **Solo un campo `identificador` que se repite EXACTO en dos documentos funda una entidad.** Un
   RFC en trescientas facturas es una entidad; un folio que nunca se repite es un atributo del
   documento; un texto libre que se repite es una **duda** («marcalo identificador si lo es»),
   no una entidad. Y un `...` copiado de la plantilla no funda nada, por forma.
2. **Un campo es atributo de la entidad si depende de su identificador en TODOS los grupos
   comprobables.** El nombre que siempre acompana al mismo RFC se muda a la entidad, con el
   numero de grupos en que se comprobo. Si en un grupo cambia, es una duda con los documentos
   que la rompen, y el campo se queda en el documento. La mayoria seria un umbral.
3. **Se propone, nunca se aplica.** Entidades antes que documentos, clave foranea, RLS en todas,
   `revisaSql` antes de devolver. Lo que ya existe en el descriptor se referencia por su clave
   primaria real y no se crea.

Las dudas son salida de primera clase: cardinalidad no uniforme (un documento con dos RFC de
emisor), identificador de un solo valor (¿entidad de un miembro o constante?), dependencia rota,
documento sin campos. Declarar, no descartar.

### La via del motor tiene dos formas, y el motor decide cual

- **`modo: 'campos'`** (por defecto): se piden transcripcion Y campos en JSON, y cada valor se
  coteja contra la transcripcion del propio motor (`cotejaContraTranscripcion`). Un valor que no
  esta en el papel no entra al resultado: va a `cotejo.noCoinciden`, que es la cola humana.
- **`modo: 'transcripcion'`**: para motores de OCR puros, que NO siguen instrucciones de formato.
  Se pide solo el texto y los campos salen por `camposPorPatron` sobre el, con `procedencia: 'ocr'`
  y **confianza 0**: el motor no declara ninguna y no se inventa. Todo pasa por revision hasta que
  una medicion diga otra cosa.

Medido el 2026-09-11 con GLM-OCR (0,9 mil millones de parametros, `glm-ocr:q8_0` por Ollama):
pedido el JSON, devolvio tablas HTML y un `"markdown":=` que no es JSON; pedida la transcripcion,
devolvio el texto exacto de un escaneo sintetico en 74 s de CPU (65 s de ellos codificando la
imagen antes del primer token). El mismo escaneo le cuesta a `qwen2.5vl:7b` unos 8 minutos.

### Medido el 2026-09-11: tres motores autohospedados sobre el mismo corpus sintetico

Hardware: 16 hilos de CPU, 15 GB de memoria, **sin GPU**. Ollama. Corpus: 7 escaneos sinteticos
de una pagina (5 facturas, 2 minutas; 1240x1754) con verdad conocida, mas un escaneo real que solo
aporta tiempo. Todos los motores van pineados (`glm-ocr:q8_0`, `qwen2.5vl:3b`, `qwen2.5vl:7b`).

| Motor | Modo | Paginas leidas | Segundos/pagina | CER (espacio plegado) | Campos correctos | Confianza declarada |
|---|---|---|---|---|---|---|
| `glm-ocr:q8_0` (0,9B) | transcripcion + patrones | **8 de 8** | 103-128 (en frio) · 68-71 (sin reinicio) · **8-12 (imagen ya vista: cache)** | 0,0 % en 6 de 7; 100 % en 1 por transcripcion DUPLICADA (corregido) | **58 de 58** | ninguna (0) |
| `qwen2.5vl:3b` | campos (JSON) | 2 de 7 (contexto 4096) · **1 de 1 con 8192** | 76-164 · 321 con 8192 | 0,4-1,6 % | 7 de 8 devueltos · con 8192: 8 de 10 | constante 1,00 (tambien en los 2 fallos) |
| `qwen2.5vl:7b` | campos (JSON) | 3 de 7 (contexto 4096) · **2 de 2 con 8192** | 288-462 · 430-486 con 8192 | 2,0-14,3 % | **18 de 18** · con 8192: 19 de 20 | 0,90 y 0,95 (el fallo llevaba 0,90) |

Lo que dicen los numeros, y no es lo que parecia:

- **El motor especializado gana en las tres columnas a la vez**: lee todo, sin un caracter
  equivocado, y a un tercio o un quinto del tiempo. Pero **no estructura**: los campos los saca
  el proyecto por patron sobre su transcripcion, y no declara confianza. Por eso van con 0 y todo
  pasa por revision.
- **Los generalistas fallaban en cerrar el JSON por el CONTEXTO, no por leer**: 5 de 7 (3b) y
  4 de 7 (7b) volvieron «el contenido del mensaje no es JSON valido» con el contexto por defecto
  de Ollama (4096: la imagen ya se come una parte). Reiniciado con `OLLAMA_CONTEXT_LENGTH=8192`,
  las mismas facturas cerraron: 7b 2 de 2 con 19 de 20 campos correctos, 3b 1 de 1 con 8 de 10.
  La leccion no es «sube el contexto»: es que un fallo del motor que parece de calidad puede ser
  de configuracion del servidor, y solo se distingue midiendo. **El limite del servidor es parte
  del motor pineado**: cambiarlo cambia lo que sale.
- **La confianza no da senal en ninguno**: 3b la devuelve constante (1,00, tambien en sus dos
  campos equivocados), GLM-OCR no la tiene, y 7b solo toma dos valores: sobre 20 campos con
  contexto amplio dio r = 0,23 con UN fallo (que llevaba 0,90, la misma cifra que 12 aciertos).
  Con esa muestra **no se fija umbral** (TAR-17 sigue bloqueada, ahora con tres motores medidos y
  no uno); lo que haria falta es un corpus con decenas de fallos, y ese no se fabrica.
- **El cache de imagen de Ollama existe y es enorme**: la misma imagen vuelve a costar 8-12 s en
  vez de 110. Para un corpus con duplicados importa; para uno sin ellos, no cuenta. Las cifras
  «en frio» se midieron reiniciando el servidor antes.
- **Dos peticiones en vuelo no ayudan en CPU**: con `OLLAMA_NUM_PARALLEL=2` y `enVuelo: 2`,
  en frio, 0,60 paginas/min de reloj frente a 0,54 con una; cada peticion tardo casi el doble
  (109-296 s). El lote continuo del que habla la literatura (20-26 veces con lote de 64) es de
  GPU, y aqui no hay: se declara como techo, no se estima.
- **Por ruta**: de 22 documentos, 6 fueron por capa 0 y 8 por XML en 0,0 s cada uno, y solo 8
  pasaron por el motor. Enrutar fuera del motor ahorro 14 paginas de motor: a 110 s cada una,
  **unos 26 minutos de los 41 que habria costado mandarlo todo**.

### El corpus de medicion no entra al repositorio

`corpus/` esta en el `.gitignore` de la raiz. `python3 medicion/genera-corpus.py` fabrica un corpus
**sintetico con verdad conocida** —facturas y minutas escaneadas con rotacion, desenfoque y grano;
facturas digitales con capa de texto real; semilla fija; todo inventado y asi declarado en cada
`.json`— porque medir CER, campos correctos y correlacion confianza-error exige una referencia
exacta, y esa referencia no puede salir de un documento real con datos de terceros.

`node medicion/corpus.mjs --modelo glm-ocr:q8_0 --modo transcripcion [--en-vuelo 2] [--extra /ruta/real.pdf]`
corre el lote, imprime la tabla por documento (via, campos, cotejo, segundos), las metricas contra
la verdad, el modelo inferido y el SQL, y escribe un JSON por documento mas `propuesta.json`.
**Imprime forma, nunca valores**: un documento real pasado por `--extra` aporta tiempo y conteos,
nada mas. `pruebas/salida-json.ts` valida lo que dejo la corrida contra los tipos del extractor.

## Identificadores y codigos antes que OCR

Lo que decide si un expediente se puede cargar son sus identificadores (RFC, CURP, NSS), y ahi es
donde un OCR falla mas. Medido el 2026-09-11 sobre 84 paginas reales de 4 expedientes laborales:
Tesseract leyo la prosa bien, y el RFC del empleado salio legible en 1 de 4. El preprocesado de
imagen no lo arregla (mueve la confianza 0-3 puntos). Lo arregla cambiar el orden:

```ts
import { leeCorpus, declaraClases, diagnosticaRfc, diagnosticaCurp, diagnosticaNss, reglaFaltaIdentificador } from '@tu-scope/extractor-documental'
import { motorPorProceso } from '@tu-scope/extractor-documental/motores/proceso-local'
import { lectorZxing } from '@tu-scope/extractor-documental/lectores/zxing'

const resultado = await leeCorpus(paginas, {
  lectorDeCodigos: lectorZxing(),                                  // (a) el QR va ANTES del OCR
  motor: motorPorProceso({ comando: 'python3', argumentos: ['motores-locales/tesseract.py'], modelo: 'tesseract-5.5.0-spa-zonal-1', entorno }),
  clases: declaraClases([{ clase: 'carta', titulo: /carta de recomendaci[oó]n/i }, /* ... */]),
  omiteClases: new Set(['carta']),                                 // (c) lo que no aporta no gasta
  validadores: { rfc: diagnosticaRfc, curp: diagnosticaCurp, nss: diagnosticaNss },  // (f) confianza externa al motor
  motorDeRespaldo: motorCompatible({ base: 'http://127.0.0.1:11434/v1', modelo: 'glm-ocr:q8_0', modo: 'transcripcion' }),
  derivaAlRespaldo: reglaFaltaIdentificador({ curp: ['curp'], constancia_fiscal: ['rfc'], alta_imss: ['nss'] }),  // (e) sin regla no se deriva nunca
})
```

Por pagina, en este orden: **(a) codigos** —la constancia de situacion fiscal trae un QR con
`D3=<idCIF>_<RFC>` y un Code128 con el RFC en claro; la de CURP, un QR de texto con la CURP; todo
sale con `procedencia: 'codigo'` y confianza 1—; **(b) motor principal**; **(c) clase** por titulo;
**(d) cotejo** OCR contra codigo con `corrobora`, y las claves en discrepancia van a revision;
**(e) respaldo** solo por la regla del proyecto; **(f) validadores**: lo que no pasa no entra a
`campos` y se declara en `identificadoresInvalidos`.

Tres reglas que no se negocian:

- **Un identificador corregido por checksum es una PROPUESTA, no un dato.** `corrigePorChecksum`
  cambia UNA posicion entre confusiones de OCR (0/O, 1/I, 5/S, 8/B, 2/Z, 6/G, 3/E, 4/A, 7/T) y
  acepta solo si exactamente una variante pasa; el valor va a `corregidos` con su original y NO
  entra a `campos`. Medido sobre expedientes reales: de 4 correcciones, el QR del mismo expediente
  confirmo 1 y contradijo 2. Un checksum de modulo 10 deja pasar una de cada diez sustituciones,
  y «arreglar» hacia la clave de otra persona es exactamente el dano que C4 no admite. Lo cierra
  el QR o una persona.
- **Sin regla del proyecto no hay respaldo.** `derivaAlRespaldo` no tiene valor por defecto. La
  regla que la medicion respalda es `reglaFaltaIdentificador({ curp: ['curp'], constancia_fiscal:
  ['rfc'], alta_imss: ['nss'], ine: ['curp'] })`: deriva la pagina cuya clase espera un
  identificador que ni el QR ni el OCR dieron, o la que propuso uno que no paso el checksum sin
  otro valido. NO deriva por confianza de pagina: no esta calibrada, y una foto o un sello con
  confianza baja cuesta 100-200 s de motor y no devuelve nada. Medido: 6 paginas derivadas de 84
  frente a 12 con «confianza < 0,6», con solo 2 en comun.
- **Los QR de terceros no se parsean.** INE, CFE, SEP, vacunacion: se cuentan por tipo y largo, su
  contenido no se conserva y su destino no se abre.

Y lo que la medicion dejo escrito (`.claude/specs/009-identificadores-y-codigos/tareas.md`): las
zonas de Tesseract se leen con `--psm 8` y escala 3 porque asi salieron 7 de 7 RFC exactos frente
a 4 de 7 con `psm 7`; la lista blanca de caracteres la ignora el motor LSTM (en zonas solo de
digitos se aplica por software: O→0, I→1, S→5); y la confianza por palabra de Tesseract en esas
zonas es 0, asi que la confianza real la ponen el digito verificador y el cotejo, no el motor.

Las zonas miran tambien DEBAJO de la etiqueta, en columna: en el alta del IMSS el NSS no va a la
derecha de «NSS» sino en la fila de abajo de una tabla, o bajo «No. de Afiliacion al Seguro
Social» partido en dos. Medido tras el cambio: 4 de 5 hojas reales de alta con NSS valido (antes
0 de 5) y 4 de 4 sinteticas exactas (`medicion/genera-alta-imss.py`), sin perder ningun RFC.
Y cada identificador lleva una **plantilla de posiciones** (`LLLLDDDDDDLLLLLLAD` para la CURP):
la lista blanca se aplica por software y por posicion, y una lectura con UNA posicion de clase
equivocada no se pierde: llega al checksum, que la corrige (como propuesta) o la manda a revision.
La constancia de RENAPO imprime la CURP grande y sola en su linea, sin etiqueta al lado: la zona
`curp` la busca por forma en toda la pagina (`medicion/genera-constancias-curp.py`, 4 de 4).

## Umbrales: los tres que NO vienen puestos

`umbral` de confianza, `umbral` de similitud y los parametros de la rafaga del escaner son
**obligatorios y sin valor por defecto**. No es incomodidad: a ojo fallan en las dos direcciones —
o llenan la cola de revision de ruido, o dejan pasar errores con confianza alta. Se miden sobre el
corpus real (TAR-17, TAR-25, TAR-34).

Para el escaner hay una via que **no necesita medir nada**: configurar prefijo y sufijo en el
aparato hace la deteccion determinista. La rafaga por tiempos es el plan B.

### Y un motor real puede devolver la confianza como CONSTANTE

Medido el 2026-09-10 contra un motor autohospedado: 25 campos extraidos, **las 25 confianzas
valieron `0.90` exacto**. El campo que copio literal y el que recompuso, identicos.

Eso no es una medida, es un numero que el modelo escribio porque el formato se lo pedia. Contra
cualquier umbral separa CERO: o pasan todos o no pasa ninguno. TAR-17 dice desde el principio que
«si la correlacion sale cerca de cero, ningun umbral va a funcionar y el problema no es donde
cortar — es el motor». Ahora hay un numero detras.

**Consecuencia practica**: medir la correlacion antes de elegir motor deja de ser recomendable y
pasa a ser obligatorio. Con un motor asi, el umbral no se puede fijar aunque tengas corpus.

## Que esperar de un motor autohospedado, medido

Primera corrida real el 2026-09-10: Ollama en CPU, sin GPU, un escaneo de una pagina de 1280x1640.

| Modelo | Peticion | Tiempo | Resultado |
|---|---|---|---|
| `qwen2.5vl:3b` | solo transcripcion | 2,7 min | completa |
| `qwen2.5vl:3b` | JSON estructurado | 5,6 - 14,6 min | **nunca cierra el JSON** |
| `qwen2.5vl:7b` | JSON estructurado | 8 min | completo y valido |
| `qwen2.5vl:7b` | JSON con esquema de 25 campos | 11,9 min | 25 de 25, sin inventar claves |

Tres cosas que conviene saber antes de elegir:

- **Un modelo de 3.000 millones no cierra un JSON estructurado** sobre un documento denso, por
  mucha ventana de contexto que se le de. Transcribe bien; estructurar ademas es demasiado.
- **El esquema de anotacion no es opcional en la practica.** Sin el, el modelo numera lo que ve:
  `fecha`, `subtotal1` … `subtotal10`. Sirve para leer, no para alimentar una base.
- **Un escaneo no tiene segunda fuente**, asi que se le piden al motor DOS lecturas distintas —una
  transcripcion y los campos— y se comprueba que cada valor extraido aparezca en la transcripcion.
  En esa corrida: 24 de 25 presentes, 1 ausente. Ver §5.2.1 del SDD.

## Probarla, y fabricar el corpus mientras la pruebas

```bash
npm run demo    # http://localhost:4321 — sirve el dist/ real, no una copia
npm run mide    # la tabla de §8 sobre lo que hayas corregido
```

La demo no es solo para verla funcionar: **cada corrección que haces a mano se guarda como una
muestra etiquetada**, y `mide` la lee. §8 de `INVESTIGACION-OCR-MISTRAL` llama a transcribir la
referencia *«el trabajo aburrido, y el único que hace que el resto signifique algo»*; esto lo
convierte en subproducto de probar la herramienta.

**Los dos corpus no cuestan lo mismo, y conviene saberlo antes de empezar:**

| Corpus | Qué hace falta | Desbloquea |
|---|---|---|
| **Similitud** | Solo tu catálogo y tu criterio. **Cero claves** | TAR-25 |
| **Confianza** | Un **motor de OCR real** con su clave | TAR-17 |

El de confianza necesita motor porque la capa 0 da texto exacto **sin confianza por campo**: no hay
score que correlacionar. Sin clave puedes probar todo lo demás —capa 0, ingesta, revisión,
reconciliación, modelo E-R, códigos— pero no produces las muestras que TAR-17 necesita. Por eso la
página trae un ejemplo cargable **cuyas confianzas el corpus rechaza**: están inventadas, y
guardarlas contaminaría justo la medición que decide el umbral.

`demo/corpus/` está en `.gitignore`. Son documentos reales de un negocio: un corpus commiteado es
una fuga con historial de git.

`mide` **no es una prueba de regresión** y no devuelve exit 1 por un decimal — imprime números para
que los lea una persona. Y **no recomienda ningún umbral**: elegir exige saber cuánto cuesta un
error que se cuela frente a una hora de revisión, y eso no está en los datos.

## El banco de pruebas: un negocio ficticio en una base embebida

`npm run demo` prueba la herramienta en el navegador y fabrica corpus. El **banco** hace lo otro:
ejercita el camino entero desde Node —ingesta, extracción, mapeo contra catálogos, cola de revisión,
corrección, persistencia y recuperación— **sin Supabase, sin credenciales y sin red**.

```bash
npm run banco siembra        # crea el negocio ficticio  [--semilla X] [--facturas N]
npm run banco corrida        # el camino completo, con REINICIO DE PROCESO real
npm run banco determinismo   # dos siembras con la misma semilla → la misma huella
npm run banco descriptores   # los tres estados, leídos de la base
npm run banco peligroso      # el escenario de §2.10 y su barrera
npm run banco destruye
```

**Por qué existe.** El SDD §2.8 dice que este template no tiene catálogos, ni datos, ni esquema que
introspeccionar. Eso convertía tres capacidades en documentadas-y-nunca-ejecutadas: la persistencia
sólo existía contra Supabase o IndexedDB, y los tres estados del descriptor eran tres ficheros JSON
que podían afirmar cualquier cosa. Aquí el descriptor sale de `pragma table_info`: describe lo que
la base **tiene**.

**Qué motor de base, y por qué.** `node:sqlite`, que viene dentro de Node 22.18+. El paquete corre
hoy sin ningún `node_modules` propio, y el banco hereda esa propiedad. La alternativa seria era
PGlite —Postgres en WASM—, y su argumento parecía fuerte: producción es Supabase, o sea Postgres.
No aplica a este camino: **el adaptador de Supabase no escribe SQL**, habla PostgREST. El dialecto
sólo vive en la migración, que es otro artefacto.

**Qué NO prueba el banco, dicho en voz alta:**

| | |
|---|---|
| **Las policies de RLS** | SQLite no tiene RLS. En producción la base niega la fila aunque el código se equivoque; aquí el aislamiento por organización lo impone el código del adaptador, que es una garantía más débil. Las policies de `migraciones/001-*.sql` **siguen sin haberse ejecutado nunca** |
| **Los umbrales** | Las confianzas las fabrica un motor de mentira. TAR-17, TAR-25 y TAR-34 siguen bloqueadas: los umbrales se miden sobre corpus real |
| **El OCR** | Los documentos sintéticos son texto plano. Lo que se ejercita es el camino, no la extracción |

`pruebas/banco-espejo.ts` compara el esquema del banco contra la migración real, columna a columna y
CHECK a CHECK: una tabla que cambie en producción y no aquí pone el gate en rojo. Es el mismo
mecanismo que `pruebas/persistencia.ts` usa para las listas de valores, y por la misma razón — una
copia a mano diverge sola.

El banco vive fuera de `exports` y de `files`: **no se publica**. La puerta de
`CREAR-UNA-HERRAMIENTA.md` manda — sin reuso real 3+ veces, publicar sólo añade una versión que
mantener. Promoverlo a `./almacenes/sqlite` sería un CDC aparte.

## Pruebas

```bash
npm run prueba   # construye dist/ y prueba CONTRA EL, sin red y sin navegador
```

Las pruebas importan de `../dist/`, no de `../src/`: se prueba lo que se publica, que es la
convencion de `tools/voz`. Las del banco (`pruebas/banco-*.ts`) usan una base SQLite embebida, que
viene dentro de Node: siguen sin necesitar red, credenciales ni nada instalado. Las fuentes importan con extension `.js` aunque los archivos sean `.ts`
— `tsc` las resuelve, y usar `.ts` ahi hace imposible emitir `dist/`.

La UI tambien tiene pruebas de verdad, no capturas: las decisiones —que columna se ofrece, que
campo cae bajo umbral, si se puede suprimir, como se recorre un arbol de carpetas— viven en modulos
puros fuera de React. En los componentes queda el pegamento, que es justo lo que no lleva
decisiones dentro.
