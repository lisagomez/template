# Banco de pruebas con base de datos — extractor documental (spec para `/goal`)

> Compilado por `/goal-compiler` el 2026-09-10. Forma: **loop** (un solo contexto, sin fan-out).
> No es una spec del protocolo: **no va en `.claude/specs/`** — ese directorio exige numeración
> correlativa, diez secciones y EARS, y un octavo directorio ahí pondría `npm run verifica:specs`
> en rojo para todo el repo.

## MISION

Hoy el extractor documental está construido —45 de 48 tareas, 372 pruebas en verde— y **no se
puede ejercitar de punta a punta en este repo**, porque el template no tiene bases. El SDD lo dice
en §2.8: *«no hay catálogos, ni datos, ni un esquema real que introspeccionar»*. Los descriptores
son tres ficheros JSON. La persistencia sólo existe contra Supabase o IndexedDB. TAR-25 está
literalmente bloqueada con la frase *«Este template no tiene catálogos que medir»*.

El horizonte: **un negocio ficticio completo, coherente y reproducible vive dentro del banco de
pruebas**, y convierte `npm run demo` en un entorno donde el extractor recorre el camino entero
—ingesta → OCR → cola de revisión → mapeo contra catálogos → reconciliación → persistencia →
recuperación → medición— sin Supabase, sin credenciales, sin red y sin una sola cuenta que crear.

Lo que debe existir cuando termines:

- **Los puertos de servidor implementados de verdad.** `AlmacenDocumentos`, `AlmacenPlantillas`,
  `RepositorioDeRegistros`, `AlmacenDeOriginales`, `EsquemaExistente` y la cola (`AlmacenLocal`)
  sobre una base embebida. Hoy sólo hay `supabase`, `supabase-storage` e `indexeddb`: no existe
  ninguna vía de servidor sin Supabase.
- **Datos semilla con la forma del mundo real, no lorem ipsum.** GTIN con dígito de control
  módulo 10 válido, SSCC, RFC bien formados, y nombres de proveedor con las variaciones
  ortográficas que hacen interesante la similitud de Dice: *«ACME S.A. de C.V.»* / *«Acme SA de
  CV»* / *«ACME SA»*. Un catálogo de juguete no ejercita nada.
- **Los tres estados del descriptor sobre una base real**, no sobre tres JSON: vacío (proyecto
  virgen — el caso normal según §2.8, no una rama), poblado, y **desalineado** (declara una
  columna que ya no existe).
- **El escenario peligroso de §2.10 sembrado a propósito.** Identificadores que **no están** en el
  catálogo, para que quede demostrado que la respuesta es *no está* y jamás *«el más parecido»* —
  que es lo que mete stock en el SKU equivocado sin un solo error visible.
- **Las tres clases de fuente de §2.9 con datos que las distingan.** Documento (deduplica por hash
  del contenido), etiqueta (GTIN + lote + serie), y **evento** (el mismo código escaneado dos veces
  son legítimamente dos eventos: salida de almacén y llegada; deduplicarlos borra la trazabilidad
  de una mañana entera sin producir ningún error).
- **Semilla determinista.** La misma semilla produce la misma base, bit a bit. Se levanta con un
  comando y se destruye con otro; nada queda commiteado que no sea reproducible.
- **El corpus sigue vivo.** `demo/corpus/campos.jsonl` y `similitud.jsonl` siguen alimentándose y
  `npm run mide` sigue leyéndolos. Si la base mejora ese circuito, que lo mejore; romperlo no es
  una opción.

## LIBERTAD TECNICA

Tú eliges arquitectura, motor de base, esquema y estrategia: probablemente sabes mejor que yo qué
conviene aquí.

**SQLite es de dónde salió la idea, NO un requisito.** Es una sugerencia descartable. Investiga y
decide con evidencia entre, al menos:

- **`node:sqlite`** — nativo en Node 22.23 (verificado en este entorno: `DatabaseSync`,
  `StatementSync`, `backup`), cero dependencias, pero emite `ExperimentalWarning`.
- **PGlite** — Postgres compilado a WASM, embebido. El argumento fuerte: **producción es Supabase,
  que es Postgres**, y SQLite diverge en tipos y dialecto justo en el sitio donde el adaptador de
  Supabase no divergiría. Una base de prueba que miente sobre el dialecto valida un camino que no
  es el que se va a correr.
- **better-sqlite3** — maduro y síncrono, a cambio de una dependencia nativa que compila.

El criterio no es «cuál es más cómodo»: es fidelidad al dialecto de producción, coste de
dependencia, y si sobrevive al gate sin red ni compilador. Decide y **justifícalo**.

## INVESTIGA ANTES DE CONSTRUIR

- `docs/SDD-extractor-documental.md` **entero**, y con especial cuidado §2.6 (no hay vía sin
  privilegio para introspeccionar un esquema), §2.8 (el descriptor vacío es el caso normal),
  §2.9 (la identidad depende de la clase de fuente), §2.10 (los identificadores van por igualdad
  exacta y `resuelveValor` **lanza** si se intenta la vía difusa), §2.11 (procedencia de código).
- `tools/extractor-documental/src/puertos.ts` — los seis puertos, con el porqué de cada uno.
- `src/almacenes/supabase.ts` y `src/almacenes/indexeddb.ts` — el patrón de adaptador que este
  paquete ya aceptó. Cópialo en forma, no reinventes uno nuevo.
- `demo/servidor.mjs` y `medicion/mide.mjs` — el banco de pruebas ya fabrica corpus como
  subproducto de usarlo. Esto **extiende** ese circuito, no lo sustituye.
- `.claude/specs/007-extractor-documental/tareas.md`, tareas TAR-17, TAR-25 y TAR-34 — para saber
  exactamente qué NO estás autorizado a cerrar.

Reafirma el objetivo en una línea antes de cada edición grande, para no driftar.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador **sólo ve esta conversación**: no corre comandos ni abre ficheros. Surfea el output.

1. `cd tools/extractor-documental && npm run prueba` en verde, con el **conteo nuevo pegado** y
   estrictamente mayor que 372. Ninguna de las 372 existentes borrada ni relajada.
2. `npm run validate` en la raíz, en verde, output pegado.
3. **La siembra**, con su output: cuántas tablas, cuántos proveedores, cuántos SKUs, qué semilla.
4. **Una corrida de punta a punta pegada, paso a paso**: entra un documento → salen campos → se
   mapea contra el catálogo → uno cae en cola de revisión por confianza baja → se corrige a mano →
   se persiste → **se reinicia el proceso** → se recupera el mismo lote intacto.
5. **Los tres descriptores sobre la base real**: vacío, poblado y desalineado, cada uno con su
   output. El desalineado tiene que fallar de forma legible, no explotar.
6. **El escenario peligroso**: un identificador ausente del catálogo devuelve *no está* — con el
   output que lo demuestra, y con el segundo-mejor visible para que se vea qué se rechazó.
7. **Las tres clases**: el mismo documento dos veces produce **un** registro; el mismo código
   escaneado dos veces produce **dos** eventos. Output de ambos.
8. **Determinismo**: dos siembras con la misma semilla, y el hash o el diff pegado que lo prueba.
9. **Reporte de decisiones**: qué motor de base elegiste, contra qué alternativas, y por qué.
10. **Declaración explícita**: *«TAR-17, TAR-25 y TAR-34 siguen bloqueadas; no fijé ningún
    umbral»*. Si no puedes escribir esa frase con verdad, no has terminado: te has desviado.
11. Lista las formas en que esto podría estar mal o incompleto, y resuélvelas.

## COMANDO DE VALIDACION

```
cd tools/extractor-documental && npm run prueba
```

Hoy da **372/372 en verde en ~420 ms**, sin red y sin base de datos. Córrelo **tras cada cambio
grande**, no sólo al final, y pega el output. Antes de cerrar, además, `npm run validate` en la
raíz (typecheck + lint + build + gobernanza + regresión + contabilidad + fugas).

## RESTRICCIONES REALES

1. **NO se fija ningún umbral. Ninguno.** TAR-17 (confianza), TAR-25 (similitud) y TAR-34 (ráfaga
   del escáner) siguen bloqueadas cuando termines. Un catálogo sintético permite **ejercitar** el
   camino de la similitud; no permite **medir** dónde cortar — eso exige el corpus real, 100-200
   páginas, y `mide.mjs` ya lo dice. `calibracion.ts` tiene una prueba que falla si alguien añade
   una función que recomiende umbrales: no la toques y no la rodees. **Proponer un umbral con datos
   sintéticos no es un extra: es el fallo exacto que esta restricción existe para impedir.**
2. **Banco de pruebas, no superficie publicada.** Decisión tomada: fuera de `exports` y fuera de
   `files` en el `package.json` del paquete. La puerta de `docs/CREAR-UNA-HERRAMIENTA.md` manda —
   sin reuso real 3+ veces, publicar sólo añade una versión que mantener. Promoverlo algún día a
   `./almacenes/sqlite` sería un CDC aparte, con diff, regresión y bitácora.
3. **El núcleo no importa nada.** `src/` del paquete no gana ni una dependencia por esto. Lo que
   necesite la base vive en el banco de pruebas.
4. **Cero credenciales y cero red.** Ni `service_role`, ni claves, ni salida a internet: corre en
   un contenedor aislado igual que las 372 pruebas de hoy.
5. **Datos sintéticos, siempre.** Ni una factura, ni un catálogo, ni un RFC de una persona o
   empresa real. Datos personales de terceros es C4, no una comodidad — y el daño recaería sobre
   quien no firmó nada.
6. **`npm run mide` sigue funcionando** y sigue exigiendo ≥100 páginas para llamarse concluyente.
7. Español en código, comentarios y salidas, como todo el paquete.

## RED DE SEGURIDAD

Si tras **25 turnos** no converges, detente y reporta el bloqueo con lo que llevas construido.
