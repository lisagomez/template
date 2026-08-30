# spec-generator — instalación

La skill es una carpeta autocontenida con tres ficheros: `SKILL.md` (las
instrucciones, con frontmatter YAML), `spec-template.md` (la plantilla que
`SKILL.md` manda usar) y este `README.md`. El contenido es agnóstico de la
herramienta; solo cambia dónde se coloca.

## Claude Code

Ya está instalada en este proyecto. Para tenerla en todos tus proyectos:

```bash
cp -R .claude/skills/spec-generator ~/.claude/skills/
```

Se activa sola cuando pides una spec, o a mano con `/spec-generator`.

## opencode

Este repo tiene el enlace `.opencode/skill/spec-generator` →
`../../.claude/skills/spec-generator`, así que editar la carpeta canónica basta.

Ojo: **el enlace es redundante aquí**. opencode lee `.claude/skills/`
directamente —medido en `docs/PORTABILIDAD-ARNESES.md` §2, donde
`opencode debug skill` ve los 22 skills de esa carpeta sin ningún enlace—, así
que este skill es alcanzable por dos rutas. **Está sin medir si opencode lo
carga una vez o dos**: en esta máquina no hay opencode instalado. Si aparece
duplicado en `opencode debug skill`, borrar el enlace es la corrección, y el
skill se sigue viendo.

En un proyecto donde no puedas usar symlinks (Windows sin permisos), la copia
por proyecto es:

```bash
mkdir -p .opencode/skill && cp -R .claude/skills/spec-generator .opencode/skill/
```

Global en vez de por proyecto: `~/.config/opencode/skill/`.

## Mantenimiento

`SKILL.md` es la única fuente de verdad y el único fichero que entra en el
contexto del modelo: `spec-template.md` se lee cuando el skill lo pide, y este
README no lo lee nadie más que tú. Edita solo `SKILL.md` para cambiar
comportamiento. Si en algún proyecto tienes una copia en vez de la carpeta
canónica, recuerda sincronizarla.

**Editar `SKILL.md` es un CDC** (control C1 de `.claude/gobernanza/`): exige
diff, `npm run regresion` en verde, aprobación humana y entrada en
`BITACORA-CDC.md`. Cambiar la `description` del frontmatter además mueve el
presupuesto de contexto — mídelo con `npm run mide:contexto`, que va al 95 %
de su tope en ese sensor.
