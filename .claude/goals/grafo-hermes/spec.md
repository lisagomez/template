# El grafo de Hermes frente al de template — Spec

> Compilado por `/goal-compiler` el 2026-09-26. Forma: **LOOP** (diagnóstico de la Fase 1.5:
> 0 síes — un solo trabajo de análisis; leer los dos repos no exige contextos separados, y
> colapsar en un agente no pierde nada).
>
> Worktree: `/home/kyara/code/template-grafo-hermes`, rama `goal-grafo-hermes` (desde `main`
> en `2324459`). **Todo el trabajo ocurre ahí**, nunca en `/home/kyara/code/template`.

## MISIÓN

Que exista, dentro de template, **la respuesta medida** a dos preguntas que hoy se contestan de
memoria:

1. **¿En qué estado está el grafo en cada lado?** En template, el grafo de conocimiento es la
   spec `.claude/specs/004-grafo-de-conocimiento/` y está declarado **NO CONSTRUIDO** (15 tareas
   abiertas; TAR-1 pide literalmente "leer el material de origen de Hermes y confirmar los dos
   incidentes contra la fuente"). En `lisagomez/hermes-os-a2a` el grafo está **en producción**:
   motor determinista, API, seed citado, dimensiones fiscal y regulatoria, puente A2A, gate.
2. **¿Cómo se integra a template, y qué forma de integración es la correcta?** Con la
   comparación en la mano, no con la intuición.

La realidad que debe existir al terminar es un **expediente de decisión** que una persona pueda
firmar sin tener que abrir Hermes:

- **Inventario medido del grafo de Hermes.** Cada pieza con su ruta, qué hace, estado real
  (tests corridos aquí, no citados de un README), número de reglas y dimensiones, dependencias
  (Postgres, FastAPI, Docker, red `hermes-net`), quién la consume y con qué contrato. Punto de
  partida, no techo: `businessos/grafo/`, `businessos/grafo-a2a/`, `businessos/grafo-gate/`,
  `businessos/enriquecimiento-a2a/gate_grafo.py`, el `cerebro/graph` de `control-interno`,
  `meeting-copilot/.../pre-discovery/grafo.ts`, los PRPs `prp-fase2-grafo.md` y
  `prp-grafo-entrevista-guiada.md`, y las memorias `fase2-grafo.md` y
  `fase8-grafo-regulatorio.md`. Descubre lo que falte en la lista.
- **Inventario del lado template.** Qué hay ya que toque al grafo: spec 004 (spec, plan,
  tareas), el extractor documental (que **emite códigos y nunca etiquetas** para que el
  significado viva en el grafo), el skill `add-a2a`, `docs/SDD-puente-a2a-extractor.md`,
  `docs/ALINEACION-GOBERNANZA-hermes-os-a2a.md`, el ERP importado de Hermes en PRP-004 (¿arrastra
  alguna dependencia con el grafo?) e `inventario/activos.json` (¿registra el grafo como
  activo?).
- **Matriz de contraste RF por RF.** Cada requisito de la spec 004 (RF-1 a RF-12, los RNF y los
  criterios de finalización) contra lo que Hermes tiene: **cumple / parcial / ausente /
  contradice**, con la evidencia en `archivo:línea` de Hermes. Incluye las desviaciones
  deliberadas que la spec ya declara (sin citación hacia el usuario final; stack Golden Path en
  vez de Python) y dice si siguen siendo correctas vistas desde el código real.
- **Los dos incidentes confirmados contra la fuente** (la colisión de "drones" y el veredicto
  improvisado con el motor caído): commit, archivo o memoria de Hermes donde consta cada uno.
  Si alguno **no consta**, se dice, y no se reconstruye de memoria.
- **Las dos dudas abiertas de la spec 004, contestadas con evidencia o reafirmadas como
  abiertas**: (a) qué pasa cuando el parser cae, y (b) vigencia a fecha del hecho frente a
  vigente hoy. Pista: la memoria de la Fase 2 de Hermes dice "vigencia a fecha de operación".
  Hay que verificar si eso resuelve la duda (b) o solo la mitad.
- **Opciones de integración comparadas.** Como mínimo:
  - **A. Importar con historial** al monorepo, como se hizo con el ERP en PRP-004.
  - **B. Portar al Golden Path** (Next.js + Supabase + Zod), como pide el RNF de la spec 004.
  - **C. Consumir como agente A2A** (`grafo-a2a`) sin traer el código.
  - **D. Híbrido**, o la opción que descubras.

  Para cada una: qué se trae, qué se reescribe, qué se pierde, qué costaría, dónde duele. Y qué
  exige de gobernanza: C1 si toca skills o superficie de herramientas; C3 si abre una
  superficie de entrada; C4, porque **esta es la spec donde el daño a terceros es el riesgo
  principal**; C7 si hay Supabase. También si choca con que template es **privado** y Hermes
  **público**. Termina con **una recomendación argumentada**, no con un empate.
- **Borrador de PRP** para la opción recomendada (en `.claude/PRPs/`, numerado después del
  último existente, con la plantilla `prp-base.md`). Va marcado **PROPUESTO — NO APROBADO**, con
  fases, gates humanos y la regresión que exigiría.
- **La spec 004 al día**: TAR-1 cerrada con su evidencia si de verdad se cerró; el plan y las
  dudas actualizados con lo aprendido. **Solo se añade o se corrige con evidencia**, nunca se
  suaviza un requisito para que "encaje" con Hermes.

Todo eso vive en `docs/SDD-grafo-hermes-a-template.md` (el expediente) más los cambios en la
spec 004 y el PRP propuesto.

## LIBERTAD TÉCNICA

Cómo lees Hermes (clon en el scratchpad, `gh api`, lo que convenga), cómo corres sus tests, cómo
estructuras la matriz y qué opciones de integración propones las decides tú. Las opciones A-D
son punto de partida, no un menú cerrado. Optimiza por la decisión mejor fundada, no por el
documento más largo.

## INVESTIGA ANTES DE CONCLUIR

- Corre la suite del grafo de Hermes **aquí** (`businessos/grafo/tests`, `grafo-a2a/tests`,
  `grafo-gate/tests`). Un "54/54 verdes" de una memoria de julio no es evidencia de hoy. Si no
  corre (dependencias, Postgres), dilo y di por qué. Cuenta las reglas del seed actual en vez de
  citarlas.
- Mira el historial de git de Hermes en las rutas del grafo: qué cambió después de las memorias,
  y si hay deriva entre memoria y código.
- Lee cómo se integró el ERP en PRP-004 (importado con historial, fases, gate de privacidad):
  es el precedente directo de la opción A, con sus lecciones.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. `git worktree list` y `git status` del worktree pegados: el trabajo vive en
   `goal-grafo-hermes`.
2. Salida real de los tests del grafo de Hermes corridos aquí (o el error exacto y su causa), y
   el conteo de reglas por dimensión medido sobre el seed.
3. La matriz RF por RF pegada completa, con `archivo:línea` de Hermes en cada fila que no sea
   "ausente".
4. Los dos incidentes con su referencia en la fuente (o "no consta", dicho).
5. La tabla de opciones con la recomendación y su porqué en tres líneas.
6. El PRP propuesto: ruta y encabezado pegados, con el estado NO APROBADO visible.
7. El diff de la spec 004 pegado.
8. El último output del comando de validación, en verde.
9. Una lista de las formas en que el análisis podría estar mal, cada una resuelta o declarada:
   - memoria de Hermes desactualizada frente al código;
   - tests que pasan con mocks y no con Postgres;
   - reglas contadas en el JSON y no en el SQL generado;
   - opción C que parece barata pero mete a un tercero en el camino de una respuesta sobre
     terceros;
   - sesgo hacia importar porque ya se hizo con el ERP.
10. Commit en la rama y PR abierto hacia `main`, **sin mezclar**.

## COMANDO DE VALIDACIÓN

`npm run verifica:specs && npm run verify:gobernanza`, desde el worktree, tras cada cambio en
`.claude/specs/` o `.claude/PRPs/`, con el output pegado. Antes de cerrar: `npm run validate`
completo. Si falla por algo ajeno a este cambio, se demuestra con el mismo comando en `main`.

## RESTRICCIONES REALES

- **Hermes es de solo lectura.** Nada de push, PR, issue ni comentario allí. Se clona al
  scratchpad, no dentro del repo.
- **No se copia nada de template hacia Hermes** ni se cita contenido privado de template en
  ningún sitio público: template es privado y Hermes es público.
- **No se construye el grafo.** Ni motor, ni tablas, ni migraciones, ni Supabase, ni imagen
  Docker. La spec 004 y su plan lo prohíben hasta que haya un PRP aprobado. El PRP de salida es
  una **propuesta**.
- **No se importa código de Hermes** a template en esta tarea, aunque la recomendación sea
  importar: importar es la fase 1 del PRP, y va con gate humano.
- Sin tocar skills, prompts, `settings.json`, `AGENTS.md`, `.mcp.json` ni `routing-modelos.json`
  (C1). Si el análisis concluye que alguno debería cambiar, va como propuesta dentro del PRP.
- Ningún secreto: si el clon de Hermes trae `.env` o credenciales, no se leen ni se imprimen.
- Todo en español, y los nombres nuevos también.

## RED DE SEGURIDAD

Si tras 40 turnos no converges, o si los tests de Hermes exigen infraestructura que no hay aquí
(Postgres vivo, la red de Docker), no la levantes a la fuerza: documenta qué se pudo medir y qué
no, y detente con el bloqueo reportado.
