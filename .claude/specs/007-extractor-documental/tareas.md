# Tareas 007 — Extractor documental como herramienta enchufable

> Una casilla marcada apunta a un artefacto que **existe y se verificó**; marcar por adelantado es
> exactamente cómo un plan deja de significar algo. El núcleo puro está construido y probado
> (48 pruebas, sin red, sin base de datos y sin navegador). La UI, los adaptadores y el
> empaquetado siguen abiertos.

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

## Bloqueadas por medición

- [ ] **TAR-17 · Fijar el umbral de confianza.**
      Bloqueada hasta correr el piloto de `docs/INVESTIGACION-OCR-MISTRAL.md` §8: el umbral
      depende de la correlación entre la puntuación del motor y el error real, y a ojo falla en
      las dos direcciones — cola humana inútil, o errores que pasan con confianza alta.
      → duda abierta de la spec

- [ ] **TAR-25 · Fijar el umbral de similitud.**
      Bloqueada hasta medir sobre catálogos reales: es el hermano del umbral de confianza y falla
      igual en las dos direcciones — o llena la cola de falsos ambiguos, o deja pasar duplicados.
      Este template no tiene catálogos que medir, y por eso no se fija aquí.
      → duda abierta de la spec
