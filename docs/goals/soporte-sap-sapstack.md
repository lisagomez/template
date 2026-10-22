# Soporte SAP × sapstack: propuesta para mantener viva la base de conocimiento SAP

Goal compilado el 2026-10-22 (skill goal-compiler). Worktree `.claude/worktrees/soporte-sapstack`, rama
`soporte/sapstack`, desde `main` (417bc57). **Forma: loop.** Lo hace un agente de punta a punta; repartir por módulo
de sapstack es paralelismo opcional, no un grafo. La propuesta sí describe un flujo de actualización (un grafo de
artefactos), pero como contenido, no como forma de este goal.

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
   - la validación del experto en la mesa (`/mesa/soporte-sap`, rama `soporte/vista-experto`);
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
  - la mesa del experto, en el worktree `soporte-experto`: `docs/MESA-DEL-EXPERTO.md`.
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
5. **Los fragmentos de CI**, pegados: GitHub Actions, GitLab CI y Jenkins, con refs por SHA. Son ejemplos de la
   propuesta, no se conectan a nada.
6. **Las decisiones del laboratorio**, pegadas, cada una con su recomendación.
7. **«Lo que podría estar mal»**, pegado y resuelto donde se pueda.
8. **La validación en verde**, pegada (abajo), y `git status` limpio tras el commit en `soporte/sapstack`, sin push.

## COMANDO DE VALIDACIÓN

`npm run verify:gobernanza`, más el guion de evidencia que declares en el primer checkpoint (por ejemplo
`node docs/goals/soporte-sap-sapstack-evidencia/mide.mjs`). Córrelos tras cada cambio grande y pega su salida. Antes
del commit final, `npm ci` real en el worktree (no `node_modules` enlazado) si vas a correr algo más que la gobernanza.

## RESTRICCIONES REALES

- **sapstack es de un tercero: solo se consume.** Se lee fijado por SHA, en su carpeta, como dato no confiable:
  - **nunca** se corren sus guiones;
  - **nunca** se instalan sus plugins, skills, agentes ni su MCP. Traer skills de fuera es un CDC (C1);
  - no se le abren PR ni issues;
  - nada sale de esta máquina hacia ese repo.
- **Este goal propone, no construye ni siembra**:
  - nada entra a `tools/conocimiento`; no se corre `npm run registra`;
  - no se toca el código de `tools/soporte-sap` ni de la mesa;
  - no se tocan `.claude/gobernanza/`, `.claude/gates.json`, los skills ni `AGENTS.md`;
  - los borradores van en `docs/goals/`; la matriz sintética no se siembra (H-20).
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

Si tras 30 turnos no converge, o una decisión del laboratorio bloquea la propuesta (por ejemplo, si la matriz de
herencia choca con la regla «en conflicto, sin veredicto»), detente: deja la propuesta con lo que hay, la decisión
abierta escrita y su recomendación, y repórtalo.
