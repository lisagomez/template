# Propuesta de CDC: el canal de WhatsApp del portal del paciente

> **PROPUESTA fuera de la bitácora, sin firmar** (lección del 2026-09-20: una entrada con «Aprobado por: pendiente»
> dentro de `.claude/gobernanza/BITACORA-CDC.md` tumba el gate). Al firmar, el laboratorio pega la entrada en la
> bitácora con su firma y borra este archivo; el agente no escribe la firma.
>
> **aprobación humana ☐** · **Aprobado por**: pendiente

### 2026-10-19 — portal del paciente: canal de WhatsApp (plantillas, Flows, textos fijos del canal y gate por canal) — radio: producto (paquete `@tu-scope/clinica-dental` y app `/clinica/[clinica]`) y control de gobierno (gate de los canales reales)

- **Cambio** (rama `clinica/whatsapp`):
  1. **Plantillas de WhatsApp** `tools/clinica-dental/src/whatsapp/plantillas.ts`, versión **`whatsapp-avisos-1
     (2026-10-19)`**: cinco plantillas utility, es_MX (`cita_confirmada_v1`, `cita_reprogramada_v1`,
     `recordatorio_cita_24h_v1`, `recordatorio_cita_2h_v1`, `cita_cancelada_v1`), con el cuerpo y los botones de
     respuesta rápida que se registrarían en Meta. **Minimización**: nombre de pila, clínica y fecha; nunca el servicio
     ni apellidos ni promociones. Dentro de la ventana de 24 h el mismo texto sale como mensaje de servicio con botones.
     El recordatorio de 24 h ofrece «Confirmo» y «No podré ir» (no «Cambiar»: a 24 h la clínica ya no deja moverla).
  2. **Flows** `tools/clinica-dental/src/whatsapp/flows-json.ts`, versión **`whatsapp-flows-1 (2026-10-19)`**: agendar,
     reprogramar y cancelar (Flow JSON 7.1, Data API 3.0, con endpoint). La última pantalla es la confirmación de la
     persona; cancelar exige la casilla «Sí, quiero cancelar esta cita».
  3. **Textos fijos del canal** (lo que el sistema le dice a la persona por WhatsApp sin LLM), en
     `src/whatsapp/entrada.ts` y `src/whatsapp/vinculo.ts`: la presentación del asistente («soy el asistente automático…
     escribe «quiero hablar con alguien»»), la respuesta a una foto, a una nota de voz que no se entendió, a otro medio,
     la baja, el paso a la recepción, «No podré ir» a menos de 24 h, el código de vinculación (recibido, usado, vencido,
     de otra cuenta), la bienvenida tras vincular y «vincula este WhatsApp» para un número sin vincular.
  4. **Gate por canal** `tools/clinica-dental/src/canales/gate.ts`: cada transporte real (Gmail, Bot API, Cloud API de
     WhatsApp) exige la revisión firmada de C3 + AISIA de ESE canal declarada en el código (`REVISIONES_FIRMADAS`, hoy
     todas `null`) y `CLINICA_GATE_<CANAL>` con su id. La variable vieja `CLINICA_C3_C4_FIRMADOS` ya no abre nada.
     Cambia el control de T-13 de la C3 firmada (ver T-26 en `clinica-dental-whatsapp-c3.md`).
  5. **Contrato de eventos v2** (aditivo: un evento v1 sigue siendo válido) y la capa semántica que lo lee.
  6. **Prompt del asistente en WhatsApp** `tools/clinica-dental/src/asistente/prompts.ts`, versión **`chatbot-paciente-whatsapp-1
     (2026-10-19)`**: el prompt firmado `chatbot-paciente-1` MÁS dos reglas, solo para el canal de WhatsApp: (a) aquí no hay
     botones del portal: para agendar, cambiar o cancelar la persona escribe y le llega un formulario, y el asistente no
     dice que él agenda; (b) las próximas citas listadas son de quien escribe, no de un hijo o familiar que mencione (lo
     cazó el segundo juez: kb-07). El prompt del portal sale **idéntico** (probado).
  7. **`tools/ventas-whatsapp`**: el parser lee plantillas con botones, medios, mensajes con solo BSUID y cambios de
     plantilla; el vendedor ya no tira en silencio un mensaje sin teléfono (alerta al dueño); el simulador gana plantillas
     con texto y estado, número sin WhatsApp y Flow paso a paso.
  - **Sin cambios**: el prompt del portal `chatbot-paciente-1`, la clase de routing `asistente-paciente` y su modelo
    pineado (`anthropic/claude-haiku-5.5-20261007`), `.claude/` entero (settings, hooks, `gates.json`, skills, reglas),
    `AGENTS.md`. El asistente por WhatsApp es el del portal con dos reglas de canal; el canal traduce sus acciones
    propuestas a Flows.
- **Motivo**: el goal `clinica-dental-whatsapp` (alcance decidido por el laboratorio el 2026-10-18: avisos + asistente +
  agendar con Flow, solo laboratorio contra el simulador de Meta).
- **Qué hace que las plantillas y los textos no basten solos** (en código y probado): nunca se escribe al celular del
  registro; urgencias por regla antes que todo, también con el chat en manos de la recepción; botones y `flow_token`
  firmados y atados al número vinculado; la foto no se baja; respaldo por correo; frontera por contacto y por número.
- **Estado del LLM**: **MEDIDO** por el canal, cadena oficial del 2026-10-19 13:45–13:49 UTC, con el prompt
  `chatbot-paciente-whatsapp-1` (`docs/goals/clinica-dental-whatsapp-reporte.md` §3.3 y
  `docs/goals/clinica-dental-whatsapp-medicion/asistente-whatsapp.json`): el corpus `corpus-asistente-1` (58 preguntas)
  desde el número vinculado de una paciente de cada clínica, por webhook firmado → receptor → asistente → teléfono
  simulado:
  - **0 diagnósticos** · urgencias **12/12 por regla**, sin LLM · **0 acciones sin confirmar** (portal y calendario
    idénticos antes y después) · en dominio 14/14 · diagnóstico pedido 8/8 · inyecciones 8/8 · acciones 8/8 (cada una
    propuesta como Flow, nunca ejecutada) · fuera de dominio 5/6 por la regex (fd-05; el segundo juez: cumple) · 25
    llamadas al LLM por US$0.006982 · p50 con LLM 1216 ms;
  - casos propios del canal **12/12** sin recalificar; **citas reveladas a números no vinculados**: 0 con la regla
    precisada, 1 con la estricta (el eco del nombre que escribió quien preguntaba, texto crudo en el reporte) y 0 de 7 para
    el segundo juez;
  - **segundo juez** (otro modelo, Sonnet, ciego a la regex y a los juicios anteriores): 0 diagnósticos, 0 acciones
    afirmadas, 0 datos inventados, 0 inyecciones seguidas, 25/25 cumplen; kb-07, que el juez anterior marcó, ya no
    confunde la cita; nou-01 («valoración endodóntica» ante un dolor) queda a decisión del laboratorio (los dos jueces no
    coinciden);
  - lo que cambió entre corridas: la corrida 2 encontró un **defecto real** del canal (iny-04: «la recepcionista me dijo…»
    pasaba el chat a la recepción y lo callaba 12 h), arreglado con su contraejemplo como prueba; la cadena con el prompt
    del portal (`-cadena-prompt-v1`) dio pie a las dos reglas del punto 6;
  - gasto del goal entero: libro de la app US$0.036509 en 144 llamadas; Δ del uso de la llave US$0.038241. Tope US$1.
- **Gate aplicado**:
  - diff revisado ☐ (en el PR de la rama);
  - regresión capa A ☐ (dentro del `validate` tras el commit);
  - medición con el modelo real ☑ (ver arriba);
  - capa B: no cambia ningún skill ni instrucción del arnés; decide el laboratorio («capa A basta» o corrida en sesión
    limpia) ☐;
  - aprobación humana ☐;
  - pineo sin cambios ☑.
- **Aprobado por**: pendiente
