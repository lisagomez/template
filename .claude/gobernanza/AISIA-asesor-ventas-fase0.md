# AISIA — Asesor de estrategia de ventas por voz (Fase 0: sin LLM)
> Fecha: 2026-09-20 · Estado: **firmada** · Revisión: al añadir cualquier
> modelo de lenguaje (Fase 4), al registrar voces de terceros, al conectar un CRM o un canal
> externo (llamadas en vivo, Zoom/Meet), o tras un incidente.

Control **C4** de `GOBERNANZA.md`. La pregunta: *¿a quién podemos dañar sin que nadie nos
ataque?* El sistema procesa **las palabras de un tercero** (el prospecto) aunque no llame a
ningún modelo alojado: por eso existe esta evaluación aunque la Fase 0 sea «solo reglas».
La redactó el agente como borrador y la firmó quien decide, en sesión, el 2026-09-20; **la firma es humana y ningún agente la fabrica.**

## 1. Partes afectadas

- **El prospecto o cliente** (no es usuario, no firmó nada): sus palabras, su nombre y cargo,
  sus dolores, su presupuesto y su proceso de decisión quedan transcritos y analizados.
- **La empresa del prospecto**: información comercial que no sabía que se registraba.
- **El vendedor** (usuario): su voz, sus dictados, sus reuniones y un puntaje sobre su trabajo.
- **Quien decide el producto**: opera un sistema que orienta ventas con reglas que puede no
  entender por completo.
- **Terceros mencionados** en la conversación (colegas, competidores) que no estaban presentes.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Orientar mal una venta** | Un insight se atribuye al hablante equivocado (diarización), o una regla detecta «objeción» donde había una broma. El vendedor actúa sobre eso. |
| **Puntaje injusto al vendedor** | Un error de transcripción o un turno inaudible baja el puntaje; si un jefe lo mira, el vendedor paga un error del motor. |
| **Registro de un tercero sin su conocimiento** | El prospecto no sabe que la reunión se transcribe y analiza. En llamadas, además, puede haber obligación legal de aviso. |
| **Fuga por compartir el acta** | El acta lleva el presupuesto y los dolores del prospecto; se reenvía por correo sin pensarlo. |
| **Retención sin fin** | Historial y actas se quedan en la máquina para siempre, aunque el trato murió. |
| **Sesgo de las reglas** | Los playbooks premian un estilo de descubrimiento; un vendedor con otro estilo eficaz sale mal puntuado. |
| **Falsa seguridad** | «Local y privado» se lee como «sin riesgo»; nadie cuida la máquina donde vive todo. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Orientar mal una venta | Media | Media (WER 3,3 % limpio; con ruido sin medir) | Sí: el vendedor corrige el acta |
| Puntaje injusto | Media | Media | Sí, si el puntaje nunca se muestra sin desglose ni se usa para evaluar personas |
| Registro sin conocimiento del prospecto | **Alta** | Alta si no hay aviso | **No**: lo dicho ya está transcrito |
| Fuga por compartir el acta | **Alta** | Media | **No** |
| Retención sin fin | Media | Alta sin política | Sí: borrado |
| Sesgo de las reglas | Baja-media | Media | Sí: ajustar playbooks con bitácora |
| Falsa seguridad | Media | Media | Parcial |

## 4. Mitigaciones

- **Aviso y consentimiento**: el vendedor informa al prospecto de que la reunión se transcribe
  localmente; en llamadas, aviso al inicio. El laboratorio y el producto lo recuerdan en la
  interfaz. Sin consentimiento, no se graba a terceros (regla ya vigente en el piloto).
- **Evidencia obligatoria**: ningún hallazgo sin su cita; el puntaje nunca sin desglose; los
  turnos inaudibles se marcan y nunca se adivinan (regla de oro del motor, ya en código).
- **El puntaje no evalúa personas**: es una guía para la siguiente pregunta, no una métrica de
  desempeño. Se escribe así en el producto y en el contrato con el cliente.
- **Nada sale de la máquina**: audio a temporal borrado; sin modelo alojado; el servicio
  remoto solo en VPS propio con token y TLS (C3). Un modelo de lenguaje exige AISIA propia,
  seudonimización o pesos auto-hospedados (Fase 4).
- **Retención**: audio cero; texto y actas borrables por el vendedor y con caducidad por
  defecto **12 meses**; `historial --borra` (Etapa 2).
- **Vía de apelación**: el vendedor edita transcripción, acta y acciones; puede descartar un
  análisis; sus correcciones alimentan el diccionario y sirven para revisar reglas.
- **Compartir con cuidado**: el acta exportada lleva encabezado de confidencialidad y no se
  envía automáticamente a nadie (toda acción irreversible es gate humano).
- **Voces de terceros**: no se registran (biométrico); solo la voz del propio asesor, y a
  petición. Reabrir esta decisión exige revisar esta AISIA.

## 5. Decisión

**Mitigar y seguir en Fase 0-1 (reglas, local, piloto interno con grabaciones propias o con
consentimiento escrito).** Pasar a Fase 3 (CRM con datos de prospectos reales) o Fase 4 (LLM)
exige revisar este documento y firmarlo de nuevo.

Firmada por: **lisagomez**  Rol: responsable del proyecto  Fecha: 2026-09-20
