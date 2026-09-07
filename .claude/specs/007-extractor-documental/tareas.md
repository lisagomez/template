# Tareas 007 — Extractor documental como herramienta enchufable

> **Todas abiertas.** Nada de esta spec está construido. Una casilla marcada apunta a un
> artefacto que existe y se verificó; marcar por adelantado es exactamente cómo un plan deja de
> significar algo.

## Abiertas

- [ ] **TAR-1 · Andamio del paquete.**
      Hecho cuando: existe `tools/extractor-documental/` copiado de `tools/ejemplo-herramienta/`,
      con `package.json` declarando los seis subpaths de `exports`, `type: "module"`,
      `sideEffects: false`, `engines.node` y todas las peer marcadas opcionales.
      → cubre DoF-1 · RF-22

- [ ] **TAR-2 · Núcleo: tipos y puertos.**
      Hecho cuando: `MotorOcr`, `AlmacenDocumentos` y `AlmacenPlantillas` existen como
      interfaces, sin una sola implementación, y el núcleo no importa nada.
      → cubre RF-9 · RF-21 · RF-22

- [ ] **TAR-3 · Núcleo: máquina de estados y clasificación.**
      Hecho cuando: las transiciones `pendiente → … → validado` y `clasificaArchivo` son
      funciones puras con pruebas que corren sin red y sin claves, y `revision_humana` es una
      salida normal, no un error.
      → cubre DoF-3 · RF-6 · RF-12

- [ ] **TAR-4 · Núcleo: identidad por contenido.**
      Hecho cuando: el identificador de un documento sale del hash de su contenido, y una prueba
      demuestra que reprocesar el mismo lote no crea un segundo registro.
      → cubre RF-8

- [ ] **TAR-5 · Manifiesto del plugin.**
      Hecho cuando: `./plugin` exporta id, nombre, descripción, ruta, versión, capacidades e
      icono SVG en línea, y se importa en un proyecto **sin React instalado**.
      → cubre RF-1 · RF-2 · RF-3

- [ ] **TAR-6 · Reducer de la plantilla de revisión.**
      Hecho cuando: habilitar, deshabilitar, renombrar y reordenar campos son transiciones puras,
      y deshabilitar registra quién y cuándo.
      → cubre RF-13 · RF-20

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

## Bloqueadas por medición

- [ ] **TAR-17 · Fijar el umbral de confianza.**
      Bloqueada hasta correr el piloto de `docs/INVESTIGACION-OCR-MISTRAL.md` §8: el umbral
      depende de la correlación entre la puntuación del motor y el error real, y a ojo falla en
      las dos direcciones — cola humana inútil, o errores que pasan con confianza alta.
      → duda abierta de la spec
