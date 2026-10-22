# Soporte SAP × sapstack: propuesta para mantener viva la base de conocimiento SAP

Goal compilado el 2026-10-22 (skill goal-compiler). Worktree `.claude/worktrees/soporte-sapstack`, rama
`soporte/sapstack`, **apilada sobre `soporte/vista-experto`** (`d632e0f`, la mesa del experto, todavía sin PR). Su PR
va después del de la mesa. **Forma: loop**, en dos tramos: primero la propuesta y después la vista que la hace visible.
Lo hace un agente de punta a punta; repartir por módulo de sapstack es paralelismo opcional, no un grafo. La propuesta
sí describe un flujo de actualización (un grafo de artefactos), pero como contenido, no como forma de este goal.

## MISIÓN

Que el laboratorio tenga **la propuesta definitiva** para que Soporte SAP no envejezca. Tiene que decir qué se toma de
sapstack, por dónde entra, quién lo valida, quién lo firma y cómo se mantiene al día, con cada afirmación medida sobre
el código de los dos lados y no copiada de un README.

Al terminar existe `docs/goals/soporte-sap-sapstack-propuesta.md`, un borrador que firma el laboratorio. Una
consultora N2 que lo lea entiende por qué el agente de soporte va a saber más el mes que viene que hoy, y por qué ese
saber no le va a dar un veredicto inventado a su cliente. Lleva:

1. **Lo que sapstack es de verdad**, fijado por commit: módulos, agentes, comandos, datos (T-codes y punteros a SAP
   Notes), escenarios, guiones y CI. Cada cifra contada, no citada. Y su **procedencia**: de quién es, de dónde sale,
   la licencia, la última actualización, si alguien lo mantiene y qué tan confiable es como fuente (un recurso
   secundario, en coreano y hecho en un día no es una fuente citable para un veredicto).
2. **La transcripción del laboratorio, verificada**: las tres sugerencias (CI empresarial, matriz de herencia global y
   local, fuente única con banners) y **cada afirmación que hace sobre el repo**, una por una, contra el código:
   cierta, falsa o a medias, con `archivo:línea`. Lo que la transcripción da por hecho y no existe se dice.
3. **El cruce sapstack → Soporte SAP**, activo por activo. Destino posible de cada uno:
   - el dominio `sap-soporte` de `tools/conocimiento` (todavía vacío: «sus reglas reales entran con la primera
     incidencia real, firmadas»);
   - el léxico del anonimizador (`tools/soporte-sap/src/lexico.ts`: lo que NO es un nombre);
   - la categorización y el mapeo;
   - el kit y la mesa del experto;
   - o ninguno.
   Cada activo con su riesgo, quién lo valida, quién lo firma y **una medida**. Por ejemplo: cuántos T-codes de
   sapstack ya conoce Soporte SAP, y cuántos términos SAP de sus escenarios el anonimizador de hoy toma por nombre de
   persona. Esa medida, corrida y pegada.
3b. **El grafo para ampliar la base**, que es la primera línea de la transcripción. Los candidatos de sapstack se
   escriben **con el contrato del grafo** (`tools/grafo-conocimiento/src/contrato.ts`) y se validan con
   `validaConocimiento`, en un paquete de prueba fuera de `tools/conocimiento` y sin registrarlos. Luego se corre el
   motor sobre los 5 escenarios de sapstack (`docs/scenarios/`), para mostrar cuáles tendrían veredicto y cuáles irían
   «al experto», y por qué: sin fuente citable, en conflicto o con la categoría en duda. Además, qué relaciones del
   grafo enriquecerían el triage (T-code ↔ módulo ↔ síntoma o dump ↔ puntero a Note ↔ release ECC/S4) y qué cambiaría
   en `categoriza` y `mapeo` si entraran.
3c. **La imprenta de CLIs**: los 10 comandos y los 9 agentes de sapstack, cada uno por la escalera CLI-first de
   `AGENTS.md`:
   1. ¿Ya lo cubre un `ss-*` de `tools/soporte-sap/clis/manifiesto.json`?
   2. ¿Está **publicado** en la librería de la imprenta?
   3. ¿Conviene **imprimir** uno? Solo si la tarea ya se repitió 3 o más veces **y** existe la API real.
   4. Si no, el modelo, por routing.

   Cada candidato lleva su clasificación del contrato: `readOnly`, dry-run por defecto, si es **destructivo** (lo que
   mueve dinero, como F110, es destructivo y su daño a terceros no es firmable) y su grado. Sin grado, es «no medido».
   La vía que ya existe: el experto enseña una operación repetible en la mesa, el chat propone el CLI sin imprimirlo
   (`tools/soporte-sap/src/chat.ts:76`) y el laboratorio lo aprueba por CDC.
4. **Las tres sugerencias traducidas a los mecanismos que el template ya tiene**, sin copiar los de sapstack:
   - **CI empresarial**: el padrón de gates (`.claude/gates.json`, `npm run gates`, `proyecta:gates`) proyectado a
     GitHub Actions, GitLab CI y Jenkins, con fragmentos YAML y Groovy de ejemplo y las refs fijadas por SHA. Nunca
     `main` ni `latest`: el reusable de sapstack apunta a un repo que ya no existe y por defecto usa `main`.
   - **Matriz de herencia**: SAP estándar → localización MX (CFDI, SAT) → consultora → cliente. Quién gana cuando
     chocan, en una matriz visual. Se alinea con lo que ya rige: `generales/` frente a `dominios/`, la contención
     declarada (gana la frase más específica, por escrito, en `contenciones-aceptadas.json`) y **el motor: sin regla
     o en conflicto no declarado, no hay veredicto**. Una precedencia que cambie un veredicto la firma el laboratorio.
   - **Fuente única y artefactos generados**: el diagrama de flujo de una edición en la fuente hasta cada artefacto
     generado. Los banners «ALTO: ARTEFACTO AUTOGENERADO» en la primera línea, con enlace a la fuente, y el gate que
     rechaza editarlos a mano, con el patrón de `sincroniza:gemini`.
5. **El lazo de actualización**, como grafo de artefactos con sus aristas tipadas (guion, agente o humano):
   - la fuente fijada;
   - el aviso de commit nuevo, que no mueve nada (como `vigila:versiones`);
   - el diff;
   - los candidatos;
   - la validación del experto en la mesa (`/mesa/soporte-sap`, ya en esta rama);
   - la firma del laboratorio;
   - `npm run registra`;
   - la versión;
   - el pin del producto, que sube un humano.

   Y la verdad incómoda: si sapstack está quieto desde abril y su origen ya no existe, **no es una fuente viva**. La
   propuesta dice cuáles sí lo son: el experto en la mesa, y lo que SAP publica, solo como puntero, porque el contenido
   de las Notes es de SAP.
6. **El plan por fases** con su gate cada una. Las **decisiones del laboratorio** numeradas (D-SS-1…), cada una con su
   recomendación. Lo que pide CDC (C1), AISIA o revisión (C4) o el registro de riesgo (C5). El costo. Y **«Lo que
   podría estar mal»**, con lo que ya se resolvió y lo que no.
7. **La vista, actualizada con este requerimiento**: la mesa deja de ser solo «el experto prueba casos» y muestra
   también cómo crece la base. Dos piezas:
   - **El mapa (overview), para el laboratorio.** Una pantalla tan clara como el Overview de un Worker en Cloudflare:
     - un mapa de nodos con flechas, de izquierda a derecha:
       - **las fuentes** a la izquierda, cada una una tarjeta que se despliega con su conteo: sapstack fijado por SHA
         (con aviso si hay un commit nuevo), el experto en la mesa y los punteros a SAP Notes;
       - **la base `sap-soporte`** en el centro: versión fijada, reglas firmadas y estado, con su punto de color;
       - **lo que la usa** a la derecha: triage y categorización, el motor y sus veredictos, el léxico del anonimizador
         y los CLIs `ss-*`.
     - Debajo, **tarjetas de métricas**: candidatos pendientes, validados por el experto, firmados y rechazados, y la
       tasa «al experto» de los escenarios, cada una con su serie.
     - Una **lista de versiones** de la base, como la de Deployments: versión, fecha, quién firmó y huella.
     - Un **panel lateral** con las fuentes y sus pins: SHA, último commit del origen, licencia y última revisión.
     - Cada nodo lleva a su detalle: los candidatos, la versión o la tabla de CLIs.
   - **La validación de candidatos, para el experto.** Cada candidato se presenta como **hipótesis**, nunca como
     solución, con su fuente a la vista (archivo y línea de sapstack, SHA y licencia). El experto dice si es correcto,
     si está mal, lo corrige o dice «no sé», con un comentario, y sale una **propuesta** que el laboratorio ve en su
     vista y firma, o no. La mesa no siembra nada, igual que hoy.

   Todo número sale de datos reales: si no hay, dice «sin datos», como Cloudflare con «No data». Nunca hay una métrica
   decorativa: cada número tiene una sola versión. Visual e intuitiva como el resto de la mesa, legible en el teléfono.

## LIBERTAD TÉCNICA

Eliges cómo analizar, qué medir y con qué herramientas, cómo se ve la matriz y el diagrama (Mermaid, tabla, SVG) y
cómo se ordena la propuesta. Lo de arriba es el qué, no el índice. Si encuentras una mejor manera de alinear sapstack
con Soporte SAP, o la evidencia dice que no conviene tomar algo, la propuesta lo dice y lo argumenta.

## INVESTIGA ANTES DE ESCRIBIR

- 2 o 3 referencias de cómo se mantiene viva una base de conocimiento técnico con curaduría humana y procedencia: por
  ejemplo, KCS (Knowledge-Centered Service), cómo SAP publica las Notes y la Simplification List, y cómo se gobierna una
  precedencia de reglas global y local. Cita lo que uses.
- El lado propio, antes de proponer:
  - `tools/conocimiento/README.md` y su `CAMBIOS.md`;
  - `tools/soporte-sap/src/conocimiento-produccion.ts` (H-20);
  - `.claude/specs/004-grafo-de-conocimiento/`;
  - `docs/goals/soporte-sap.md`;
  - la mesa del experto, ya en esta rama: `docs/MESA-DEL-EXPERTO.md`, `docs/goals/soporte-sap-experto.md` (sus
    decisiones y «lo que podría estar mal»), `src/features/soporte-sap/mesa/` y `scripts/laboratorio-alojado/`;
  - para el mapa: el Overview de un Worker en Cloudflare (la captura del laboratorio del 22/10: `/tmp/claude-1000/-home-gsore-code-template/6f6be038-77e6-4b53-9f05-997378bd0d3b/images/26.png`, si sigue ahí; no se sube al repo, porque lleva el usuario de la cuenta), y 1 o 2 referencias
    más de mapas de dependencias legibles.
- Reafirma el objetivo en una línea antes de cada edición grande.

## HECHOS YA MEDIDOS (2026-10-22, vuélvelos a comprobar)

- sapstack se clonó en `/tmp/claude-1000/-home-gsore-code-template/6f6be038-77e6-4b53-9f05-997378bd0d3b/scratchpad/sapstack-src/repo`.
  Si ya no está, se clona de nuevo en una carpeta propia y vacía, `--depth 1`, y se fija por SHA.
- **Commit**: `5be80773025a3ace996f02a5b0a8557779eaa334`, v1.4.0. Los commits v1.1 a v1.4 son todos del 2026-04-11, en
  unas tres horas.
- **Licencia y origen**: MIT, 146 archivos. Los badges y el CI apuntan a `BoxLogoDev/sapstack`, que hoy da 404. Lo que
  hay es una copia, no un fork marcado.
- **Datos**:
  - `data/tcodes.yaml` tiene 280 claves de primer nivel; el README dice 279.
  - `data/sap-notes.yaml` tiene 46 notas; el README dice «50+».
  - Las dos dicen ser solo punteros «confirmados».
- **`scripts/build-multi-ai.sh`** solo sincroniza bloques de lista de plugins y versión entre marcadores. **No lee**
  `data/tcodes.yaml` **ni traduce reglas**, aunque la transcripción dice que sí.
- **`scripts/resolve-note.sh`** busca por palabra clave en `data/sap-notes.yaml`. No hay ninguna carpeta de excepciones
  locales: la localización vive en la sección `korea:` de `.sapstack/config.schema.yaml`.
- **`.github/workflows/sapstack-ci-reusable.yml`**: `uses: BoxLogoDev/...@v1.4.0`, con `sapstack-ref` en `main` por
  defecto.
- **Lado propio**:
  - `tools/conocimiento` tiene 17 dominios `mx-*`/`co-*` y 4 `generales/`. Ninguno es SAP.
  - `sap-soporte` es el dominio previsto (`DOMINIO_SOPORTE_SAP`).
  - Los T-codes de `lexico.ts` no aparecen con el patrón simple: mídelo bien.
- **El grafo**: los tipos están en `tools/grafo-conocimiento/src/contrato.ts`, la validación en `valida.ts`
  (`validaConocimiento`), el gate de siembra en `gate-entrada.ts` y la selección en `selecciona.ts`. Se usan como
  librería, en solo lectura.
- **La imprenta**:
  - `.claude/imprenta/manifiesto.json` declara servicio → CLI y no imprime. Imprimir pasa en un proyecto derivado,
    con Go: aquí no hay librería de binarios, ni debe haberla. Imprimir o adoptar un CLI es CDC (C1).
  - La librería pública (`mvanhorn/printing-press-library`, `cli-skills/`) tiene 595 CLIs. Lo único SAP es `pp-concur`
    (viajes y gastos, no ERP). No hay nada de S/4, ABAP ni OData de SAP.
  - Soporte SAP tiene 7 CLIs `ss-*`, todos «no medido».
  - **Imprimir contra un SAP real choca con D6**: sigue abierto quién ejecuta en el SAP de un cliente.
- Los comandos de sapstack son prompts en Markdown (`commands/*.md`), no programas: un «CLI» que salga de ellos hay que
  diseñarlo, no se traduce tal cual.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. La propuesta existe en `docs/goals/soporte-sap-sapstack-propuesta.md`, de 500 líneas como máximo; si hace falta, se
   parte en anexos. Su índice va pegado.
2. **La tabla de las afirmaciones de la transcripción**, completa y pegada: afirmación → cierta, falsa o a medias →
   `archivo:línea`.
3. **La medida del cruce**, corrida con un guion de solo lectura (en `docs/goals/soporte-sap-sapstack-evidencia/` o en
   el scratchpad), con su comando y su salida pegados:
   - el solapamiento de T-codes;
   - los términos de sapstack que el anonimizador de hoy confunde con nombres;
   - el conteo por módulo de lo que entraría como candidato y de lo que no.
   Si se corre dos veces, da lo mismo.
4. **La matriz de herencia y el diagrama de fuente única**, pegados como texto (Mermaid o tabla).
4b. **El grafo, corrido**: la salida de `validaConocimiento` sobre los candidatos y la del motor sobre los 5
   escenarios (veredicto o «al experto», y por qué), pegadas.
4c. **La tabla de CLIs**: cada comando y agente de sapstack, el peldaño de la escalera donde se resuelve y su
   clasificación (`readOnly`, dry-run, destructivo, grado), pegada.
5. **Los fragmentos de CI**, pegados: GitHub Actions, GitLab CI y Jenkins, con refs por SHA. Son ejemplos de la
   propuesta, no se conectan a nada.
6. **Las decisiones del laboratorio**, pegadas, cada una con su recomendación.
7. **La vista, con Playwright** contra el laboratorio local (la misma imagen con `docker run`, si cambia la imagen).
   Capturas pegadas de:
   - el mapa con sus conteos reales;
   - el detalle de un nodo al hacer clic;
   - el experto validando un candidato, antes y después;
   - el laboratorio viendo esa validación como propuesta;
   - el experto recibiendo 404 en el mapa.

   Además: el recorrido de la mesa sigue en verde con los pasos nuevos, y no hay errores de consola propios.
8. **Una fila nueva en la matriz por cada afirmación nueva de seguridad**, verde sin su sabotaje y roja con él
   (`--fila <id>`). Por ejemplo:
   - una validación del experto no entra al grafo sin firma;
   - el experto no ve el mapa;
   - los candidatos salen solo del SHA fijado.

   Y la matriz entera en verde, con su conteo.
9. **«Lo que podría estar mal»**, pegado y resuelto donde se pueda.
10. **La validación en verde**, pegada (abajo), y `git status` limpio tras el commit en `soporte/sapstack`, sin push.

## COMANDO DE VALIDACIÓN

```
npm run verify:gobernanza
npx tsc --noEmit -p . && npm --prefix tools/soporte-sap run -s build && npm --prefix tools/soporte-sap run -s prueba
```

Además, el guion de evidencia que declares en el primer checkpoint (por ejemplo
`node docs/goals/soporte-sap-sapstack-evidencia/mide.mjs`). Córrelos tras cada cambio grande y pega su salida:

- tras cada cambio de UI, el recorrido de la mesa contra el laboratorio local;
- tras cada fila nueva, la matriz (`node tools/soporte-sap/evidencia/firmas.ts`).

Antes de empezar, `npm ci` real en el worktree (no `node_modules` enlazado). Al final, `npm run validate` **en primer
plano**: en segundo plano, Claude Code lo mató una vez por memoria.

## RESTRICCIONES REALES

- **sapstack es de un tercero: solo se consume.** Se lee fijado por SHA, en su carpeta, como dato no confiable:
  - **nunca** se corren sus guiones;
  - **nunca** se instalan sus plugins, skills, agentes ni su MCP. Traer skills de fuera es un CDC (C1);
  - no se le abren PR ni issues;
  - nada sale de esta máquina hacia ese repo.
- **Este goal propone y construye la vista; no siembra**:
  - nada entra a `tools/conocimiento`; no se corre `npm run registra`;
  - se cambia **la mesa**: `src/features/soporte-sap/mesa/`, `src/app/mesa/soporte-sap/`, su API y, si hace falta, lo
    que la imagen empaqueta. No se cambian el motor, el grafo ni el léxico del anonimizador: lo que propongas para el
    léxico se mide y se propone, porque decide qué se tapa;
  - no se tocan `.claude/gobernanza/`, `.claude/gates.json`, los skills ni `AGENTS.md`;
  - los borradores van en `docs/goals/`; la matriz sintética no se siembra (H-20).
- **Las guardas de la mesa no se tocan** y ninguna fila de la matriz se cae:
  - el 404 sin `SOPORTE_SAP_LABORATORIO`;
  - `configura:deploy`;
  - el build de la vitrina;
  - el candado de `.env*` en `despliega.sh`;
  - la verificación del JWT en la puerta y en el contenedor;
  - lo del laboratorio, solo para su identidad.

  Mejor dentro de las rutas que ya pasan por la puerta (por ejemplo, una pestaña de `/mesa/soporte-sap/laboratorio`).
  Una ruta nueva en `RUTAS_DE_LA_MESA` va con su fila y su sabotaje.
- **AISIA**: si la validación de candidatos de un tercero cambia lo que declara la revisión 11, va un borrador de
  revisión 12 en `docs/goals/` y el laboratorio lo firma **antes de desplegar**. **Desplegar es del laboratorio**
  (`despliega.sh`, con `!`): el goal termina con la vista probada en local, no en Cloudflare.
- **Ningún CLI se imprime ni se instala**, ni de la librería pública: aquí se proponen, y adoptar uno es CDC. El motor y
  la validación del grafo se usan como librería, sobre candidatos que nunca se registran.
- **Lo que cambia un veredicto lo firma el laboratorio.** Sin una fuente citable, un candidato de sapstack es una
  hipótesis para el experto, no una regla. Del contenido de las SAP Notes, solo el número y el enlace.
- **Sin modelo y sin datos reales**: no se manda el contenido a ningún LLM ni API. No se generan entradas de estrés para
  el lector de PDF (H-22).
- **Todo va fijado**: refs, imágenes y versiones por SHA o versión exacta, nunca `main` ni `latest`. Si algo se copia
  más adelante, se conserva la atribución MIT.
- Archivos de 500 líneas como máximo, funciones de 50 como máximo. Todo en español, se dice «el laboratorio», y nunca
  se imprime un secreto.
- **Gates humanos**: el push, el PR, la firma de la propuesta y cada decisión D-SS. El laboratorio los corre con `!`.

## RED DE SEGURIDAD

Si tras 60 turnos no converge, o una decisión del laboratorio bloquea la propuesta (por ejemplo, si la matriz de
herencia choca con la regla «en conflicto, sin veredicto»), detente: deja la propuesta con lo que hay, la decisión
abierta escrita y su recomendación, y repórtalo.

## Lo que se hizo (2026-10-22)

- **La propuesta**: `docs/goals/soporte-sap-sapstack-propuesta.md` (+ anexos). Evidencia: `docs/goals/soporte-sap-sapstack-evidencia/mide.mjs`.
- **La mesa**: `?pestana=candidatos` (validar conocimiento) y el mapa en `/mesa/soporte-sap/laboratorio`; el catálogo y
  la foto de la base, generados por `src/features/soporte-sap/mesa/fuentes/extrae.mjs`, con `_ALTO` y huella.
- **Ocho filas nuevas** en la matriz (siete probadas y una que depende de D-SS-2) y el borrador de la **revisión 12** de la AISIA
  (`docs/goals/soporte-sap-AISIA-revision-sapstack.md`), que el laboratorio firma antes de desplegar.
- **Encontrado al construir**:
  - el filtro de la mesa mira toda la acción, id incluido: un id con cifras (`nota-2269324`) tenía forma de documento.
    Los ids de candidato van sin cifras;
  - lo mismo le pasaba a los casos: `c-mvjjiz61-023329` dejaba el caso sin poder calificarse (68 de 3000 ids) y la suite
    fallaba al azar. Arreglado con prueba roja → verde;
  - con el filtro «por validar», la tarjeta validada desaparecía y el experto no veía su confirmación: se queda;
  - Next en dev bloquea sus recursos a `127.0.0.1`: el recorrido contra dev va por `localhost`;
  - el runtime del laboratorio vive en memoria: un segundo recorrido contra el mismo proceso encuentra el escenario de
    MIGO ya arreglado. Cada recorrido, contra un proceso nuevo.
