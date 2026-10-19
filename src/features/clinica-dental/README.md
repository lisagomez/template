# Portal del paciente (clínicas dentales)

El portal que una clínica pondría frente a sus pacientes: entrar, registrarse con cuestionario, agendar sin dobles reservas, ver sus citas y el estado de cada aviso, un asistente por escrito o por voz, y el mismo portal por WhatsApp. Hoy, solo laboratorio, con dos clínicas y pacientes sintéticos.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| **Entrar y recuperar la contraseña** con la auth de la casa (Supabase); en el laboratorio, un Supabase LOCAL propio (`tools/clinica-dental/laboratorio/supabase`) | Usar la base compartida ni el Supabase en la nube |
| **Registro con cuestionario**: Zod en cliente y servidor, errores en cada campo, borrador en el dispositivo (sin el padecimiento ni la contraseña), consentimientos separados y sin marcar, tutor para menores | Crear la cuenta antes de validar todo (no deja cuentas huérfanas); poner datos personales en los metadatos de auth |
| **Agenda**: servicio con precio y duración a la vista → franja de días + calendario mensual → hora → resumen con **selector de avisos** (correo, WhatsApp, Telegram, combinaciones o ninguno, sin preselección) y newsletter aparte | Confirmar sin cuenta; ofrecer un hueco que no existe |
| **Mis citas**: las próximas, y por cada aviso qué se programó, si se entregó, se leyó, falló o se canceló, con lo que la persona puede hacer (vincular Telegram o WhatsApp, revisar su correo); cancelar con confirmación; cambiar; retirar permisos con un clic | Cancelar con menos de 24 h desde el portal (se llama a la clínica) |
| **Mi WhatsApp** (en «Mis citas»): código de un solo uso y enlace `wa.me`; el número que lo manda queda pendiente y la persona confirma que es suyo (sus 4 últimos dígitos si no es el celular del registro) o lo rechaza; desvincular | Escribirle al celular del registro sin que lo haya probado; mostrar el número entero |
| **WhatsApp de la clínica** (núcleo en `tools/clinica-dental`): avisos por plantilla o mensaje de servicio, el asistente contestando todo lo que entra (urgencias por regla primero, notas de voz con ASR local en dos lecturas, foto con respuesta fija), Flows para agendar, reprogramar y cancelar, la recepción que toma el chat (coexistencia), respaldo por correo | Hablar con Meta: el laboratorio va contra el simulador y el transporte real no se construye sin su gate |
| **Botones de Voz y Chatbot** (recordados): la guía de voz del registro y el chat por escrito o por voz, con ASR y TTS **locales**; las urgencias por regla con enlace al 911 o a la clínica (por voz, con la corrección de palabras de alarma y el aviso U7: `services/servidor/lecturas-voz.ts`) | Mandar audio fuera del servidor, usar Web Speech ni APIs de voz de terceros; ejecutar acciones desde el chat |
| **Consent mode v2** denegado por defecto y `dataLayer` sin PII; GTM solo con ID y consentimiento | Cargar analítica de terceros sin consentimiento |
| **Laboratorio** (`/laboratorio-clinica-dental`): buzón de salida que renderiza cada `.eml`, Telegram simulado con el reel, **WhatsApp simulado** (el teléfono de la persona: escribir, botones, nota de voz, foto, Flows; y la recepción o Meta que intervienen), tablero de unit economics con el costo por canal y grafo de atención | Ser una vista del personal de la clínica (horizonte) |

## Casos de uso

- **Paciente nuevo**: llega por un anuncio (`?canal=busqueda`), se registra (por escrito o con la guía de voz), agenda una
  limpieza, recibe la confirmación con `.ics` y los recordatorios.
- **Paciente que vuelve**: entra, ve sus próximas citas y el estado de cada aviso, cambia una cita o se da de baja del
  newsletter.
- **Visitante con dudas**: pregunta al chatbot precios, horarios o cómo prepararse; ante una señal de alarma, recibe la
  derivación fija (911 o la clínica hoy).
- **Paciente por WhatsApp**: vincula su número desde «Mis citas», recibe confirmación y recordatorios con botones,
  confirma su asistencia, mueve o cancela su cita con un formulario dentro de WhatsApp, pregunta por escrito o con una
  nota de voz, y pasa a la recepción cuando quiere a una persona.
- **El laboratorio**: corre los recorridos de los pacientes sintéticos (`scripts/clinica-dental/recorrido.ts`), mide el
  asistente y la voz, y regenera el corte semántico, el unit economics y el grafo.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18`; Next 16 (App Router) con `CLINICA_LABORATORIO` encendida (sin ella el portal no arranca: falla
  cerrado).
- **Dependencias del sistema**: Docker (el Supabase local del laboratorio); para la voz, el demonio de `tools/dictado`
  (Parakeet y Piper locales); para el reel, ffmpeg y el Chromium de Playwright.
- **CPU, GPU y memoria**: medido en un Ryzen 7 5700G sin GPU: del fin real del habla al primer audio, la guía de voz
  p50 777 / p95 1032 ms; una orden local del chatbot p50 762 / p95 875 ms; una respuesta con el LLM p50 2157 / p95
  2783 ms (2026-10-16, `docs/goals/clinica-dental-medicion/voz.json`).
  Memoria no medida aparte.
- **Servicios externos**: OpenRouter para el cerebro del asistente (texto; modelo pineado de la clase
  `asistente-paciente`); ninguno más en el laboratorio (correo, Telegram y Meta simulados; la guardia de red del
  servidor anota en `CLINICA_DATOS/red-servidor.json` a qué host sale el proceso).
- **Variables de entorno**: `CLINICA_LABORATORIO`, `CLINICA_DATOS`, `CLINICA_RELOJ_INICIO`, `CLINICA_URL_PORTAL`,
  `CLINICA_TOPE_USD`, `CLINICA_TELEGRAM_SECRETO`, `CLINICA_WA_SECRETO_APP`, `CLINICA_WA_VERIFICA`, `CLINICA_MEDICION`
  (la corrida que muestra el tablero), `NEXT_PUBLIC_GTM_ID` (opcional), `OPENROUTER_API_KEY`,
  `DICTADO_MOVIL_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Almacenamiento**: fuera del repo, en `CLINICA_DATOS` (por defecto `~/.clinica-dental`): estado del portal, libro,
  buzón, Telegram, reel, libro de gasto, llaves y la cola durable del webhook de WhatsApp (archivos `0600`).
- **Salida del perímetro (C4)**: el texto del chat a OpenRouter (y el padecimiento solo si el paciente lo pide); nada
  más sale en el laboratorio. Con un número real, lo que va y viene por WhatsApp lo descifra y guarda Meta hasta 30 días.
  AISIA: `docs/goals/clinica-dental-aisia.md` y su revisión para WhatsApp `docs/goals/clinica-dental-whatsapp-aisia.md`;
  amenazas: `docs/goals/clinica-dental-c3.md` y `docs/goals/clinica-dental-whatsapp-c3.md`.

## Rutas

| Ruta | Qué es |
|---|---|
| `/clinica/[clinica]` | portada, `entrar`, `recuperar`, `registro`, `agenda`, `mis-citas`, `privacidad` |
| `/api/clinica-dental/*` | `huecos`, `eventos`, `asistente`, `voz/transcribir`, `voz/sintetizar`, `baja/[token]`, `telegram/[clinica]`, `reel/[clinica]`, `laboratorio`, `laboratorio/whatsapp`, `whatsapp/webhook`, `whatsapp/flows` |
| `/laboratorio-clinica-dental` | buzón, Telegram, WhatsApp, tablero, grafo |
