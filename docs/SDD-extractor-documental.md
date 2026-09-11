# SDD — Extractor documental como herramienta enchufable

**Estado:** **construido y ejercitable.** `tools/extractor-documental/` existe: 45 de las 48
tareas cerradas, 448 pruebas en verde sin red ni credenciales, y un banco de pruebas con base
embebida que recorre el camino entero (§2.20). Las **tres** tareas abiertas son las de
calibración —TAR-17, TAR-25 y TAR-34— y siguen bloqueadas a propósito: la calidad de cualquier
motor de OCR sobre el corpus real sigue siendo **desconocida** porque el piloto de medición
([`INVESTIGACION-OCR-MISTRAL.md`](./INVESTIGACION-OCR-MISTRAL.md) §8) no se ha corrido. El banco
**no las acerca**: fabrica datos sintéticos, y un umbral medido sobre datos que uno mismo inventó
no es una medición.
**Ámbito:** una herramienta de `tools/` que se empaqueta, se instala en otros proyectos y se
anuncia sola como plugin. El núcleo no importa React, Next ni Supabase; el contrato de
empaquetado es el de [`EMPAQUETAR-HERRAMIENTA.md`](./EMPAQUETAR-HERRAMIENTA.md) y **no se
reescribe aquí**.

---

## 1. El problema

Las dos investigaciones previas dejaron el motor resuelto y el producto sin empezar. Sabemos
**con qué** extraer (un puerto con adaptadores: Mistral API o PaddleOCR-VL autohospedado) y
sabemos **cuánto cuesta**. Lo que no existe es la pieza que un humano usa: arrastrar una carpeta
de expedientes, mirar lo que salió, corregir lo que está mal, y decirle al sistema *"así está
bien, guárdalo como plantilla"*.

Y hay un segundo problema, más caro y menos visible: **eso mismo hará falta en el siguiente
proyecto**. Un extractor documental escrito dentro de una app concreta es un extractor
documental que se reescribe entero la próxima vez. Por eso esto nace como herramienta, con
`package.json` propio, y no como una carpeta de `src/features/`.

## 2. Lo que se descubrió al escribirlo

### 2.1 Las dependencias del Golden Path no están instaladas

`AGENTS.md` declara Zustand en el stack y `components.json` está configurado para shadcn con
`iconLibrary: "lucide"`. **Nada de eso está en `package.json`.** Las dependencias reales son
`next`, `react`, `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`, `zod` y `tailwindcss`.
Ni un componente de shadcn, ni `lucide-react`, ni `react-hook-form`.

Para una feature interna daría igual — se instala y ya. Para una **herramienta** es
determinante: cada dependencia que el entry point de React dé por supuesta es una dependencia
que el proyecto consumidor tiene que tener, con la versión correcta. Por eso:

> **El icono del plugin viaja como SVG en línea dentro del manifiesto, no como import de una
> librería de iconos.** Un manifiesto que importa `lucide-react` obliga a instalar lucide en
> todo proyecto que solo quería leer el nombre de la herramienta.

### 2.2 "Carpetas" no es un input de HTML, son dos mecanismos distintos

El usuario pidió "arrastrar o seleccionar archivos y carpetas". Eso no es una casilla:

- **Seleccionar** una carpeta exige `<input type="file" webkitdirectory>`.
- **Arrastrar** una carpeta exige `DataTransferItem.webkitGetAsEntry()` y un recorrido recursivo
  del árbol, porque `event.dataTransfer.files` **no contiene** el contenido de un directorio
  arrastrado: contiene el directorio, y está vacío.

Los dos son API del DOM. Ninguno puede vivir en el núcleo. Lo que sí vive en el núcleo es la
función pura que decide qué hacer con cada archivo una vez aplanado el árbol — y esa se prueba
sin navegador, que es justo el punto.

### 2.3 El ERD derivado es salida de un modelo, y se estaba colando por la puerta de atrás

"Que prepare los catálogos de configuración de datos y el modelo de relación de entidades"
suena a automatización inofensiva. No lo es: **generar SQL a partir de campos que un modelo de
lenguaje extrajo de un escaneo es exactamente el caso que la regla de la casa prohíbe confiar.**
Un `CREATE TABLE` derivado de una alucinación no falla ruidosamente — crea una tabla plausible
con una columna de más, y nadie lo nota hasta que hay datos dentro.

De ahí la decisión que estructura toda la capa 6: **el ERD derivado se emite como propuesta
revisable en SQL, nunca se aplica.** Aplicarlo es una acción irreversible y va por gate humano.

### 2.4 El "todavía no" de la puerta se está saltando a propósito

[`CREAR-UNA-HERRAMIENTA.md`](./CREAR-UNA-HERRAMIENTA.md) es tajante: sin reuso real 3+ veces,
empaquetar solo añade una versión que mantener. Aquí el reuso es **cero** — la herramienta no
existe todavía.

No se omite el conflicto: se declara. El usuario pidió explícitamente que la herramienta sea
descargable y usable en otros proyectos desde el día uno, y esa es su decisión. Lo que sí impone
la regla es el coste: **una herramienta se versiona, y cambiar la forma de un `export` es un
major aunque el código haga lo mismo.** Se acepta ese coste a cambio de no reescribirla.

### 2.5 La numeración de las specs no es decorativa

`scripts/verifica-specs.mjs` exige numeración correlativa desde `001` sin saltos ni repetidos.
Existen `001`–`006`. Esta spec **tiene que ser la `007`** y su carpeta tiene que llamarse
`007-extractor-documental`. Un número saltado pone el gate en rojo para todo el repo, no solo
para la spec nueva.

### 2.6 La introspección del esquema no tiene vía sin privilegio

El camino obvio para "mapear contra los catálogos que el usuario ya tiene" es leer su esquema con
la clave anónima. **No se puede**, y el descubrimiento reordena la arquitectura entera:

- El **OpenAPI de PostgREST vía anon key está bloqueado desde marzo de 2026**. Supabase responde
  literalmente *"Accessing the schema via the Data API is only allowed using a secret API key"*.
- La **introspección GraphQL** de `pg_graphql` sí filtra por los permisos SQL del rol —que es lo
  conceptualmente correcto, porque respeta los grants sin saltarse nada— pero está
  **desactivada por defecto desde pg_graphql 1.6.0**, y Supabase dejó de exponer las tablas al
  API automáticamente.
- Lo que queda exige clave secreta. Y una herramienta que **exige `service_role` para funcionar**
  choca de frente con C7: convierte un requisito de comodidad en una ampliación de privilegio
  permanente, en todo proyecto que la instale.

Consecuencia: **la introspección no puede ser el cimiento**. El puerto `EsquemaExistente` tiene
dos vías, y la que manda es la primera:

1. **Descriptor declarado** por el integrador: tablas, columnas, tipos y claves. Cero privilegio,
   siempre funciona, y de regalo hace la herramienta portable a proyectos que no son Supabase.
2. **Introspección asistida**, solo donde ese proyecto la tenga habilitada. Comodidad, no cimiento.

### 2.7 Del modelo semántico de Power BI se copia la mitad

La referencia que pidió el usuario es buena, pero copiarla entera sería cargo cult. **Se copia**:
una tarjeta por tabla, arrastrar una columna sobre otra para crear la relación, los indicadores
`1` y `*` en los extremos de la línea, y la distinción entre línea sólida y punteada.

**No se copia la dirección de filtro cruzado.** En Power BI describe cómo se propagan los filtros
para calcular agregaciones; es un concepto de BI, no de integridad relacional. Aquí lo que existe
es la cardinalidad y el sentido de la clave foránea. Traer el control de filtro cruzado a esta
pantalla sería ofrecer una perilla que no gobierna nada.

### 2.8 El template no tiene bases, y por eso el descriptor vacío es el caso normal

Este repo es un template: no hay catálogos, ni datos, ni un esquema real que introspeccionar. La
tentación es tratar eso como una limitación del entorno de pruebas. Es al revés — **es lo que fija
la arquitectura correcta**, y borra una rama de código antes de escribirla:

> **Un proyecto virgen es `descriptor.tablas = []`.** No hay `if (tieneCatalogos)`. Hay un
> descriptor que a veces viene vacío, y todo lo demás —mapeo, reconciliación, lienzo— opera igual.

Lo que en un proyecto con catálogos es "engancha este campo a `proveedores.id`", en uno virgen es
"propone una entidad nueva **porque no había ninguna a la que engancharse**". Mismo código, mismo
recorrido, distinta entrada. Dos caminos separados divergen en cuanto alguien arregla un bug en
uno solo, y el que se queda roto es siempre el que nadie mira.

De ahí dos cosas más:

- **El descriptor se declara y se versiona con el proyecto consumidor**, y puede generarse desde
  los tipos que ese proyecto ya tenga — `src/types/database.ts` es la convención que este
  template usa. Ese puente no necesita credencial ninguna.
- **Se verifica sin base de datos**, con fixtures de descriptor commiteados: uno vacío, uno con
  catálogos poblados y uno **desalineado** —declara una columna que ya no existe—. Sin ellos,
  "funciona con catálogos existentes" sería una capacidad documentada y nunca ejecutada, que es
  precisamente lo que esta capa no acepta como verdad.

### 2.9 La idempotencia por contenido descarta eventos de trazabilidad

Entra una fuente nueva —un código leído con cámara o con escáner— y con ella tres **formas de
dato** que no son lo mismo, aunque el usuario las nombre juntas:

| Forma | Qué es | Ejemplo |
|---|---|---|
| **Documento** | Un fichero → una entidad con campos | Factura: el QR corrobora el OCR |
| **Etiqueta** | Un código → un ítem con GTIN, lote, caducidad, serie | GS1-128; FNSKU de Amazon |
| **Evento** | Un código **no es un documento: es un hecho con hora y lugar** | Guía de FedEx escaneada en cada punto |

La tercera fila rompió código ya construido. `identidadDe()` hashea el contenido y deduplica —
correcto para una factura, **catastrófico para trazabilidad**: escanear la misma guía dos veces son
legítimamente dos eventos (salida de almacén y llegada), y la regla anterior **habría descartado el
segundo en silencio**. Perder un evento es exactamente lo que vuelve inútil un sistema de
trazabilidad, y no produce ningún error.

La identidad depende ahora de la clase de fuente:

| Clase | Identidad | ¿Deduplica? |
|---|---|---|
| `documento` | hash del contenido | Sí |
| `etiqueta` | GTIN + lote + serie | Sí, dentro de un conteo |
| `evento` | código + instante + puesto | **Nunca por el código solo** |

### 2.10 Los identificadores no se parecen: son o no son

El segundo defecto que encontró esta fuente. `resuelveValor()` compara por similitud de Dice, que
es lo correcto para *"ACME S.A. de C.V."* y **peligroso para un GTIN**. Medido sobre el propio
módulo, no supuesto:

| Par | Similitud |
|---|---|
| Dos GTIN a un dígito | **0,87** |
| Dos GTIN a dos dígitos | 0,80 |
| Dos FNSKU a un carácter | 0,82 |
| Dos RFC a un carácter | 0,85 |

Todos por encima de cualquier umbral razonable. Y el escenario peligroso no es el empate —un empate
al menos levanta sospecha— sino **que el identificador correcto no esté en el catálogo**: entonces
el segundo mejor gana solo, y la herramienta afirma con estado `resuelto` que la caja es de otro
producto. Eso mete stock en el SKU equivocado sin un solo error visible.

Por eso la regla no es un consejo: **un campo marcado como identificador no puede entrar por la vía
difusa**, y `resuelveValor` lanza si se intenta. Los identificadores van por igualdad exacta, y
cuando no están, la respuesta es *no está* — nunca *"el más parecido"*.

### 2.11 Decodificar bien no dice nada sobre si el contenido es cierto

Un QR decodifica o no: Reed-Solomon corrige, y no existe una confianza de 0,87. La tentación es
tratarlo como la fuente más fiable. **Es la menos fiable de todas**, porque es la más controlable
por un atacante: cualquiera imprime una pegatina y la pega encima de la legítima.

No es teórico. Microsoft reportó **7,6 millones de intentos de *quishing* en enero de 2026 y 18,7
millones en marzo**; los dos patrones documentados son pegatinas sobre códigos legítimos y **QR
dentro de PDF de factura de proveedor que desvía el pago a una cuenta mula** — que es literalmente
este caso de uso. Una cadena minorista gastó 2,3 M USD en control de daños tras pegatinas falsas en
200 tiendas.

De ahí dos reglas duras:

> **Nunca se navega a una URL que venga de un código.** Se muestra el destino y decide la persona.
>
> **Un campo de código lleva `procedencia: 'codigo'`.** Sin esa marca, un dato de código con
> confianza 1 y uno de OCR con confianza alta son indistinguibles, y el de código **se saltaría la
> cola de revisión** por el mero hecho de venir de un decodificador determinista.

Lo que sí da el código gratis es **validación determinista sin red**: GTIN y SSCC llevan dígito de
control módulo 10, la guía de FedEx Express módulo 11 con pesos 1‑3‑7. Una lectura mal hecha falla
su dígito de control. Eso responde a *«¿esta lectura es buena?»* mucho mejor que una puntuación
inventada — y no dice nada sobre si el contenido es verdad, que es otra pregunta.

### 2.12 El escáner óptico no es un dispositivo: es un teclado

Un lector de mano en modo *keyboard-wedge* teclea la carga y manda un terminador (CR), con prefijo
configurable. No hay API que abrir ni permiso que pedir: se escuchan pulsaciones.

Y de ahí sale la recomendación que evita la parte frágil: **configurar el escáner con prefijo y
sufijo da desambiguación determinista**. La heurística de tiempos —¿ráfaga de máquina o persona
tecleando?— existe para el escáner que llegó sin configurar, y es el plan B declarado, con sus dos
parámetros obligatorios porque no hay valor por defecto defendible sin medir el teclado de quien la
use.

Ventaja lateral que decide dónde poner cada cosa: **en un puesto fijo el escáner es más fiable que
la cámara**, porque no pide permiso. La cámara es para movilidad.

### 2.13 La PWA instalada no es comodidad: es lo que impide perder la cola

El trabajo de campo —almacén, reparto— ocurre sin cobertura, así que hace falta cola local. Tres
hechos verificados, y el segundo cambia la categoría de la decisión:

- **`BackgroundSync` no existe en Safari** («unlikely soon») ni en Firefox. La cola no puede
  depender de él: vive en IndexedDB y se reproduce al recuperar conexión o al reabrir.
- **iOS purga el almacenamiento a los 7 días de no usarse, y exime a las apps añadidas a la
  pantalla de inicio.** Traducción: sin instalar, **una cola de escaneos sin sincronizar puede
  borrarse sola y los eventos se pierden sin ningún error**. Instalar la PWA es el mecanismo que
  protege la cola. De ahí un requisito que nadie pide: si hay cola pendiente y la app corre en
  pestaña, **hay que avisarlo**, porque el usuario no puede saber que su navegador va a tirar sus
  escaneos.
- **La cámara funciona en PWA instalada en iOS, pero el permiso no se persiste**: Safari
  re-pregunta de forma intermitente en modo standalone.

Y el cruce con §2.9 que se escapa fácil: si un evento se encola sin conexión, **el instante que
vale es el del escaneo en el dispositivo**. Sellarlo al llegar al servidor desplaza toda la
trazabilidad y además hace colapsar la identidad `código + instante + puesto` — varios eventos
sincronizados a la vez compartirían instante y se deduplicarían entre sí, borrando la trazabilidad
de toda una mañana justo al recuperar la cobertura. Se guardan los dos instantes: el del
dispositivo manda para el orden, el del servidor es auditoría de llegada, y un desfase grande entre
ambos es señal de revisión porque el reloj del móvil puede estar mal.

**Reparto de responsabilidades**: la PWA es de la app consumidora, no del paquete — una librería no
instala un service worker. El paquete aporta la cola como núcleo puro sobre un puerto; la app se
hace PWA con el skill `/add-mobile` que ya existe en la fábrica.

### 2.14 El título es para el humano; los identificadores son para buscar

Un trabajo terminado sin sitio donde vivir se convierte en filas sueltas que nadie recupera tres
meses después. De ahí el **lote**: se titula la sesión —*«Conteo almacén norte 07/09»*— porque
nadie pone título a un escaneo suelto.

El título es **obligatorio pero no único**. Forzar unicidad hace que el segundo día alguien escriba
«Conteo almacén 2», que es peor que dos lotes homónimos distinguibles por fecha. Y contra el
«prueba 2» no sirve validar —bloquear títulos malos es paternalismo que la gente esquiva— sino
**sugerir un buen defecto derivado del contenido** que el humano acepta o cambia.

Pero un título escrito a mano es un índice pésimo. Lo que se busca de verdad es *«la factura
A‑1234»* o *«la guía 4490…»*, y esos identificadores **ya los extrae `analizaCarga()`**: indexarlos
es aprovechar trabajo hecho. Heredan además la regla de §2.10: **se buscan por igualdad exacta,
nunca por parecido**.

> **El riesgo del reuso mal hecho**: esa normalización vivía dentro de `resuelveIdentificador()`.
> Se extrajo a `normalizaIdentificador()` y la usan los dos. Si divergieran, la búsqueda no
> encontraría lo que la reconciliación sí resolvió — y **no daría error**, simplemente no
> aparecería nada. Hay una prueba que ata ambos caminos al mismo resultado.

### 2.15 El respaldo de la base no incluye las evidencias

Para una factura o una guía, el PDF o la foto **son** la prueba. Se guardan en un bucket privado,
con URL firmada y caduca, y con la ruta `{organizacion_id}/{sha256}.{ext}` — el primer segmento no
es estética: la RLS de `storage.objects` se escribe sobre `(storage.foldername(name))[1]`, así que
ahí tiene que ir aquello por lo que se autoriza.

Y el hallazgo que sale caro descubrir tarde:

> **`pg_dump` NO incluye los objetos del bucket.** La metadata de `storage.objects` sí entra en el
> volcado; los bytes viven en un almacén de objetos aparte y **quedan fuera**. Un respaldo de base
> de datos que corre en verde deja fuera **todas las evidencias originales** — y eso es peor que no
> tenerlas respaldadas, porque *parece* que están.

Requiere una segunda vía de respaldo y una línea propia en el inventario de `BUSINESS_LOGIC.md`
§4, no colgando de «la base de datos». La retención se declara; vencer **no borra nada solo**:
borrar es irreversible y va por gate humano.

La deduplicación por hash se detiene en la frontera de la organización a propósito. Compartir
objetos entre organizaciones ahorraría almacenamiento y **filtraría información**: A podría deducir
que B tiene esa misma factura. El ahorro no compensa.

### 2.16 Sin equipo, la revisión humana no funciona

Todo colgaba de una persona, pero el flujo entero asume que **quien escanea no es quien valida**.
Con permisos por individuo, el revisor no ve lo que subió el operario y la cola de revisión queda
vacía justo para quien tiene que atenderla.

Entran organización y rol, con la matriz **declarada como dato** y una prueba que la recorre
entera —así ningún rol gana un permiso por descuido al tocar otra cosa:

| Rol | Escanea | Corrige y valida | Cierra | Suprime | Consulta y exporta |
|---|---|---|---|---|---|
| `operario` | Sí | No | No | No | Sí |
| `revisor` | Sí | Sí | Sí | Sí | Sí |
| `consulta` | No | No | No | No | Sí |

`consulta` no es un rol de segunda: es quien audita **sin poder alterar lo auditado**.

### 2.17 Supresión frente a inmutabilidad: se borra el contenido, queda la lápida

Lo validado es inmutable —una corrección añade versión, con quién, cuándo y **por qué**— pero un
titular puede pedir que se borren sus datos. Las dos reglas chocan de frente, y se resuelven a
propósito: **desaparece el contenido** (el original, los valores, las entradas del índice) y
**queda constancia de que el registro existió**, con quién lo pidió y quién lo ejecutó.

Sin la lápida, una auditoría no distingue «nunca existió» de «se borró», y el historial de
versiones queda con huecos que parecen corrupción. Y **suprimir no es corregir**: distinta
operación, distinta autoridad, irreversible.

### 2.18 El coste se ve antes de gastarlo, y «no se sabe» no es cero

5.000 páginas a la tarifa del motor son ~20 USD, y hoy eso se descubre en la factura. Es además la
superficie que faltaba contra el *denial-of-wallet* que el modelo de amenazas ya nombraba.

Con la regla heredada de `src/lib/ai/contabilidad.ts`: **si el motor no declara tarifa, la
estimación es `null`, nunca cero**. Un cero inventado da un presupuesto que parece completo y no lo
está. Y una suma con un hueco es un total desconocido, no un total parcial.

### 2.19 Exportar tiene dos detalles que no son cosméticos

El CSV lleva **BOM UTF‑8** o Excel destroza los acentos y el usuario concluye que la herramienta
corrompe sus datos. Y toda celda que empiece por `=`, `+`, `-` o `@` **se neutraliza**: Excel la
ejecuta al abrir el fichero, y los valores vienen de documentos que un atacante puede fabricar.

Es el remate del ataque de §2.11: cuela el texto en un documento y espera a que alguien exporte.
Además, una exportación **saca datos de terceros del sistema**, así que queda registrada.

---

### 2.20 El banco de pruebas obligó a elegir motor de base, y el criterio obvio era falso

§2.8 dejó dicho que este template no tiene bases. La consecuencia práctica tardó en verse: tres
capacidades quedaban **documentadas y nunca ejecutadas**. La persistencia sólo existía contra
Supabase o IndexedDB —ninguna vía de servidor sin cuenta—, y los tres estados del descriptor eran
tres ficheros JSON que pueden afirmar lo que quieran, así que probaban el parser, no el circuito.

De ahí el banco: un negocio ficticio en una base embebida, en `tools/extractor-documental/banco/`.

**El criterio con el que se eligió motor era el equivocado, y conviene dejar por qué.** El
argumento aparente favorecía a PGlite —Postgres compilado a WASM—: producción es Supabase, o sea
Postgres, y SQLite diverge en tipos y dialecto. Al mirar el código resulta que ese argumento no
aplica al camino que el banco ejercita:

> **El adaptador de Supabase no escribe SQL.** Habla PostgREST (`.from().upsert().eq()`). El
> dialecto de Postgres sólo vive en `migraciones/001-*.sql`, que es otro artefacto y otro objetivo.

Elegir por fidelidad de dialecto habría pagado un precio real —varios MB de WASM y un
`npm install` en un directorio que **hoy no tiene ningún `node_modules`**— a cambio de fidelidad
en un sitio por el que el código no pasa. Se eligió `node:sqlite`, que viene dentro de Node 22.18+,
y el banco hereda la propiedad de correr sin nada instalado.

**Lo que el banco NO prueba, y no debe aparentar que prueba.** SQLite no tiene RLS. El aislamiento
por organización lo impone aquí el código del adaptador, que es una garantía **más débil** que la
de producción, donde la base niega la fila aunque el código se equivoque. Dicho de otro modo: las
policies de esa migración **siguen sin haberse ejecutado nunca**, y ese hueco no lo cierra este
trabajo — lo cerraría PGlite, que es el único motivo por el que sigue sobre la mesa.

**Y una traducción a mano se pudre.** Por eso el esquema del banco declara su espejo y
`pruebas/banco-espejo.ts` lo compara contra el SQL real, columna a columna y `CHECK` a `CHECK`: una
tabla que cambie en producción y no en el banco pone el gate en rojo. Es el mismo mecanismo que
`pruebas/persistencia.ts` usa para las listas de valores, y por la misma razón.

---

### 2.21 Un CFDI no es un formato, y por eso el esquema no se codifica: se registra

La vía del PDF pelea contra la tipografía. Con la factura real que calibró `capa-cero.ts` salieron
campos pegados sin separador, líneas de glifos ilegibles y un nombre de cliente que el extractor
sigue sin encontrar aunque el documento lo lleve. Para un comprobante fiscal eso es trabajo
desperdiciado, porque **el PDF no es el documento fiscal: es su representación impresa**. El dato
exacto vive en el XML, y ahí no hay nada que estimar.

Lo que no es obvio es lo que se descubre al querer leer ese XML. **Un CFDI no es un formato.** Es un
tronco común más un conjunto **abierto** de complementos autorizados —pagos, nómina, carta porte, y
los que el SAT publique después—, cada uno con su esquema y su versión. Escribir cada esquema dentro
de la herramienta tiene una consecuencia que solo se ve más tarde: **cada publicación del SAT pasa a
ser una versión nueva de la herramienta**, y cualquier proyecto que necesite un esquema que no
anticipamos se queda esperando a que lo publiquemos nosotros. En un template que va a instalarse en
casos de uso distintos, eso no es un inconveniente: es el fallo de diseño.

Por eso el esquema deja de ser código y pasa a ser una **unidad registrable**. La herramienta trae
lo que todo CFDI tiene —el tronco, y el timbre— y cada proyecto declara los complementos que su caso
necesita, sin tocar este paquete. `src/xml/registro.ts` es ese punto, y no conoce el SAT: hay una
prueba que lo ejercita con un esquema inventado, precisamente para demostrar que es un mecanismo y
no cuatro casos particulares.

**Tres reglas lo sostienen, y ninguna es de estilo.**

*Se resuelve por dirección, jamás por prefijo.* `cfdi:` es convención de quien emitió el documento,
no norma. El mismo comprobante puede venir con otro prefijo, o sin ninguno usando el espacio por
defecto, y sigue siendo el mismo esquema. Un lector que busque la cadena `cfdi:Comprobante` funciona
con los XML del emisor con el que se probó y falla con el siguiente — y falla dando **cero campos**,
que es indistinguible de un documento vacío. La prueba que fija esto compara el mismo comprobante
escrito de dos maneras y exige campos idénticos.

*La versión va pineada, y la dirección sola no basta.* Las dos versiones del timbre fiscal comparten
dirección y solo se distinguen por su atributo `Version`, así que la clave del registro tiene tres
partes y no dos. Un comodín aquí significa leer con las reglas de una versión los datos de otra, y
eso no produce un error visible: produce **un dato distinto con apariencia de correcto**, en la
casilla de un importe. Es la misma disciplina que `exigeModeloPineado` aplica al modelo de OCR (C1).

*Declarar, no descartar.* Un complemento sin lector se reporta con su dirección, su versión y el
motivo — y el motivo distingue tres hechos que no son el mismo: no hay lector, hay lector de otra
versión, o el complemento no declara versión. Confundir el segundo con el primero esconde una
migración de esquema del SAT detrás de un «no lo soportamos», y para quien integra son dos acciones
distintas. Es el precedente de `lineasDescartadas` en `saneado.ts`, aplicado a otra cosa.

**El DOCTYPE se rechaza, y esa es la decisión de seguridad del módulo.** Un extractor documental lee
ficheros que manda un tercero. La entidad externa es el ataque clásico contra eso: el XML declara
una entidad que apunta a un fichero del servidor y su contenido acaba dentro de un campo de la
factura. Aquí no hay bandera que desactivarlo **porque no existe el código que lo haría**: el lector
no sabe resolver una entidad declarada. Una bandera se puede volver a encender; un código que no
está escrito, no. Un CFDI válido no lleva DOCTYPE, así que el rechazo no cuesta ni un documento
legítimo.

**Lo que el lector se niega a afirmar.** No verifica el sello del emisor ni el del SAT, y el tipo lo
garantiza: `verificado` es el literal `false`, no un booleano. Con un booleano alguien lo pondría a
`true` «cuando implementemos la verificación»; con el literal, hacerlo no compila sin cambiar el
contrato, y un contrato cambiado se ve en la revisión. **Analizar no es validar, y validar no es
autenticar**: un comprobante entero puede estar inventado y su XML analizar perfecto. Por eso la
regla de `corroboracion.ts` vale igual aquí — ninguna fuente gana por decreto, y el XML tampoco.

**Y un hallazgo que salió de paso, sobre código que ya existía.** `comparable()` normaliza a
mayúsculas antes de comparar. Es correcto para un registro fiscal y **falso para base64**: si el
sello viajara bajo la misma clave que emite el código impreso, el cotejo podría reportar un
**acuerdo falso sobre el único campo que existe para detectar una sustitución**. Se resolvió con
clave propia y una función aparte, `cotejaSelloConQr`, y hay una prueba que fija el defecto para que
nadie lo redescubra por las malas.

**Qué NO se construyó, y por qué se dice.** Nómina y carta porte no tienen lector. Sin un documento
real solo se puede transcribir la norma, y ahí un error no se ve hasta producción. Nómina además
lleva datos de un empleado que no eligió estar aquí, y eso pide su propio análisis de impacto (C4),
no una fila añadida de paso. Pagos sí se construyó, y no por ser un buen ejemplo: un recibo de pago
lleva `Total="0"` porque todo el dinero está en el complemento, así que sin lector entra al sistema
como **una factura de cero pesos con apariencia de exacta**.

**El estado de la evidencia, y lo que cambió al llegar el primer XML real.** El 2026-09-10 pasó por
la herramienta un CFDI 4.0 de honorarios, timbrado. Las direcciones de CFDI 4.0 y del timbre quedan
**confirmadas**: son exactamente las que estaban pineadas. La de pagos sigue sin confirmar, porque
no ha pasado ningún recibo de pago real, y `espacios.ts` distingue las tres en su cabecera.

Pero lo que ese documento aportó de verdad no fue la confirmación: fue **un defecto que ninguna
prueba sintética veía**. El bloque de impuestos se perdía entero y en silencio, y el aviso decía que
no había nada que advertir. En una factura de honorarios eso no es un detalle: el total **no** es el
subtotal, y lo retenido es lo que alguien tiene que enterar al SAT. Con los impuestos leídos la
aritmética cierra exacta —`9607.69 + 1537.23 - 1144.92 = 10000.00`—; sin ellos quedaban 392,31 pesos
sin explicar en la pantalla de quien revisa.

La causa raíz no era el olvido de una tabla. Era que **la regla de los complementos —declarar, no
descartar— no se estaba aplicando al tronco**, que es donde menos se nota y más duele. Por eso el
arreglo no es solo leer impuestos: `LecturaDeCfdi` gana un `noLeido` que declara todo hijo del
tronco que el lector no traduce, así que `CfdiRelacionados`, `InformacionGlobal` y lo que el SAT
publique mañana aparecen en vez de desaparecer.

Tres rasgos más que ese documento enseñó, y que un analizador ingenuo rompe: las declaraciones
`xmlns` iban **al final** de la lista de atributos, con `xsi:schemaLocation` delante; el timbre
declaraba su `xmlns` **en sí mismo** y no en la raíz; y los importes del renglón traían seis
decimales frente a dos en los totales. Los tres pasan, y hay un fixture que conserva esa forma con
los datos cambiados.

**Cómo se evita que esto envejezca en silencio.** Una traducción a mano diverge sola, así que hay
tres mecanismos y cada uno cubre una cosa distinta. La versión pineada caza el cambio anunciado: un
complemento de otra versión se reporta, no se lee mal. El `noLeido` caza el elemento o atributo
nuevo que llega sin cambiar la versión. Y `medicion/deriva.mjs` compara el inventario del lector
contra el esquema publicado, **en las dos direcciones** — porque mapear algo que el esquema no
declara es peor señal que no mapear algo que sí.

Ese script sale a la red a propósito, y por eso vive fuera del paquete, no toca el camino de
lectura y **no está encadenado a `npm run validate`**: un gate que falla por falta de conexión es un
gate que se aprende a ignorar. Su primera ejecución encontró cuatro atributos del esquema oficial
que el lector no mapeaba, y uno más en el timbre. Los cinco están cerrados.

**Y el cuarto mecanismo, sobre los códigos.** `medicion/catalogos.mjs` vigila qué códigos son
válidos. De los doce catálogos de los que depende una regla dice **qué código entró o salió, por su
nombre**; del resto, solo la cuenta, porque un código postal nuevo es rutina y uno nuevo en uso de
comprobante no lo es. El corte está medido —esos doce tienen 25 códigos o menos y el siguiente ya es
geografía con 66— pero se dejó como **lista declarada y no como umbral**: un umbral ascendería en
silencio un catálogo de referencia el día que encogiera.

La referencia va **fechada por quien publica**, no por el día en que alguien miró: el servidor
declara su `last-modified` y su identificador de versión. Eso da la única fecha que sirve para decir
«esto valía entonces», y de paso una comprobación barata — si el identificador no cambió no se
descarga nada, **una décima de segundo frente a 5,7 MB**, y una comprobación cara es una que se deja
de correr.

De ahí sale lo que más rendimiento da y no costó una sola pieza: **la serie histórica no hay que
construirla**. Cada sellado deja la referencia anterior en el historial de git, ya fechada por la
fuente, así que `git log` sobre ese fichero **es** el repositorio de versiones. Conviene mirarlo
antes de inventar una tabla de histórico.

**Una corrección que conviene dejar escrita, porque el error es fácil de repetir.** Al medir el
catálogo publicado —5,8 MB, 162.233 códigos, **cero descripciones legibles**— se concluyó que el
significado «no está disponible en forma comparable». Es un salto que no tocaba dar: lo medido era
el XSD, que es el artefacto de **validación** y solo dice qué códigos son válidos. Las descripciones
se publican aparte. Y hay un segundo sentido en el que la conclusión era peor: **desde el momento en
que se guardan instantáneas, la serie ya es propia**, así que el hueco solo existe hacia atrás y se
cierra solo con el tiempo. Estaba planteado como un límite permanente cuando era una condición
inicial.

Lo que **ningún** mecanismo caza, ya con el tamaño correcto: detectar que una descripción cambió es
mecánico; decidir si ese cambio **afecta a una regla** no lo es. Una descripción se reescribe sin
cambiar el fondo, y el fondo cambia con un retoque menor. El diff lo señala, una persona lo juzga.

Y una consecuencia de todo esto para el grafo: si el significado no está en el artefacto que la
máquina compara, tiene que vivir en un solo sitio, y ese sitio es el grafo del proyecto. Lo que
convierte «emitir códigos y nunca etiquetas» en una decisión estructural y no en higiene. La spec
004 lleva anotada la forma que eso pide: solo se añade, nunca se edita, y **la clave de búsqueda es
`(código, fecha del hecho)`**, no el código a secas.

**Lo que no se extrae a propósito**: el atributo `Certificado`, que lleva el X.509 entero y dentro
el nombre completo, el correo y los identificadores fiscales de quien firma. Se extrae su **número**,
que identifica sin exponer nada. Volcar el certificado sacaría datos personales a un campo que
después viaja a una base, a un CSV y a la pantalla de cualquiera que revise.

---

## 3. Principio de diseño

> **El humano no revisa lo que el sistema extrajo. El humano decide qué significa, y el sistema
> aprende esa decisión.**

Un extractor que solo muestra texto obliga a leerlo entero cada vez. La diferencia entre eso y
una herramienta es que aquí la revisión **produce un artefacto**: la plantilla por defecto. La
segunda tanda de documentos del mismo tipo ya llega con los campos correctos, en el orden
correcto, con los irrelevantes apagados. El trabajo del humano se paga una vez.

Tres corolarios que se aplican sin excepción:

1. **El núcleo no toca el DOM ni la red.** Puertos e interfaces; las implementaciones viven en
   entry points aparte. Es lo que hace que se pueda probar sin navegador y sin claves.
2. **La confianza es un dato de primera clase, no un log.** Cada campo extraído lleva su score,
   y el umbral que manda un documento a revisión humana es configuración, no una constante.
3. **Nada derivado de un modelo se aplica solo.** Se propone, se revisa, se aplica.

---

## 4. Contrato del paquete

`tools/extractor-documental/` → `@tu-scope/extractor-documental`.

| Subpath | Qué contiene | peerDependency |
|---|---|---|
| `.` | Núcleo TypeScript puro: tipos, puertos, máquina de estados, clasificación de archivos, reducer de la plantilla, derivación del ERD. **Cero dependencias** | — |
| `./plugin` | Manifiesto: `id`, `nombre`, `descripcion`, `icono` (SVG en línea), `ruta`, `version`, `capacidades`. Importable **sin React** | — |
| `./react` | `ZonaDeIngesta`, `TablaDeRevision`, `EditorDeCampo`. `'use client'` la primera línea del archivo | `react` (opcional) |
| `./motores/mistral` | Adaptador de `MotorOcr` contra la API | `@mistralai/mistralai` (opcional) |
| `./motores/openai-compat` | Adaptador HTTP contra un vLLM autohospedado (PaddleOCR-VL, GLM-OCR) | — (`fetch`) |
| `./almacenes/supabase` | Adaptador de `AlmacenDocumentos` y `AlmacenPlantillas` | `@supabase/supabase-js` (opcional) |
| `./react/lienzo` | Lienzo de modelado: tarjetas por entidad, relaciones arrastrables, cardinalidad en los extremos | `@xyflow/react` y `react` (ambas opcionales) |
| `./react/camara` | Lectura con cámara: `BarcodeDetector` nativo, respaldo wasm donde no exista | `zxing-wasm` y `react` (ambas opcionales) |
| `./almacenes/indexeddb` | Adaptador de `AlmacenLocal` para la cola sin conexión | — (API del navegador) |
| `./almacenes/supabase-storage` | Adaptador de `AlmacenDeOriginales`: bucket privado, URL firmada | `@supabase/supabase-js` (opcional) |

Lo que el `package.json` debe declarar (§5 del runbook de empaquetado): `type: "module"`,
`sideEffects: false`, `engines.node`, `files: ["dist"]`, y `peerDependenciesMeta.<dep>.optional`
en **todas** las peer. El empaquetador comprueba que `'use client'` sobrevive al build y que el
tarball se instala e importa en un proyecto limpio; **publicar es gate humano**, no un paso del
script.

**Puertos del núcleo** — interfaces, sin una sola implementación:

```
MotorOcr           extrae(documento, opciones) → PaginaExtraida[]
AlmacenDocumentos  guarda / lee / lista documentos y sus extracciones
AlmacenPlantillas  guarda / lee la plantilla por defecto y los catálogos
EsquemaExistente   describe() → DescriptorDeEsquema   (tablas, columnas, tipos, claves)
LectorDeCodigos    lee(imagen) → cargas crudas
AlmacenLocal       cola de lecturas mientras no hay conexión
RepositorioDeRegistros  guarda un lote, lo lee, y busca por criterios
AlmacenDeOriginales     guarda el binario y devuelve una URL firmada y caduca
```

`LectorDeCodigos` está **deliberadamente separado** de `MotorOcr` y no comparten interfaz: el OCR
devuelve confianza y región; un decodificador devuelve una carga que decodificó o no. Unificarlos
obligaría a inventarle una confianza al código, que es justo el error de §2.11.

`EsquemaExistente` es el puerto que hace posible mapear contra lo que el proyecto ya tiene. Su
implementación por defecto **no consulta nada**: devuelve el descriptor que el integrador declaró
(§2.6). Un descriptor con `tablas: []` es un proyecto sin catálogos, y recorre exactamente el
mismo código que uno poblado (§2.8).

**Máquina de estados** del documento, en el núcleo y probada como función pura:

```
pendiente → en_cola → procesando → extraido → en_revision → validado
                          │            │           │
                          └─ fallido   └─ revision_humana   └─ rechazado
```

`revision_humana` no es un error: es la salida normal cuando la confianza queda por debajo del
umbral. Tratarla como fallo es lo que hace que la gente suba el umbral hasta que la cola
desaparece, y con ella el control.

---

## 5. Las once capacidades pedidas

| # | Lo que se pidió | Dónde vive | Nota que decide el diseño |
|---|---|---|---|
| 1 | Icono para seleccionarla, como plugin | `./plugin` | Manifiesto autodescriptivo; la app anfitriona lo descubre y lo pinta. SVG en línea (§2.1) |
| 2 | Botón de adjuntar, arrastrar o seleccionar PDF, imágenes y **carpetas** | `./react` + núcleo | Dos API del DOM distintas (§2.2). El aplanado del árbol y la clasificación son puros |
| 3 | Revisión de los datos | `./react` | La confianza por bloque se muestra siempre, no bajo un desplegable |
| 4 | Vista configurable: habilitar/deshabilitar y editar cada campo | núcleo + `./react` | `PlantillaDeRevision`: `visible`, `editable`, `orden`, `etiqueta` por campo. El reducer es puro |
| 5 | Botones guardar/modificar/eliminar por dato, y uno de pantalla | `./react` | Por campo, más `guardarComoDefecto` para la disposición entera |
| 6 | Al guardar: queda por defecto, prepara catálogos y el modelo E-R | núcleo | El ERD se **propone** en SQL **reconciliando con lo que ya existe**, no partiendo de cero; aplicarlo es gate humano (§2.3) |
| 7 | Relacionar con catálogos y campos que el proyecto ya tiene | núcleo + `./react/lienzo` | Dos niveles: campo→columna, y **valor→fila**. El segundo es el trabajo de verdad (§5.1) |
| 8 | Leer códigos con cámara o escáner óptico | núcleo + `./react/camara` | El escáner es un teclado (§2.12); la cámara necesita respaldo wasm fuera de Chrome |
| 9 | Facturas, inventario y trazabilidad | núcleo | Tres formas de dato, no tres tipos de documento (§2.9). La identidad cambia con la clase |
| 10 | Trabajar sin conexión | núcleo + `./almacenes/indexeddb` | La cola sella el instante al escanear, y la PWA instalada es lo que impide perderla (§2.13) |
| 11 | Guardar con título y recuperar después | núcleo + `./almacenes/supabase-storage` | El lote lleva el título; los identificadores extraídos son el índice real (§2.14). El original es la evidencia, y su respaldo no lo cubre `pg_dump` (§2.15) |

### 5.1 La reconciliación de valores es el trabajo, no el lienzo

Mapear el campo *"Proveedor"* a la columna `facturas.proveedor_id` es la parte fácil: es una
elección de una lista. Lo difícil, y donde se gana o se pierde la herramienta, es resolver que
*"ACME S.A. de C.V."* **es la fila 1874** de `proveedores` y no una nueva.

Tres estados, y ninguno es "listo":

| Estado | Cuándo | Qué pasa |
|---|---|---|
| `resuelto` | Coincidencia exacta, o el humano confirmó un candidato | El dato puede promoverse |
| `ambiguo` | Varios candidatos por encima del umbral de similitud | Va a revisión con los candidatos ordenados |
| `sin_resolver` | Ningún candidato | Se **propone** el alta; nadie la escribe |

El alta automática es exactamente cómo acaban conviviendo *"ACME SA"* y *"ACME S.A. de C.V."*
como dos proveedores distintos, con las facturas repartidas entre los dos y el saldo de ninguno
cuadrando. No falla ruidosamente: falla en silencio y se descubre meses después, cuando ya hay
movimientos colgando de ambas filas y separarlas es un proyecto.

### 5.2 La corroboración es lo que hace valiosa la segunda fuente

El QR de un CFDI lleva UUID, RFC emisor, RFC receptor, total y ocho caracteres del sello de forma
determinista. Si el OCR leyó un total de 11.600,00 y el código dice 1.160,00, **la discrepancia es
detectable precisamente porque hay dos fuentes independientes**.

Y ninguna gana por decreto. El código no es más fiable por decodificar limpio: una pegatina falsa
decodifica igual de limpio que la legítima (§2.11). Lo que significa algo es la discrepancia, y
**una sola manda a revisión humana aunque las dos fuentes vengan con confianza alta** — si dos
fuentes independientes no dicen lo mismo, una está mal y ninguna máquina sabe cuál.

Con un matiz que evita ahogar la cola en ruido: los importes se comparan como números, así que
`1,160.00` y `1160.00` son acuerdo, no conflicto.

**Y un formato real enseñó otro matiz, medido el 2026-09-10 sobre un CFDI de verdad:** hay emisores
que escriben el total del QR relleno de ceros a la izquierda y con seis decimales. Compararlo como
cadena daría una discrepancia **falsa en cada factura de esos emisores** — y una cola llena de
falsos positivos deja de leerse, que es el fallo que el umbral tiene prohibido causar. La
normalización numérica ya lo cubría; ahora hay prueba que lo fija.

### 5.2.1 Y cuando NO hay segunda fuente: pedirle dos lecturas distintas al mismo motor

Un CFDI trae tres fuentes —XML, código impreso y reconocimiento— y ahí la corroboración es directa.
**Un escaneo no trae ninguna.** No hay código que decodificar ni XML que leer: solo la imagen, y un
motor que dice lo que ve. Una fuente sola no se puede corroborar consigo misma.

Salvo que se le pregunte **dos cosas distintas**. Medido el 2026-09-10 sobre un reporte de sucursal
escaneado, con un motor autohospedado:

1. Una pasada pidiendo **solo la transcripción**, que es lo que un motor de visión hace mejor.
2. Otra pidiendo **los campos de un esquema**.
3. Y se comprueba que cada valor extraído **aparezca en la transcripción**.

Resultado: 25 campos devueltos, **24 presentes en la transcripción y 1 ausente**. El ausente era el
nombre de la empresa, partido en dos líneas del encabezado y recompuesto por el modelo — no una
alucinación, pero sí exactamente el campo que hay que mirar antes de fiarse.

**Por qué importa más de lo que parece.** Un modelo al que se le piden 25 campos tiende a devolver
25, existan o no: rellenar es más fácil que admitir un hueco. El resultado tiene la misma forma
—completo, confianzas altas— tanto si leyó como si invento. Esta comprobación es lo único que los
distingue sin un humano mirando el papel.

Y es **lo único que los distingue, punto**: en esa misma corrida los 25 campos llegaron con
confianza **0.90 exacta, los 25**. El que copió literal y el que recompuso, idénticos. Si uno
hubiera sido inventado, habría llegado con la misma confianza que los correctos.

La herramienta no impone este cotejo —es una decisión del proyecto, como todo lo que cuesta una
llamada de más— pero cuando el documento no tiene segunda fuente, es la que hay.

### 5.3 Sin conexión, el instante manda

Una lectura que no se puede enviar no puede perderse. La cola vive en el dispositivo y **sella el
instante al escanear**, nunca al sincronizar — ver §2.13 para por qué lo contrario borraría la
trazabilidad de toda una mañana justo al recuperar la cobertura.

Qué se encola y qué no, acotado por los límites reales: los **escaneos** son texto diminuto y caben
de sobra; las **imágenes y PDF capturados sin conexión** no, y esos se encolan con presupuesto
declarado y aviso al usuario.

---

## 6. Modelo de amenazas (C3)

**Activos**: los documentos originales (datos personales de terceros), el texto extraído, la
clave del motor de OCR, y la plantilla por defecto — que es la que decide qué se extrae mañana.

**Fronteras**: todo lo que cruza hacia adentro se valida. Aquí eso son tres cosas, y la tercera
es la que se olvida:

| Atacante | Cómo muerde aquí | Control |
|---|---|---|
| **O1** Usuario malicioso | Un PDF con texto que parece una instrucción, colado en el contexto del modelo que anota | Lo extraído se trata como **datos, jamás como instrucciones**. Validación Zod de toda anotación antes de tocar nada |
| **O3** Fatiga de aprobación | El sello de goma sobre la pantalla de revisión: tras 40 documentos correctos, se le da a guardar sin mirar | La confianza por campo va **arriba y visible**; el ERD propuesto se presenta como diff acotado, nunca como "aplicar todo" |
| **O4** Bots y externos | Denial-of-wallet: subir 10.000 páginas contra un motor que se paga por página | Estimación **antes** de confirmar el lote (§2.18), límite de páginas y el aviso del 80% ya existente |
| **O1** Usuario malicioso | **Inyección de fórmulas**: un valor que empieza por `=` colado en un documento, que Excel ejecuta cuando alguien exporta | Neutralización al generar el CSV (§2.19) |
| **O6** Compromiso de un servicio | Un bucket mal configurado —público en vez de privado— expone documentos de terceros con **URL permanente** | Bucket privado, URL firmada y caduca, y RLS por pertenencia a la organización (§2.15) |
| **O5** Cadena de suministro | El modelo de OCR sin pinear, o un adaptador que trae una dependencia comprometida | El modelo va pineado (C1): `mistral-ocr-4-1`, o el sha del commit de Hugging Face. `mistral-ocr-latest` se rechaza |
| **O6** Compromiso de un servicio | El worker de ingesta con `service_role` convertido en palanca | C7: el worker es job de plataforma y se declara; la superficie de subida del usuario va con RLS y su sesión |
| **O2** Contraparte deshonesta | **Código sustituido**: una pegatina encima del QR legítimo de una factura, o un QR insertado en el PDF de un proveedor, que desvía el pago. 7,6 M de intentos en enero de 2026, 18,7 M en marzo | Nunca se navega a la URL de un código: se muestra el destino. Ningún dato de pago se promueve sin confirmación, y la corroboración con el OCR delata el cambio |
| **O2** Contraparte deshonesta | **Envenenamiento de catálogo**: un documento con un nombre elegido a propósito para forzar un alta espuria en un catálogo que comparte todo el proyecto | Ningún alta sin confirmación humana, y los candidatos parecidos se muestran al lado para que el duplicado salte a la vista |

La frontera que se olvida: **la salida del propio motor**. No se confía por diseño. El `document
annotation` llega como string y se valida contra el esquema antes de existir como dato.

Y otra que la intuición coloca al revés: **la carga de un código**. Decodifica limpio siempre, y
eso invita a confiarla; pero es el canal más barato de manipular que existe, porque no hace falta
comprometer ningún sistema — basta una impresora de etiquetas. Se trata como dato, jamás como
instrucción, y si alimenta a un modelo va saneada.

Y una frontera que la comodidad quiere borrar: **leer el esquema del proyecto**. La vía cómoda
exige clave secreta y ampliaría el privilegio de forma permanente en todo proyecto que instale la
herramienta (§2.6). Por eso la vía por defecto no consulta nada: lee un descriptor declarado.

---

## 7. Evaluación de impacto (C4)

**Partes afectadas**: no son los usuarios de la app. Son **los titulares de los documentos** —
pacientes, clientes, empleados, solicitantes — que nunca eligieron estar aquí.

**Daños posibles sin ningún atacante**:

1. **Un dato mal extraído que nadie corrige.** El markdown sale bien maquetado, con un dígito
   cambiado. Pasa la revisión visual humana. Si ese dato decide algo sobre la persona (un
   importe, una fecha de vencimiento, una dosis), el daño es sobre ella y es difícil de rastrear
   hasta su origen.
2. **Un campo apagado en la plantilla que resulta ser el importante.** La plantilla por defecto
   es cómoda precisamente porque deja de mirarse. Un campo desactivado por conveniencia en el
   primer documento desaparece silenciosamente de los mil siguientes.
3. **El documento fuera del perímetro.** Con el adaptador de API, el original sale hacia un
   tercero.
4. **El duplicado silencioso en un catálogo ajeno.** Un alta que debió ser una coincidencia parte
   en dos el historial de una persona o una empresa: la mitad de sus facturas cuelgan de una fila
   y la mitad de otra. Ocurre sin atacante, no da ningún error, y cuando se detecta ya hay
   movimientos en ambas — deshacerlo deja de ser un `UPDATE` y pasa a ser un proyecto.

5. **El pago desviado por un código sustituido.** El daño no lo sufre quien escanea: lo sufre **el
   proveedor legítimo**, que no cobra y tiene que reclamar algo que su cliente cree haber pagado.
   Es un tercero que no participó en nada.
6. **El evento de trazabilidad perdido en una purga de almacenamiento.** Ocurre sin atacante y sin
   error visible, y quien lo paga es quien dependía de esa trazabilidad — el destinatario que no
   puede probar dónde estuvo su envío, o el lote sanitario que no se puede reconstruir.
7. **El número de guía es dato personal adyacente**: con él se consulta una dirección de entrega.
   No es un secreto, pero tampoco es inocuo.

8. **La evidencia perdida por creerla respaldada.** El respaldo de la base corre en verde y los
   originales no están en él (§2.15). Quien lo paga es el titular que ya no puede probar nada, y no
   se descubre hasta que hace falta.
9. **El dato exportado que sale del sistema.** Un CSV con datos de terceros deja de estar bajo RLS
   en cuanto se descarga. Se registra quién exportó qué y cuándo — no evita el daño, lo hace
   rastreable.

**Mitigaciones**: ningún alta de catálogo sin confirmación humana, con los candidatos parecidos a la vista; bbox de origen obligatorio para todo dato promovido — un dato sin su
coordenada no se puede auditar después; la plantilla registra **quién** apagó cada campo y
**cuándo**; y el ERD derivado nunca se aplica solo.

**Decisión**: el daño 3 **no es firmable por el dueño** (límite de C5). Si los documentos llevan
datos personales de terceros, el adaptador de API no se usa: se usa el autohospedado, o se
rediseña. Ahí no se ofrece la vía del registro de riesgo, porque ofrecerla sugiere que una firma
bastaría.

---

## 8. Qué cierra y qué no

**Cierra**: la forma de la herramienta, sus entry points, sus puertos, la máquina de estados, y
dónde vive cada una de las seis capacidades pedidas. Cierra también quién decide qué: el humano
decide si se publica, con qué versión se pinea, y si el ERD propuesto se aplica.

**No cierra, y hay que decirlo.** Todo lo de esta lista **sigue abierto hoy**, después de
implementar la spec. Tres de ellas son exactamente las que mantienen bloqueadas TAR-17 (umbral de
confianza), TAR-25 (umbral de similitud) y TAR-34 (parámetros de la ráfaga): se **miden**, no se
eligen, y este entorno no tiene corpus, catálogos ni lector físico con que hacerlo.

- **Qué motor gana.** Sigue siendo desconocido hasta correr el piloto. La herramienta está
  diseñada para no tener que saberlo todavía — ese es el motivo del puerto.
- **El umbral de confianza.** No se puede elegir a ojo: depende de la correlación entre el score
  y el error real, que nadie ha medido. Hasta entonces es configuración sin valor por defecto
  defendible.
- **Si el manuscrito del proyecto es de plantilla repetida.** De eso depende que haga falta un
  fine-tune, y es una pregunta empírica.
- **El umbral de similitud** que separa "candidato" de "coincidencia" en la reconciliación de
  valores. Es el hermano del umbral de confianza y tiene el mismo problema: a ojo, o llena la cola
  de revisión de falsos ambiguos, o deja pasar duplicados. Se mide sobre catálogos reales.
- **Cómo se mantiene el descriptor**: generado desde los tipos del proyecto en tiempo de build, o a
  mano. Lo primero no se desincroniza; lo segundo no ata la herramienta al tipado de nadie.
- **Los parámetros de la ráfaga del escáner** (ms entre teclas, mínimo de caracteres): dependen del
  teclado y del lector concretos. Se miden en el puesto, y mientras tanto la vía buena es
  configurar prefijo y sufijo en el escáner, que no necesita medir nada.
- **Las policies de RLS de `migraciones/001-*.sql` no se han ejecutado nunca.** Están escritas y
  revisadas, y eso no es lo mismo que probadas. El banco de pruebas (§2.20) no las alcanza porque
  SQLite no tiene RLS; cerrarlo exige un Postgres real —PGlite embebido, o un proyecto de
  Supabase—, y hasta entonces «el aislamiento está garantizado por la base» es una afirmación sin
  ejecutar detrás.
- **Qué se encola sin conexión además de los escaneos.** Un escaneo es texto y cabe siempre; una
  foto de documento no. Falta decidir el presupuesto y qué se le dice al usuario cuando se agota.
- **Progreso y reanudación de un lote largo**: con un batch que tarda horas es operativamente
  importante, pero no condiciona el modelo de datos, así que se puede añadir sin migrar nada.
- **El plazo de retención por defecto**: depende del tipo de documento y de la jurisdicción. No se
  fija aquí; se declara por proyecto.
### Lo que este documento decía y ya no es cierto

> Hasta el 2026-09-09 esta sección terminaba diciendo: *«El núcleo está construido; la herramienta
> no. Existen los módulos puros con 119 pruebas. No existen los entry points de React, ni la
> cámara, ni los adaptadores de OCR, de persistencia y de storage.»*
>
> **Ya no.** Se implementó la spec 007: **45 de 48 tareas, 372 pruebas** en verde sin red, sin base
> de datos y sin navegador, y **ocho entry points** que se instalan e importan en un proyecto
> limpio. Existen la capa 0, los dos motores de OCR, la propuesta de modelo E-R con su barrera
> anti-`ALTER`, la persistencia con RLS por organización, el bucket privado, la cola en IndexedDB,
> la ingesta con arrastre de carpetas, la vista de revisión, el mapeo campo→columna, las pantallas
> de lotes, coste y supresión, la cámara, el escáner y el lienzo de modelado.
>
> Se deja el párrafo tachado en vez de borrarlo porque un SDD que se reescribe para parecer que
> siempre tuvo razón deja de servir para lo que sirve un SDD: se lee para saber qué se pensaba
> **antes** de construir. El detalle tarea a tarea está en
> [`.claude/specs/007-extractor-documental/tareas.md`](../.claude/specs/007-extractor-documental/tareas.md).

**Tres cosas que se aprendieron construyéndolo y que este documento no preveía:**

1. **La propuesta de alta llegaba sin parecidos al lado.** `resuelveValor` filtra los candidatos
   por umbral, así que cuando se propone un alta —que es precisamente cuando nadie alcanzó el
   umbral— la lista venía vacía **por definición**. §5.1 daba por hecho que los parecidos estarían
   ahí; no lo estaban. Son dos preguntas distintas —*«¿es esta fila?»* y *«¿te suena de algo?»*— y
   el segundo no puede filtrarse por el umbral del primero.
2. **La capa 0 no puede sustituir al motor cuando se piden anotaciones.** Da texto exacto, no
   campos con confianza y región. Devolver campos vacíos «porque había texto» daría por extraída
   una factura sin un solo dato.
3. **Trocear mal no da error.** Parte el documento por donde no toca y **pierde la correspondencia
   de página en silencio**: la página 9 vuelve como página 1 y la cita queda apuntando al sitio
   equivocado. El troceo por páginas necesita remapear los índices al global, región incluida.

---

## 9. Portabilidad: hay un segundo consumidor real

`lisagomez/hermes-os-a2a` **es el mismo SaaS Factory V4** —misma gobernanza C1‑C7, mismo decision
tree, mismas reglas de código— ya en producción: tres verticales aisladas por contenedor, Hetzner
con Docker Compose, Supabase con RLS, OpenRouter con routing por tarea, y CRM sobre Telegram y
WhatsApp.

Eso **justifica retroactivamente** §2.4: lo que se marcó como saltarse la regla del «todavía no»
resulta tener un consumidor esperando.

| Pieza | En un proyecto derivado como hermes |
|---|---|
| Motor OCR autohospedado | **Encaja mejor que en el template**: ya es self-hosted con Docker Compose, así que C4 deja de ser decisión abierta y pasa a ser la premisa |
| Mapeo contra catálogos existentes | Su grafo regulatorio es un Postgres **ya poblado**: el caso *brownfield* del descriptor. El template es el fixture vacío; hermes, el poblado |
| Lectura de CFDI en XML (§2.21) | **Encaja con el grafo, y por eso el lector emite códigos y nunca etiquetas.** Un CFDI trae `601`, `S01`, `03`: darles significado es resolverlos contra las tablas del proyecto, que en hermes **son ese grafo ya poblado**. Embarcar los catálogos del SAT duplicaría el grafo dentro de la herramienta y lo dejaría envejecer por separado — el mismo error que esta tabla ya señala para el lienzo |
| Ingesta por Telegram y WhatsApp | Superficie natural — con el aviso de abajo |
| Coste por página | El mismo hueco **también está abierto allí**, y duele más porque ya está gastando |
| PWA con cola sin conexión | **Se poda**: es infraestructura, no app de campo. Solo aplica si hay operarios en almacén |
| Lienzo de modelado | **Se poda o se replantea**: si ya hay un grafo, un segundo modelador visual duplica el concepto en vez de aprovecharlo |

> **Aviso que suma dos amenazas.** `AGENTS.md` ya dice que un canal de chat externo es superficie
> **no autenticada** hacia un agente con llaves (C3 + C4 + gate humano). Combinado con §2.11 —el
> código es el canal más controlable por un atacante— alguien puede mandar por WhatsApp un
> documento con un QR fabricado. **Las dos amenazas se suman y se tratan juntas**, no por separado.

**Aislamiento**: la herramienta trae su propia multi-tenencia por fila (`organizaciones`). En un
proyecto que además aísla por contenedor, cada vertical se instala con su `organizacion_id` y ese
aislamiento queda como capa adicional. Funciona en los dos sin bifurcar el código. Un documento y una
  capacidad no son lo mismo, y esta capa ya se llevó esa lección.
