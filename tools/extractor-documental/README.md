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
  leeCfdi40, registroDeEsquemas, lectorDeTimbre11, lectorDePagos20, avisoDelComprobante,
} from '@tu-scope/extractor-documental/xml'

// Nada se registra por defecto. Lo que no registres, sale DECLARADO como no leido.
const registro = registroDeEsquemas([lectorDeTimbre11, lectorDePagos20])

const lectura = leeCfdi40(bytesDelXml, registro)
if (!lectura.esCfdi) console.warn(lectura.motivo)   // nunca lanza: el fallo es un motivo

lectura.campos              // el tronco: total, rfc_emisor, rfc_receptor, folio...
lectura.conceptos           // los renglones, cada uno con sus campos
lectura.complementos.leidos // lo que si se leyo
lectura.complementos.sinLector  // lo que NO, con su direccion, su version y el motivo
avisoDelComprobante(lectura)    // el aviso en espanol, o `null` si no hay nada que decir
```

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
| Leer CFDI 3.3, nomina o carta porte | La 3.3 esta fuera de alcance. Los otros dos se registran el dia que haya un documento real: escribir su mapeo a ciegas es inventarse el dato de otro |

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
