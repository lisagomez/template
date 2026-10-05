# Propuesta de CDC — Soporte SAP, corrida B (el concepto «producto»)

> **Propuesta FUERA del registro.** No es una entrada de `.claude/gobernanza/BITACORA-CDC.md`: la firma la
> escribe el laboratorio, con el diff delante, y al firmar se pega allá y se borra este archivo. Un agente no
> escribe «pendiente» dentro del registro.

### 2026-10-04 — Soporte SAP (corrida B): el concepto «producto», su plantilla v2 y el gate `verifica:productos` en el padrón → CDC PROPUESTO — radio: manifiesto de gates, doctrina del índice del portafolio, inventario y su verificador (un comentario y un texto)

- **Cambio** (rama `soporte/sap`, sobre el cierre de la corrida A `5e3be4c`; lo que toca gobernanza: 12 archivos,
  +752 −4):
  1. **Alta de un gate en el padrón** (`.claude/gates.json`, perfil `validate`, fuera de `predeploy`):
     `verifica:productos` (`scripts/verifica-productos.mjs`, `package.json`, línea en `README.md`). Cruza cada
     manifiesto de `productos/` con el índice del portafolio y el inventario. Lo que comprueba:
     - dueño y composición: propios, componentes y base, sin solaparse;
     - lo que no se negocia: ningún precio sin plan comercial; RPO y RTO desconocidos hasta GATE 3; canal
       externo con C3 y C4; tercero con datos personales con AISIA; ningún agente aprueba;
     - los huecos: ningún null callado, una sección que no aplica con su motivo, lo que no cupo escrito.

     Siembra 26 defectos sobre el manifiesto de referencia y cae en rojo si alguno no muerde. Una fila del
     índice sin manifiesto se lista como **pendiente** y no pone el gate en rojo. **Es alta, no baja**: no se
     apaga ni se edita ningún gate existente. Su `_nota` describe la alta, como las demás del padrón; la firma
     vive en esta entrada.
  2. **Doctrina del índice** (`BUSINESS_LOGIC.md` raíz, solo la cabecera): «qué es un producto» (una fila de la
     tabla; la clase `PRODUCTO` es una pieza vendible; `producto` en el inventario nombra al dueño), con el
     enlace al concepto. **No cambia ninguna fila, ninguna tabla ni la firma del índice**, pero es el
     documento que el laboratorio firmó el 2026-09-30, así que la cabecera nueva necesita su visto bueno.
  3. **Inventario** (`inventario/activos.json`, `INVENTARIO.md` regenerada):
     - la fuente `productos/`;
     - un asiento nuevo, `TPL-productos` (clase `FABRICA`, `blueprint`);
     - el dueño `producto: "ventas-whatsapp"` en `TPL-ventas-whatsapp` y `TPL-feature-ventas-whatsapp`;
     - el campo `producto` dice **dueño** también en el verificador: su comentario en
       `scripts/inventario/nucleo.mjs` y el texto de la sección «Por producto» de la vista
       (`scripts/inventario/vista.mjs`). Sin cambio de conducta: `prueba:inventario` 15/15.

     Ninguna clase se renombra y ningún asiento se borra.
  4. **El concepto y la plantilla** (`productos/CONCEPTO.md`, `productos/PLANTILLA.md` v2, `productos/soporte-sap.json`,
     `productos/ventas-whatsapp.json`): documentos y datos nuevos. No son skill ni prompt. Pasan por este CDC
     porque el gate los lee: cambiar la plantilla cambia lo que el gate exige.
- **Relación con el CDC de la corrida A** (firmado el 2026-10-04, en `.claude/gobernanza/BITACORA-CDC.md`): **va
  aparte y después**. La B lee el campo `producto` del inventario, que **introduce la A**
  (`scripts/inventario/nucleo.mjs`), y alinea su comentario («el producto que vende la pieza») con el concepto
  («el dueño»): punto 3.
- **Motivo**: el DoF de la corrida B pide que el gate nuevo corra en el `validate`, por un gate existente o dado
  de alta en `.claude/gates.json` dentro de su CDC. Ningún gate existente lee manifiestos, así que se dio de alta.
- **Propuesto, NO aplicado** (cada uno con su CDC si el laboratorio lo quiere):
  - que cada fila pendiente del índice gane su manifiesto: hoy 6 de 8 (el gate las lista);
  - que el skill `new-app` genere el manifiesto junto con el contrato: es skill, radio sistema, con diff antes
    del sí;
  - **plantilla v3**: `retencion` y `salida` (portabilidad), que Soporte SAP tiene en D8 y el vendedor en P-07
    y en su baja. Por la regla de entrada debieron entrar en la v2 y no se vieron a tiempo (informe B, §6);
  - **cambiar la regla de entrada** para que entre lo que tienen dos productos aunque no lo tenga la
    referencia. Hoy no se puede: la spec de la corrida B dice que lo que no aparece en Soporte SAP no entra.
- **No se tocaron**: `AGENTS.md`, skills, prompts, `routing-modelos.json`, el modelo, `.mcp.json`, `settings.json`,
  ni el código de ningún producto: el vendedor en WhatsApp se describió sin cambiar una línea de
  `tools/ventas-whatsapp` ni de `src/features/ventas-whatsapp`.
- **Gate aplicado**:
  - diff visible ☐, **se enseña completo antes de pedir la firma**:
    `git diff 5e3be4c..soporte/sap -- .claude/gates.json scripts/verifica-productos.mjs scripts/inventario/ package.json README.md inventario/activos.json BUSINESS_LOGIC.md productos/`;
  - regresión capa A ☑ 147/147;
  - capa B ☑ 22/22 (`regresion -- --trampa`: corpus completo, leído solo el resumen). **Los casos no se corrieron en sesiones frías**: decide el laboratorio si basta la
    capa A (es una alta en el padrón y doctrina del índice, sin skills, prompts ni modelo);
  - aprobación humana ☐;
  - pineo: no aplica (sin modelo, sin imagen, sin dependencias nuevas).
- **Regresión y demostración**:
  - el gate en verde con los dos manifiestos y **26/26 siembras cazadas**: cada defecto tumba su comprobación;
  - **la plantilla cambió y el gate lo nota**: la v2 contra los dos manifiestos en v1 da **9 comprobaciones
    en rojo**. Entre ellas, los 4 nulls callados del vendedor que la v1 dejaba en verde;
  - `verifica:gates` ☑: sin archivos de prueba huérfanos, y el gate nuevo está en el padrón y en la
    documentación;
  - `verifica:inventario` ☑ 243 unidades, 0 nuevas, 0 huérfanas, 0 ambiguas;
  - `npm run validate` ☑ tras el último commit de esta propuesta: la cifra va en la entrada que se firma.
- **Aprobado por**: _(en blanco: lo escribe el laboratorio)_
