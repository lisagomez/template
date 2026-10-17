# Portal del paciente (clínicas dentales)

El portal que una clínica pondría frente a sus pacientes: entrar, registrarse con cuestionario, agendar sin dobles reservas, ver sus citas y el estado de cada aviso, y un asistente por escrito o por voz. Hoy, solo laboratorio, con dos clínicas y pacientes sintéticos.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| **Entrar y recuperar la contraseña** con la auth de la casa (Supabase); en el laboratorio, un Supabase LOCAL propio (`tools/clinica-dental/laboratorio/supabase`) | Usar la base compartida ni el Supabase en la nube |
| **Registro con cuestionario**: Zod en cliente y servidor, errores en cada campo, borrador en el dispositivo (sin el padecimiento ni la contraseña), consentimientos separados y sin marcar, tutor para menores | Crear la cuenta antes de validar todo (no deja cuentas huérfanas); poner datos personales en los metadatos de auth |
| **Agenda**: servicio con precio y duración a la vista → franja de días + calendario mensual → hora → resumen con **selector de avisos** (correo, Telegram, ambos o ninguno, sin preselección) y newsletter aparte | Confirmar sin cuenta; ofrecer un hueco que no existe |
| **Mis citas**: las próximas, y por cada aviso qué se programó, si se entregó, falló o se canceló, con lo que la persona puede hacer (vincular Telegram, revisar su correo); cancelar con confirmación; cambiar; retirar permisos con un clic | Cancelar con menos de 24 h desde el portal (se llama a la clínica) |
| **Botones de Voz y Chatbot** (recordados): la guía de voz del registro y el chat por escrito o por voz, con ASR y TTS **locales**; las urgencias por regla con enlace al 911 o a la clínica | Mandar audio fuera del servidor, usar Web Speech ni APIs de voz de terceros; ejecutar acciones desde el chat |
| **Consent mode v2** denegado por defecto y `dataLayer` sin PII; GTM solo con ID y consentimiento | Cargar analítica de terceros sin consentimiento |
| **Laboratorio** (`/laboratorio-clinica-dental`): buzón de salida que renderiza cada `.eml`, Telegram simulado con el reel, tablero de unit economics y grafo de atención | Ser una vista del personal de la clínica (horizonte) |

## Casos de uso

- **Paciente nuevo**: llega por un anuncio (`?canal=busqueda`), se registra (por escrito o con la guía de voz), agenda una
  limpieza, recibe la confirmación con `.ics` y los recordatorios.
- **Paciente que vuelve**: entra, ve sus próximas citas y el estado de cada aviso, cambia una cita o se da de baja del
  newsletter.
- **Visitante con dudas**: pregunta al chatbot precios, horarios o cómo prepararse; ante una señal de alarma, recibe la
  derivación fija (911 o la clínica hoy).
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
  `asistente-paciente`); ninguno más en el laboratorio (correo y Telegram simulados).
- **Variables de entorno**: `CLINICA_LABORATORIO`, `CLINICA_DATOS`, `CLINICA_RELOJ_INICIO`, `CLINICA_URL_PORTAL`,
  `CLINICA_TOPE_USD`, `CLINICA_TELEGRAM_SECRETO`, `NEXT_PUBLIC_GTM_ID` (opcional), `OPENROUTER_API_KEY`,
  `DICTADO_MOVIL_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Almacenamiento**: fuera del repo, en `CLINICA_DATOS` (por defecto `~/.clinica-dental`): estado del portal, libro,
  buzón, Telegram, reel, libro de gasto y llaves (archivos `0600`).
- **Salida del perímetro (C4)**: el texto del chat a OpenRouter (y el padecimiento solo si el paciente lo pide); nada
  más sale en el laboratorio. AISIA: `docs/goals/clinica-dental-aisia.md`; amenazas: `docs/goals/clinica-dental-c3.md`.

## Rutas

| Ruta | Qué es |
|---|---|
| `/clinica/[clinica]` | portada, `entrar`, `recuperar`, `registro`, `agenda`, `mis-citas`, `privacidad` |
| `/api/clinica-dental/*` | `huecos`, `eventos`, `asistente`, `voz/transcribir`, `voz/sintetizar`, `baja/[token]`, `telegram/[clinica]`, `reel/[clinica]`, `laboratorio` |
| `/laboratorio-clinica-dental` | buzón, Telegram, tablero, grafo |
