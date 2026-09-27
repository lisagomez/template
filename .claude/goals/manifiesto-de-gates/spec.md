# Manifiesto de gates — el template, dueña única del contrato que hermes copia a mano — Spec

> Compilado el 2026-09-26 por `/goal-compiler`, tras analizar
> `https://github.com/lisagomez/hermes-os-a2a` contra los cimientos de este template.
> **Forma (Fase 1.5): LOOP**, no grafo — contexto único (la capa de gates de este repo),
> sin fan-out real, y el test de colapso lo confirma: todo cabe en el bucle de un agente
> sin perder nada.

---

## EL ANÁLISIS QUE ORIGINA ESTE GOAL (y lo que NO se va a hacer)

La pregunta de partida era si convenía alinear los **departamentos** de `hermes-os-a2a`
como parte de los cimientos del template. La respuesta, medida sobre los dos repos, es
**no** — y el hallazgo apunta al revés de lo que la pregunta asumía.

En hermes un departamento es un *paquete de competencias* = (1) tareas del Ejecutor +
(2) reglas de validación del Supervisor + (3) fuentes de conocimiento. Se configura, no se
programa. Su fuente de verdad es `businessos/supervisor-a2a/reglas/<departamento>.toml`.

Tres hechos medidos el 2026-09-26:

1. **Este template ya ES el departamento de software, copiado a mano.**
   `businessos/departamentos/desarrollo-software.md` §1 mapea las tareas del Ejecutor una a
   una sobre los skills de este repo (`new-app`, `prp`, `bucle-agentico`, `add-login`,
   `add-payments`, `add-emails`, `add-mobile`, `website-3d`, `supabase`, `ai`,
   `playwright-cli`). Y `reglas/software.toml` transcribe los gates de este `AGENTS.md`:
   `npm run build`, `npm run typecheck`, `npm run lint`, `npx playwright test`, `sin_any`,
   `sin_secretos`. Son las reglas de aquí, escritas a mano en otro repo, sin gate sobre
   ninguna de las dos copias.
2. **La abstracción "departamento" sólo paga con N≥2 dominios que necesiten gates
   distintos sobre artefactos distintos.** En hermes eso es cierto (software→`npm build`;
   procesos→estructura de `diagnostico.yaml`/`build-spec.yaml`; adquisición→claims
   aprobados y rango de precio; contratos→determinismo del chaincode). Aquí hay **un**
   dominio: construir software. Un padrón de una fila es YAGNI — regla del propio
   `AGENTS.md`.
3. **El vocabulario ya es difuso en su propia casa.** "Departamento" nombra dos cosas:
   paquete de competencias del trío (4, según `trio-contrato/contrato.py::DEPARTAMENTOS`)
   y perfil de reglas del Supervisor (5 TOML, incluido `buzon`, que no es departamento del
   trío y cuyo `politicas.py` no conoce la palabra). El espejo de la UI se declara "espejo
   de `reglas/*.toml`" y va 2 atrás (3 de 5), con un comentario que excusa el retraso. De
   los 9 `.md` en `departamentos/`, sólo 4 son departamentos: `estrategia.md` dice textual
   *"no tiene Ejecutor/Supervisor, no es un departamento del trío"*, `white-label.md` es un
   modelo de negocio, `equipo-y-slack.md` es la capa humana.

**Fuera de alcance, explícito:** no se crea `.claude/departamentos/`, ni ningún padrón de
departamentos, ni entra la palabra "departamento" al vocabulario de los cimientos. Meter
una palabra **organizativa** en el prefijo de caché contradice una decisión ya tomada aquí
—`.claude/memory/project/infraestructura-agentes.md:27`: *"la frontera no es organizativa:
es de radio de daño"*— y sería la segunda colisión de vocabulario con hermes (la de
"Hermes" ya la marcó `docs/SDD-fase6-trio-hermes-ejecutor-supervisor.md`).

Lo que **sí** vale es una sola pieza, probada en producción ajena, que este template no
tiene: **el gate como dato declarado, con invariante fail-closed.** Y la alineación que de
verdad cierra la divergencia tiene precedente en este repo de hace cinco días: **una sola
dueña del contrato** (voz 0.5.0 y dictado, PR #140).

---

## ESTADO DE PARTIDA (medido el 2026-09-26, no estimado)

- `npm run validate` es **una cadena plana de 22 gates en una línea de 613 caracteres** de
  `package.json`, unidos por 21 `&&`. Nadie difea eso con sentido.
- La cadena falla cerrada **por accidente** (npm revienta si falta el script), no por
  declaración.
- No existe la noción de **gate declarado pero inactivo**, que es exactamente la trampa
  que `docs/SDD-fase6-trio-hermes-ejecutor-supervisor.md` §C4 marcó: *"un gate inactivo se
  lee, a simple vista, igual que uno que pasó"* (fatiga de aprobación, O3).
- Ningún gate declara **qué superficie guarda** ni **qué evidencia deja**. Está implícito
  en el nombre del script y en la cabeza de quien lo escribió.
- `reglas/software.toml` de hermes declara 8 gates copiados a mano de aquí, 2 de ellos
  (`codigo_review`, `security_review`) inactivos por falta de runner.

## MISION

Que este template **declare sus gates como dato** y se vuelva la **dueña única** del
contrato de gates que hoy `hermes-os-a2a` transcribe a mano.

Al terminar debe existir esta realidad:

1. **Un manifiesto declarado** donde cada gate de `validate` es un registro con, como
   mínimo: nombre, runner, qué ejecuta (comando o chequeo), **qué superficie guarda**,
   **qué evidencia deja**, y `activo`/`inactivo` — y todo gate inactivo lleva **motivo y
   qué le falta** para activarse. Un gate sin eso no es un gate: es una intención.
2. **Invariante fail-closed al cargar**, con las tres formas que `software.toml` ya
   probó y este repo no tiene declaradas:
   - gate **activo** cuyo runner/comando no existe = **config inválida, no arranca**;
   - runner **desconocido** (typo) = config inválida **aunque el gate esté inactivo**;
   - gate activo que **no puede correr** en runtime = **rechazo**, jamás "asumido".
3. **Un gate inactivo JAMÁS se lee como uno que pasó.** La salida los separa visualmente y
   cuenta las tres poblaciones por separado (pasaron / inactivos / rojos). Esto es
   anti-sello-de-goma: es el hallazgo C4 del SDD de Fase 6, aplicado aquí.
4. **`validate` deja de ser la línea de 613 caracteres**: lo que corre se **deriva** del
   manifiesto, de modo que añadir un gate sea editar el manifiesto y no una línea de
   `package.json`. Y **el verificador falla si el manifiesto y lo que `validate` corre
   divergen** — mismo patrón que `scripts/verifica-gobernanza.mjs` aplica a la capa de
   gobernanza: *"un documento que nada obliga a mantener se pudre en silencio"*.
5. **Proyección consumible para hermes**: el manifiesto **emite** la proyección que
   `supervisor-a2a/reglas/software.toml` necesita, para que hermes la consuma en vez de
   transcribirla. Se entrega el artefacto; **no se escribe nada en el repo de hermes**.
6. **Gobernanza cableada, no prometida**: el manifiesto **es superficie de comportamiento**
   (decide qué pasa y qué no, para todo el repo, hasta el próximo cambio). El SDD de Fase 6
   ya argumentó que `software.toml` debía caer bajo **C1**: *"ningún archivo que decide qué
   pasa y qué no debería cambiar sin que alguien lo note"*. Ese argumento aplica idéntico
   aquí. Entra al alcance de C1 (diff + `npm run regresion` + aprobación humana + entrada en
   `BITACORA-CDC.md`) y **`verify:gobernanza` lo comprueba** — si sólo queda escrito en un
   doc, no dispara, y esta capa ya se llevó esa lección.
7. **La divergencia queda medida**: un reporte que compara los gates de aquí contra los 8
   de `software.toml` y dice qué copiaba mal, qué iba atrás y qué no existía en ninguno de
   los dos lados.

## LIBERTAD TECNICA

Tú eliges el formato del manifiesto (JSON, TOML, YAML, módulo JS), cómo se deriva la
ejecución, cómo se emite la proyección y cómo se cablea al verificador de gobernanza.
Cualquier tecnología nombrada arriba es **sugerencia descartable**, salvo la sección
RESTRICCIONES REALES. Optimiza por el mejor resultado, no por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

Antes de escribir código, lee y decide a partir de esto:

- `businessos/supervisor-a2a/reglas/software.toml` y `gates.py` de hermes (el diseño que
  funciona: gate = runner + criterio binario + evidencia, y sus invariantes de carga). El
  repo está clonado en el scratchpad de la sesión; si no, `gh repo clone lisagomez/hermes-os-a2a`.
- `scripts/verifica-gobernanza.mjs` y `scripts/verifica-marca-blanca.mjs` de este repo: son
  el **idioma de los verificadores de aquí**. En particular el patrón `--prueba` ("la prueba
  de la prueba": siembra las violaciones y exige que caigan) — tu verificador lo lleva.
- `docs/SDD-fase6-trio-hermes-ejecutor-supervisor.md` §5 (C1 sobre `software.toml`, C4 sobre
  el gate inactivo) y `docs/SDD-fase7-swarm-hermes-ejecutores.md` §6: son la auditoría ya
  hecha de este mismo mecanismo, con sus huecos nombrados.
- `.claude/gobernanza/GOBERNANZA.md` §2 (C1) y §11 (verificación de la capa).

Reafirma el objetivo en una línea antes de cada edición grande para no driftar.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador sólo ve esta conversación: no corre comandos ni lee archivos. Surfea la
evidencia.

- El **manifiesto pegado** (o su listado generado), con los 22 gates y sus campos, marcando
  visiblemente cuáles están activos y cuáles inactivos con su motivo.
- El **último output de `npm run validate` en verde**, pegado, mostrando las tres
  poblaciones contadas por separado (pasaron / inactivos / rojos).
- **La prueba de la prueba, pegada**: el verificador sembrando y tumbando, una por una, al
  menos estas cinco violaciones —
  1. gate activo con runner inexistente,
  2. runner con typo en un gate **inactivo**,
  3. gate activo que no puede correr en runtime,
  4. manifiesto que divergió de lo que `validate` corre de verdad,
  5. gate inactivo **sin** motivo declarado.
  Las cinco en rojo. Un verificador que no se puede tumbar a propósito no está probado.
- **La proyección emitida, pegada**, y el **diff contra el `software.toml` real de hermes**,
  con el conteo de qué copiaba mal, qué iba atrás y qué faltaba en ambos lados.
- La **evidencia de que C1 dispara**: el output de `npm run verify:gobernanza` fallando
  cuando el manifiesto queda fuera del alcance de C1, y en verde cuando está dentro. No
  basta decir que está cableado: demuéstralo (regla "demostrar, no citar" de `AGENTS.md`).
- **Reporte de decisiones**: qué formato elegiste para el manifiesto y por qué, cómo
  derivaste la ejecución, y qué dejaste fuera a propósito.
- **Lista de las formas en que esto podría estar mal o incompleto, y resuélvelas.**

## COMANDO DE VALIDACION

```
npm run validate
```

Es el contrato completo de este repo (typecheck + lint + build + gobernanza + specs +
regresión + secretos + contexto + routing + contabilidad + pruebas + imprenta + fugas).
Córrelo tras cada cambio grande y **surfea su output**, no sólo su exit code.

## RESTRICCIONES REALES

- **Worktree**: se trabaja en `.claude/worktrees/manifiesto-de-gates`, rama
  `worktree-manifiesto-de-gates`. Nunca en `main` directo.
- **No se escribe NADA en `hermes-os-a2a`**: es otro repo, fuera del alcance de escritura
  —el mismo límite que los dos SDD declararon: *"este documento es la auditoría, no el
  CDC"*. Se emite la proyección y se entrega.
- **No se crea ningún padrón de departamentos** ni entra la palabra "departamento" a los
  cimientos (ver el análisis de arriba).
- **Ningún gate existente se retira ni se debilita.** Los 22 siguen corriendo. Si alguno
  resulta inejecutable, se declara **inactivo con motivo**, jamás se borra. Ante cualquier
  presión de "simplificar" la cadena: corre el gate y enseña qué se rompe.
- **`npm run validate` verde de punta a punta** al terminar.
- Reglas de código de `AGENTS.md`: nunca `any` (usar `unknown`), archivos ≤500 líneas,
  funciones ≤50, `kebab-case` en archivos, `camelCase` en funciones.
- **Secretos**: jamás imprimas el valor de una variable de entorno, ni depurando. Presencia
  enmascarada (`presente/ausente`, largo, prefijo de 4 como máximo).
- El manifiesto **no se toca en caliente** sin pasar por su propio C1 una vez cableado.
- **Español** en todo lo que escribas, aunque el código y los logs estén en inglés.

## RED DE SEGURIDAD

Si tras **12 turnos** el manifiesto y `validate` no convergen en verde, detente y reporta el
bloqueo con el output real del gate que no cierra. No entregues un `validate` amarillo
declarado verde.
