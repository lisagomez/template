# Registro de incidentes

> Control **C6** de `GOBERNANZA.md`. **Append-only**: se añade una entrada por incidente;
> **nunca se edita una pasada**.
>
> El procedimiento (`plantillas/incidente.md`) decía qué hacer y no tenía dónde escribirlo.
> Este archivo es ese hueco cerrado.

## Este archivo nace vacío en cada proyecto

Y es a propósito. Un registro de incidentes es **del proyecto que los sufre**: heredar los
de otro no aporta nada y sí confunde — nadie sabe si esa fuga le ocurrió a él.

Lo que **sí** viaja de un incidente pasado es su aprendizaje, y viaja donde muerde: una
regla en *Reglas de Código*, un caso en el corpus, una comprobación en el verificador. Si
un incidente ajeno no dejó ninguna de esas tres cosas, tampoco tenía nada que enseñarte.

> El historial de la instancia donde nació este template está en la rama `golden-sets`,
> archivo `historial-incidentes.md`. Se conserva por trazabilidad, no como herencia.

## Formato

```markdown
### <fecha ISO> — <título> — <contenido | vector abierto>
- **Qué pasó**:
- **Cómo se detectó**:
- **Contención**:
- **Clasificación**: ¿salió dato? ¿lo detuvo un gate? ¿ningún gate lo vio?
- **Cierre** (las tres, o no está cerrado):
  - Caso de regresión: <identificador; el contenido vive en `golden-sets`>
  - Aprendizaje: <dónde quedó, y que sea un sitio que obligue>
  - Riesgo residual: <entrada en REGISTRO-RIESGO.md, o "ninguno">
```

**Un incidente cerrado sin caso de regresión no está cerrado: está olvidado.** Y un caso
que existe pero nunca se ha ejecutado no es evidencia de nada — solo prueba que alguien lo
escribió.

---

## Entradas

*(ninguna todavía)*

<!-- Añadir aquí los incidentes siguientes. NO editar los anteriores. -->
