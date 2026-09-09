# Tareas 007 — Extractor documental como herramienta enchufable

> Una casilla marcada apunta a un artefacto que **existe y se verificó**; marcar por adelantado es
> exactamente cómo un plan deja de significar algo. El núcleo puro está construido y probado
> (**353 pruebas**, sin red, sin base de datos y sin navegador). Con él están la capa 0, los dos
> adaptadores de motor, la propuesta de modelo con su barrera anti-`ALTER`, y el paquete
> **empaquetado y probado de verdad**: `npm run empaqueta` instala el tarball en un proyecto
> limpio e importa sus **ocho** subpaths. La persistencia (esquema, adaptadores y bucket privado)
> también está cerrada. Siguen abiertos la UI, la cámara y el lienzo de modelado.

## Cerradas

- [x] **TAR-2 · Núcleo: tipos y puertos.**
      → `src/tipos.ts` · `src/puertos.ts` — los cuatro puertos (`MotorOcr`, `AlmacenDocumentos`,
      `AlmacenPlantillas`, `EsquemaExistente`) son interfaces sin implementación, y
      `pruebas/contrato.ts` verifica que el núcleo no importa React, Next, Supabase ni proveedor.

- [x] **TAR-3 · Núcleo: máquina de estados y clasificación.**
      → `src/estados.ts` · `src/archivos.ts` — transiciones declaradas como dato, `revision_humana`
      probada como salida normal y no como fallo. Incluye `troceaPaginas` para el límite de 8
      páginas de las anotaciones.

- [x] **TAR-4 · Núcleo: identidad por contenido.**
      → `src/identidad.ts` — SHA-256 por Web Crypto (mismo código en Node y navegador). Probado que
      reprocesar no crea un segundo registro, y que una vista sobre un buffer mayor no cambia el hash.

- [x] **TAR-6 · Reducer de la plantilla de revisión.**
      → `src/plantilla.ts` — habilitar, deshabilitar, renombrar y reordenar son puras e inmutables;
      deshabilitar registra quién y cuándo, y rehabilitar limpia la autoría anterior.

- [x] **TAR-18 · Puerto de esquema y descriptor declarado.**
      → `src/esquema.ts` — `esquemaDeclarado()` implementa el puerto **sin consultar nada** y valida
      al construir. Ninguna ruta pide una credencial con privilegio de esquema.

- [x] **TAR-19 · Los tres descriptores de ejemplo.**
      → `pruebas/fixtures/` — y la prueba *«el descriptor vacío recorre el mismo código que el
      poblado»* pasa ambos por las mismas funciones. La desalineación se detecta antes de proponer
      mapeo alguno.

- [x] **TAR-26 · Identidad por clase de fuente.**
      → `src/identidad.ts` · `identidadDeLectura()` aplica documento / etiqueta / evento.
      `pruebas/trazabilidad.ts` demuestra que dos lecturas del mismo código como evento **no**
      colapsan, y que un documento sí deduplica por contenido. Cubre DoF-11 · RF-41 · RF-42.

- [x] **TAR-27 · Barrera de identificadores.**
      → `src/reconciliacion.ts` · `resuelveValor` **lanza** sobre `formato: 'identificador'` y
      `resuelveIdentificador()` va por igualdad exacta. La prueba mide el peligro real: un GTIN
      ausente del catálogo se emparejaba con otro producto en estado `resuelto`.
      Cubre DoF-12 · RF-43 · RF-44.

- [x] **TAR-28 · Análisis de la carga de un código.**
      → `src/codigos.ts` · clasifica URL, CFDI, GS1, FNSKU y guía; parsea los AIs de GS1; valida
      módulo 10 (GTIN, SSCC) y módulo 11 de FedEx Express; `esRafagaDeEscaner()` como plan B.
      Los dígitos de control de las pruebas están **calculados, no inventados**.
      Cubre RF-38 · RF-45 · RF-46 · RF-47.

- [x] **TAR-29 · Corroboración entre reconocimiento y código.**
      → `src/corroboracion.ts` · una sola discrepancia exige revisión aunque ambas fuentes vengan
      con confianza alta; los importes se comparan como números para no ahogar la cola en ruido.
      Cubre RF-48 · RF-49.

- [x] **TAR-30 · Cola sin conexión.**
      → `src/cola.ts` · el instante se sella al escanear, se conservan los dos instantes, hay
      retroceso acotado y aviso de riesgo de purga si la app no está instalada.
      Cubre DoF-13 · RF-50 a RF-54.

- [x] **TAR-35 · Roles y matriz de permisos.**
      → `src/roles.ts` · matriz declarada como dato; `pruebas/roles.ts` la recorre **entera**, así
      ningún rol gana un permiso por descuido. Cubre DoF-18 · RF-71..RF-74.

- [x] **TAR-36 · Lote con título y ciclo de vida.**
      → `src/registros.ts` · título obligatorio y **no único**, `tituloSugerido()` derivado del
      contenido, y un lote cerrado que rechaza altas. Cubre DoF-14 · RF-55..RF-58.

- [x] **TAR-37 · Correcciones como versiones.**
      → `src/versiones.ts` · append-only, motivo obligatorio, y `vigente()` por número de versión y
      no por posición. Cubre DoF-16 · RF-64..RF-66.

- [x] **TAR-38 · Índice de identificadores, con la normalización compartida.**
      → `src/busqueda.ts` · `normalizaIdentificador()` **extraída** de `reconciliacion.ts` y usada
      por los dos; la prueba ata ambos caminos al mismo resultado. Cubre DoF-17 · RF-67..RF-70.

- [x] **TAR-39 · Ruta y retención de los originales.**
      → `src/originales.ts` · organización como **primer segmento** (de eso depende que la RLS del
      bucket sea expresable), sin dedupe entre organizaciones, y vencer no borra nada solo.
      Cubre DoF-15 · RF-59..RF-63.

- [x] **TAR-40 · Supresión con lápida.**
      → `src/supresion.ts` · devuelve la orden (lápida + objetos a borrar); el borrado real es del
      adaptador. `esSuprimido()` distingue borrado de inexistente. Cubre DoF-19 · RF-75..RF-77.

- [x] **TAR-41 · Coste estimado antes de confirmar.**
      → `src/costes.ts` · `null` sin tarifa declarada, **nunca cero**, y una suma con un hueco es un
      total desconocido. Cubre RF-78 · RF-79.

- [x] **TAR-42 · Exportación a CSV.**
      → `src/csv.ts` · BOM UTF-8 y neutralización de celdas que Excel ejecutaría; la exportación
      queda registrada. Cubre DoF-20 · RF-80..RF-82.

- [x] **TAR-9 · Capa 0: PDF que ya trae texto.**
      → `src/capa-cero.ts` — `leeCapaCero()` infla los flujos con `DecompressionStream` (API web,
      cero dependencias) y lee los operadores `Tj`/`TJ`/`'`/`"`. `extraeConCapaCero()` es el
      orquestador, y `pruebas/capa-cero.ts` **cuenta las llamadas**: 0 con un PDF que trae texto,
      1 con un escaneo. El matiz que decide la corrección: **pedir anotaciones llama al motor
      aunque haya texto**, porque la capa 0 da texto y no campos con confianza y región — devolver
      campos vacíos «porque había texto» sería dar por extraída una factura sin un solo dato.
      Toda duda (PDF cifrado, filtro no soportado, texto que no supera la prueba de
      imprimibilidad) resuelve **llamando al motor**: un falso negativo cuesta dinero, un falso
      positivo mete datos corruptos con apariencia de exactos y sin pasar por la cola.

- [x] **TAR-7 · Adaptador de OCR autohospedado.**
      → `src/motores/openai-compat.ts` — `fetch` y nada más, verificado por una prueba de contrato
      nueva que **falla si el archivo importa cualquier módulo externo**. El modelo va pineado: los
      alias autoactualizables (`latest`, `stable`, `current`, `default`, `head`) se rechazan **al
      construir**, no al usar (C1). La respuesta se valida campo a campo: una `confianza: "alta"`
      o un `95` en escala 0-100 descartan el campo en vez de romper la comparación contra el
      umbral en silencio, y una región fuera de rango se descarta entera en lugar de recortarse
      —recortarla citaría un sitio que no es de donde salió el dato—. Ni la clave ni el cuerpo de
      la respuesta aparecen en ningún mensaje de error, y hay una prueba que lo exige.
      → cubre RF-10 · RF-24

- [x] **TAR-8 · Adaptador de OCR por API.**
      → `src/motores/mistral.ts` — mismo puerto, límites publicados declarados (50 MB, 1000
      páginas, 8 por anotación). **Trocea por páginas**: `planificaEnvio()` es una función pura y
      probada aparte, porque trocear mal no da error — parte el documento por donde no toca y
      pierde la correspondencia de página en silencio. Por eso `traduceRespuesta()` **remapea los
      índices locales de cada trozo al global**, región incluida: sin eso la página 9 vuelve como
      página 1 y la cita apunta al sitio equivocado.
      **Por tamaño NO trocea, y se dice en vez de fingirlo**: partir los bytes de un PDF exige
      reescribirlo y eso no es de este paquete; lo que hace es rechazarlo antes de gastar la
      llamada, con el peso y el límite en el mensaje.
      Y el detalle que no se puede inventar: la anotación de Mistral **no trae confianza por
      campo**, así que un campo sin ella sale con `confianza: 0` — que no es «seguro que está
      mal» sino «el motor no dijo nada», y es el único valor que garantiza que pase por revisión
      humana con cualquier umbral. Ponerle 1 se saltaría la cola entera, que es el control.
      **Desviación declarada** de la tabla §4 del SDD: habla por `fetch`, no por
      `@mistralai/mistralai`. El SDK no aporta nada en este flujo, sin dependencia no hay versión
      que pinear, y sobre todo TAR-15 instala el tarball en un proyecto limpio e importa cada
      subpath — uno que importe un peer ausente revienta justo ahí.
      → cubre RF-7 · RF-24

- [x] **TAR-13 · Catálogos y propuesta de modelo.**
      → `src/modelo.ts` — `preparaCatalogos()` deriva de los campos **habilitados** (RF-17) y
      `proponeModelo()` emite el SQL **como texto** (RF-18). Los tipos se eligen conservadores:
      `text` salvo que todas las muestras coincidan, porque adivinar `numeric` por tres muestras
      es como se acaba con una columna que rechaza el cuarto documento. La tabla nueva sale con
      RLS activa y su policy por `owner_id` — una tabla nueva sin política es una tabla que
      cualquiera lee. Un mapeo a una tabla que no está en el descriptor **avisa** en vez de
      inventársela.
      → cubre DoF-5 · RF-17 · RF-18 · RF-19

- [x] **TAR-24 · Barrera anti-ALTER.**
      → `src/modelo.ts` · `revisaSql()` — y el cambio de fondo respecto a como estaba planteada:
      **la barrera vive en el código, no solo en la prueba**. `proponeModelo` la llama sobre el SQL
      entero antes de devolverlo, así que una propuesta prohibida no sale de la función. Una
      barrera que solo existe en el test protege al test; ésta protege al proyecto que instale la
      herramienta.
      El matiz que la hace correcta: `ALTER` **no** se prohíbe en bloque, porque una tabla nueva
      necesita `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Se comprueba **a qué tabla apunta cada
      `ALTER`**: si la crea esta misma propuesta es terminar de crearla; cualquier otra lanza.
      Prohibir el verbo entero habría obligado a emitir tablas sin RLS — cambiar un riesgo por otro
      peor. `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `GRANT` y `REVOKE` sí están prohibidos en
      bloque, con prueba por cada uno.
      Y RF-19 se verifica por ausencia de ruta: una prueba lee el fuente y **falla si aparece
      `execute(`, `query(`, `rpc(` o `.from(`**. No se aplica porque no hay con qué.
      → cubre DoF-9 · RF-31

- [x] **TAR-1 · Andamio del paquete.**
      → `tools/extractor-documental/package.json` — `type: "module"`, `sideEffects: false`,
      `engines.node`, `files`, cero `dependencies`, y `exports` con los cuatro subpaths que ya
      existen. La regla que lo sostiene dejó de depender de que alguien se acordara: hay una
      prueba que **falla si un subpath declarado apunta a un fichero que no existe**.
      → cubre DoF-1 · RF-22

- [x] **TAR-5 · Manifiesto del plugin.**
      → `src/plugin.ts` — id, nombre, descripción, ruta, versión, capacidades e icono SVG en línea
      con `currentColor`, y `pruebas/plugin.ts` verifica que el archivo **no importa nada**.
      Lo que faltaba —la prueba de que se importa en un proyecto sin React— ya está medida:
      `npm run empaqueta` importa `@tu-scope/extractor-documental/plugin` en un proyecto temporal
      con **cero dependencias** y obtiene sus 2 exports.
      → cubre RF-1 · RF-2 · RF-3

- [x] **TAR-15 · La prueba de fuego del empaquetado.**
      → `npm run empaqueta extractor-documental` en verde: contrato del `package.json`, build (93
      archivos), tarball (106), **los 4 subpaths instalados e importados en un proyecto limpio**, y
      26 `.d.ts` viajando.
      Y de paso se tapó un hueco del propio empaquetador: **solo importaba el entry principal**.
      Declarar un subpath y no importarlo nunca es prometer una puerta sin girar el pomo — que es
      exactamente el fallo que ese script dice existir para cazar («un `exports` mal puesto…
      revienta en el proyecto de destino»). Ahora recorre todos, y distingue el fallo real del
      **peer opcional ausente**, que en un proyecto limpio es lo esperado y se reporta como «sin
      probar» en vez de pasar por probado.
      → cubre DoF-2 · RF-23

- [x] **TAR-45 · Migraciones de organizaciones, lotes, versiones, índice y lápidas.**
      → `migraciones/001-extractor-documental.sql`, que **viaja en el paquete**: un adaptador sin
      su esquema no sirve de nada. Ocho tablas, RLS activa en todas —verificado recorriendo el
      SQL, no de palabra— y aislamiento **por pertenencia a la organización**, no por `owner_id`
      suelto: un extractor lo usa un equipo, y quien sube no es quien revisa (§2.16). Aislar por
      usuario dejaría al revisor sin ver lo que subió el operario, que es justo el flujo.
      Dos detalles que una prueba vigila porque son fáciles de perder: `versiones_de_campo` y
      `lapidas` **no tienen policy de UPDATE ni de DELETE** —sin policy permisiva RLS deniega, así
      que append-only deja de ser una costumbre y pasa a ser imposible de violar—, y la lápida
      **no tiene clave foránea al documento**, porque un `cascade` se llevaría por delante justo la
      constancia de que existió.
      Y el espejo: una prueba extrae los `CHECK` de la migración y los compara con las uniones de
      `tipos.ts` y `roles.ts`. **Cazó un error real en su primera corrida** — la migración había
      inventado cuatro roles (`capturista`/`administrador`/`lector`) donde el núcleo declara tres.
      Divergir ahí significa que la base acepta un rol que el código de permisos no sabe evaluar.
      → cubre RF-71 · control C7

- [x] **TAR-14 · Adaptador de persistencia.**
      → `src/almacenes/supabase.ts` — **no importa `@supabase/supabase-js`**: el cliente entra
      inyectado con la forma mínima declarada en el propio archivo. Además de mantener el paquete
      sin dependencias, eso es lo que hace cumplible C7 por construcción: **el adaptador no puede
      fabricarse un cliente con `service_role` aunque quisiera**, recibe el que le den. Una prueba
      verifica que ni la migración ni los adaptadores lo *usan*, y que ninguna policy se abre a un
      rol que no sea `authenticated`.
      Lo leído de la base se valida antes de devolverlo: la columna es `jsonb`, así que la base
      acepta cualquier forma, y lo que hay dentro lo escribió una versión anterior de la
      herramienta.
      → cubre RF-21 · control C7

- [x] **TAR-43 · Adaptador de Supabase Storage.**
      → `src/almacenes/supabase-storage.ts` — bucket **privado** (verificado sobre el SQL) y
      lectura por URL firmada. La caducidad se **acota** en vez de obedecerse: quien pide treinta
      días no ha pensado en que una URL firmada circula por correo y sobrevive al permiso que la
      justificó. La policy del bucket se acota por el primer segmento de la ruta —de eso depende
      que la RLS sea expresable— y `borra()` solo se llama explícitamente: vencer la retención no
      borra nada por su cuenta.
      → cubre RF-60 · control C7

- [x] **TAR-33 · Adaptador de IndexedDB para la cola.**
      → `src/almacenes/indexeddb.ts` — IndexedDB y no `localStorage` por dos razones que muerden
      justo en este flujo: `localStorage` es **síncrono** y bloquea la UI mientras el operario
      escanea en ráfaga, y su tope de ~5 MB se desborda en una jornada sin cobertura — y desbordar
      lanza **al escribir**, así que se pierde la lectura recién hecha, la única que el operario
      cree tener.
      Lo que este adaptador **no puede arreglar, y por eso lo dice**: el navegador puede purgar el
      almacenamiento de un sitio no instalado sin avisar. `estimaPurga()` existe para avisar
      **antes** (RF-53), no para prevenirlo. Y cuando el navegador no sabe estimar —Safari viejo,
      contexto no seguro— devuelve `null` y lo dice: un cero ahí se leería como «hay sitio de
      sobra», que es la conclusión contraria a la verdadera.
      Una entrada irreconocible se **descarta** de la lista en vez de devolverse a medias: la
      escribió una versión anterior de la app, y enviarla a medias hace que el servidor la rechace
      para siempre.
      → cubre RF-50 · RF-53

- [x] **TAR-10 · Ingesta en la UI.**
      → `src/react/ZonaDeIngesta.tsx` + `src/react/aplana.ts` — las tres vías de RF-4/5/6, con el
      reparto que hace esto verificable: **el recorrido del árbol vive fuera de React** y se prueba
      sin navegador; la clasificación y el rechazo son del núcleo, ya probados; en el componente
      queda solo el pegamento del DOM, que es justo lo que no lleva decisiones dentro.
      §2.2 en código: elegir carpeta (`webkitdirectory`) entrega la lista **ya plana**; soltarla
      (`webkitGetAsEntry`) entrega un **árbol que hay que recorrer**. `dataTransfer.files` viene
      vacío con una carpeta, y por ahí es por donde se pierden 300 facturas sin un error en consola.
      Tres cosas que un recorrido ingenuo se salta, cada una con su prueba: **`readEntries`
      devuelve como mucho 100 por llamada** —quien la llama una vez pierde el resto en silencio, y
      la prueba usa 250—; un árbol cíclico se corta por profundidad **y se dice**; y un archivo
      ilegible se nombra sin abortar el lote, porque abortar perdería los otros 299.
      El bucle del lector es **iterativo y no recursivo**: la versión recursiva reventaba la pila
      con un lector que repitiera lote, y `Maximum call stack size exceeded` no dice nada de la
      causa.
      → cubre RF-4 · RF-5 · RF-6

- [x] **TAR-11 · Vista de revisión.**
      → `src/react/TablaDeRevision.tsx` + `src/react/revision.ts` — la confianza y la región se
      pintan **siempre**, nunca tras un desplegable (RF-11): un dato cuya procedencia hay que ir a
      buscar es un dato que nadie mira.
      Y la decisión está **en la firma, no en la implementación**: `umbral` es prop **obligatoria y
      sin default**. TAR-17 está bloqueada porque ese número se mide, y un valor por defecto aquí
      sería justo la puerta por la que un número sin medir entraría igual, con apariencia de
      decisión. Un umbral fuera de [0,1] lanza.
      Dos reglas más, con prueba: un campo que la plantilla **no conoce se muestra igual**, al
      final —esconderlo sería peor que el desorden, porque es justo lo que hay que revisar—, y un
      campo de OCR **sin región** impide validar sin revisión, mientras que uno de código sin
      región sí vale: un escáner no produce imagen.
      La cola se enuncia sin adjetivos. `revision_humana` no es un error, y llamarlo fallo es lo
      que empuja a subir el umbral hasta que la cola desaparece, y con ella el control.
      → cubre RF-11 · RF-14

- [x] **TAR-12 · Guardar como defecto.**
      → `disposicionDe()` en `react/revision.ts` + `cargaPlantilla()`/`guardaPlantilla()` en
      `src/plantilla-por-defecto.ts`. La acción de pantalla persiste **todos** los campos, también
      los apagados: guardar solo lo visible perdería que alguien deshabilitó algo a propósito y la
      siguiente tanda lo traería de vuelta — exactamente el trabajo que la plantilla existe para no
      repetir. Hay una prueba de ida y vuelta que ata las dos mitades.
      **Esto empezó siendo un hook y dejó de serlo, y el cambio mejoró el diseño.** `usePlantilla`
      cargaba dentro de un `useEffect` llamando a `setState`; `react-hooks/set-state-in-effect` lo
      rechazó en el gate. La regla estaba señalando el diseño: metía IO y una condición de carrera
      —una carga lenta de un tipo pisando la del tipo actual— dentro del árbol de React, justo
      donde no se puede probar sin navegador. Ahora son dos funciones `async` en el núcleo, sin
      React ni DOM, probadas con `node --test`.
      Y la asimetría entre las dos es deliberada: **cargar no lanza** —la revisión funciona sin
      plantilla, y no poder leer una preferencia no justifica dejar al revisor sin pantalla, pero
      el motivo se conserva para distinguir «no había» de «no se pudo leer»— mientras que
      **guardar sí lanza**: fallar al guardar el trabajo de revisión de una persona y no decírselo
      le hace creer que quedó a salvo cuando no.
      → cubre DoF-4 · RF-15 · RF-16

- [x] **TAR-21 · Mapeo campo → columna en la UI.**
      → `src/react/mapeo.ts` · `columnasOfrecidas()` saca las columnas del **descriptor declarado**
      y las marca `preexistente`, que es lo que RF-27 pide distinguir. No hay introspección ni
      falta: §2.6 explica que la única vía exige clave secreta, y una herramienta que pide
      `service_role` para arrancar amplía el privilegio en todo proyecto que la instale (C7). Un
      descriptor vacío devuelve lista vacía, y eso es un estado **normal** (§2.8).
      La bifurcación por `formato` no es una optimización: `resuelveValor` **lanza** ante un
      identificador a propósito, y este módulo elige la vía correcta antes de llamar.
      → cubre RF-27 · DoF-8

- [x] **TAR-22 · Flujo del valor huérfano.**
      → sin coincidencia el dato queda `sin_resolver` y el alta se **propone**, nunca se escribe:
      `altasPendientes()` devuelve una lista, y una prueba verifica que en el módulo **no existe
      ninguna función que escriba** (RF-30 no se cumple prometiéndolo, se cumple porque la ruta no
      está).
      **Y aquí apareció un hueco real del núcleo, que esta tarea destapó.** `resuelveValor` filtra
      los candidatos por `>= umbral`, así que cuando se propone un alta —que es precisamente cuando
      nada alcanzó el umbral— la propuesta llegaba con **cero parecidos**. El comentario del tipo
      prometía que «los parecidos hacen saltar el duplicado» y en el único caso que importa no
      había ninguno: el revisor daría de alta «ACME Servicios Industriales» sin ver que «ACME
      S.A. de C.V.» ya existe, y el flujo que existe para evitar duplicados los estaría creando.
      El arreglo separa dos preguntas que el código confundía: `resuelveValor` responde *«¿es esta
      fila?»* —ahí el umbral manda— y `parecidosA()` responde *«¿te suena de algo?»*, sin filtrar,
      que es lo que hay que enseñar al proponer un alta.
      → cubre RF-29 · RF-30

- [x] **TAR-46 · Pantalla de lotes: crear, titular, buscar y recuperar.**
      → `src/react/pantallas.ts` — el título se **sugiere** del contenido y es editable, con una
      marca `esSugerido` que existe para un caso concreto: si llegan más documentos **después** de
      que alguien escribiera su propio título, la sugerencia **no lo pisa**. Sin esa marca habría
      que elegir entre no actualizar nunca o pisar lo que una persona escribió, que es peor.
      Obligatorio pero **no único**: dos tandas pueden llamarse igual y eso no es un error (§2.14).
      → cubre RF-55 · RF-57 · RF-67 · RF-68

- [x] **TAR-47 · Confirmación de coste y exportación en la UI.**
      → **ver la cifra no es aceptarla**: sin aceptación explícita no se lanza. Y un coste
      desconocido **no bloquea pero se marca** — bloquear por no saber dejaría la herramienta
      inservible en cuanto un motor no declare precio, y lanzar en silencio sería gastar sin
      avisar. `null` se enseña como «desconocido», nunca como «0,00 USD»: misma regla que la
      contabilidad de tokens y que la estimación de purga.
      → cubre RF-78 · RF-80

- [x] **TAR-48 · Flujo de supresión con gate humano.**
      → las tres condiciones de RF-75 se comprueban **por separado** para poder decir cuál falta:
      decir «no puedes» sin decir qué falta obliga a adivinar, y quien adivina prueba combinaciones
      hasta que una funciona — lo último que quieres con un borrado.
      Y RF-63 en código: la retención vencida produce una **lista de candidatos**, no un borrado.
      Una fecha ilegible **no** se trata como vencida: ante la duda no se propone borrar nada. Una
      prueba recorre los exports y falla si aparece una función que borre.
      → cubre RF-75 · RF-63

- [x] **TAR-31 · Lectura con cámara.**
      → `src/react/camara.ts` — `BarcodeDetector` nativo donde exista (Chrome, Android) y respaldo
      `zxing-wasm` donde no (Safari, Firefox: **no es una excepción rara**, es buena parte de los
      teléfonos que van a usar esto). Las dos como peer opcional.
      **La garantía de la tarea, verificada contando llamadas**: construir el lector **no carga el
      wasm**, y donde hay detector nativo no se carga nunca. El `import()` va dentro de la función,
      no arriba del archivo — un import estático lo metería en el bundle de todo el que importe el
      módulo, incluida la persona que solo sube PDF desde un escritorio y no abrirá una cámara en
      su vida. Y no se notaría al probar: funcionaría igual, arrastrando medio mega por carga.
      → cubre RF-37 · RF-38

- [x] **TAR-32 · Escáner óptico en la UI.**
      → `src/react/escaner.ts` — §2.12 en código: el escáner **no es un dispositivo, es un
      teclado**, así que todo el problema es distinguir «lo tecleó un aparato» de «lo está
      escribiendo una persona».
      La vía **determinista** (prefijo y sufijo configurados en el aparato) es la principal, y la
      ráfaga por tiempos queda como **respaldo declarado**: sin parámetros explícitos está
      desactivada, que es lo correcto mientras TAR-34 siga sin medir. Y cuando sí se usa, la
      lectura se marca **no fiable**.
      El detalle que evita reintroducir el problema por la puerta de atrás: **estando configurado,
      no se cae al respaldo**. Si el aparato pone su marca y esto no la lleva, lo escribió una
      persona; probar la heurística después devolvería justo los falsos positivos que la vía 1
      elimina — y un falso positivo se **come** lo que alguien estaba escribiendo.
      → cubre RF-39 · RF-40

- [x] **TAR-23 · Lienzo de modelado.** *(con una salvedad declarada)*
      → `src/react/lienzo.ts` + `LienzoDeModelado.tsx`.
      **La salvedad, dicha tal cual**: la tarea pedía **verificar primero** que `@xyflow/react`
      monta en React 19. Esa verificación **no se ha hecho** — no está instalado y este entorno no
      tiene con qué montar un componente (ni jsdom, ni testing-library, ni navegador). Así que no
      se afirma que falle: se afirma que **no se comprobó**, y se aplica el respaldo que la propia
      tarea prevé. Si alguien lo verifica de verdad algún día, cambiarlo es sustituir la capa de
      pintado, no las decisiones — que viven aparte y están probadas.
      **Se copia de Power BI** (§2.7): tarjeta por entidad, relación al arrastrar columna sobre
      columna con su detalle antes de crearla, cardinalidad en los extremos, y línea sólida frente
      a punteada — punteada cuando apunta a una tabla que **ya existe**, porque ésa no se crea, se
      referencia.
      **No se copia la dirección de filtro cruzado**, y hay una prueba que verifica que no existe:
      en Power BI describe cómo se propagan los filtros al calcular agregaciones, un concepto de
      BI. Aquí lo que hay es cardinalidad y sentido de la clave foránea. Traer esa perilla sería
      ofrecer un control que no gobierna nada — peor que no tenerlo, porque quien lo mueve cree
      haber decidido algo.
      Dos detalles del pintado: lo preexistente se distingue por **posición, borde y texto**, no
      solo por color —quien no distinga esos colores, o use un lector de pantalla, lo necesita—; y
      las tarjetas son HTML con las líneas en SVG porque `draggable` no es atributo de `<text>`, y
      un lienzo SVG puro obligaría a reimplementar el arrastre a mano.
      → cubre RF-32 · RF-33 · RF-34

- [x] **TAR-44 · La segunda vía de respaldo del bucket.**
      → `BUSINESS_LOGIC.md` §4 — los ficheros de Storage entran como **línea propia** del
      inventario, no colgando de «Datos en Supabase», con su criticidad y su destino, y con la
      razón escrita al lado: los bytes viven **fuera de Postgres**, así que un `pg_dump` en verde
      deja fuera todas las evidencias — y eso es **peor** que no tenerlas respaldadas, porque
      parece que están.
      Se hace sobre la **plantilla** del repo y no sobre un proyecto concreto, que es lo que
      corresponde aquí: así lo hereda todo proyecto que la use, en vez de depender de que alguien
      se acuerde. Y queda dicho que montar la sincronización es **operación del proyecto**, no algo
      que traiga la herramienta que sube los ficheros.
      → hallazgo §2.15 del SDD

- [x] **TAR-16 · Cerrar el cableado y los gates.**
      → `npm run validate` en **verde** en cada aterrizaje, con `verifica:specs` incluyendo esta
      spec (DoF-6). El pineado de modelo tiene su entrada en `BITACORA-CDC.md` (DoF-7): los
      adaptadores **reciben** el identificador y la herramienta pone la barrera —
      `exigeModeloPineado()` rechaza cinco familias de alias **al construir**, con prueba— y queda
      declarado que en este repo **no hay ningún modelo en producción** que pinear.
      Y la herramienta está enrutada desde el decision tree de `AGENTS.md`, con `GEMINI.md`
      **regenerado** (a mano el verificador lo rechaza). Fue un **CDC estándar** con su aprobación
      explícita y su entrada en bitácora — presentado, **descartado una primera vez**, y aprobado
      después de ver el diff, las dos capas de regresión y el coste medido: el suelo por sesión
      sube de 8908 a 9128 tokens.
      La entrada dice, además de la ruta, que **los umbrales no vienen puestos y se miden**. Eso
      está ahí y no solo en el README por el aprendizaje del 2026-08-23: *un control escrito solo
      en un documento referenciado no dispara*.
      → cubre DoF-6 · DoF-7

- [x] **TAR-20 · Resolución de valores por similitud.**
      → `src/reconciliacion.ts` — Dice sobre bigramas, `resuelto | ambiguo | sin_resolver`, y
      `elegida` es `null` salvo en `resuelto`. El umbral es parámetro **obligatorio**: no hay
      default defendible sin medirlo.

## Abiertas

## Bloqueadas por medición

- [ ] **TAR-17 · Fijar el umbral de confianza.**
      Bloqueada hasta correr el piloto de `docs/INVESTIGACION-OCR-MISTRAL.md` §8: el umbral
      depende de la correlación entre la puntuación del motor y el error real, y a ojo falla en
      las dos direcciones — cola humana inútil, o errores que pasan con confianza alta.
      → duda abierta de la spec

- [ ] **TAR-34 · Fijar los parámetros de la ráfaga del escáner.**
      Bloqueada: dependen del teclado y del lector concretos, y este contenedor no tiene ninguno.
      Mientras tanto la vía buena no necesita medir nada — configurar prefijo y sufijo en el aparato
      hace la detección determinista.
      → duda abierta de la spec

- [ ] **TAR-25 · Fijar el umbral de similitud.**
      Bloqueada hasta medir sobre catálogos reales: es el hermano del umbral de confianza y falla
      igual en las dos direcciones — o llena la cola de falsos ambiguos, o deja pasar duplicados.
      Este template no tiene catálogos que medir, y por eso no se fija aquí.
      → duda abierta de la spec
