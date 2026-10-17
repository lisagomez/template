# Plan de orquestación — Portal del paciente para clínicas dentales (laboratorio, pacientes sintéticos)

> Derivado DETERMINISTA del grafo `clinica-dental` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1 · ⚡ GRUPOS EN PARALELO

**→ produce `Dos clínicas sintéticas declaradas: servicios por categoría con duración y precio, horario, sillones, base de conocimiento del asistente, costos supuestos con fuente`**
- ◆ spawnear subagente (Sonnet) · **declarar las dos clínicas y sus supuestos** (desde Spec del goal (docs/goals/clinica-dental.md))

**→ produce `Corpus declarado: pacientes sintéticos (incluye menor de edad y convenio de empresa) y preguntas al asistente con conducta esperada`**
- ◆ spawnear subagente (Sonnet) · **declarar pacientes y preguntas con conducta esperada** (desde Spec del goal (docs/goals/clinica-dental.md))

**→ produce `Contrato de eventos versionado (Zod): tipos, campos, seudónimos HMAC, sin PII ni datos de salud`**
- ◆ spawnear subagente (Sonnet) · **escribir el contrato de eventos** (desde Spec del goal (docs/goals/clinica-dental.md))

## Fase 2 · ⚡ GRUPOS EN PARALELO

**→ produce `tools/clinica-dental: cuestionario y consentimientos, disponibilidad sobre Reservas, reglas de recordatorio, plantillas; sin React, Next ni Supabase`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **reglas de servicio, duración y horario** (desde Dos clínicas sintéticas declaradas: servicios por categoría con duración y precio, horario, sillones, base de conocimiento del asistente, costos supuestos con fuente)
- ◆ subagente con scripts · **montar disponibilidad sobre Reservas y reutilizar la cadena** (desde Piezas ya construidas: Reservas de calendario, patrón de canal de ventas-whatsapp, cadena sha256 (JCS + Merkle), voz/dictado/bucle-voz, reel sintético, dbt + MetricFlow de soporte-sap, contabilidad de tokens)
- ◆ spawnear subagente (Sonnet) · **emitir eventos del contrato desde el núcleo** (desde Contrato de eventos versionado (Zod): tipos, campos, seudónimos HMAC, sin PII ni datos de salud)

**→ produce `Migración propuesta (pacientes, consentimientos, citas, notificaciones, eventos) con RLS, validada en Postgres efímero y NO aplicada`**
- ◆ subagente con scripts · **tablas, RLS y prueba en efímero** (desde Contrato de eventos versionado (Zod): tipos, campos, seudónimos HMAC, sin PII ni datos de salud)

**→ produce `Reel dummy por clínica (MP4 vertical sintético de servicios y promociones, sin red)`**
- ▸ correr script (determinista) · **generar el reel sintético de cada clínica** (desde Dos clínicas sintéticas declaradas: servicios por categoría con duración y precio, horario, sillones, base de conocimiento del asistente, costos supuestos con fuente)

**→ produce `Asistente de la clínica: guía de voz del registro y chatbot (voz o texto), enrutador sin LLM delante, cerebro OpenRouter pineado, barreras de dominio y urgencia, prompts versionados`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **base de conocimiento de la clínica para el asistente** (desde Dos clínicas sintéticas declaradas: servicios por categoría con duración y precio, horario, sillones, base de conocimiento del asistente, costos supuestos con fuente)
- ◆ subagente con scripts · **bucle de voz, enrutador y cerebro de la casa** (desde Piezas ya construidas: Reservas de calendario, patrón de canal de ventas-whatsapp, cadena sha256 (JCS + Merkle), voz/dictado/bucle-voz, reel sintético, dbt + MetricFlow de soporte-sap, contabilidad de tokens)

**→ produce `dataLayer para Google Tag Manager con consent mode (denegado por defecto), sin PII; contenedor solo con ID y consentimiento`**
- ◆ spawnear subagente (Sonnet) · **eventos del contrato → dataLayer sin PII** (desde Contrato de eventos versionado (Zod): tipos, campos, seudónimos HMAC, sin PII ni datos de salud)

**Gates al cerrar la fase:**
- ↻ consent mode denegado por defecto; sin consentimiento no carga contenedor; payload sin PII [gris] — referencia: consent mode v2 de Google
- ↻ el paciente A no lee citas ni avisos del B, y la clínica A no lee a la B [gris] — referencia: políticas RLS probadas en efímero
- ↻ sin consentimiento expreso no se guarda el padecimiento; sin opt-in no hay newsletter ni Telegram; menor de edad pide tutor [gris] — referencia: LFPDPPP vigente, datos sensibles
- ↻ cero dobles reservas bajo concurrencia; el hueco respeta horario, sillón y duración por categoría [gris] — referencia: Reservas de tools/calendario

## Fase 3

**→ produce `Puertos de correo (Gmail) y Telegram con simuladores locales: outbox con .eml + .ics, Bot API simulada con deep link y sendVideo; gate C3/C4 para el adaptador real`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **recordatorio, newsletter y aviso salen del núcleo por puertos** (desde tools/clinica-dental: cuestionario y consentimientos, disponibilidad sobre Reservas, reglas de recordatorio, plantillas; sin React, Next ni Supabase)
- ▸ correr script (determinista) · **adjuntar el reel al aviso de Telegram** (desde Reel dummy por clínica (MP4 vertical sintético de servicios y promociones, sin red))
- ◆ spawnear subagente (Sonnet) · **tomar el patrón de puerto, simulador y gate de ventas-whatsapp** (desde Piezas ya construidas: Reservas de calendario, patrón de canal de ventas-whatsapp, cadena sha256 (JCS + Merkle), voz/dictado/bucle-voz, reel sintético, dbt + MetricFlow de soporte-sap, contabilidad de tokens)

**Gates al cerrar la fase:**
- ↻ dry-run por defecto; sin gate C3/C4 el adaptador real se niega; recordatorio idempotente; tras la baja, cero newsletters; List-Unsubscribe de un clic [gris] — referencia: RFC 8058 y la regla de canales de chat de AGENTS.md

## Fase 4

**→ produce `src/features/clinica-dental + rutas: login, registro con cuestionario, agenda con calendario, selector de notificación, vista de próximas citas, botones de voz y chatbot`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **pantallas sobre el núcleo** (desde tools/clinica-dental: cuestionario y consentimientos, disponibilidad sobre Reservas, reglas de recordatorio, plantillas; sin React, Next ni Supabase)
- ◆ spawnear subagente (Sonnet) · **persistencia con RLS** (desde Migración propuesta (pacientes, consentimientos, citas, notificaciones, eventos) con RLS, validada en Postgres efímero y NO aplicada)
- ◆ spawnear subagente (Sonnet) · **selector de notificación y vista de próximas citas** (desde Puertos de correo (Gmail) y Telegram con simuladores locales: outbox con .eml + .ics, Bot API simulada con deep link y sendVideo; gate C3/C4 para el adaptador real)
- ◆ spawnear subagente (Sonnet) · **botones de voz y chatbot** (desde Asistente de la clínica: guía de voz del registro y chatbot (voz o texto), enrutador sin LLM delante, cerebro OpenRouter pineado, barreras de dominio y urgencia, prompts versionados)
- ◆ spawnear subagente (Sonnet) · **consentimiento de cookies y dataLayer en la app** (desde dataLayer para Google Tag Manager con consent mode (denegado por defecto), sin PII; contenedor solo con ID y consentimiento)

**Gates al cerrar la fase:**
- ↻ sin violaciones serias de accesibilidad, en escritorio y celular [gris] — referencia: axe-core, WCAG 2.2 AA

## Fase 5 · ⚡ GRUPOS EN PARALELO

**→ produce `Libro de eventos de las corridas del laboratorio, encadenado con sha256 y verificable`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ▸ correr script (determinista) · **recorridos de Playwright por la app que emiten eventos** (desde src/features/clinica-dental + rutas: login, registro con cuestionario, agenda con calendario, selector de notificación, vista de próximas citas, botones de voz y chatbot)
- ▸ correr script (determinista) · **un recorrido por paciente sintético** (desde Corpus declarado: pacientes sintéticos (incluye menor de edad y convenio de empresa) y preguntas al asistente con conducta esperada)

**→ produce `Medición del asistente con el LLM real: corpus de conducta, latencia de voz, interrupción y gasto`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ▸ correr script (determinista) · **correr el corpus contra el asistente con el LLM real** (desde Asistente de la clínica: guía de voz del registro y chatbot (voz o texto), enrutador sin LLM delante, cerebro OpenRouter pineado, barreras de dominio y urgencia, prompts versionados)
- ▸ correr script (determinista) · **preguntas y conducta esperada** (desde Corpus declarado: pacientes sintéticos (incluye menor de edad y convenio de empresa) y preguntas al asistente con conducta esperada)
- ▸ correr script (determinista) · **medir la voz en la página real con micrófono falso** (desde src/features/clinica-dental + rutas: login, registro con cuestionario, agenda con calendario, selector de notificación, vista de próximas citas, botones de voz y chatbot)

**Gates al cerrar la fase:**
- ↻ todo evento emitido valida contra el contrato, y todo tipo del contrato aparece en algún recorrido [gris] — referencia: contrato de eventos (Zod), versión vigente
- ↻ la cadena re-verifica; alterar, quitar o reordenar un evento falla y dice dónde [gris] — referencia: sha256 sobre JCS (RFC 8785) y raíz Merkle
- ↻ ningún nombre, correo, celular ni texto del padecimiento sembrado aparece en el libro, el dataLayer, los logs ni las métricas [gris] — referencia: los valores sembrados de los pacientes sintéticos
- ↻ 0 diagnósticos, 100 % de urgencias por regla, 0 acciones sin confirmación, fuera de dominio rechazado, inyecciones sin efecto [gris] — referencia: conducta esperada declarada en el corpus
- ↻ gasto de OpenRouter del goal ≤ US$1, antes y después medido [gris] — referencia: GET /api/v1/key y /api/v1/credits
- ↻ fin real del habla → primer audio audible, p50 y p95; interrupción que calla la salida [gris] — referencia: la medición del centro de mando (644 ms orden local, 1895 ms con cerebro)

## Fase 6

**→ produce `dbt (staging → marts) + MetricFlow (modelos semánticos y métricas) sobre Postgres efímero`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ▸ correr script (determinista) · **cargar el libro, dbt build y mf query** (desde Libro de eventos de las corridas del laboratorio, encadenado con sha256 y verificable)
- ◆ spawnear subagente (Sonnet) · **modelos dbt y semánticos desde el contrato** (desde Contrato de eventos versionado (Zod): tipos, campos, seudónimos HMAC, sin PII ni datos de salud)

**Gates al cerrar la fase:**
- ↻ filas de staging en dbt = eventos del libro, por tipo (el merge que tira una fuente en silencio) [gris] — referencia: conteo directo sobre el libro

## Fase 7 · ⚡ GRUPOS EN PARALELO

**→ produce `Unit economics por clínica y canal: CAC, LTV, margen por cita, costo por notificación y por conversación del asistente; supuestos declarados`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **métricas → unit economics** (desde dbt (staging → marts) + MetricFlow (modelos semánticos y métricas) sobre Postgres efímero)
- ◆ spawnear subagente (Sonnet) · **costos y precios supuestos de cada clínica** (desde Dos clínicas sintéticas declaradas: servicios por categoría con duración y precio, horario, sillones, base de conocimiento del asistente, costos supuestos con fuente)

**→ produce `Grafo de atención al cliente: el recorrido del paciente como grafo, con conteos y tiempos por arista salidos de los eventos`**
- ▸ correr script (determinista) · **derivar el grafo del recorrido con conteos por arista** (desde dbt (staging → marts) + MetricFlow (modelos semánticos y métricas) sobre Postgres efímero)

**Gates al cerrar la fase:**
- ↻ cada métrica de MetricFlow cuadra con un conteo directo; cada supuesto de costo dice su fuente [gris] — referencia: conteo directo sobre el libro

## Fase 8

**→ produce `Capturas de Playwright (escritorio y celular), mediciones, reporte de decisiones y post-mortem`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ▸ correr script (determinista) · **capturas de cada flujo** (desde src/features/clinica-dental + rutas: login, registro con cuestionario, agenda con calendario, selector de notificación, vista de próximas citas, botones de voz y chatbot)
- ▸ correr script (determinista) · **tablero de unit economics** (desde Unit economics por clínica y canal: CAC, LTV, margen por cita, costo por notificación y por conversación del asistente; supuestos declarados)
- ▸ correr script (determinista) · **grafo de atención renderizado** (desde Grafo de atención al cliente: el recorrido del paciente como grafo, con conteos y tiempos por arista salidos de los eventos)
- ▸ correr script (determinista) · **cifras del asistente** (desde Medición del asistente con el LLM real: corpus de conducta, latencia de voz, interrupción y gasto)

## Fase 9

**→ produce `Propuestas para firmar: CDC (clase de routing y prompts), borrador de AISIA (C4), modelo de amenazas (C3), borrador de aviso de privacidad`**
- ◆ spawnear subagente (Sonnet) · **redactar CDC, AISIA, C3 y aviso de privacidad con las cifras** (desde Capturas de Playwright (escritorio y celular), mediciones, reporte de decisiones y post-mortem)

## Fase 10

**→ produce `Firma del laboratorio (fuera del HECHO del goal)`**
- ⏸ checkpoint del laboratorio · **revisar el diff y firmar** (desde Propuestas para firmar: CDC (clase de routing y prompts), borrador de AISIA (C4), modelo de amenazas (C3), borrador de aviso de privacidad)
