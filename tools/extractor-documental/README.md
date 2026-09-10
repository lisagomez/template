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
