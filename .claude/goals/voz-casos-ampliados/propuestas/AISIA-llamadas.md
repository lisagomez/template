# AISIA — Llamadas en vivo a dos canales (caso 19, control C4)

> Fecha: 2026-09-20 · Estado: borrador para firma · Revisión: al escribir el ayudante de Windows,
> al añadir un modelo de lenguaje al análisis, o tras un incidente.
> Hermana del modelo de amenazas (`modelo-amenazas-llamadas.md`): aquel cubre al atacante; este
> cubre el sistema funcionando bien.

## 1. Partes afectadas

- **El interlocutor de la llamada** (prospecto, cliente, proveedor). No es usuario, no firmó, y
  a veces no sabe que hay una máquina oyendo. Es la parte que más pierde y menos decide.
- **Terceros mencionados** durante la llamada: la directora financiera, el colega, el
  competidor. Sus nombres y decisiones acaban en un acta que no pidieron.
- **El vendedor.** Recibe un puntaje y unos huecos; su jefe puede leerlos. La herramienta que
  lo ayuda también lo evalúa.
- **La empresa del vendedor.** Responsable del tratamiento; en varias jurisdicciones, grabar sin
  aviso es ilícito.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Grabar a quien no consintió** | El ayudante captura los dos canales y la ley del lugar exige consentimiento de las dos partes. Todo funcionó; el delito es la función. |
| **Insight equivocado con consecuencias** | El asesor por reglas cita «ya tiene presupuesto de ochenta mil» porque la frase apareció; el interlocutor lo dijo de otro cliente. El vendedor actúa sobre eso. |
| **Evaluar al vendedor sin que lo sepa** | El score existe para ayudarlo; se usa para despedirlo. |
| **Retención de palabras ajenas** | El acta (texto) se guarda con los 365 días del dictado; las palabras del interlocutor no tenían ese plazo. |
| **Terceros mencionados** | «Carla firma el contrato» queda escrito y exportado. Carla no estuvo en la llamada. |
| **Exclusión** | El asesor tiene guía solo de ventas y en español; una llamada en otro idioma o de soporte técnico sale mal medida y nadie lo ve. |
| **Opacidad** | El interlocutor no sabe que hay análisis en vivo; el vendedor no sabe que el análisis es por reglas y no «inteligencia». |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Grabar sin consentimiento | **Alta** (legal, a un tercero) | **Alta** sin aviso obligatorio | **No** |
| Insight equivocado | Media | Media (reglas sin contexto) | Sí, si el vendedor verifica |
| Evaluar al vendedor | Alta | Alta | Parcial |
| Retención de palabras ajenas | Alta | Alta con el defecto actual | Sí, borrando |
| Terceros mencionados | Media | Alta | Parcial |
| Exclusión | Media | Media | Sí |
| Opacidad | Media | Alta | Sí |

## 4. Mitigaciones

- **Consentimiento según jurisdicción, no según comodidad.** Antes de capturar, el sistema exige
  declarar el país/estado de las dos partes; en «dos partes» (varios estados de EE. UU., varios
  países europeos) se reproduce el aviso hablado (`aviso-legal-grabacion.md`) y la captura no
  empieza hasta que el interlocutor asiente de viva voz (o se cancela). En «una parte», el aviso
  igual se recomienda y queda registrado que se dio o no.
- **Indicador que no se oculta y tecla de corte** (del modelo de amenazas).
- **Retención propia del caso**: el acta de una llamada se guarda con plazo corto y declarado
  (propuesta: 30 días, borrable a mano antes), distinto de los 365 del dictado; el audio nunca.
- **Terceros mencionados**: el acta exportable marca nombres propios y ofrece taparlos antes de
  exportar; nunca se registra la voz de nadie (biométrico de tercero: sin firma posible).
- **El vendedor sabe**: la pantalla dice «análisis por reglas, cita evidencia, puede equivocarse»
  y el score no se envía a nadie sin acción explícita del vendedor.
- **Apelación**: el interlocutor puede pedir el borrado del acta; el vendedor puede impugnar
  un insight con un clic que lo marca como erróneo (y alimenta la regresión del asesor).
- **Lo que no se hará**: capturar sin aviso; LLM sobre las palabras del interlocutor sin AISIA
  de Fase 4 y seudonimización o pesos propios; enviar audio fuera de la máquina.

## 5. Decisión

**No ofrecer hasta que exista el ayudante de Windows verificado por hash, este documento y el
modelo de amenazas estén firmados, y el aviso legal haya pasado revisión jurídica humana.**
Mientras tanto, el caso 19 del laboratorio sigue en PUERTA HUMANA, con la alternativa honesta
(grabar con consentimiento y subir el archivo a la Sala 2) y el spike con audio propio como
única prueba técnica. Justificación: la parte que más pierde no firma; C5 no alcanza.

Firmada por: ____________  Rol: ____________  Fecha: ____________
