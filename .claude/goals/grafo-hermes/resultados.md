# Resultados — el grafo de Hermes frente al de template (2026-09-26)

Medido sobre `hermes-os-a2a@97d9f9e`. Clon de solo lectura en el scratchpad; nada se escribió en Hermes.

| Qué | Resultado |
|---|---|
| Pruebas del grafo de Hermes corridas aquí | 132 + 17 (puente A2A) + 10 (puerta pública) = **159 en verde** |
| Gate de procedencia | OK: 98 reglas, 101 impactos, 61 categorías |
| Reglas por ámbito (JSON = SQL generado) | CO fiscal 3 · MX contable 4 · contractual 6 · datos-personales 4 · fiscal 11 · regulatorio 70 |
| Spec 004 frente a Hermes | 6 cumple · 4 parcial · 1 contradice a propósito (RF-5) · 1 no aplica (RF-11) |
| Incidentes | drones: consta (`86ee4dc`) · motor caído: consta (`negocio/AGENTS.md:143-150`) · «incidente de conflicto»: **no consta**, spec corregida |
| Huecos del origen, medidos | conflicto vivo que pasa el gate (INTERESES) · vocabulario de veredicto global · bajas que borran el pasado (hecho de 2024 sin regla) |
| Recomendación | **D**: motor portado a `tools/`, conocimiento como dato pineado y corpus de paridad |

Entregables:
- `docs/SDD-grafo-hermes-a-template.md`: el expediente;
- `.claude/PRPs/PRP-005-grafo-de-conocimiento-al-golden-path.md`: PROPUESTO, NO APROBADO;
- `.claude/specs/004-grafo-de-conocimiento/`: TAR-1 cerrada, dos dudas contrastadas, una duda
  nueva (la cita), la nota de RF-8 corregida.
