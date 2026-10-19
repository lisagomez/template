# Propuesta de CDC (C8): una clase de routing para el juez del asistente de la clínica

> **PROPUESTA fuera de la bitácora, sin firmar.** Es el bloqueo del goal `clinica-dental-whatsapp` para un segundo
> juez del lado del producto: el goal tiene prohibido tocar `.claude/`, y la clase vive ahí. Al firmar, el laboratorio
> aplica el diff, pega la entrada en la bitácora con su firma y borra este archivo; el agente no escribe la firma.
>
> **aprobación humana ☐** · **Aprobado por**: pendiente

### 2026-10-19 — routing: clase `juez-asistente-paciente` — radio: control de gobierno (routing de modelos)

- **Cambio** en `.claude/routing-modelos.json`:
  ```diff
   "tareas": {
     …
  +  "juez-asistente-paciente": "razonamiento",
     …
   },
   "no_se_abaratan": {
  -  "clases": ["decision-de-gobernanza", "caso-trampa-capa-b", "incidente", "prp-o-spec", "agente-sgi-evaluacion"]
  +  "clases": ["decision-de-gobernanza", "caso-trampa-capa-b", "incidente", "prp-o-spec", "agente-sgi-evaluacion", "juez-asistente-paciente"]
   }
  ```
- **Para qué**: el spec pide que las respuestas que la regex marque como fallo las revise «un segundo juez
  independiente». Hoy ese juez es un subagente del arnés (otro modelo, ciego a la regex): independiente de quien mide,
  pero no del arnés. Con la clase, un guion del producto le pasaría `para-el-juez.json` a un modelo por OpenRouter, con
  su gasto en el libro y su modelo pineado, en cada medición.
- **Lo que decide el laboratorio al firmar**: si el juez usa el modelo del nivel (`anthropic/claude-opus-5`, de la misma
  familia que el asistente) o su alternativa abierta (`moonshotai/kimi-k3`, otra familia: más independiente, y los datos
  que vería son sintéticos). Va en «no se abaratan» porque un juez más débil da un verde que no significa nada.
- **Sin cambios**: el asistente, su clase `asistente-paciente` y su modelo pineado.
- **Gate aplicado**: diff revisado ☐ · `verifica:routing` dentro del `validate` ☐ · aprobación humana ☐.
- **Aprobado por**: pendiente
