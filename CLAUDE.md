@AGENTS.md

## Solo para Claude Code

Las instrucciones de la fabrica viven en `AGENTS.md`, que es la **fuente unica** y la que
leen tambien otros arneses (opencode y compania). Este archivo la importa con `@AGENTS.md`
—la via que documenta Claude Code— para que el contenido entre igual en contexto y **las
reglas sigan disparando**: una regla que solo vive en un documento referenciado no dispara,
y esta capa ya se llevo esa leccion.

Lo especifico de este arnes, y solo eso:

- **Skills**: `.claude/skills/` (22). Se invocan con `/nombre` o los activa el modelo.
- **Gobernanza**: `npm run validate` encadena typecheck, build, verificador, regresion,
  auditoria de credenciales y presupuesto de contexto.
- **Memoria automatica**: vive fuera del repo, en `~/.claude/projects/<proyecto>/memory/`.
  La memoria **del proyecto**, la que viaja con el codigo, es `.claude/memory/`.
