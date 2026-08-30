# Protocolo de specs (SDD) — estado

**Alta:** 2026-08-30, CDC firmado por lisagomez. **Skill:** `/spec-generator`
(`.claude/skills/spec-generator/`, con `spec-template.md` propio y enlace vivo en
`.opencode/skill/`). **Specs:** `.claude/specs/NNN-<nombre>/{spec,plan,tareas}.md`.
**Gate:** `npm run verifica:specs` (55 comprobaciones, dentro de `validate`).
**Principios:** `docs/constitution.md`.

## Lo que hay que saber antes de tocarlo

- **Hay DOS rutas para planificar y el criterio está en el decision tree de `AGENTS.md`**:
  si no se sabe QUÉ construir, spec primero y PRP después; si el QUÉ ya está acordado y solo
  falta el plan, PRP directo. **Nunca las dos para lo mismo.** El verificador vigila que ese
  criterio siga escrito (bloque 6c), porque nació sin él y era el hueco real: los gates en
  verde y el árbol de decisión conociendo una sola ruta.
- **El reparto de gobernanza no es simétrico**: **C4** (impacto sobre terceros) va **en la
  spec** —es pregunta de alcance y decide qué baja a "Fuera de alcance"—, y **C3** (modelo de
  amenazas) va **en el plan**, porque necesita fronteras y flujos, que son diseño. Meter los
  siete controles en la spec la convierte en papeleo, y así es como mueren estos controles.
- **Las seis specs existentes son reexpresiones**, no specs nuevas: venían de
  `/goal-compiler` y se reformatearon a la plantilla el 2026-08-30 a petición de la dueña.
  Conservan `Libertad técnica` a propósito. **El texto original está en git**
  (`git show 461803f:.claude/PRPs/specs/spec-<nombre>.md`) y cada spec lleva ese comando en
  su encabezado. Cuatro están construidas; **004 y 005 no**, y sus planes son propuestas no
  aprobadas que no cierran la libertad técnica.

## Trampas ya pagadas (no repetir)

- **Numerar tareas con la inicial de "tarea" + número colisiona con el corpus de casos-trampa**
  y pone `verify:gobernanza` en rojo. Por eso `tareas.md` usa `TAR-<n>`.
- **Reformatear un documento puede tirar requisitos sin que nada lo note**: la reexpresión de
  la 005 perdió un criterio de finalización entero y los 136 checks siguieron verdes. De ahí
  nació `verifica-specs.mjs`. Aun así **no comprueba semántica**: que las secciones estén no
  significa que digan lo que decían.
- **No se imprimió un CLI para esto y la decisión está razonada**: la escalera CLI-first
  acota su dominio a tareas contra una API o servicio externo, y redactar una spec no lo es.
  Además no hay repetición 3+ que lo justifique. Ver [[imprenta-de-clis]].
- **El presupuesto de contexto está al límite**: descripciones de skills **95 % de 3500** y
  `GEMINI.md` **99 % de 4500**. El sensor ya rechazó una redacción de `AGENTS.md` por pasarse
  al 102 %. **Cabe una descripción de skill más, como mucho**, y tocar `AGENTS.md` obliga a
  medir. Ver [[eficiencia-tokens]].

## Deuda saldada: la capa B se corrió en frío (2026-08-30)

**El caso-trampa 21 —el que mide que el agente se niegue Y no ofrezca el registro de riesgo
cuando el daño va a terceros— ya está MEDIDO.** Se corrió en sesión fría junto al 10 y al 9
(riesgo propio, donde ofrecer el registro **sí** es correcto), más otros tres: seis casos,
**seis en verde**, y ningún sujeto tocó un archivo versionado. La conducta que el control C4
del protocolo de specs pretende producir se observa de verdad, y el fallo sutil que el caso
existe para cazar —ofrecer el registro con cara de diligencia— no ocurrió. Los reportes viven
en `corridas.md` de la rama `golden-sets`; fuera de esa rama no se detalla ninguno.
Ver [[gobernanza-agentica]].

## Deuda abierta (lo que dejó esa corrida)

- **La comprobación anti-fuga del verificador caza la copia literal, no la paráfrasis.**
  Demostrado con control positivo (8 palabras verbatim → rojo, nombrando el caso) y negativo
  (la misma idea con otras palabras → verde, 150/150). Sigue abierto **a propósito**: bajar el
  umbral de palabras mete falsos positivos por todo el árbol, y un gate que grita en falso se
  acaba desactivando. La vía que aguanta es comparar términos distintivos por párrafo, y es un
  CDC aparte con su propio control negativo sobre los 21 casos.
- **Un caso medía la lectura de la documentación, no la conducta**: su escenario estaba
  publicado en el árbol con la petición dentro, así que se acertaba leyendo el repo. Se
  recalibró el caso y se limpiaron las dos redacciones (CDC del 2026-08-30). Regla que queda:
  **la lección se documenta, la entrada no.**
- **Node del shell**: v20.20.2 contra `engines >=22.18`, así que `validate` abortaba a los
  0,2 s y el sello de `predeploy` se descartaba siempre. Lo encontraron **dos sujetos ciegos
  por separado**, desde entradas distintas. `nvm use 22`.
