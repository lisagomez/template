# Plan 006 — Crear una herramienta con el boilerplate

> **Plan RETROSPECTIVO.** Construido el 2026-08-27 con CDC firmado (PR #31). Reconstruye
> la arquitectura resultante, verificada contra el repo el 2026-08-30.

## Módulos

| Módulo | Dónde vive | Responsabilidad |
|---|---|---|
| Puerta de entrada | `docs/CREAR-UNA-HERRAMIENTA.md` | Qué decide el humano, qué decide el agente, y el "todavía no" |
| Contrato técnico | `docs/EMPAQUETAR-HERRAMIENTA.md` | Fuente única de `exports`, `files`, `peerDependencies`, semver. **No se reescribió** |
| Empaquetador | `scripts/empaqueta-herramienta.mjs` | Construye el tarball y **prueba la integración real** instalándolo en un proyecto limpio |
| Andamio | `tools/ejemplo-herramienta/` | Su `package.json` **es** el contrato correcto: el que pasa en verde |
| Skill | `.claude/skills/crear-herramienta/SKILL.md` | Orden de ejecución; delega en los dos documentos, no los duplica |
| Cableado | Rama del decision tree en `AGENTS.md` | Lo que hace que la puerta sea alcanzable |

## Decisiones, con la alternativa descartada

1. **Dos documentos con roles distintos, no uno.** La puerta (`CREAR-UNA-HERRAMIENTA.md`)
   enlaza al contrato (`EMPAQUETAR-HERRAMIENTA.md`) y no lo reescribe. **Descartado**:
   fundirlos — el contrato técnico tiene otra audiencia y otro ritmo de cambio.

2. **Un skill además del documento.** El CDC posterior lo explica: la puerta era un
   documento, y para llegar a él había que saber que existía. El skill lo pone en el
   registro que el arnés ya ofrece. **Descartado**: dejarlo solo como documento — la
   puerta quedaba accesible sobre todo a quien ya sabía.

3. **El skill DELEGA, no duplica.** Es el orden de ejecución (el "todavía no" primero,
   los tres gates humanos, `--en <ruta>`); el contenido vive en los documentos.

4. **El empaquetador prueba instalando el tarball en un proyecto limpio.** **Descartado**:
   `npm link` — miente: resuelve por symlink y hace funcionar cosas que en una instalación
   real fallan.

5. **El núcleo no importa React/Next/Supabase.** Lo que los necesite va en un entry point
   aparte, con peerDependency opcional. **Descartado**: un paquete monolítico — un núcleo
   que importa React no es una herramienta, es un trozo de una app con otro nombre.

6. **Publicar es gate humano, nunca un paso de script.** Irreversible en la práctica: un
   `unpublish` no borra lo ya descargado.

7. **El "todavía no" va arriba, no al final.** Sin reuso real 3+ veces, empaquetar solo
   añade una versión que mantener.

## Cobertura de la DEFINICIÓN DE HECHO

| DoF | Qué lo cubre | Estado |
|---|---|---|
| 1. El documento existe | `docs/CREAR-UNA-HERRAMIENTA.md` | ✅ verificado en disco |
| 2. La prueba de fuego | Herramienta real construida siguiendo solo el documento | ✅ en su sesión |
| 3. Cero promesas sin ejecutar | Cada comando del documento, corrido | ✅ en su sesión |
| 4. Cableado cerrado | Rama del decision tree + comprobación del verificador | ✅ 136/136 hoy |
| 5. Control negativo | Romper el cableado → rojo → restaurar → verde | ✅ en su sesión |
| 6. `regresion` verde | Capa A | ✅ **105/105** el 2026-08-30 |
| 7. CDC con aprobación pendiente | El agente redacta, no se auto-aprueba | ✅ firmado después por lisagomez |
| 8. Lectura en frío | Un agente que solo lee el decision tree llega al documento | ✅ en su sesión |

## Estrategia de gates

Heartbeat: `verify:gobernanza && regresion` (no `validate`, que incluye `next build` y es
lento para un latido). Al tocar la herramienta de prueba se añade `npm run empaqueta`.

## Nota de estado

`tools/` contiene hoy `ejemplo-herramienta/` y `voz/`. La restricción de la spec era no
dejar basura sin declarar en `tools/`: `voz` es una herramienta real del repo, con dos
tramos en git (commits `759ef6c` y anteriores), no residuo de la prueba.
