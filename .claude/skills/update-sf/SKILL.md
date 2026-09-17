---
name: update-sf
description: "Actualizar SaaS Factory desde el repo upstream POR DIFF: compara el .claude/ de fuera con el de aqui, ensena que cambiaria y no escribe nada sin aprobacion (traer skills de fuera es un CDC). Activar cuando el usuario dice: actualiza el template, hay nueva version, update SaaS Factory, quiero la ultima version, que trae el upstream. NUNCA reemplaza .claude/ entero."
allowed-tools: Read, Bash
---

# Update SaaS Factory

Trae a `.claude/` lo que el repo upstream de SaaS Factory tenga de nuevo, **archivo por
archivo y con el diff delante**. Un skill que llega de fuera cambia el comportamiento de
todo lo que la fabrica produce despues: es un **CDC (control C1)** y pasa por su gate.

## Por que ya no es "borrar y copiar"

La version anterior de este skill borraba `.claude/` entera y copiaba la del upstream
encima. Medido el 2026-09-17 en este repo: el upstream llevaba desde el 2026-03-23 sin
cambios y el `.claude/` local tenia **21 elementos que alla no existen** (gobernanza,
imprenta, rules, specs, routing, presupuesto, settings y 7 skills propios) y 13 archivos
compartidos **mas nuevos aqui**. "Actualizar" habria sido destruir la capa de gobernanza y
retroceder meses. Un `.claude/` no es una copia del upstream: es el upstream mas lo que
este proyecto aprendio. Por eso el skill ahora compara y pregunta; nunca reemplaza.

## Proceso

### Paso 1: Localizar el repo upstream

Busca el alias `saas-factory` en la configuracion del shell:

```bash
grep -h "alias saas-factory" ~/.zshrc ~/.bashrc 2>/dev/null
```

Tiene la forma `alias saas-factory='cp -r /ruta/al/repo/saas-factory/. .'`. **Extrae la
ruta del repo** (lo que va entre `cp -r ` y `/saas-factory/.`). Si no esta, pregunta:

> No encontre el alias `saas-factory`. ¿Donde tienes el repositorio de SaaS Factory?

### Paso 2: Traer el upstream (solo lectura sobre este proyecto)

```bash
git -C [RUTA_REPO_SF] fetch origin main
git -C [RUTA_REPO_SF] rev-list --left-right --count HEAD...origin/main   # detras / delante
git -C [RUTA_REPO_SF] pull --ff-only origin main
git -C [RUTA_REPO_SF] log -1 --format='%h %cs'   # commit y fecha: se pinean en la bitacora
```

Si el pull falla (cambios locales en el repo fuente, ramas divergentes), informa y para:
no se actualiza desde una fuente en estado desconocido.

### Paso 3: Comparar, no copiar

```bash
SRC=[RUTA_REPO_SF]/saas-factory/.claude
diff -rq "$SRC" .claude
```

Clasifica cada linea en tres cubos y **muestralos como tabla antes de seguir**:

| Cubo | Que es | Que se hace |
|---|---|---|
| Solo en upstream | Skill o plantilla nueva de fuera | Candidato a traer. Se lista con su tamano |
| Solo en local | Lo que este proyecto anadio | **NO se toca ni se lista como "a borrar"**: gobernanza, rules, specs, skills propios, `settings*.json`, `worktrees/`, memoria |
| En ambos y distinto | El mismo archivo, dos versiones | Se mira **quien es mas nuevo**: `git log -1 --format=%cs -- .claude/<archivo>` en local contra la fecha del commit upstream. Si local es mas nuevo no es una actualizacion sino un retroceso, y se dice |

Para cada archivo del tercer cubo que el upstream tenga mas nuevo, ensena el diff:

```bash
diff -u .claude/<archivo> "$SRC/<archivo>"
```

Si los cubos uno y tres quedan vacios, o todo lo compartido es mas nuevo en local,
**no hay nada que actualizar**: se informa y termina aqui. No se toca nada.

### Paso 4: Gate humano sobre el diff

Presenta la tabla y los diffs, y pregunta que archivos traer. Reglas del gate:

- **El diff se ensena ANTES de pedir el si.** Describir el cambio de palabra y pedir
  aprobacion es un «continua», no una aprobacion (`GOBERNANZA.md` §2).
- Quien aprueba, aprueba archivos concretos. "Traelo todo" se traduce a la lista y se
  repite la lista para que la firme.
- Hasta ese si **no se escribe nada** en `.claude/`.

### Paso 5: Aplicar solo lo aprobado y correr la regresion

Copia **archivo por archivo**, nunca el directorio:

```bash
mkdir -p ".claude/$(dirname <archivo>)"
cp "$SRC/<archivo>" ".claude/<archivo>"
```

Luego el gate de regresion de skills (capa A) y el cableado de gobernanza:

```bash
npm run regresion
npm run verify:gobernanza
```

Rojo = el cambio **no se promueve**: se revierte lo copiado con
`git checkout -- .claude/<archivo>` y se informa que contrato rompio el skill de fuera.
Sin excepciones ni "se ve bien".

### Paso 6: Entrada en la bitacora

Anade una entrada en `.claude/gobernanza/BITACORA-CDC.md` con el formato del archivo:
fecha, `radio: skill` (o `plantilla` si vino `prp-base.md` o un design-system), la lista
de archivos traidos, el **commit upstream pineado** (hash y fecha del paso 2), el
resultado de la regresion y quien aprobo.

### Paso 7: Confirmar al usuario

Sin paths internos ni comandos. Que llego, que quedo igual y que el cambio esta
registrado:

```
SaaS Factory actualizado.

Traido del upstream (commit <hash>, <fecha>):
- <skill o plantilla>: <que cambia, en una linea>

Sin tocar: tu configuracion, tus skills propios, la gobernanza y tu codigo.
Registrado en la bitacora de cambios.
```

## Lo que este skill NUNCA hace

- Borrar `.claude/` entera ni copiar el `.claude/` del upstream encima (el `rm -rf` y el
  `cp -r` de la version anterior). Cada archivo entra por su nombre y con su diff.
- Borrar algo que solo existe en local. Lo que el upstream no tiene no esta "de mas".
- Tocar `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `settings.json`, `settings.local.json`,
  `.claude/memory/`, `.claude/gobernanza/`, `.claude/rules/`, `.claude/specs/` ni `src/`.
- Escribir antes de la aprobacion, o promover con la regresion en rojo.
