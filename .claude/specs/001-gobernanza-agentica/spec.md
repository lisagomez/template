# Spec 001 — Capa de gobernanza agéntica

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-23 y **aprobada con CDC firmado**. El texto exacto que se
> firmó sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-gobernanza-agentica.md`
>
> Se conserva **Libertad técnica**: es el núcleo del diseño de estas specs (outcome claro,
> cómo libre). El protocolo exige no saltarse secciones, no prohíbe añadirlas.
>
> **Estado: CONSTRUIDA.** Ver `plan.md` y `tareas.md`.

## Contexto y objetivo

El SaaS Factory ya practicaba, sin nombrarlos, la mitad de los controles de un sistema de
gestión de IA serio. Lo que faltaba no era ingeniería: era **papel bien hecho, cableado al
flujo**, y el cierre de tres huecos invisibles porque no rompen nada el día que se
descuidan — rompen semanas después, sin ruido. Los tres: no había gate para cambios de
comportamiento; nadie verificaba a los agentes; y `service_role` anulaba la regla de RLS.

El objetivo es una capa de gobernanza **viva**: no un documento que nadie lee, sino reglas
que el propio flujo obliga a consultar, con un verificador que falla si el papel y el
código divergen.

## Usuarios / actores

- **La dueña del repo**, que aprueba cambios y firma riesgos, sin equipo de compliance.
- **El agente** que ejecuta y al que estos controles limitan.
- **Un auditor o comprador enterprise** que necesita verificar la postura sin confiar.
- **Todo proyecto derivado**, que hereda la capa el día uno.

## Historias de usuario

- H1: Como dueña quiero que ningún skill se edite en caliente para que un cambio de
  comportamiento no llegue a producción sin diff ni aprobación.
- H2: Como auditor quiero que el papel y el código no puedan divergir en silencio para
  poder verificar la postura con un comando.
- H3: Como agente quiero saber qué riesgos no puedo aceptar aunque me lo pidan, para no
  trasladar a terceros un daño que nadie firmó.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: CUANDO se cambie el modelo, un skill, un prompt, una plantilla, `settings.json`,
  `.mcp.json` o el tag de una imagen de agente, EL SISTEMA exigirá diff, regresión verde,
  aprobación humana y entrada en la bitácora antes de promover.
- RF-2: EL SISTEMA mantendrá el modelo de producción pineado.
- RF-3: SI se declara `latest` o cualquier alias auto-actualizable, ENTONCES EL SISTEMA lo
  rechazará.
- RF-4: CUANDO se ejecute la suite de regresión, EL SISTEMA comparará la salida por match
  estructural, no textual, y marcará promovible solo en verde.
- RF-5: EL SISTEMA incluirá casos-trampa adversariales que deben producir escalada o
  bandera, no salida limpia.
- RF-6: EL SISTEMA exigirá un modelo de amenazas de cinco pasos como sección fija de cada
  PRP.
- RF-7: EL SISTEMA exigirá una evaluación de impacto (AISIA) que cubra daños ocurridos con
  el sistema operando bien y sin atacante presente.
- RF-8: SI alguien acepta un riesgo que rompe una regla, ENTONCES EL SISTEMA exigirá una
  entrada firmada en el registro de riesgo antes de proceder.
- RF-9: SI el daño recae sobre terceros que no firmaron, ENTONCES EL SISTEMA no ofrecerá la
  vía del registro y explicará por qué esa clase es distinta.
- RF-10: CUANDO ocurra un incidente, EL SISTEMA aplicará contención antes que diagnóstico,
  y no dará el incidente por cerrado sin un caso nuevo en la suite de regresión.
- RF-11: EL SISTEMA mantendrá `service_role` fuera de las superficies de negocio, limitado
  a migraciones, webhooks verificados y jobs de plataforma, cada uno declarado.
- RF-12: SI el papel y el código divergen, ENTONCES EL SISTEMA fallará con exit distinto de
  cero.
- RF-13: MIENTRAS un gate esté en rojo, EL SISTEMA no promoverá el cambio, sin excepciones.

## Requisitos no funcionales

- Todo en español, con el tono del template: directo, tablas antes que párrafos.
- **Sostenible por una persona sola**: un control que exija un equipo de compliance no entra.
- El verificador corre sin red, sin credenciales y sin dependencias instaladas.
- Genérico: nada específico de un cliente. Es boilerplate heredable.

## Libertad técnica *(sección conservada del diseño original)*

Estructura de archivos, cuántos documentos, cómo se llaman, dónde viven y cómo se implementa
el verificador son decisiones de quien ejecuta. Lo no negociable es que la capa esté
**cableada**: que el flujo obligue a consultarla.

## Casos límite

- Un control escrito solo en el documento y no en el flujo: **no dispara**. Medido — C1 y C5
  fallaron por esto hasta pasar a reglas inline.
- Un alias de modelo que sí existe en el registro del arnés: el rechazo no puede depender de
  que el alias sea inválido.
- Fatiga de aprobación: el sello de goma no es malicia, es estadística. Se combate con
  diffs chicos y banderas primero.
- Un verificador que nunca se vio fallar no verifica nada.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| Quien opera el repo | **Fatiga de aprobación**: si cada cambio pide firma, se firma sin leer y el control pasa a ser teatro — con la agravante de que produce sensación de control | Gate proporcional al radio, diffs chicos, banderas primero. No se combate con regaños |
| Usuarios de un proyecto derivado | Un gate que bloquea un arreglo urgente de seguridad retrasa la protección de gente que no participa en la decisión | El procedimiento de incidente prioriza **contención primero**: pausar es barato, y el gate no se interpone en la contención |
| Proyectos derivados | Heredan controles que quizá no necesitan y los abandonan en bloque | Lo que exige un equipo de compliance no entra, o entra marcado como etapa posterior |

**No alcanza a terceros que no firmaron**: es una capa interna de proceso. El único vector
hacia fuera es el retraso en incidentes, y está mitigado arriba.

## Fuera de alcance

- Construir la suite de regresión completa: se documenta el control y se deja el esqueleto.
- La ceremonia PKI y la vertical blockchain del material de origen (x402, ERC-8004, AP2).
- Todo lo específico de Hermes: se conserva el mecanismo, no su vocabulario.

## Criterios de finalización

Los siete controles mapeados a archivo y sección sin huecos · el verificador en verde y
**visto fallar** al romper un cable a propósito · plantillas probadas con un caso real de
este repo · trazabilidad del destilado (qué se descartó y por qué).

## Dudas abiertas

- [NECESITA ACLARACIÓN] ¿Qué control de esta capa es teatro, en el sentido de que nadie lo
  va a seguir cuando haya prisa? La autocrítica lo pregunta; la respuesta cambia con el uso.
