# Tareas 007 — Extractor documental como herramienta enchufable

> Una casilla marcada apunta a un artefacto que **existe y se verificó**; marcar por adelantado es
> exactamente cómo un plan deja de significar algo. El núcleo puro está construido y probado
> (**119 pruebas**, sin red, sin base de datos y sin navegador). La UI, la cámara, los adaptadores
> y el empaquetado siguen abiertos.

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

- [x] **TAR-20 · Resolución de valores por similitud.**
      → `src/reconciliacion.ts` — Dice sobre bigramas, `resuelto | ambiguo | sin_resolver`, y
      `elegida` es `null` salvo en `resuelto`. El umbral es parámetro **obligatorio**: no hay
      default defendible sin medirlo.

## Abiertas

- [ ] **TAR-1 · Andamio del paquete.** *(parcial)*
      Hecho: existe `tools/extractor-documental/` con `type: "module"`, `sideEffects: false`,
      `engines.node`, `files` y cero `dependencies` — vigilado por `pruebas/contrato.ts`.
      **Falta**: `exports` solo declara `.` y `./plugin`. Los otros cuatro subpaths no se declaran
      hasta que existan: un `exports` que apunta a un fichero inexistente pasa el build y revienta
      en el proyecto de destino, que es justo el fallo que el empaquetador busca.
      → cubre DoF-1 · RF-22

- [ ] **TAR-5 · Manifiesto del plugin.** *(parcial)*
      Hecho: `src/plugin.ts` exporta id, nombre, descripción, ruta, versión, capacidades e icono
      SVG en línea con `currentColor`, y `pruebas/plugin.ts` verifica que el archivo **no importa
      absolutamente nada**.
      **Falta**: la prueba de que se importa en un proyecto sin React instalado, que es la
      integración real de TAR-15.
      → cubre RF-1 · RF-2 · RF-3

- [ ] **TAR-7 · Adaptador de OCR autohospedado.**
      Hecho cuando: `./motores/openai-compat` habla por `fetch` con un vLLM, valida la respuesta
      contra un esquema antes de devolverla, y el identificador del modelo va pineado.
      → cubre RF-10 · RF-24

- [ ] **TAR-8 · Adaptador de OCR por API.**
      Hecho cuando: `./motores/mistral` implementa el mismo puerto, trocea por tamaño y por
      páginas antes de enviar, y su peerDependency es opcional.
      → cubre RF-7 · RF-24

- [ ] **TAR-9 · Capa 0: PDF que ya trae texto.**
      Hecho cuando: un PDF con capa de texto nativa se resuelve sin llamar al motor, y una prueba
      lo demuestra contando las llamadas.
      → decisión del plan · ahorra entre el 30 % y el 50 % del corpus

- [ ] **TAR-10 · Ingesta en la UI.**
      Hecho cuando: `ZonaDeIngesta` acepta botón, arrastre y selección de carpeta; el arrastre de
      un directorio recorre su árbol de forma recursiva; y lo no soportado se rechaza nombrando
      archivo y motivo.
      → cubre RF-4 · RF-5 · RF-6

- [ ] **TAR-11 · Vista de revisión.**
      Hecho cuando: cada dato muestra su confianza y su región de origen sin desplegar nada, y
      ofrece guardar, modificar y eliminar.
      → cubre RF-11 · RF-14

- [ ] **TAR-12 · Guardar como defecto.**
      Hecho cuando: la acción de pantalla persiste la disposición completa y la siguiente tanda
      del mismo tipo llega ya con ella aplicada.
      → cubre DoF-4 · RF-15 · RF-16

- [ ] **TAR-13 · Catálogos y propuesta de modelo.**
      Hecho cuando: al fijar la plantilla se preparan los catálogos y se emite el SQL del modelo
      entidad-relación **como texto**, y ninguna ruta del código lo ejecuta.
      → cubre DoF-5 · RF-17 · RF-18 · RF-19

- [ ] **TAR-14 · Adaptador de persistencia.**
      Hecho cuando: `./almacenes/supabase` crea sus tablas con RLS activa y policies por
      `owner_id`, el esquema Zod es espejo exacto de los `CHECK`, y ninguna superficie de usuario
      usa `service_role`.
      → cubre RF-21 · control C7

- [ ] **TAR-15 · La prueba de fuego del empaquetado.**
      Hecho cuando: `npm run empaqueta extractor-documental` pasa en verde incluida la
      integración real — proyecto limpio, `npm install <tarball>`, importar y ejecutar.
      → cubre DoF-2 · RF-23

- [ ] **TAR-16 · Cerrar el cableado y los gates.**
      Hecho cuando: la herramienta está enrutada desde el decision tree de `AGENTS.md`, el modelo
      del adaptador tiene entrada en `BITACORA-CDC.md`, y `npm run validate` está en verde.
      → cubre DoF-6 · DoF-7

- [ ] **TAR-21 · Mapeo campo → columna en la UI.**
      Hecho cuando: el revisor asocia un campo extraído a una columna de una tabla del descriptor, y
      lo preexistente se distingue de lo propuesto.
      → cubre RF-27 · DoF-8

- [ ] **TAR-22 · Flujo del valor huérfano.**
      Hecho cuando: sin coincidencia, el dato queda `sin_resolver`, se propone el alta con los
      candidatos parecidos al lado, y **ninguna ruta la escribe** sin confirmación explícita.
      → cubre RF-29 · RF-30

- [ ] **TAR-23 · Lienzo de modelado.**
      Hecho cuando: **primero** se verifica que `@xyflow/react` monta en React 19 (arrastra
      `zustand`, y la incompatibilidad reportada venía de zustand 4); si no monta, se cae a SVG
      propio. Luego: tarjeta por entidad, relación al arrastrar campo sobre columna con su detalle
      antes de crearla, y cardinalidad en los extremos. Sin dirección de filtro cruzado.
      → cubre RF-32 · RF-33 · RF-34

- [ ] **TAR-24 · Barrera anti-ALTER.**
      Hecho cuando: una prueba recorre la salida SQL del generador y **falla** si aparece cualquier
      sentencia que altere una tabla presente en el descriptor.
      → cubre DoF-9 · RF-31

- [ ] **TAR-31 · Lectura con cámara.**
      Hecho cuando: `./react/camara` usa `BarcodeDetector` donde exista y cae a `zxing-wasm` donde
      no, con las dos peer opcionales. Se verifica **antes** que el wasm no se descarga a quien no
      abre la cámara.
      → cubre RF-37 · RF-38

- [ ] **TAR-32 · Escáner óptico en la UI.**
      Hecho cuando: se detecta la lectura por prefijo/sufijo configurado —la vía determinista— y la
      ráfaga por tiempos queda solo como respaldo declarado.
      → cubre RF-39 · RF-40

- [ ] **TAR-33 · Adaptador de IndexedDB para la cola.**
      Hecho cuando: `./almacenes/indexeddb` implementa `AlmacenLocal`, y la app avisa del riesgo de
      purga cuando hay cola pendiente sin estar instalada.
      → cubre RF-50 · RF-53

- [ ] **TAR-43 · Adaptador de Supabase Storage.**
      Hecho cuando: `./almacenes/supabase-storage` sube al bucket **privado**, lee por URL firmada
      con caducidad, y la migración crea las policies sobre `storage.objects` acotadas por
      `bucket_id` y por pertenencia a la organización. Sin `service_role` en la superficie del
      usuario.
      → cubre RF-60 · control C7

- [ ] **TAR-44 · La segunda vía de respaldo del bucket.**
      Hecho cuando: el inventario de `BUSINESS_LOGIC.md` §4 lleva los originales como **línea
      propia**, no colgando de «la base de datos», y queda escrito que `pg_dump` no los incluye.
      Montar la sincronización es operación del proyecto, no código de la herramienta.
      → hallazgo §2.15 del SDD

- [ ] **TAR-45 · Migraciones de organizaciones, lotes, versiones, índice y lápidas.**
      Hecho cuando: existen con RLS por pertenencia a la organización y el esquema Zod es espejo
      exacto de cada `CHECK`.
      → cubre RF-71 · control C7

- [ ] **TAR-46 · Pantalla de lotes: crear, titular, buscar y recuperar.**
      Hecho cuando: se crea un lote con título sugerido editable, y se recupera por título o por un
      identificador extraído.
      → cubre RF-55 · RF-57 · RF-67 · RF-68

- [ ] **TAR-47 · Confirmación de coste y exportación en la UI.**
      Hecho cuando: el coste estimado se ve **antes** de lanzar el lote, y la exportación descarga
      el CSV dejando registro.
      → cubre RF-78 · RF-80

- [ ] **TAR-48 · Flujo de supresión con gate humano.**
      Hecho cuando: suprimir exige rol revisor, motivo y confirmación explícita, y ninguna ruta lo
      dispara automáticamente al vencer la retención.
      → cubre RF-75 · RF-63

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
