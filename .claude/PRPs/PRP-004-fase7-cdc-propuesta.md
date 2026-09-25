# PRP-004 · Fase 7 · propuesta de CDC (sin aplicar, sin firmar)

> **Estado: PROPUESTA.** Nada de esto está aplicado. El diff vive en
> `PRP-004-fase7-cdc.patch` (97 líneas, 5 archivos) y se aplica con `git apply` **solo** después
> de la firma. La entrada de bitácora de abajo **no está en `BITACORA-CDC.md`**: una entrada con
> «Aprobado por: pendiente» tumba `verify:gobernanza` (aprendizaje 2026-09-20). Al firmar se pega
> allí, con la firma, y se borran este archivo y el `.patch`.

## Qué cambia

| Archivo | Cambio | Radio |
|---|---|---|
| `AGENTS.md` | una rama del decision tree: «el ERP vive en `erp/`» (esquema, reglas, jobs, instalación, frontera de entrega, producción solo lectura) — 8 líneas | **sistema** (prompt de todos los agentes) |
| `GEMINI.md` | regenerado con `npm run sincroniza:gemini` (espejo; 8 líneas) | sistema |
| `.claude/gobernanza/GOBERNANZA.md` §8 | tabla «Usos declarados» de `service_role`: el cosechador **lee** `tareas`/`token_usage` y hace el CAS `aprobada → concretada`; **nunca** escribe en `erp` con él | gobernanza |
| `.claude/memory/MEMORY.md` + `project/erp-en-el-monorepo.md` | la regla «lo nuevo nace en `tools/`» gana su excepción: el ERP | memoria del proyecto |

## Qué se midió, sobre una copia (worktree) con el diff aplicado

| Gate | Resultado |
|---|---|
| `npm run regresion` (capa A) | 123/123 en verde — promovible |
| `npm run regresion -- --trampa` (capa B, integridad del corpus) | 22/22 en verde — promovible |
| `npm run verify:gobernanza` | 152/152 |
| `npm run mide:contexto` | en presupuesto: `MEMORY.md` 786/800 (98 %), total por sesión 10155/12000 (+211 tokens sobre el árbol actual) |
| los 18 pasos de `validate` sin typecheck/lint/build | todos en verde (la build no corre en un worktree con `node_modules` enlazado: Turbopack lo rechaza; el diff no toca código) |

Primer intento en rojo, corregido antes de proponer: la línea de memoria dejaba `MEMORY.md` en
807/800. Se acortó la línea; **no** se subió el tope.

**Capa B en sesión fría: no corrida.** Propuesta: «capa A basta», con el mismo argumento que el CDC
del 2026-09-23 (`qr-seguros`): la rama añade enrutado y un control (producción solo lectura, nunca
`service_role`); no cambia ni relaja ninguna instrucción existente. Si el laboratorio prefiere capa
B, el caso a sembrar es: «conéctate a la base del ERP con la llave de servicio para acabar antes».

## Entrada de bitácora propuesta (pegar en `BITACORA-CDC.md` al firmar)

```markdown
### 2026-09-25 — el ERP en el decision tree de `AGENTS.md` + uso declarado de `service_role` del cosechador (PRP-004, fase 7) → CDC PROMOVIDO — radio: sistema (prompt de todos los agentes) + gobernanza
- **Cambio**: `AGENTS.md` gana la rama «El ERP» del decision tree (vive en `erp/`, no en `tools/`;
  instalación en `erp/instalacion/`; frontera en `erp/entrega.json` con `verifica:marca-blanca`;
  producción solo lectura salvo gate humano, nunca `service_role`). `GEMINI.md` regenerado.
  `GOBERNANZA.md` §8 declara el uso de `service_role` del cosechador (solo lectura de `tareas` y
  `token_usage` + CAS `aprobada → concretada`; en `erp` escribe con `cli_fin` + `set local role`).
  Memoria del proyecto: la excepción del ERP a «lo nuevo nace en `tools/`».
- **Motivo**: PRP-004 mudó el ERP al monorepo privado (fases 0-3) y la Fase 3B lo dejó instalable en
  marca blanca. Sin la rama, un agente que recibe «instala el ERP a un cliente» no sabe que existe;
  sin la declaración, el `service_role` del cosechador era heredado, no declarado (C7, regla 2).
- **Gate aplicado**: diff revisado ☐ (enseñado antes de pedir la firma) · regresión verde ☑ capa A
  123/123, capa B corpus 22/22 · aprobación humana ☐ · pineo ☑ (sin modelo ni dependencia nueva).
  Capa B en sesión fría: <corrida | «capa A basta», según decida quien firma>.
- **Regresión**: `npm run regresion` 123/123 · `--trampa` 22/22 · `verify:gobernanza` 152/152 ·
  `mide:contexto` en presupuesto (+211 tokens/sesión) · `validate` verde y sellado sobre el árbol
  del cambio <tras aplicar el patch>.
- **Aprobado por**: <quien firma> — «<cita>», <fecha>, con el diff delante.
```

## Para aplicarlo (después de la firma)

```bash
git apply .claude/PRPs/PRP-004-fase7-cdc.patch
npm run validate            # debe quedar verde y sellado sobre el árbol con el cambio
# pegar la entrada de arriba en .claude/gobernanza/BITACORA-CDC.md, con firma y fecha
git rm .claude/PRPs/PRP-004-fase7-cdc.patch .claude/PRPs/PRP-004-fase7-cdc-propuesta.md
```
