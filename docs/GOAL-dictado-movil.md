# Dictado desde el celular (PWA) — Spec para `/goal`

> Compilado con `/goal-compiler` el 2026-09-19. Forma: **LOOP**. Petición de la dueña: «quiero
> dictarte desde mi celular con PWA y habilitar el icono flotante para android y iphone».
>
> **CONSTRUIDO el 2026-09-19.** PWA instalable (`public/manifest.json`, `public/sw.js` sin fetch
> handler, `PwaRegister` en el layout raíz, íconos generados). Micrófono remoto con
> emparejamiento por token (`/api/dictado/movil`, C3), transcripción local (C4: audio a
> temporal que se borra), destino conmutable PC/pantalla/ambos (`dictado pega` nueva orden de
> la herramienta). Página `/dictar` con botón flotante móvil arrastrable. Probado de punta a
> punta: audio → transcripción fiel; ambos destinos; screenshots en viewport iPhone. La demo
> en el teléfono real de la dueña queda para su prueba (necesita el paso de red de Windows y
> aceptar el certificado). Límite de plataforma declarado sin maquillar: no hay overlay del
> sistema en PWA.

## MISIÓN

Que el **celular sea una superficie de dictado de primera clase** de la fábrica, en Android y
iPhone, al nivel de una app de dictado comercial:

1. **PWA instalable.** La app del template se instala en el teléfono (icono en el home screen,
   pantalla completa, offline shell). En iPhone y Android.
2. **Botón flotante móvil.** Dentro de la PWA vive el gemelo móvil del botón flotante de
   Windows: arrastrable, siempre a mano, mismo lenguaje visual (gris hueco = desconectado,
   gris = en espera, rojo = ESCUCHANDO, ámbar = transcribiendo). *Honestidad de plataforma:
   ni iOS ni Android permiten a una PWA un overlay del sistema sobre otras apps — el flotante
   es DENTRO de la app instalada, y el spec lo dice sin fingir lo contrario.*
3. **Hablar al celular y que el texto llegue.** Tocar el botón, hablar al micrófono del
   teléfono, y el texto aparece según el **destino conmutable**:
   - **→ PC**: donde esté el cursor de Windows (el celular es un micrófono remoto más del
     pipeline de `tools/dictado` — dictarle a Claude Code desde el sofá).
   - **→ pantalla**: transcrito en el teléfono, con copiar y compartir.
4. **Un solo estado.** El botón del cel, el botón web, el tray y el flotante de Windows ven y
   controlan EL MISMO dictado: encender en uno se ve en todos (el protocolo del sensor-icono ya
   difunde estados a todos los clientes).
5. **Fluidez de sala.** La misma calidad ya medida: motor local, latencia baja, puerta de
   energía, muletillas fuera. El micrófono del teléfono suele ser MEJOR que el de la PC.

## HECHOS DEL ENTORNO (verificados — apóyate, no redescubras)

- `tools/dictado`: núcleo con `DetectorVoz`/`Transcriptor`/`Pegador` **inyectables**; el motor
  medido es parakeet + respaldo (p50 ~300 ms); `servicio/servidor.mjs` ya expone
  `POST /transcribir` (PCM16/WAV en el cuerpo, Bearer ≥32 obligatorio) — sirve tal cual como
  backend de transcripción; el pegador de Windows escribe donde esté el foco.
- Sensor-icono: TCP `127.0.0.1:47124`, una palabra (`alternar`), difunde `estado <nombre>` a
  TODOS los clientes (`tools/dictado/src/node/icono.ts`). `/api/dictado` (Next route) ya lo
  puentea a HTTP; `src/shared/stores/dictado.ts` (Zustand) + `BotonDictado` ya existen.
- Skill **`add-mobile`** (`.claude/skills/add-mobile/`): PWA + manifest + service worker +
  push, iOS-compatible. Úsalo como base, no reinventes.
- **`getUserMedia` exige contexto seguro**: HTTPS o localhost. El teléfono entra por LAN, así
  que hace falta HTTPS local (mkcert/cert propio), un túnel, o el deploy real — tú eliges cómo.
- WSL2 no escucha en la LAN por sí solo: hace falta el portproxy de Windows
  (`netsh interface portproxy`) o equivalente para que el teléfono alcance a Next.
- iOS: micrófono en PWA funciona (Safari ≥14.3); push exige 16.4+; NO hay overlay del sistema.
- Gates: `npm run validate` en la raíz (sellado 152/152 hoy) y
  `cd tools/dictado && npm run build && npm run prueba` (35/35 hoy).

## LIBERTAD TÉCNICA

Tú eliges el camino del audio (MediaRecorder por trozos, WebSocket streaming, WebAudio +
PCM16 directo al `servicio/`, o VAD en el navegador), cómo resolver HTTPS en LAN, y cómo
sincronizar estado (sondeo, SSE, WS). Todo lo tecnológico de aquí es sugerencia descartable
salvo RESTRICCIONES. Investiga 2-3 referencias world-class de dictado móvil web (cómo manejan
el gesto de inicio en iOS, el audio en background, la latencia percibida) antes de decidir.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. Últimos outputs de los DOS comandos de validación pegados, en verde.
2. UI móvil demostrada con Playwright en viewport móvil: screenshots del botón flotante móvil
   en sus estados, del flujo dictar → texto en pantalla, y del manifest instalable.
3. Demo en vivo con la dueña: instala la PWA en su teléfono real, toca el botón, dicta, y
   **confirma en la conversación** que (a) el texto apareció en el cursor de su PC y (b) en la
   pantalla del cel; los logs pegados muestran la frase con su latencia.
4. Reporte de decisiones: camino del audio elegido y por qué, cómo se resolvió HTTPS/LAN, qué
   quedó fuera por límite de plataforma (overlay, background) dicho sin maquillaje.
5. Lista de formas en que podría estar mal/incompleto, resueltas o declaradas.

## COMANDO DE VALIDACIÓN

```bash
cd /home/kyara/code/template && npm run validate && cd tools/dictado && npm run build && npm run prueba
```

Córrelo tras cada cambio grande y surfea su output.

## RESTRICCIONES REALES

- **Autenticación obligatoria (C3)**: un micrófono remoto que escribe en el cursor de la PC es
  una superficie de entrada hacia una máquina con llaves. Emparejamiento por token/PIN sí o
  sí; sin credencial no se transcribe ni se pega NADA. El token nunca se imprime (regla de
  secretos en pantalla).
- **Nada sale a nubes de terceros (C4)**: la transcripción corre en la máquina propia (motores
  de `tools/dictado`) o en un VPS propio; el audio no se guarda por defecto.
- No se rompe ni degrada ningún acceso existente (tray, flotante Windows, botón web, Ctrl
  derecho, terminal).
- Los límites de plataforma se declaran, no se maquillan (overlay del sistema: imposible en
  PWA; se dice en el README).
- Gates en verde antes de mergear, como todo lo demás.
