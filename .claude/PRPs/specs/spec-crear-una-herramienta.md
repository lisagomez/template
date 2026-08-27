# Crear una herramienta con el boilerplate — Spec

> Documento objetivo: **`docs/CREAR-UNA-HERRAMIENTA.md`**.
> Forma diagnosticada (Fase 1.5 del goal-compiler): **LOOP**, no grafo. 0/4 síes —
> un solo contexto, sin fan-out, sin ruteo de diagrama, mismo criterio de éxito de
> punta a punta. Colapsa al loop de un agente sin perder nada.

---

## MISION

Este template sirve para dos cosas: **apps** que se despliegan y **herramientas** que se
instalan. La segunda mitad no tiene puerta de entrada. Existe el runbook técnico
(`docs/EMPAQUETAR-HERRAMIENTA.md`) y existe el andamio (`tools/ejemplo-herramienta/`),
pero **no existe el documento que convierte a alguien con una idea en dueño de un paquete
instalado y funcionando en otro proyecto suyo.**

Construye ese documento: **la puerta de entrada Agent-First a la vertiente "herramienta"
del template.** No un tutorial de npm — de esos hay miles y ninguno sabe nada de esta
fábrica. El documento de referencia mundial para *esta* pregunta: **"tengo una idea de
herramienta reusable, ¿qué digo, qué apruebo, y dónde está el riesgo que no veo?"**

La realidad que debe existir cuando termines: alguien que nunca ha publicado un paquete
en su vida abre este documento, **habla** con el agente, y termina con una herramienta
suya instalada y corriendo en otro proyecto — habiendo entendido las tres decisiones que
eran suyas y de nadie más, y sin haber tecleado un solo comando.

### Lo que el documento tiene que resolver, y hoy nadie resuelve

1. **El registro es Agent-First y eso no es cosmético.** `AGENTS.md` es explícito: *"NUNCA
   le digas al usuario que ejecute un comando. NUNCA le pidas que edite un archivo."* El
   documento se escribe para quien **habla**, no para quien teclea. Los comandos pueden
   aparecer como *lo que el agente hará y cuya salida verás*, jamás como la vía principal
   del lector. Un documento que empieza con `cp -r tools/ejemplo-herramienta ...` ya
   falló, por muy correcto que sea el comando.

2. **La frontera decisión-humana / decisión-del-agente, dibujada explícitamente.** El
   agente decide arquitectura, qué va en el núcleo y qué en un entry point aparte, cómo se
   parte el código, qué tipos exporta. El humano decide, y nadie más puede decidir por él:
   - **si esto debe ser una herramienta** (ver punto 3),
   - **si se publica** — irreversible en la práctica: un `unpublish` no borra lo que ya se
     descargó. Gate humano, nunca un paso de script,
   - **quién la consume y con qué versión pineada** — porque solo el humano sabe qué otros
     proyectos suyos van a instalarla.

3. **El "no la hagas" tiene que estar, y estar arriba.** YAGNI aplicado: una herramienta
   que se usa en un solo proyecto es una carpeta con pasos extra. El disparador honesto es
   la repetición real — la misma clase de problema resuelta **3+ veces** — no la
   corazonada de que "esto seguro lo reuso". El documento tiene que ser capaz de decirle
   al lector *no lo empaquetes todavía*, y explicar por qué eso le ahorra trabajo.

4. **Nombrar dónde está el riesgo real, que no es donde el lector cree.** El código puede
   estar perfecto y el paquete reventar en el proyecto de destino: **lo que falla es el
   contrato del paquete**, y ese es el peor sitio para enterarse. Los tres que muerden:
   - el núcleo que importa React (y entonces no es una herramienta: es un trozo de una app
     concreta con otro nombre);
   - dos Reacts en el mismo árbol — el bug de hooks que se lleva una tarde entera;
   - `npm link`, que **miente**: resuelve por symlink y hace funcionar cosas que en una
     instalación real fallan. El tarball es exactamente lo que instalará el consumidor.

5. **El pineo es gobernanza, no manía.** `latest` y los rangos `^` son anti-patrón también
   para los paquetes propios (control C1): un `npm publish` de un martes se convierte en un
   cambio de comportamiento en tres proyectos a la vez, sin diff y sin aprobación. El
   documento lo dice en el idioma del lector, no en el del auditor.

6. **DRY con el runbook que ya existe.** `docs/EMPAQUETAR-HERRAMIENTA.md` se queda como
   está y sigue siendo la fuente única del contrato técnico (`exports`, `files`,
   `peerDependencies`, semver, compatibilidad). El documento nuevo **delega y enlaza; no
   reescribe.** Si al terminar hay solape real, se recorta de UNO de los dos y se dice
   explícitamente cuál y por qué.

7. **Cerrar el cableado, o el documento no existe.** Un documento al que nada apunta es un
   archivo, no una puerta. Queda enrutado desde `AGENTS.md` (rama del decision tree
   "quiero hacer una herramienta"), y el verificador (`scripts/verifica-gobernanza.mjs`)
   gana la comprobación que falla si el documento desaparece o si la rama del decision tree
   deja de apuntarlo. **Esa es la diferencia entre una regla que dispara y una que no** —
   la lección del 2026-08-23 ya pagada por esta capa.

---

## LIBERTAD TECNICA

Tú eliges la estructura del documento, su longitud, su orden, sus ejemplos, si lleva
tablas o diagramas, cómo nombras las secciones y qué herramienta de prueba construyes para
demostrarlo. Cualquier estructura sugerida aquí es **descartable**, salvo la sección
RESTRICCIONES REALES.

Optimiza por que el lector **termine con la herramienta funcionando y entendiendo lo que
aprobó**, no por cubrir todos los casos ni por parecerse a la documentación de npm.

---

## INVESTIGA ANTES DE CONSTRUIR

1. **Lee la fábrica primero, no la escribas de memoria**: `AGENTS.md` (filosofía
   Agent-First, decision tree, Reglas de Código, aprendizajes), `docs/EMPAQUETAR-HERRAMIENTA.md`
   entero, `tools/ejemplo-herramienta/` (su `package.json` **es** el contrato correcto:
   es el que pasa el empaquetador en verde), y `scripts/empaqueta-herramienta.mjs` — lee
   qué comprueba de verdad, no supongas.
2. **Estudia 2-3 puertas de entrada world-class** de proyectos que enseñen a producir algo
   reusable, y quédate con el mecanismo que las hace funcionar, no con su plantilla.
3. **Reafirma el objetivo en una línea antes de cada edición grande** para no driftar hacia
   un tutorial de npm.

---

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador **solo ve esta conversación**: no corre comandos ni abre archivos. Todo lo de
abajo tiene que estar *pegado en el transcript*.

1. **`docs/CREAR-UNA-HERRAMIENTA.md` existe**, y pegas sus secciones vertebrales: la
   frontera de decisiones (humano vs agente), el "cuándo NO hacer una herramienta", y los
   tres riesgos de contrato.
2. **La prueba de fuego — el documento se ejecutó, no se escribió.** Construyes una
   herramienta real desde cero **siguiendo únicamente lo que dice el documento**, y pegas:
   - la salida de `npm run empaqueta <nombre>` en verde, **incluido el paso de integración
     real** (proyecto temporal limpio → `npm install <tarball>` → importar y ejecutar);
   - la línea exacta del `package.json` que declara `exports` con `types` y el
     `peerDependenciesMeta` opcional, si la herramienta tiene entry point de React.
3. **Cero promesas sin ejecutar.** Enumeras **todos** los comandos y rutas que el documento
   nombra y, junto a cada uno, la evidencia de haberlo corrido en esta sesión. La regla es
   del propio repo (aprendizaje 2026-08-25): *documentado y nunca ejecutado es una
   afirmación, no una capacidad*. Un solo comando prometido sin salida pegada = no hecho.
4. **Cableado cerrado**: pegas el diff de la rama de `AGENTS.md` que apunta al documento y
   la comprobación nueva del verificador, con el output de `npm run verify:gobernanza` en
   verde y el conteo de comprobaciones subido respecto al de partida (127).
5. **Control negativo del verificador**: rompes a propósito el cableado (renombra el
   documento o quita el puntero), pegas el verificador **en rojo**, restauras, y lo pegas
   verde otra vez. Un verificador que nunca se vio fallar no verifica nada.
6. **`npm run regresion` en verde**, pegado.
7. **Entrada de CDC redactada** en `.claude/gobernanza/BITACORA-CDC.md` con cambio, motivo,
   gate aplicado y regresión — con la **aprobación humana marcada como pendiente**. El
   agente redacta el CDC; **no se lo auto-aprueba** (C1).
8. **Lectura en frío**: pegas el razonamiento de qué haría un agente que solo leyera el
   decision tree ante *"quiero reusar esto en otros proyectos"* — debe llegar al documento
   nuevo sin ayuda.
9. **Reporte de decisiones**: qué estructura elegiste para el documento y por qué, qué
   dejaste fuera a propósito, y qué recortaste (si algo) de `EMPAQUETAR-HERRAMIENTA.md`
   para no duplicar.
10. **Lista las formas en que esto podría estar mal o incompleto y resuélvelas** antes de
    declararlo hecho.

---

## COMANDO DE VALIDACION

```bash
npm run verify:gobernanza && npm run regresion
```

Córrelo **tras cada cambio grande** y surfea su output en la conversación. Es el heartbeat
del loop, no el examen final: el examen es la DoF. Cuando toques la herramienta de prueba,
añade `npm run empaqueta <nombre>`.

No corras `npm run validate` como heartbeat — incluye `next build` y es demasiado lento
para un latido; déjalo, si acaso, para el cierre.

---

## RESTRICCIONES REALES

- **Registro Agent-First, innegociable.** La vía principal del lector es **hablar**. Los
  comandos aparecen como lo que el agente ejecutará y cuya salida el lector verá, nunca
  como su instrucción. Si el documento le pide al lector que teclee o que edite un archivo
  como camino principal, está mal escrito aunque el contenido sea correcto.
- **`docs/EMPAQUETAR-HERRAMIENTA.md` no se reescribe.** Sigue siendo la fuente única del
  contrato técnico. Se enlaza. Si recortas algo de él por solape, dilo explícitamente.
- **En español**, con el registro de `docs/` (acentos incluidos, como el resto de esa
  carpeta).
- **Tocar `AGENTS.md` es un CDC (C1)**: diff + `npm run regresion` + entrada en
  `.claude/gobernanza/BITACORA-CDC.md`. La aprobación humana **queda pendiente**: no la
  marques como dada.
- **No publiques nada a ningún registro npm.** Publicar es irreversible y es gate humano.
  La demostración llega hasta el tarball instalado en un proyecto temporal limpio.
- **No inventes comandos, flags ni rutas.** Cada uno se verifica contra `--help` o contra
  el script real antes de escribirlo en el documento.
- **No toques `.claude/gobernanza/golden-sets`** ni el corpus de casos-trampa: viven en la
  rama `golden-sets`.
- **La herramienta de prueba**: o la borras al terminar, o explicas por qué se queda y qué
  aporta al template. No dejes basura sin declarar en `tools/`.
- **`.env`, secretos y credenciales**: nunca imprimas un valor. Presencia enmascarada y ya.

## RED DE SEGURIDAD

Si tras **12 turnos** el documento no converge —o el verificador no logra cablearse sin
romper comprobaciones existentes— detente y reporta el bloqueo con lo que llevas hecho.
