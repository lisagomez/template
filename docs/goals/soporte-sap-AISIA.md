# AISIA — Soporte SAP (borrador)

> Fecha: 2026-10-04 · Estado: **borrador, fuera del registro** (no es una entrada de
> `.claude/gobernanza/`; al firmarla, el laboratorio la pega donde corresponda) · Revisión: al
> conectar un LLM real, al exponer la sala o el canal N1–N2, al cablear la aplicación de una
> solución en un SAP real, o tras un incidente.
>
> Plantilla: `.claude/gobernanza/plantillas/aisia.md`. Su hermano, el modelo de amenazas (C3),
> está en `.claude/PRPs/PRP-008-soporte-sap.md` §Gobernanza.

## 1. Partes afectadas

- **Las empresas atendidas (N3)**: sus incidencias, documentos y datos de operación pasan por un
  sistema que categoriza, propone y mide; nunca hablaron con el laboratorio.
- **Las personas dentro de los N3**: empleados cuyos datos de RR. HH., nómina o usuario SAP
  aparecen en un ticket o en una captura. No son usuarios de nada y no firmaron nada.
- **Las consultoras (N2)**: el cliente que paga; su reputación frente a sus clientes depende de lo
  que el sistema proponga y de lo que su tablero afirme.
- **Los consultores**: sus horas y su desempeño quedan medidos; una métrica mal definida los
  juzga mal.
- **El laboratorio (N1)**: aprueba sobre la operación de terceros y acumula conocimiento que nace
  de sus datos.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Dato personal en el sandbox** | El anonimizador no reconoce una forma de dato (un número de personal con otro formato, un nombre poco común) y el caso entra al sandbox común. |
| **Solución equivocada aprobada** | La matriz da una solución con grado alto para una incidencia que se parece pero no es la misma; el supervisor la valida y el humano aprueba por fatiga. En el laboratorio el daño es al simulador; en un SAP real sería a la operación del N3. |
| **Conocimiento de una consultora usado para otra** | Lo aprendido con los datos de la consultora A se vuelve regla común y beneficia a su competidora B sin que A lo sepa (D1). |
| **FODA o accionable que afirma de más** | El tablero del N3 dice una debilidad o un impacto en MXN con datos escasos; la consultora lo presenta como hecho. |
| **Proyección tomada por promesa** | Un impacto en MXN con supuestos del laboratorio se lee como compromiso. |
| **SLA mal medido** | El reloj no pausa una espera del cliente o cuenta horas fuera del calendario: la consultora paga créditos que no debía, o el N3 no recibe los que le tocaban. |
| **Consultor juzgado por una métrica** | MTTR o primera respuesta sin contexto de complejidad castiga a quien toma los casos difíciles. |
| **Corte de servicio por presupuesto** | Al 100 % del presupuesto se apaga el agente para una consultora y sus clientes se quedan sin triage. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Dato personal en el sandbox | **Alta** | Media | **No**: una vez leído no se des-lee |
| Solución equivocada aprobada | Alta en un SAP real · baja en el simulador | Media | En el simulador sí; en un SAP real depende del transporte |
| Conocimiento cruzado entre consultoras | Media-alta | Alta si no se decide D1 | No (el conocimiento ya se usó) |
| FODA o accionable que afirma de más | Media | Media | Sí, si cada punto cita su dato |
| Proyección tomada por promesa | Media | Alta | Sí |
| SLA mal medido | Media (dinero) | Baja-media | Sí, recalculando desde los eventos |
| Consultor juzgado por una métrica | Media | Media | Sí |
| Corte por presupuesto | Media-alta | Baja | Sí |

## 4. Mitigaciones

- **Dato personal**: anonimizador **fail-closed** (lo que no se resuelve con certeza va a
  cuarentena, que guarda solo tipos de señal), medido con un corpus con datos sembrados y 0 fugas
  como referencia, y revisado por un agente distinto del que lo escribió. Los datos de terceros no
  son firmables (límite de C5): si un caso no se puede anonimizar, no entra.
- **Solución equivocada**: el veredicto lo da el motor determinista con su fuente; el supervisor no
  es el ejecutor; el humano ve el antes y el después en el simulador; la aplicación en un SAP real
  no está cableada (D6) y cuando lo esté será por acción, con gate humano.
- **Conocimiento cruzado**: por defecto aislado por consultora; a la matriz común solo pasa lo que
  el experto marca como general y está anonimizado; el registro FDE dice qué fue a medida y qué al
  núcleo (D1).
- **FODA, accionables y proyecciones**: cada punto cita su métrica del corte semántico; cada
  impacto muestra fórmula, supuestos y rango; la pantalla dice que una proyección no es una
  promesa; la confianza baja cuando hay pocos datos.
- **SLA**: el reloj se prueba en sus bordes; el cumplimiento se recalcula desde los eventos con
  traza; las cifras del contrato las decide el laboratorio (D13).
- **Consultores**: las métricas se muestran por complejidad y categoría, no como ranking de
  personas; el asignado es un seudónimo.
- **Presupuesto**: el aviso al 80 % avisa; cortar al 100 % es una decisión explícita de la app,
  no un efecto del módulo.

## 5. Decisión

**Mitigar** y operar solo en laboratorio. Para salir del laboratorio hacen falta: D1, D3, D7 y
D14 decididas; el anonimizador medido sobre un corpus real con consentimiento (D9); C3 y esta
AISIA firmadas; GATE 3 cerrado si el laboratorio opera el servicio (D3).

Firmada por: ____________  Rol: ____________  Fecha: ____________
