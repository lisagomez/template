# Historial de incidentes — instancia de origen

> **Por qué vive aquí y no en el boilerplate.** `INCIDENTES.md` es un **registro**, y como
> tal viaja con el template: todo proyecto necesita dónde escribir sus incidentes. Pero las
> **entradas** de abajo son de esta máquina concreta, y un proyecto nuevo no las hereda —
> nacería con el relato de una fuga que no le ocurrió.
>
> Se conservan porque el aprendizaje que produjeron sí viajó: la regla de "secretos en
> pantalla" en las Reglas de Código, su caso en el corpus, y la comprobación que las vigila.
> Esto es la trazabilidad de dónde salió todo eso.
>
> Retirado del árbol de trabajo el 2026-08-23.

---


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

### 2026-08-23 — **CIERRE** del incidente de credenciales, del lado del template
> No es un incidente: es el cierre del primero. Entrada nueva porque las anteriores no se
> editan.

- **Qué faltaba**: la reclasificación anterior dejó el incidente abierto por el motivo
  correcto — su caso de regresión existía pero **nunca se había ejecutado**. Sin eso, no
  había evidencia de que la regla dispare; solo de que está escrita.
- **Qué se hizo**: ejecutarlo en sesión fría, entrada verbatim, con pre-vuelo verificado.
  **Resultado: VERDE**, incluida la cláusula opcional de la expectativa. Reporte en
  `corridas.md` (rama `golden-sets`, `63eda94`).

- **Las tres condiciones de cierre, ahora sí**:
  - **Caso de regresión**: existe **y está medido en verde**. ✅
  - **Aprendizaje**: la regla vive en *Reglas de Código* de `CLAUDE.md` y `GEMINI.md`, y el
    verificador falla si alguien la borra. ✅
  - **Riesgo residual**: ninguno **para el template**. ✅

- **Por qué esto cierra de verdad y no es papeleo**: el incidente ocurrió porque **no había
  regla**, y dos agentes idénticos se comportaron al revés ante el mismo caso — azar, no
  política. La medición en frío demuestra que ya no depende del criterio de quien toque.
  Es el ciclo del Auto-Blindaje completo **con evidencia**: incidente → regla → caso →
  verde.

- **Lo que NO cierra esta entrada** (y no lo esconde): **rotar las dos credenciales sigue
  pendiente en la máquina de la dueña.** Es acción real y necesaria, de otro ámbito, y no
  bloquea nada de este repositorio. El template se auditó: cero credenciales reales, con un
  gate que lo vigila.
- **Hallazgo abierto que dejó la corrida** (no es del incidente): los servidores MCP usan
  `@latest`. Ver `BITACORA-CDC.md`.

<!-- Añadir aquí los incidentes siguientes. NO editar los anteriores. -->
