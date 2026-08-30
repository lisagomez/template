# Tareas 004 — Grafo de conocimiento

> **Todas ABIERTAS.** Esta spec no está construida y su alcance declarado es el blueprint,
> no la implementación. Estas tareas **no están autorizadas**: se convierten en PRP
> (`/prp` + `/bucle-agentico`) el día que un proyecto derivado necesite la capacidad.
>
> Orden por dependencia. Cada una con su "Hecho cuando:" verificable.

## Fase 1 — Contrato antes que código

- [ ] **TAR-1 · Leer el material de origen, no reinventarlo.**
      Hecho cuando: están leídas la Fase 8 de `hermes-os-a2a` (incluidos los dos incidentes
      reales) y `businessos/grafo/README.md`, y confirmados **contra la fuente** los dos
      incidentes que motivan exclusiones y conflicto. RF: INVESTIGA 1 y 4.

- [ ] **TAR-2 · Definir el contrato categoría/regla/veredicto en Zod.**
      Hecho cuando: el esquema existe, no usa `any`, y el vocabulario de veredicto está
      **acotado por dimensión** (no texto libre). RF: MISION-1, RESTRICCIONES.

- [ ] **TAR-3 · Decidir dónde viven las reglas.**
      Hecho cuando: la decisión está tomada **con su alternativa descartada escrita**. Si es
      Supabase: RLS habilitado y `service_role` fuera de la superficie de consulta (C7).

## Fase 2 — Motor determinista (sin LLM todavía)

- [ ] **TAR-4 · Motor de evaluación.**
      Hecho cuando: dado un triple estructurado devuelve veredicto, sin modelo de por medio.

- [ ] **TAR-5 · Exclusiones por categoría.**
      Hecho cuando: una oración diseñada para colisionar dos categorías cae en la correcta.
      Evidencia: **antes/después** — sin la exclusión colisiona, con ella no. RF: DoF-5.

- [ ] **TAR-6 · Regla de conflicto.**
      Hecho cuando: dos reglas de la misma categoría con veredictos distintos degradan a
      fail-safe **con bandera**, y nunca eligen una. RF: DoF-6.

- [ ] **TAR-7 · Fail-safe.**
      Hecho cuando: sin regla aplicable la respuesta dice explícitamente que no hay
      información suficiente, con forma **distinguible** de una respuesta real. RF: DoF-4.

## Fase 3 — Capa de lenguaje natural

- [ ] **TAR-8 · Parser oración → campos.**
      Hecho cuando: usa `structured-outputs` (Vercel AI SDK + Zod) y **no toca el veredicto**.
      RF: MISION-2, LIBERTAD TECNICA.

- [ ] **TAR-9 · Redactor de respuesta.**
      Hecho cuando: devuelve una oración natural **sin exponer** de qué regla salió.
      RF: MISION-3.

- [ ] **TAR-10 · Resolver el modo de fallo del parser.**
      Hecho cuando: está decidido y probado qué pasa si el LLM del parser se cae — y que
      **falla distinto** que "no hay regla". O queda declarado como límite conocido.
      RF: DoF-8. **Es la pregunta abierta de la spec.**

## Fase 4 — Cerrar

- [ ] **TAR-11 · Dos dominios de ejemplo poblados.**
      Hecho cuando: hay uno regulatorio y uno genérico de otro dominio, demostrando que el
      modelo no está atado a lo legal. RF: DoF-2.

- [ ] **TAR-12 · Prueba end-to-end con oración real.**
      Hecho cuando: pregunta en lenguaje natural → parser → motor → respuesta natural, sin
      payload armado a mano. RF: DoF-3.

- [ ] **TAR-13 · Test que fija el conteo de reglas.**
      Hecho cuando: agregar una regla **obliga** a tocar el test en el mismo cambio.
      RF: MISION-6, DoF-7.

- [ ] **TAR-14 · Gate automático de colisiones.**
      Hecho cuando: detecta colisión/conflicto **antes de sembrar**, sin depender de que
      alguien revise cada regla nueva contra todas. Entra en `validate`. RF: RESTRICCIONES.

- [ ] **TAR-15 · Autocrítica y cierre.**
      Hecho cuando: está escrito qué parte puede fallar en producción y cómo quedó resuelto
      o declarado. RF: DoF-8.
