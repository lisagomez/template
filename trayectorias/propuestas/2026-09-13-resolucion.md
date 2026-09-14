# Resolución de las propuestas del 2026-09-13

> Instrucción de la dueña: «aplica las propuestas». Aplicar una propuesta de este sistema es hacer
> lo que pide —buscar la causa— y cambiar solo lo que la evidencia justifica. Cada cambio de regla
> o de arnés va con su CDC en la bitácora. Ningún skill se tocó: la evidencia no lo pedía.
>
> Nota: la lista de seis (P1-P6) es la que generó el informe ANTES de que aprendiera a detectar
> el cambio de modelo. Regenerado después, `2026-09-13.md` solo conserva las dos de errores por
> herramienta, que son las tratadas con los aprendizajes; las otras cuatro dejaron de ser señal.

| Propuesta | Causa encontrada | Qué se aplicó |
|---|---|---|
| P1, P4 · tokens de salida por llamada +51 % / +67 % | **Cambio de modelo, no de skill.** Antes del corte el 100 % de los mensajes eran de Opus 5; después entran Fable 5.1 (2148 tokens por llamada frente a 1171 de Opus, con el razonamiento contado como salida), Sonnet 5 y Haiku. Además las sesiones de después hacen 2,6 veces más ediciones por sesión (specs 007 a 011). | El informe detecta la **mezcla de modelos por periodo** y ya no marca como regresión las métricas por llamada cuando el modelo cambió: «confundido por modelo, no se marca». |
| P2, P5 · ms por llamada +24 % / +30 % | Misma causa: más razonamiento por llamada y subagentes en las sesiones largas. | Igual que P1: confundido por modelo. |
| P3, P6 · errores por herramienta +47 % / +35 % | Errores reales y repetidos, casi todos de Bash: `pkill -f` matando la propia shell (10 veces), `gh pr edit` roto por un aviso de GitHub (4), scripts de Python fallidos (10), `cd` a rutas que ya no existen (7). No es un skill: es conducta de sesión. | Dos **aprendizajes** en `.claude/rules/aprendizajes-stack.md` (pkill anclado o por puerto; `gh api` en vez de `gh pr edit`), y la trayectoria lleva ahora `resultado.erroresPor` (por herramienta) para que la próxima vez no haga falta volver al transcript. |

## Lo que NO se aplicó, y por qué

- Ningún cambio en un skill, un prompt ni el routing: ninguna propuesta señalaba uno.
- El hook `SessionEnd` en `.claude/settings.json` del repo sigue **pendiente**: no es una de las
  propuestas y es un CDC aparte (hoy vive en `settings.local.json` de esta máquina).
- El coste de las sesiones de la fábrica sigue en `null`: el catálogo de routing no tiene precios
  verificados para los modelos del arnés, y no se inventan.
