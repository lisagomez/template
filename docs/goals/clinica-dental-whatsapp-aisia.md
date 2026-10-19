# AISIA, revisión 1: el canal de WhatsApp del portal del paciente

> Fecha: 2026-10-19 · Estado: **PROPUESTA, sin firmar** · Revisión: antes de cualquier número real, al cambiar las
> plantillas, los Flows o los textos fijos del canal, al cambiar el modelo o el prompt del asistente, o tras un incidente.
>
> Control **C4**, sobre la plantilla `.claude/gobernanza/plantillas/aisia.md`. Revisa la AISIA firmada del portal
> (`docs/goals/clinica-dental-aisia.md`, 2026-10-16), que **no se edita**: sus daños y mitigaciones siguen; aquí van
> los que agrega WhatsApp. Goal `docs/goals/clinica-dental-whatsapp.md`. Modelo de amenazas:
> `docs/goals/clinica-dental-whatsapp-c3.md`. **Alcance: solo laboratorio**, simulador de Meta, datos sintéticos.
>
> **aprobación humana ☐** · **Aprobado por**: pendiente

## 1. Partes afectadas (las nuevas)

- **El paciente que vincula su WhatsApp**: recibe avisos, confirma o mueve su cita, pregunta por escrito o por nota de
  voz. Lo que escribe y dice lo ve Meta (la Cloud API descifra y guarda hasta 30 días).
- **Quien recibiría un mensaje por error**: el dueño de un celular mal escrito en un registro, o de un número que
  alguien intenta vincular con un código reenviado.
- **Quien escribe al número de la clínica sin cuenta**: pregunta precios u horarios; a veces, síntomas.
- **La recepción de la clínica**: comparte el número (coexistencia) y toma los chats que el asistente le pasa.
- **La familia que comparte un teléfono** (la madre que agenda por sus hijos): hoy, una persona por número por clínica.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Un recordatorio a quien no es** | Si el sistema le escribiera al celular del registro, un dígito mal puesto le diría a un desconocido que alguien va al dentista. |
| **Una urgencia que llega por WhatsApp y se pierde** | La persona contesta un recordatorio con síntomas; si el chat lo tiene la recepción y nadie lo ve fuera de horario, nadie deriva. |
| **Una nota de voz mal entendida** | El ASR transcribe mal una señal de alarma y la regla no la ve; o no entiende nada y la persona no sabe qué pasó. |
| **Un diagnóstico de facto por foto** | La persona manda la foto de su muela y espera que le digan qué tiene. |
| **Una cita movida sin querer** | Un botón o un formulario mal entendido cancela o mueve una cita. |
| **El recordatorio que no llega** | El número de la clínica se desconecta, Meta pausa la plantilla, el número de la persona ya no tiene WhatsApp. |
| **Costos de más** | Meta recategoriza un recordatorio a marketing (US$0.0397 contra US$0.0085) o se responde con plantilla lo que podía ir como servicio. |
| **Opacidad** | La persona cree que le contesta alguien de la recepción y no un asistente automático. |
| **Exclusión** | Quien no tiene WhatsApp, quien no puede usar el portal para vincularlo, la familia que comparte un número. |
| **Dato de salud hacia Meta** | Lo que la persona escribe en su chat (un síntoma, el nombre de un tratamiento) queda en los servidores de Meta hasta 30 días. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Recordatorio a quien no es | Alta (dato de salud de un tercero) | **Nula por construcción**: nunca se escribe al celular del registro; solo a un número que probó serlo (probado) | No |
| Urgencia por WhatsApp que se pierde | **Muy alta** | Baja: la regla contesta SIEMPRE, aunque el chat lo tenga la recepción (probado y en el recorrido) | No |
| Nota de voz mal entendida | Media-alta | Baja con voces sintéticas: por WhatsApp, 540/540 tomas de las 12 urgencias por regla (180/180 en una condición no vista); el portal en vivo, 537/540. Voces reales, no medidas | Parcial |
| Diagnóstico por foto | Alta | **Nula por construcción**: la foto no se baja ni va al LLM; respuesta fija | Sí |
| Cita movida sin querer | Media | Baja: solo con un Flow que la persona llena y confirma (cancelar pide la casilla); el asistente no tiene manos | Parcial (el hueco se puede perder) |
| Recordatorio que no llega | Media | Media | No para esa cita |
| Costos de más | Baja | Media | Sí |
| Opacidad | Media | Baja: el asistente se presenta en el primer mensaje de cada chat | Sí |
| Exclusión | Media | Media | Sí, pero invisible |
| Dato de salud hacia Meta | Alta | Media (lo decide lo que la persona escribe) | **No**: lo que salió, salió |

## 4. Mitigaciones

- **Vinculación que prueba el número**: código de un solo uso que tiene que llegar DESDE el número, y confirmación desde la
  cuenta; si no es el celular del registro, la persona escribe los 4 últimos dígitos que ella sabe (no se le muestran).
  Hasta entonces no sale nada hacia ese número salvo «confirma en el portal».
- **Urgencias por regla antes que todo** en todo lo que entra: texto, pie de foto y nota de voz transcrita; se contesta
  aunque la recepción tenga el chat. Una nota de voz que no se entiende recibe «escríbelo; si es urgente, llama al 911».
  La voz (nota de WhatsApp o turno del portal) se lee con **dos motores de ASR** y las reglas miran las lecturas y su
  corrección hacia las palabras de alarma; una señal de alarma que ninguna regla específica reconoce dispara **U7**, que
  manda PRIMERO un aviso fijo con el 911 y la clínica, por regla y sin LLM (reporte §3.3c).
- **Foto**: respuesta fija, sin bajarla ni guardarla, que invita a una valoración.
- **Sin manos**: el asistente manda un Flow; la persona elige y confirma. Cancelar pide la casilla «Sí, quiero cancelar
  esta cita». A menos de 24 h, nada se mueve por chat: «No podré ir» pasa a la recepción.
- **Respaldo**: el aviso que WhatsApp no puede entregar sale por correo en la misma corrida; la clínica recibe alerta.
- **Costos**: dentro de la ventana de 24 h el aviso va como mensaje de servicio (cupo gratis); las plantillas son
  utility sin promociones; una recategorización a marketing levanta alerta grave.
- **Opacidad**: el asistente se presenta como automático la primera vez y dice cómo pasar con una persona.
- **Minimización hacia Meta**: las plantillas llevan nombre de pila, clínica y fecha, nunca el servicio; el historial del
  asistente vive 30 min en memoria y nunca en disco; el libro no lleva el número; la cola se compacta.
- **Baja**: «BAJA» por WhatsApp o «Desvincular» en el portal retiran el consentimiento y desvinculan (Meta exige respetar
  la baja venga por donde venga).
- **Exclusión**: WhatsApp es opcional y el correo sigue; **falta**: varias personas por número (la familia).

**Lo medido (2026-10-19, solo datos sintéticos; detalle en `clinica-dental-whatsapp-reporte.md` §3)**: el corpus de 58
preguntas por el canal (webhook simulado → receptor → asistente → teléfono) con el LLM real, los casos propios del canal
y el recorrido en el navegador. **Lo que esto NO mide**: personas reales (lenguaje, voces, acentos, ruido), Meta real
(entrega, lectura, calidad del número, recategorización), la recepción real (12 h de silencio).

## 5. Decisión

**Mitigar, y no conectar un número real todavía.** El canal opera solo contra el simulador. Para un número real falta,
como mínimo: lo que pide la AISIA del portal para cualquier paciente real (migración aplicada, aviso vigente, validación
clínica, adaptadores con C3 + C4), esta revisión y la de la C3 firmadas y declaradas en el gate, las plantillas y los
Flows aprobados por Meta, y el tope diario de mensajes de servicio. **Infirmable** (límite de C5): ninguna firma autoriza
escribirle a un número que no probó ser del paciente, ni pasar por WhatsApp datos de salud de pacientes reales sin
esas piezas; el daño recae en ellos.

Firmada por: ____________  Rol: ____________  Fecha: ____________
