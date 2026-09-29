# README «product first» — un skill con comandos, y todos los README de producto reestructurados — Spec

## EL PEDIDO (del laboratorio, 2026-09-29)

> «generame una skill con comandos para activar que los readme se estructuren con enfoque product
> first en el que se describa la funcionalidad de la herramienta o app, casos de uso, requerimientos
> en infraestructura y despuès lo demàs»

Decisiones del laboratorio (preguntadas antes de compilar):

- **El skill vive en el template** (`.claude/skills/`), no global. Viaja con el código, lo leen también
  otros arneses y crearlo es un **CDC (C1)**.
- **Alcance: el skill y TODOS los README de producto que ya existen.** No basta con un README de
  muestra: hay que reestructurarlos todos.

## ESTADO DE PARTIDA (medido el 2026-09-29 en `origin/main` 58174c9, no estimado)

Los README de producto arrancan casi todos por lo técnico. Quien llega no sabe en la primera pantalla
qué resuelve la herramienta, para quién es ni qué necesita para correr.

| README | Líneas | Primera sección hoy |
|---|---:|---|
| `tools/asesor-ventas/README.md` | 60 | Uso |
| `tools/conocimiento/README.md` | 109 | Qué hay |
| `tools/dictado/README.md` | 553 | Qué hace y qué no |
| `tools/etiquetas-gs1/README.md` | 120 | Puntos de entrada |
| `tools/extractor-documental/README.md` | 799 | La regla que ordena todo |
| `tools/grafo-conocimiento/README.md` | 112 | El motor (`src/motor.ts`) |
| `tools/pymes-marketing/README.md` | 69 | Uso |
| `tools/reel/README.md` | 37 | Qué hace |
| `tools/voz/README.md` | 492 | Que hace y que no |
| `src/features/estudio-pymes/README.md` | 15 | (sin secciones) |
| `src/features/laboratorio-pymes/README.md` | 38 | Cómo leerlo |
| `src/features/reel/README.md` | 20 | (sin secciones) |

Tres huecos más:

- **El andamio `tools/ejemplo-herramienta/` no trae README.** Toda herramienta nueva que se copia de
  él nace sin README.
- **El molde de features, `src/features/.template/README.md` (48 líneas),** explica la estructura de
  carpetas, pero no hace nacer las features con un README de producto.
- **Hay features de producto sin ningún README:** a2a, ajustes, auth, dashboard, dictado, etiquetas,
  historial, laboratorio-etiquetas, laboratorio-voz y project-settings.

Hay 26 skills y el número está declarado en `CLAUDE.md`, `AGENTS.md`, `README.md` y
`.claude/README.md`. El verificador (3e) exige que coincida con los directorios. `GEMINI.md` se
genera, no se edita a mano.

No hay enlaces con ancla a ningún README (`README.md#…`: 0 resultados). Aun así, al mover secciones
nada que hoy enlace puede quedar roto.

## MISION

Que en este monorepo **todo README de una herramienta o app responda primero las preguntas de
producto**, y que eso ya no dependa de acordarse. Tiene que haber un skill que lo produce, lo corrige
y lo audita, y una comprobación determinista que lo delata.

**1. El orden product first, un contrato del laboratorio que no se negocia.** Tras el título y una
línea de propuesta de valor:

1. **Qué hace (funcionalidad):** qué resuelve y para quién, en lenguaje de quien lo usa, no de quien
   lo programó. Incluye qué NO hace, porque en esta fábrica los límites son parte del producto.
2. **Casos de uso:** escenarios concretos (quién, en qué situación, qué obtiene). Si el código o los
   documentos no lo sostienen, se declara pendiente; nunca se inventa.
3. **Requerimientos de infraestructura:** lo que necesita para correr:
   - runtime y versión (`engines`);
   - dependencias del sistema: motores, binarios, modelos;
   - CPU, GPU y memoria, **con cifra medida o «no medido»**;
   - servicios externos;
   - variables de entorno, **solo por nombre, jamás el valor**;
   - almacenamiento;
   - si el dato sale del perímetro, que es decisión C4, no de precio.
4. **Después, lo demás**, sin perder nada: instalar, puntos de entrada o API, configuración,
   pruebas, desarrollo, mediciones, avisos, licencias, cambios.

**2. El skill, con comandos para activarlo.** Sugerencia descartable: un skill `readme` con tres
verbos. El nombre y la forma los decides tú; lo obligatorio es que existan los tres usos y se activen
por comando.

- **Nuevo** (p. ej. `/readme nuevo <ruta>`): escribe el README product first de una herramienta o
  feature leyendo su código, su `package.json`, su SDD y sus specs.
  - Lo que solo sabe el laboratorio (para quién es, qué decisión resuelve) se le **pregunta**, una
    cosa a la vez y con respuesta recomendada.
  - Nada se inventa.
- **Reestructura** (p. ej. `/readme reestructura <ruta>|todos`): reordena un README existente al
  contrato y **demuestra que no se perdió contenido**.
  - Se admite reescribir para producto, pero cada línea cambiada o movida queda justificada.
  - Borrar en silencio está prohibido.
- **Revisa** (p. ej. `/readme revisa [ruta]`): audita contra el contrato e informa, por README,
  conforme / no conforme y qué falta. También lista las herramientas y features sin README.
  - Se apoya en un **script determinista** (p. ej. `npm run revisa:readmes`), sin modelo, que otros
    arneses y un gate puedan correr.
  - Tiene modo `--prueba`, como los verificadores de aquí: tumba violaciones sembradas.

**3. Que la regla DISPARE (aprendizaje de esta fábrica: una regla que solo vive en un documento no
dispara):**

- El `description` del skill lo activa solo cuando alguien crea o edita un README de producto.
- `crear-herramienta` y la puerta `docs/CREAR-UNA-HERRAMIENTA.md` / `docs/EMPAQUETAR-HERRAMIENTA.md`
  mandan a él.
- El andamio `tools/ejemplo-herramienta/` nace con su README product first.
- El molde de features hace nacer las features nuevas igual.
- El auditor queda listo para ser gate.

**4. Todos los README de la tabla reestructurados**, con la prueba de no pérdida por archivo. Y
`nuevo` estrenado en un caso real: **`src/features/etiquetas/`**, la app de etiquetas, que no tiene
README y tiene SDD de sobra (`docs/SDD-etiquetas-gs1.md`). Las otras features sin README quedan
**listadas** por el auditor como pendientes, no creadas.

## FUERA DE ALCANCE

- `README.md` raíz y `.claude/README.md`: la gobernanza los lee (cifras, sección de la capa). No se
  reestructuran. Solo se ajusta el conteo de skills.
- `.claude/skills/*/README.md`, `.claude/goals/**`, `.claude/design-systems/README.md`,
  `src/features/README.md`, `src/shared/README.md`, `erp/migrations/README.md` y
  `trayectorias/README.md`: son documentación de arquitectura o de la fábrica, no de producto. El
  auditor los **excluye con motivo declarado**.
- Crear README para las features que no lo tienen, salvo `src/features/etiquetas/`.
- Publicar paquetes o subir versiones de las herramientas.

## LIBERTAD TECNICA

Tú eliges:

- el nombre del skill y de sus comandos;
- cómo se declara el contrato de secciones: encabezados literales, sinónimos admitidos o
  marcadores;
- cómo se prueba la no pérdida: multiconjunto de líneas normalizadas, diff por bloques u otro;
- el formato del informe del auditor;
- si el auditor lee el alcance de un glob con exclusiones o de un padrón.

Lo nombrado aquí son sugerencias descartables, salvo RESTRICCIONES REALES y el orden de las cuatro
partes, que es decisión del laboratorio.

## INVESTIGA ANTES DE CONSTRUIR

- **Referencias de primera línea** del README orientado a producto (2-3): cómo abren con el problema
  y el público los README y las páginas de producto que mejor convierten a quien llega en usuario,
  sin volverse folleto.
- **Aquí:**
  - `.claude/skills/skill-creator/`: la vía de la fábrica para crear skills;
  - `.claude/skills/spec-generator/`: un skill con entrevista y artefacto;
  - `.claude/skills/crear-herramienta/SKILL.md`;
  - `.claude/gobernanza/golden-sets/contratos.json` y `scripts/regresion-skills.mjs`: el contrato C2
    capa A del skill nuevo;
  - `scripts/verifica-gobernanza.mjs` §3e (conteo de skills) y el patrón `--prueba` de
    `scripts/verifica-marca-blanca.mjs`;
  - `docs/CREAR-UNA-HERRAMIENTA.md` y `docs/EMPAQUETAR-HERRAMIENTA.md`: el tarball del ejemplo lista
    hoy «9 archivos»; si el andamio gana README, esa cifra cambia y se actualiza.
- **Por README:** antes de reescribir, lee su código, su `package.json` (`engines`, dependencias) y su
  SDD. Los requerimientos de infraestructura salen de ahí o de mediciones ya escritas (p. ej. el
  extractor: «~110 s por página en CPU»). Lo que no esté medido se escribe «no medido».

Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

1. **El skill** pegado: frontmatter, `description` y los tres comandos, con su **diff completo**.
   También los contratos C2 que le añadiste en `contratos.json`: como mínimo, que declara el orden de
   las cuatro partes y que prohíbe imprimir valores de variables de entorno.
2. **El auditor** pegado:
   - su salida **antes**, sobre `origin/main`, con los 12 README no conformes;
   - su salida **después**, con los 12 conformes;
   - la lista de features sin README, como pendientes.
3. **La prueba de la prueba:** `--prueba` tumbando al menos estas violaciones sembradas:
   - casos de uso antes que qué hace;
   - falta la sección de infraestructura;
   - «lo demás» (p. ej. instalar) antes de las tres de producto;
   - un README en alcance nuevo y sin conformar, que entra solo por el glob;
   - un valor de variable de entorno escrito en el README.
4. **Por cada README reestructurado:** la prueba de no pérdida (líneas conservadas, movidas y
   reescritas con motivo; 0 borradas sin justificar) y su esqueleto de secciones antes y después.
5. **`/readme nuevo` sobre `src/features/etiquetas/`:** el README resultante pegado, qué salió del SDD
   y del código, qué se preguntó y qué quedó «no medido» o pendiente.
6. **La regla dispara:** el diff de `crear-herramienta` y de la puerta, el README del andamio, y
   `npm run empaqueta ejemplo-herramienta` en verde, con la cifra de archivos del tarball actualizada
   donde se cita.
7. **El CDC preparado, no firmado:**
   - `propuesta-cdc.md` en esta carpeta de goal, con el diff completo (skill, `AGENTS.md`,
     `CLAUDE.md`, contratos, conteos) y la evidencia;
   - la entrada de `BITACORA-CDC.md` redactada con «Aprobado por: pendiente».
   El laboratorio firma después, con el diff delante.
8. **Los gates, en verde y pegados:**
   - `npm run regresion`;
   - `npm run verify:gobernanza`, con el conteo de skills en 27;
   - `npm run sincroniza:gemini`;
   - `npm run mide:contexto`, que no pase de presupuesto;
   - el último `npm run validate`, en verde, 26/26 activos o los que haya, con rojos en 0.
9. **La propuesta de gate** (`revisa:readmes` en `.claude/gates.json`) redactada como parte del mismo
   CDC, con su diff, y **sin aplicar** hasta la firma. Es radio sistema: se enseña antes de pedir el
   sí.
10. **Reporte de decisiones:** nombres, contrato de secciones, método de no pérdida y qué dejaste
    fuera. Y **las formas en que podría estar mal o incompleto, resueltas**.

## COMANDO DE VALIDACION

`npm run validate` en este worktree, tras cada cambio grande, pegando su salida y no solo el exit
code. Entre medias, los rápidos:

- `node scripts/regresion-skills.mjs`;
- `npm run verify:gobernanza`;
- el auditor nuevo.

Preparación de `node_modules` en el worktree (mismo sistema de archivos; los symlinks fallan con
Turbopack): desde el checkout principal, `cp -al node_modules <worktree>/node_modules` y
`cp -al tools/dictado/node_modules <worktree>/tools/dictado/node_modules`.

## RESTRICCIONES REALES

- **Worktree `.claude/worktrees/readme-product-first`, rama `readme-product-first`.** Nunca `main` ni
  el checkout principal. En el checkout principal, `prueba:tools` sale en rojo por salidas viejas de
  `tools/extractor-documental/corpus/`: esa carpeta no se toca.
- **CDC (C1):**
  - crear el skill, editar `crear-herramienta`, `AGENTS.md`, `CLAUDE.md`, `contratos.json` o
    `.claude/gates.json` es CDC;
  - el diff se enseña **antes** de pedir el sí;
  - no se firma en nombre del laboratorio;
  - no se hace push, PR ni merge sin que lo pida.
- **`AGENTS.md` va al mínimo.** Es prefijo de caché: el conteo y, como mucho, una rama corta en el
  árbol de decisión, dentro del presupuesto de `mide:contexto`. `GEMINI.md` solo por
  `npm run sincroniza:gemini`.
- **No se pierde contenido.** Se reordena y se reescribe para producto, pero toda línea borrada lleva
  motivo en la evidencia. Las cifras medidas se conservan tal cual, con su fecha.
- **No se inventa.** Ni casos de uso ni requerimientos ni cifras: lo que no esté en código, docs o
  mediciones queda «no medido» o «pendiente».
- **Secretos:** las variables de entorno solo por nombre, jamás su valor.
- **Idioma:** español; en la conversación y en los documentos nuevos, «el laboratorio», nunca
  «la dueña».
- **Reglas de código:** sin `any`, archivos de hasta 500 líneas, funciones de hasta 50,
  dependencias con versión exacta. Sin dependencias nuevas si no hacen falta.
- **Nada se aplica a bases compartidas** (este goal no las necesita).

## RED DE SEGURIDAD

Si tras 15 turnos los 12 README no quedan conformes con el auditor en verde y `validate` sin rojos,
detente y reporta el bloqueo con la salida real del gate o del auditor que no cierra. Si un README
no puede reestructurarse sin perder contenido que importa, no lo fuerces: déjalo como está, dilo y
explica por qué.
