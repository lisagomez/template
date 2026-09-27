# Tareas 004 — Grafo de conocimiento

> **Abiertas salvo TAR-1, TAR-2 y TAR-3** (TAR-1 y TAR-3 el 2026-09-26, lectura y decisión; TAR-2 el
> 2026-09-27, el contrato de la Fase 1 de PRP-005). Esta spec no
> está construida y su alcance declarado es el blueprint, no la implementación. Las demás
> tareas **no están autorizadas**. El PRP que las convertiría en trabajo existe como
> **propuesta**, `.claude/PRPs/PRP-005-grafo-de-conocimiento-al-golden-path.md` (NO APROBADO),
> y lo que se midió en el origen está en `docs/SDD-grafo-hermes-a-template.md`.
>
> Orden por dependencia. Cada una con su "Hecho cuando:" verificable.

## Fase 1 — Contrato antes que código

- [x] **TAR-1 · Leer el material de origen, no reinventarlo.**
      Hecho cuando: están leídas la Fase 8 de `hermes-os-a2a` (incluidos los dos incidentes
      reales) y `businessos/grafo/README.md`, y confirmados **contra la fuente** los dos
      incidentes que motivan exclusiones y conflicto. RF: INVESTIGA 1 y 4.
      **Cerrada 2026-09-26** sobre `hermes-os-a2a@97d9f9e`:
      - leídas la memoria de la Fase 8, el README, el motor, el gate y el esquema;
      - corridas aquí sus 159 pruebas: 132 del grafo, 17 del puente A2A y 10 de la puerta pública.
      - **Exclusiones**: incidente real, commit `86ee4dc`, medido antes/después.
      - **Motor caído**: incidente real, `businessos/negocio/AGENTS.md:143-150`.
      - **Conflicto**: **no consta como incidente**. Es diseño heredado (`c321bee`) más un
        *gotcha* de desarrollo, y la spec quedó corregida en la nota de RF-8.

      Evidencia completa en `docs/SDD-grafo-hermes-a-template.md` §3-§4.

- [x] **TAR-2 · Definir el contrato categoría/regla/veredicto en Zod.**
      Hecho cuando: el esquema existe, no usa `any`, y el vocabulario de veredicto está
      **acotado por dimensión** (no texto libre). RF: MISION-1, RESTRICCIONES.
      **Cerrada 2026-09-27 (PRP-005 Fase 1)**: `tools/grafo-conocimiento/src/contrato.ts`, con
      `Dimension.vocabulario`, sin `any`. Un veredicto ajeno a su dimensión sale como
      `veredicto_fuera_de_vocabulario` (prueba «RF-1» de `pruebas/contrato.ts`), y el seed de Hermes
      cabe entero en el vocabulario declarado.
      *Del origen (2026-09-26)*: Hermes usa un enum **global**, y su gate acepta `deducible`
      en una regla regulatoria (medido). Un enum global no cumple esta tarea.

- [x] **TAR-3 · Decidir dónde viven las reglas.**
      Hecho cuando: la decisión está tomada **con su alternativa descartada escrita**. Si es
      Supabase: RLS habilitado y `service_role` fuera de la superficie de consulta (C7).
      **Cerrada 2026-09-26 (Fase 0 de PRP-005, el laboratorio)**:
      - la **fuente única** es un paquete de datos en este repo (RF-15);
      - descartadas, por escrito en `plan.md` (decisión 8): que siga en Hermes y un repo propio;
      - cómo carga cada proyecto sus dominios (archivo o Supabase, con C7 si es Supabase)
        queda como elección del consumidor, bajo RF-11.

## Fase 2 — Motor determinista (sin LLM todavía)

- [ ] **TAR-4 · Motor de evaluación.**
      Hecho cuando: dado un triple estructurado devuelve veredicto, sin modelo de por medio.

- [ ] **TAR-5 · Exclusiones por categoría.**
      Hecho cuando: una oración diseñada para colisionar dos categorías cae en la correcta.
      Evidencia: **antes/después** — sin la exclusión colisiona, con ella no. RF: DoF-5.
      *Del origen*: el caso real ya está medido. «quiero ser agente de seguros para drones
      delivery» cae en `DRONES_DELIVERY` sin exclusiones y en `AGENTES_SEGUROS` con ellas.

- [ ] **TAR-6 · Regla de conflicto.**
      Hecho cuando: dos reglas de la misma categoría con veredictos distintos degradan a
      fail-safe **con bandera**, y nunca eligen una. RF: DoF-6.
      *Del origen*: el seed de Hermes trae un conflicto **vivo y permanente**, fiscal
      `INTERESES` (27-VII `deducible` frente a 28-XXVII `dudoso`). Sirve de fixture real.

- [ ] **TAR-7 · Fail-safe.**
      Hecho cuando: sin regla aplicable la respuesta dice explícitamente que no hay
      información suficiente, con forma **distinguible** de una respuesta real. RF: DoF-4.
      *Del origen*: en Hermes, `dudoso` lo comparten cuatro motivos (sin regla, conflicto,
      regla que dice dudoso, pregunta no clasificable) y solo el texto los separa.
      Distinguible = **tipo propio**.

## Fase 3 — Capa de lenguaje natural

- [ ] **TAR-8 · Parser oración → campos.**
      Hecho cuando: usa `structured-outputs` (Vercel AI SDK + Zod) y **no toca el veredicto**.
      RF: MISION-2, LIBERTAD TECNICA.

- [ ] **TAR-9 · Redactor de respuesta.**
      Hecho cuando: devuelve una oración natural que **cita la fuente solo si el dominio la
      declara pública**, y en los dominios internos no expone de qué regla salió. Hay prueba
      de los dos casos. RF: RF-5 (reescrito el 2026-09-26).

- [ ] **TAR-10 · Resolver el modo de fallo del parser.**
      Hecho cuando: está decidido y probado qué pasa si el LLM del parser se cae — y que
      **falla distinto** que "no hay regla". O queda declarado como límite conocido.
      RF: DoF-8. **Es la pregunta abierta de la spec.**

## Fase 4 — Cerrar

- [ ] **TAR-11 · Dos dominios de ejemplo poblados.**
      Hecho cuando: hay uno regulatorio y uno genérico de otro dominio, demostrando que el
      modelo no está atado a lo legal. RF: DoF-2.
      *Decidido el 2026-09-26*: el regulatorio son **drones de reparto + agentes de seguros**
      (llevan dentro el incidente real), registrados desde la fuente única (TAR-16).

- [ ] **TAR-12 · Prueba end-to-end con oración real.**
      Hecho cuando: pregunta en lenguaje natural → parser → motor → respuesta natural, sin
      payload armado a mano. RF: DoF-3.

- [ ] **TAR-13 · Test que fija el conteo de reglas.**
      Hecho cuando: agregar una regla **obliga** a tocar el test en el mismo cambio.
      RF: MISION-6, DoF-7.

- [ ] **TAR-14 · Gate automático de colisiones.**
      Hecho cuando: detecta colisión/conflicto **antes de sembrar**, sin depender de que
      alguien revise cada regla nueva contra todas. Entra en `validate`. RF: RESTRICCIONES.
      *Del origen*: el gate de Hermes (`gen_seed_sql.py:76-92`) caza solo keywords
      **idénticas**, y el seed real pasa con el conflicto de INTERESES dentro. Control de
      reversión: ese seed tiene que poner **rojo** el gate nuevo.

- [ ] **TAR-15 · Autocrítica y cierre.**
      Hecho cuando: está escrito qué parte puede fallar en producción y cómo quedó resuelto
      o declarado. RF: DoF-8.

## Fase 5 — Fuente única del conocimiento (añadida en la Fase 0 de PRP-005, 2026-09-26)

> Dependen de TAR-2 y van **antes** de TAR-11. RF-13 a RF-16 nacen de las decisiones del laboratorio.

- [ ] **TAR-16 · El conocimiento, traído una vez y dividido por dominio.**
      Hecho cuando:
      - las reglas de `hermes-os-a2a` están en este repo **con su historial** (corte pineado,
        sha256, `audita:secretos` limpio, como el ERP en PRP-004), divididas por dominio, cada
        uno con su fecha de corte y si cita o no (RF-5);
      - el paquete tiene semver y registro de cambios (reglas añadidas y cerradas);
      - un proyecto de prueba registra dos dominios y **solo recibe esos**.
      RF: RF-15.

- [ ] **TAR-17 · Vigencia que no borra el pasado.**
      Hecho cuando:
      - retirar una regla cierra su `vigente_hasta` y cambiar un significado añade una versión;
      - el gate **rechaza** un borrado o una edición en su sitio;
      - control: la regla de la ley de 2010 que Hermes borró (`MX-LFPDPPP-21-CONFIDENCIALIDAD`)
        vuelve **cerrada** a 2025-03-20, recuperada de su historial, y un hecho de 2024 la
        encuentra. Restaurarla cambia un veredicto, así que va con firma.
      RF: RF-13, RF-14.

- [ ] **TAR-18 · Aviso de versión nueva, nunca actualización sola.**
      Hecho cuando: publicar una versión nueva hace que `vigila:versiones` del proyecto
      consumidor la **reporte** (exit 1, deriva nueva), y nada cambia en él hasta que un humano
      suba el pin con la paridad re-generada. RF: RF-16.
