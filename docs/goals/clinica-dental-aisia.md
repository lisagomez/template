# AISIA — Portal del paciente para clínicas dentales (asistente, avisos y datos de salud)

> Fecha: 2026-10-16 · Estado: **con la firma del laboratorio** · Revisión: antes de cualquier paciente real, al cambiar el modelo
> o un prompt del asistente, al conectar un canal real (Gmail, Telegram) o tras un incidente.
>
> Control **C4**, sobre la plantilla `.claude/gobernanza/plantillas/aisia.md`. Goal `docs/goals/clinica-dental.md`.
> Lo que hoy existe opera **solo en laboratorio**: dos clínicas y ocho pacientes sintéticos, canales simulados.
>
> **aprobación humana ☑** · **Aprobado por**: lisagomez

## 1. Partes afectadas

- **El paciente adulto**: entrega datos de identificación y contacto y, si quiere, un **dato de salud** (la descripción de
  su padecimiento, dato personal sensible según la LFPDPPP 2025, art. 2, fr. VI).
- **El paciente menor de edad** y **quien ejerce la patria potestad o la tutela**: sus datos y su consentimiento entran
  juntos; el menor no decide solo.
- **Quien escribe o habla con el asistente sin cuenta** (visitante): sus preguntas pueden contener síntomas.
- **El personal de la clínica** (horizonte): recibirá citas y, con rol clínico, el padecimiento. Hoy no tiene vista.
- **Terceros que no firmaron**: un familiar mencionado en el chat, la persona que recibe un enlace de Telegram reenviado.
- **El laboratorio**: opera el sistema y responde por él.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Una urgencia que no se deriva** | El paciente describe una señal de alarma con palabras que ninguna regla reconoce; el asistente contesta como pregunta normal. |
| **Una urgencia de más** | La regla deriva al 911 algo que no lo era (p. ej. «me sangran mucho las encías» antes de afinar U3). Gasta una llamada y asusta. |
| **Un diagnóstico de facto** | El LLM dice «probablemente sea una caries» o recomienda un medicamento; el paciente no va al dentista o se automedica. |
| **Información inventada** | Un precio, un horario o una promoción que no existe; el paciente llega con una expectativa falsa. |
| **Una acción que nadie confirmó** | Una cita agendada, cancelada o un mensaje enviado porque el asistente «entendió» que se lo pidieron. |
| **El dato de salud donde no debe** | El padecimiento sale al proveedor del LLM sin que el paciente lo haya pedido, o queda en un log, una métrica o el dataLayer. |
| **Un recordatorio que no llega** | Telegram sin vincular, un correo que rebota o un proveedor caído: el paciente falta a su cita creyendo que se le avisaría. |
| **Un recordatorio de más o duplicado** | Un reintento que manda dos veces; un newsletter después de darse de baja. |
| **Exclusión por diseño** | Quien no tiene correo ni Telegram, quien no puede usar el micrófono, quien tiene un nombre que el ASR no transcribe (medido: nombres en náhuatl salen irreconocibles), quien no lee bien. |
| **La guía de voz llena mal un campo** | El ASR oye otra cosa y la persona confirma sin leer; queda un correo o un celular equivocado. |
| **Opacidad** | El paciente no sabe que habla con un asistente automatizado, ni qué sale de la máquina. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Urgencia no derivada | **Muy alta** (salud) | Baja con la lista declarada; no medida con lenguaje real | **No** |
| Urgencia de más | Baja | Media | Sí |
| Diagnóstico de facto | **Alta** | Baja (barrera de entrada + revisión de cada frase; ver la medición) | Parcial |
| Información inventada | Media | Baja (barrera de precio; los nombres y promociones no se verifican en código) | Sí |
| Acción sin confirmar | Alta | **Nula por construcción**: el asistente no tiene herramientas de escritura | Sí |
| Dato de salud fuera de lugar | **Alta** (dato sensible de un tercero) | Baja: solo sale al LLM si el paciente lo pide, nunca al libro ni al dataLayer (probado) | **No**: lo que salió, salió |
| Recordatorio que no llega | Media | Media (Telegram sin vincular, rebotes) | No para esa cita |
| Recordatorio duplicado / newsletter tras la baja | Baja-media | Baja (idempotencia y relectura del consentimiento, probadas) | Sí |
| Exclusión por diseño | Media | **Alta** | Sí, pero invisible |
| Campo mal llenado por voz | Media | Media | Sí, si la persona lo nota |
| Opacidad | Media | Media | Sí |

## 4. Mitigaciones

- **Urgencias por regla, antes que todo** (`tools/clinica-dental/src/asistente/urgencias.ts`): seis señales con su fuente
  (NHS, Oral Health Foundation), respuesta fija con el 911 o la clínica, y ante la duda se deriva. **Falta**: que un
  dentista valide la lista y su redacción; medir con lenguaje real (el corpus es declarado por el laboratorio).
- **No diagnostica**: pedir un diagnóstico o un medicamento no llega al LLM; cada frase del LLM se revisa ANTES de
  mostrarse o decirse y una frase diagnóstica corta la respuesta. El prompt lo repite (defensa en profundidad).
- **Sin manos**: el asistente no tiene herramientas; lo más que devuelve es un botón que la persona pulsa. Agendar,
  cancelar y cambiar exigen el clic en la UI (y cancelar, una confirmación más).
- **Dato de salud**: consentimiento **expreso, por escrito y con la cuenta autenticada** (LFPDPPP 2025, art. 8),
  separado de los demás; sin él el texto se descarta y se le dice al paciente; retirarlo lo borra. Solo sale al LLM si la
  persona marca «usar lo que escribí» en el chat. El libro, las métricas y el dataLayer no lo llevan (pruebas con los
  valores sembrados).
- **Menores**: el registro exige los datos y el consentimiento de quien ejerce la patria potestad; la política de la
  clínica pide que el menor vaya acompañado.
- **Avisos**: idempotentes; el estado de cada aviso se le enseña al paciente con lo que puede hacer («vincula tu
  Telegram», «revisa tu correo»); el bot no puede escribir primero y la UI lo dice. Ningún aviso sustituye a la llamada
  de la clínica en las 24 h previas.
- **Exclusión**: todo flujo se puede hacer por escrito; la voz es opcional, sin permiso de micrófono se dice qué pasó; los
  recordatorios son opcionales y la cita no depende de ellos. **Falta**: SMS o WhatsApp (horizonte) para quien no tiene
  correo ni Telegram; pruebas con lectores de pantalla reales (hoy: axe-core).
- **Voz**: la guía propone y pide «sí, correcto»; la contraseña y los consentimientos nunca se dictan; el correo se
  puede escribir («lo escribo»). Los nombres propios por voz son poco fiables: la guía lo deja corregir.
- **Opacidad**: el chat se presenta como asistente automatizado; el aviso de privacidad dice qué sale y a quién.
- **Apelación**: toda cita se cambia o cancela desde el portal o llamando; los datos (ARCO) se ejercen escribiendo a la
  clínica o desde «Mis citas» (consentimientos).

**Lo medido (2026-10-16, solo datos sintéticos; detalle en `clinica-dental-reporte.md` §3)**: 0 diagnósticos en 58
preguntas con el LLM real; 12/12 urgencias derivadas por regla, sin LLM; 0 acciones sin confirmar (portal y calendario
idénticos antes y después); 8/8 inyecciones sin efecto; 0 PII sembrada en el libro, el dataLayer, los logs y las
métricas. **Lo que esto NO mide**: lenguaje real de pacientes (el corpus lo declaró el laboratorio), voces humanas (se
midió con voz sintética: en la corrida final «Nayeli» se oyó «Nadjali» y «Nadia Lee», «Huitzilihuitl» se oyó «Wait a new Italy», y el paciente sintético confirmó lo oído, que es justo el daño «campo mal
llenado por voz»), y la barrera de diagnóstico **de más** (una pregunta de logística caía en ella; arreglada, puede haber
otras: es exclusión, no daño clínico). Una interrupción por voz no calló en 1 de 8 en una corrida (8/8 en la siguiente).

## 5. Decisión

**Mitigar, y no ofrecer a pacientes reales todavía.** El portal opera solo con datos sintéticos. Para un paciente real
falta, como mínimo: la migración aplicada y probada contra Supabase real, el aviso de privacidad **vigente** revisado por
un abogado, la validación clínica de la lista de urgencias y de las barreras por un dentista, los adaptadores reales con
C3 + C4 firmados y gate humano, y esta AISIA firmada. **Infirmable** (límite de C5): ninguna firma autoriza tratar datos de
salud de pacientes reales sin esas piezas; el daño recae en ellos, no en quien firma.

Firmada por: lisagomez  Rol: responsable del proyecto  Fecha: 2026-10-16
