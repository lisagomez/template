# Centro de mando por voz

Le hablas a la computadora y contesta: las órdenes en menos de un segundo sin modelo de lenguaje, las preguntas abiertas con un cerebro que empieza a hablar en cuanto tiene la primera frase, y se calla si le hablas encima.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| Escucha con tu palabra de activación («oye, mando»), con un toque, manteniendo ESPACIO o en manos libres | Mandar tu voz a ningún sitio: oye (Parakeet) y habla (Piper) en esta máquina, con el demonio de `tools/dictado` |
| Resuelve sin LLM: callar, repetir, más despacio o más rápido, la hora, la fecha, tu agenda de hoy o de mañana (solo lectura), cuánto lleva gastado y cómo va de rapidez | Escribir nada: agendar, enviar o borrar se queda en borrador (dry-run) y pide «confirmo»; aun confirmado, este centro de mando solo lee |
| Piensa lo demás con el cerebro por OpenRouter (modelo pineado por el routing, tope de US$1 en el laboratorio) y lo dice frase a frase | Conectar tu agenda real: lee el espejo local del calendario; en el laboratorio, con datos sintéticos |
| Se calla al instante si le hablas encima, sin callarse con su propia voz, y el turno interrumpido muere entero | Funcionar sin el demonio de dictado: sin él dice que la voz local está caída |
| Enseña el orbe, la onda, subtítulos karaoke, la conversación y la telemetría por etapa de cada turno | Publicarse: es una pantalla de laboratorio (C3 y despliegue, fuera de este alcance) |

## Casos de uso

- **Operar el negocio con las manos ocupadas**: «oye, mando, ¿qué tengo hoy?» mientras se atiende el mostrador.
- **Preguntar algo de negocio** («¿qué es un flujo de caja?») y oír la respuesta empezar en menos de dos segundos.
- **Probar y medir el bucle de voz** del monorepo antes de llevarlo a business-os, al vendedor por WhatsApp o al
  asesor por voz: la telemetría por etapa y `scripts/centro-de-mando/mide.ts` dicen dónde se va cada milisegundo.

## Requerimientos de infraestructura

- **Runtime**: la app del template (Next 16, Node `>=22.18`) y un navegador moderno con micrófono.
- **Dependencias del sistema**: el demonio de `tools/dictado` (`npm run demonio` en `tools/dictado`) con Parakeet y la
  voz Piper es_MX «claude» descargados; medido con 4 hilos por pasada en `DICTADO_HILOS` (dos pasadas en paralelo: 221 ms p50 frente a 237
  con 8). `ffmpeg` solo si el demonio no responde y la voz cae al CLI.
- **CPU, GPU y memoria**: medido en un Ryzen 7 5700G sin GPU (WSL2): el demonio ocupa ~1,5 GB con Parakeet cargado
  (medición de `dictado`); la latencia por etapa está en `docs/goals/centro-de-mando-voz-medicion/`.
- **Servicios externos**: OpenRouter, solo para las preguntas abiertas.
- **Variables de entorno**: `DICTADO_MOVIL_TOKEN` (emparejamiento y Bearer del demonio), `OPENROUTER_API_KEY`
  (cerebro), y opcionales `CENTRO_MANDO_DATOS`, `CENTRO_MANDO_ESPEJO`, `CENTRO_MANDO_TOPE_USD`, `CENTRO_MANDO_ZONA` y
  `DICTADO_DEMONIO_PUERTO`.
- **Almacenamiento**: `~/.centro-de-mando/gasto.jsonl` (una línea por llamada al cerebro: tokens y costo, sin texto)
  y el espejo de agenda `agenda-espejo.json`. Ni audio ni lo que dices se guarda en disco.
- **Salida del perímetro (C4)**: el audio nunca sale de la máquina. El texto de una pregunta abierta sale a OpenRouter
  (Anthropic detrás); las órdenes no salen. Decidido por el laboratorio el 2026-10-15 para el laboratorio; llevarlo a
  terceros pide su propia AISIA.

## Cómo está hecho

- `components/`: el HUD (`centro-de-mando.tsx`), el orbe y la onda en canvas, los subtítulos karaoke, la telemetría y
  la conversación. La disposición viene del `CommandCenterLive` de business-os (MIT, `LICENSE-FUENTE`).
- `services/sesion.ts`: micrófono abierto una vez (`@tu-scope/voz`), detector por energía calibrada, el oído y el
  bucle (`@tu-scope/bucle-voz`), y el reproductor por `<audio>`.
- `services/puertos.ts` y `cliente.ts`: hora, fecha, telemetría y ayuda se contestan en la página; agenda y gasto en
  el servidor; la voz de las frases fijas se cachea.
- `services/servidor/`: transcripción con anclaje de idioma (dos pasadas en paralelo para lo corto), el cerebro en
  flujo NDJSON con tope de gasto, la agenda por el `Lector` de `tools/calendario` y el prompt del cerebro (CDC).
- Rutas: `/api/centro-de-mando/{transcribir,cerebro,lee,estado}`, todas con el Bearer del dictado y Zod.
- Medición y capturas: `scripts/centro-de-mando/` (micrófono falso con verdad de terreno y toma de lo que suena).
