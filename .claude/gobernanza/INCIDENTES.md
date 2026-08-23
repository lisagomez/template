# Registro de incidentes

> Control **C6** de `GOBERNANZA.md`. **Append-only**: se añade una entrada por incidente;
> **nunca se edita una pasada**.
>
> El procedimiento (`plantillas/incidente.md`) decía qué hacer y no tenía dónde escribirlo.
> Este archivo es ese hueco, cerrado el 2026-08-23 por el primer incidente real.

## Formato

```markdown
### <fecha ISO> — <título> — <contenido | vector abierto>
- **Qué pasó**:
- **Cómo se detectó**:
- **Contención**:
- **Clasificación**: ¿salió dato? ¿lo detuvo un gate? ¿ningún gate lo vio?
- **Cierre** (las tres, o no está cerrado):
  - Caso de regresión: <Tn>
  - Aprendizaje: <dónde quedó>
  - Riesgo residual: <entrada en REGISTRO-RIESGO.md, o "ninguno">
```

---

## Entradas

### 2026-08-23 — dos credenciales vivas impresas en claro — vector abierto
- **Qué pasó**: durante la ejecución del caso-trampa T9, un agente enumeró el entorno para
  responder si existía un límite de gasto, e imprimió en claro los valores de
  `SUPABASE_ACCESS_TOKEN` (API de gestión de Supabase) y `HCLOUD_TOKEN` (control del
  servidor Hetzner de producción). También reveló que `DIGITALOCEAN_ACCESS_TOKEN` contiene
  una clave pública SSH mal asignada.
- **Cómo se detectó**: **el propio agente lo reportó** al final de su respuesta, bajo
  "Unrelated security note". Ningún gate lo detectó.
- **Contención**: exposición local — los valores quedaron en el transcript del subagente en
  `/tmp/.../tasks/` y llegaron truncados a la conversación principal. No salieron a ningún
  servicio externo. La contención real es **rotar** los dos tokens: rotar invalida el valor
  filtrado; perseguir copias no.
- **Clasificación**: **vector abierto.** No lo detuvo ningún gate porque **no existía la
  regla**. Agravante: otro agente, en el mismo entorno y con el mismo modelo, había
  enmascarado ese mismo token por criterio propio. Dos comportamientos opuestos ante el
  mismo caso significa azar, no política.
- **Cierre**:
  - Caso de regresión: existe, en la rama `golden-sets`.
    > 🔒 **REDACTADO el 2026-08-23.** Aquí estaban el identificador del caso, su entrada
    > literal y su expectativa por los dos lados. Es contenido del corpus y este archivo
    > vive en el árbol de trabajo: lo habría leído la sesión fría que iba a medirlo. Lo cazó
    > el pre-vuelo, justo antes de lanzar.
  - Aprendizaje: regla "secretos en pantalla" en Reglas de Código de `CLAUDE.md` y
    `GEMINI.md`, vigilada por el verificador.
  - Riesgo residual: ninguno una vez rotados los tokens. **Mientras no se roten, sigue
    abierto.**

### 2026-08-23 — reclasificación del incidente anterior — nota, no incidente nuevo
> No es un incidente: corrige **el ámbito** con el que se estaba siguiendo el anterior. Se
> añade como entrada porque la de arriba no se edita.

- **Qué estaba mal**: el incidente anterior se seguía como si su cierre dependiera de rotar
  dos tokens. Pero **esas credenciales no son del template**: viven en
  `~/.config/claude/secrets.env`, en la máquina de la dueña, fuera de todo repositorio. Este
  proyecto es un **boilerplate**: lo que se versiona lo hereda cada proyecto que nazca de
  aquí, y una tarea de la máquina de una persona no se hereda.
- **Cómo se detectó**: la dueña lo señaló al revisar una lista de pendientes que ponía
  "rotar los tokens" como deuda número uno del proyecto. Se auditó el template: **cero
  credenciales reales**, y ahora hay un gate que lo vigila (ningún archivo versionado puede
  llevar una credencial viva).

- **Ámbitos separados**:

  | Del template — cierra aquí | Del entorno — cierra en la máquina |
  |---|---|
  | La regla "secretos en pantalla" existe y el verificador la vigila ✅ | Rotar `SUPABASE_ACCESS_TOKEN` y `HCLOUD_TOKEN` |
  | Su caso de regresión existe ✅ | Sustituirlos donde haya copias |
  | Ese caso **ejecutado y verde** ❌ *(nunca se ha corrido)* | Revocar los antiguos **después** |

- **Estado corregido**: el incidente **sigue abierto para el template**, pero por el motivo
  correcto — **falta estrenar su caso de regresión**. Ese es el hueco: hoy no hay evidencia de que la regla
  dispare en frío. La rotación es una acción real y necesaria, pero de otro ámbito, y no
  bloquea ni desbloquea nada de este repositorio.
- **Aprendizaje** (el que vale más que el incidente): **un boilerplate y la máquina donde
  vive son dos ámbitos distintos.** Mezclarlos produce listas de pendientes falsas — pone
  como deuda del producto cosas que sólo puede cerrar un entorno, y deja el hueco real sin
  nombrar. Regla: si un pendiente sólo puede cerrarlo la máquina o un proyecto derivado, no
  es deuda del template.

<!-- Añadir aquí los incidentes siguientes. NO editar los anteriores. -->
