# Propuesta de entrada para `BITACORA-CDC.md` — para firma

> Redactada FUERA del registro (lección del 2026-09-20: una entrada «pendiente» dentro de la bitácora
> tumba el gate). Al firmar, se pega en la bitácora con la firma y este archivo se borra.

### 2026-09-26 — pymes, contenido y marketing: prompts de un redactor con LLM + 2 clases de tarea en el routing → CDC PROPUESTO — radio: producto (paquete `@tu-scope/pymes-marketing`) y routing (C8)
- **Cambio**:
  1. **Prompts nuevos** en `tools/pymes-marketing/src/redactor-openai-compat.ts` (`INSTRUCCIONES` por tarea y
     `sistema()`): lo que recibiría un LLM para redactar publicaciones, respuestas a reseñas y anuncios.
     Llevan la voz del dueño, lo que nunca dice, «usa solo los hechos dados; no inventes precios, cifras,
     premios ni promesas», y el texto de terceros **delimitado** con la orden de no obedecerlo. `promptsDe()`
     los expone sin llamar al modelo, para revisarlos.
  2. **Plantillas** del redactor de serie (`src/comun/redactor-plantillas.ts`): textos en español de México
     para publicación, estado de WhatsApp, respuesta a reseña (<60 palabras) y anuncio.
  3. **`.claude/routing-modelos.json`**: +2 clases de tarea, `redaccion-de-marketing` y `respuesta-a-resenas`,
     ambas al nivel `capaz` ya pineado (`anthropic/claude-sonnet-5`). **Ningún modelo nuevo.**
- **Motivo**: el goal `pymes-marketing` (primera familia del plugin `small-business`, CDC firmado el
  2026-09-26). Sin clase asignada, la redacción heredaría el default caro en silencio (C8).
- **Estado del LLM**: **no se usa en producción**. En esta máquina no hay `OPENROUTER_API_KEY`; el laboratorio
  lo deja «no medido» (caso llm-5) y la app solo usa las plantillas. El cableado de costo se probó con un
  proveedor SIMULADO: US$0.002584 por redacción (812 + 96 tokens) con el precio pineado; costo `null` cuando el
  proveedor no reporta uso.
- **Gate aplicado**: diff revisado ☐ (enseñar antes de firmar) · regresión verde ☑ capa A 123/123 ·
  `verifica:routing` ☑ · laboratorio ☑ 45 casos (44 pasan, 1 no medido declarado) · aprobación humana ☐ ·
  pineo ☑ (sin modelo nuevo). **Capa B no corrida**: propuesta de declararla «capa A basta» porque no cambia
  ningún skill ni prompt del arnés; decide quien firma.
- **Aprobado por**: _(firma)_

**Lo que activar el LLM exigiría después (otro CDC):** llave en el entorno del servidor, una corrida real
medida con su costo en la contabilidad, y que el caso llm-5 pase a «pasa».
