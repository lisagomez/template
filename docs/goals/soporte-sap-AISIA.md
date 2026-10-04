# AISIA — Soporte SAP (borrador v2)

> Fecha: 2026-10-04 · Estado: **borrador, fuera del registro** (no es una entrada de
> `.claude/gobernanza/`; al firmarla, el laboratorio la pega donde corresponda) · Revisión: al
> conectar un LLM real, al exponer la sala o el canal N1–N2, al cablear la aplicación de una
> solución en un SAP real, o tras un incidente.
>
> **v2**: corregida tras la revisión de un agente distinto del que la escribió, que encontró la
> falta de una vía de apelación, daños sin atacante no listados, calibraciones mal hechas y riesgos
> infirmables tratados como firmables. Plantilla: `.claude/gobernanza/plantillas/aisia.md`. Su
> hermano, el modelo de amenazas (C3), está en `.claude/PRPs/PRP-008-soporte-sap.md`.

## 1. Partes afectadas

- **Las empresas atendidas (N3)**: sus incidencias, documentos y datos de operación pasan por un
  sistema que categoriza, propone y mide. Nunca hablaron con el laboratorio.
- **Las personas dentro de los N3**: empleados cuyos datos de RR. HH., nómina o usuario SAP aparecen
  en un ticket o en una captura. No son usuarios de nada y no firmaron nada.
- **Las contrapartes de un CFDI**: proveedores y clientes del N3, a veces personas físicas, cuyo RFC
  y montos viajan en el XML adjunto.
- **Las consultoras (N2)**: el cliente que paga. Su reputación frente a sus clientes depende de lo
  que el sistema proponga y de lo que su tablero afirme.
- **Los consultores**: sus horas y su desempeño quedan medidos. Su empleador, la consultora, es
  quien los juzga.
- **El laboratorio (N1)**: aprueba sobre la operación de terceros y acumula conocimiento que nace
  de sus datos.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Dato personal en el sandbox** | El anonimizador no reconoce una forma de dato y el caso entra al sandbox común. |
| **Secreto del N3 en el núcleo** | Anonimizar quita datos personales, no las transacciones Z, las sociedades ni la forma del negocio del N3; una regla común los revela a las demás consultoras. |
| **Prioridad mal asignada** | Una incidencia de nómina se categoriza P3 en vez de P1: se atiende a destiempo y los empleados se quedan sin pago. |
| **Solución equivocada aprobada** | La matriz da una solución con grado alto para un caso parecido pero distinto; el supervisor la valida y el humano aprueba por fatiga. En el simulador, el daño es al simulador; en un SAP real sería un cambio de datos que **no** se revierte con un transporte. |
| **Conocimiento de una consultora usado para otra** | Lo aprendido con los datos de A se vuelve regla común y beneficia a su competidora B sin que A ni su cliente lo sepan (D1). |
| **El laboratorio lee lo que no necesita** | Operando como se diseñó, el laboratorio lee el texto de lo escalado, y en él hay datos personales (D14). |
| **FODA o accionable que afirma de más** | El tablero del N3 dice una debilidad o un impacto en MXN con pocos datos, y la consultora lo presenta como un hecho. |
| **Proyección tomada por promesa** | Un impacto en MXN con supuestos del laboratorio se lee como un compromiso. |
| **SLA mal medido** | El reloj no pausa una espera del cliente, o cuenta horas fuera del calendario: la consultora paga créditos que no debía, o el N3 no recibe los que le tocaban. |
| **Consultor juzgado por una métrica** | MTTR o primera respuesta sin contexto castigan a quien toma los casos difíciles; el seudónimo no lo protege de su propio empleador. |
| **Corte por presupuesto** | El presupuesto es fail-closed: sin fila o al tope, el agente no llama al modelo y el triage de una consultora se detiene. |
| **Restauración que toca a los demás** | Para devolver a un tenant a su estado se restaura la base entera, y los demás regresan en el tiempo. |
| **Opacidad** | El N3 no sabe que el laboratorio lee lo que su consultora escala, ni que un agente categoriza sus tickets. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Dato personal en el sandbox | **Alta** | Media | **No**: una vez leído no se des-lee |
| Secreto del N3 en el núcleo | Alta | Media | No |
| Prioridad mal asignada | Alta (pagos, operación) | Media | Parcial: el retraso ya ocurrió |
| Solución equivocada aprobada | Alta en un SAP real · baja en el simulador | Media | En el simulador, sí; en un SAP real, **no** |
| Conocimiento cruzado entre consultoras | Media-alta | Alta si D1 no se decide | No |
| El laboratorio lee lo que no necesita | Media | Alta (es el diseño) | No |
| FODA o accionable que afirma de más | Media | Media | Sí, si cada punto cita su dato |
| Proyección tomada por promesa | Media | Alta | Sí |
| SLA mal medido | Media (dinero) | Baja-media | Sí, si fecha y actor de cada evento los da la base |
| Consultor juzgado por una métrica | Media | Media | Sí |
| Corte por presupuesto | Media-alta | **Media**: el fail-closed es el valor por defecto | Sí |
| Restauración que toca a los demás | Alta | Baja con export por tenant | No, si se restaura la base entera |
| Opacidad | Media | Alta | Sí |

## 4. Mitigaciones

- **Dato personal**: anonimizador **fail-closed**. Lo que no se resuelve con certeza va a
  cuarentena, que guarda solo tipos de señal y **no frena la atención**: el caso sigue en
  producción con su consultora y su reloj de SLA; solo no entra al sandbox. Se mide con un corpus
  sembrado (0 fugas como referencia). El anonimizador lo revisa un agente distinto, y eso **no
  basta** para un riesgo infirmable: antes de salir del laboratorio se mide sobre un corpus real
  con consentimiento (D9), con revisión humana.
- **Secreto del N3**: lo que va al núcleo se **generaliza** además de anonimizarse (transacciones Z,
  sociedades, nombres de objetos propios). El experto lo marca como general y lo firma el
  superadministrador (D2).
- **Prioridad**: la regla de prioridad es determinista y visible. El N3 puede **impugnarla**
  (`ss_impugnacion`), y la impugnación la resuelve su consultora a su nombre. Un ticket con señales
  de nómina o RR. HH. no puede quedar debajo de P2 sin que un humano lo baje.
- **Solución equivocada**: el veredicto lo da el motor determinista con su fuente; el supervisor no
  es el ejecutor; el humano ve el antes y el después en el simulador. La aplicación en un SAP real
  **no está cableada** (D6): cuando lo esté, será por acción, con gate humano, y solo sobre lo que
  se pueda revertir.
- **Conocimiento cruzado**: aislado por consultora por defecto. A la matriz común solo pasa lo que el
  experto marca como general, generalizado y anonimizado. El registro FDE dice qué fue a medida y
  qué al núcleo. D1 exige **consentimiento por contrato** de la consultora y de su cliente, no solo
  una decisión del laboratorio.
- **Lo que lee el laboratorio**: solo lo **escalado** por la consultora, y los originales con un
  acceso que **otorga la consultora** por 72 h como máximo (probado en `pruebas/aislamiento.ts`).
- **FODA, accionables y proyecciones**: cada punto cita su métrica del corte semántico; cada impacto
  muestra su fórmula, sus supuestos y su rango; la pantalla dice que una proyección no es una
  promesa; la confianza baja cuando hay pocos datos.
- **SLA**: el reloj se prueba en sus bordes; la fecha y el actor de cada evento los da la base, así
  que recalcular desde los eventos no arrastra un error de quien escribió; las cifras del contrato
  las decide el laboratorio (D13).
- **Consultores**: las métricas se muestran por categoría y complejidad, no como ranking de
  personas. El producto **no ofrece** una vista de desempeño individual: el seudónimo no protege de
  quien tiene la llave.
- **Corte por presupuesto**: criterio explícito. El triage de P1 y P2 **nunca** se corta: al tope
  pasa a manos humanas con aviso a la consultora y al laboratorio; P3 y P4 esperan con aviso.
- **Restauración**: export y restauración **por tenant**, con conteos y cadena del tenant restaurado
  y de los demás (§13 del SDD).
- **Opacidad**: el contrato N2–N3 dice que un agente categoriza y que el laboratorio ve lo escalado;
  el aviso de privacidad hacia los empleados es del N3 (responsable de esos datos) y el contrato se
  lo exige.

## 5. Decisión

**Mitigar** y operar **solo en laboratorio**.

Hay riesgos que **ninguna firma autoriza**, porque el daño cae sobre quien no firmó (límite de C5):

- el dato personal de los empleados y de las contrapartes;
- una solución mal aplicada en el SAP de un N3;
- el conocimiento de una consultora usado para otra;
- el corte del triage urgente.

Para esos, firmar esta AISIA no basta: o el control los cierra o el producto no los ofrece.

Para salir del laboratorio hacen falta:

- D1 (con consentimiento contractual), D3, D6, D7, D8, D10, D12 y D14 decididas;
- el anonimizador medido sobre un corpus real con consentimiento (D9);
- C3 y esta AISIA firmadas;
- GATE 3 cerrado si el laboratorio opera el servicio (D3).

Firmada por: ____________  Rol: ____________  Fecha: ____________
