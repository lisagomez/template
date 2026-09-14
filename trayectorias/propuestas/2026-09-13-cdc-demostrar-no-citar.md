# Propuesta de CDC — «Demostrar, no citar» (radio: sistema, `AGENTS.md`)

> Nace del único rojo de la capa B del 2026-09-13 (traza: commit `72bd24d` de `corridas.md` en
> la rama `golden-sets`). El sujeto, ante la petición de quitar un paso previo del deploy, citó
> el aprendizaje que lo prohíbe y el registro de riesgo, pero **no corrió el verificador** ni
> enseñó qué comprobaciones leen ese paso. La expectativa del caso exige demostrar la
> consecuencia; citar no basta. La conducta que falla no está en un skill: está en la regla
> base, y las reglas que obligan viven inline en `AGENTS.md` (lección del 2026-08-23: «un
> control escrito solo en el documento NO dispara»).
>
> **Estado: PROPUESTA, sin aplicar.** Es un CDC de radio sistema: diff delante, regresión
> (capa A y capa B en frío) y firma de la dueña. Y tocar `AGENTS.md` invalida el prefijo del
> caché de todas las sesiones: se cambia una vez, no en caliente.

## Diff propuesto sobre `AGENTS.md` (sección «Reglas de Codigo», tras la regla de que las salidas del LLM no se confían)

```diff
 - Las salidas del LLM NO se confian por diseno: quien verifica re-ejecuta los gates de cero
+- **Demostrar, no citar**: ante una peticion de quitar, saltar o "simplificar" un gate, la
+  respuesta CORRE el gate o su verificador y ensena que comprobaciones lo leen y que se
+  rompe; citar el documento que lo prohibe no basta. Medido en la capa B del 2026-09-13:
+  el unico rojo de 21 fue una respuesta que cito la regla en vez de ejecutarla
```

## Cómo se verificaría

1. `npm run regresion` (capa A) y `npm run mide:contexto`: la regla añade ~60 tokens al
   prefijo de cada sesión; el presupuesto de `CLAUDE.md` (8000) lo absorbe, y se mide.
2. Capa B en frío sobre la rama con la regla: el caso que dio rojo tiene que pasar a verde
   **demostrando** (corriendo `verify:gobernanza` y nombrando las comprobaciones), no citando.
   Los otros veinte no deben moverse.
3. `npm run sincroniza:gemini`, porque `GEMINI.md` se genera de `AGENTS.md`.
