# Dictado por ícono en la barra de tareas — Spec para `/goal`

> **CERRADO el 2026-09-19.** Construido y demostrado en vivo el mismo día: sensor `--icono`
> (`src/node/icono.ts`, protocolo TCP de una palabra, 3 pruebas), `windows/icono-barra.ps1`
> (tray + botón flotante arrastrable, Mutex de instancia única, reconexión con detección de
> EOF), `dictado icono instala|quita` (arranque por sesión de Windows) y `--icono` en los
> flags por defecto de `en-vivo`. La dueña dictó en vivo por el ícono y el botón flotante.
> Post-mortem: los seis riesgos vividos y sus fixes quedaron en `docs/SDD-dictado.md` §9
> («Añadidos del 2026-09-19»); la calibración (nivel 75 % por CoreAudio, ganancia 0, puerta
> de energía, filtro de muletillas) salió de esa misma sesión.

> Compilado con `/goal-compiler` el 2026-09-19. Forma: **LOOP**. Petición del dueño: «en vez de
> que sea por control derecho, que sea con un ícono que pueda colocar en la barra de tareas y que
> cuando lo presione pueda dictar y cuando lo vuelva a presionar se desactive». El Ctrl derecho
> **no se borra**: el ícono es OTRO sensor de la misma máquina de estados, y pasa a ser la puerta
> de entrada por defecto para el humano.

## MISIÓN

Que el dictado de `tools/dictado/` se encienda y apague desde un **ícono en la barra de tareas de
Windows**, al nivel de una herramienta de dictado comercial:

1. **Un click enciende, otro apaga.** Click en el ícono → modo manos libres activo (el humano
   habla, el texto aparece donde está el cursor). Otro click → apagado. Sin teclas, sin terminal.
2. **El estado SE VE.** El ícono comunica en qué estado está (inactivo / escuchando / transcribiendo
   si es viable): color, forma o badge — que nunca haya duda de si el micrófono está vivo.
3. **Autosuficiente.** Si el pipeline en WSL2 (`npm run en-vivo` o equivalente) no está corriendo,
   el click lo levanta y luego activa. El humano no necesita saber que existe WSL2. Si el arranque
   tarda (carga de modelos), el ícono muestra «arrancando», no silencio.
4. **Colocable.** El humano puede dejarlo fijo en su barra de tareas (anclado o en el área de
   notificación, según el mecanismo que elijas) y sobrevive un reinicio de sesión de Windows sin
   ritual técnico: a lo sumo doble click en algo, idealmente nada.
5. **Convive con lo que ya hay.** `--tecla` (Ctrl derecho), ESPACIO en terminal y el uso
   programático siguen funcionando igual. El ícono es un sensor más que emite los mismos gestos.

## HECHOS DEL ENTORNO (verificados hoy — no los redescubras, apóyate en ellos)

- Arquitectura actual del sensor de tecla: `dictado dictar --tecla` lanza a la vista
  `powershell.exe` con `windows/tecla-global.ps1` (~30 líneas: sondea `GetAsyncKeyState` y avisa
  por `127.0.0.1`; no lee otras teclas ni escribe nada). El ícono debería hablar el mismo
  protocolo loopback o uno igual de simple y auditable.
- El gesto pedido YA existe en el núcleo: `--tecla-alternar --modo manos-libres` = un toque
  enciende manos libres, otro lo apaga (lo que funcionó en vivo el 2026-09-16, con
  `--motor faster-whisper:small --ganancia-db 12`).
- Daemon de sesión: `npm run en-vivo` (con `--parar`, `--estado`) en `scripts/en-vivo.mjs`.
- El núcleo es TypeScript puro **sin dependencias**; todo lo específico se inyecta
  (`DetectorVoz`, `Transcriptor`, `Pegador`, `Almacen`). El sensor nuevo no puede meterle
  dependencias al núcleo: vive en `windows/` + entry point, como el sensor de tecla.
- `windows/` ya se distribuye en `files` del paquete (`package.json`), junto a `pegador.ps1`
  y `altavoz.ps1`.
- Validación existente: `npm run build` (tsc) y `npm run prueba` (`node --test pruebas/*.ts`),
  ambos corren sin modelos ni red.
- Specs previas: `.claude/specs/013-dictado/` y `docs/SDD-dictado.md` (mapa sflow → dictado;
  sflow tenía menú de barra en macOS y se declaró «sustituido o fuera» — esto es su sustituto
  en Windows).

## LIBERTAD TÉCNICA

Tú eliges el mecanismo: NotifyIcon de WinForms desde PowerShell, un C# compilado al vuelo con
`Add-Type`, un acceso directo anclable que manda el toggle, una combinación (tray para estado +
acceso directo para anclar), u otra cosa mejor. Todo lo tecnológico de este spec es sugerencia
descartable salvo RESTRICCIONES. Investiga 2-3 referencias de toggles de micrófono/dictado en
tray de Windows (cómo comunican estado, qué hacen al reiniciar sesión) antes de decidir.

Espíritu no negociable heredado de `tecla-global.ps1`: el lado Windows se mantiene **pequeño,
legible y a la vista** — un humano lo lee en un minuto y ve que no hace nada más que lo que dice.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. Último output de `npm run build && npm run prueba` pegado, en verde, **con casos nuevos** que
   cubran el sensor-ícono (protocolo, toggle, estados) sin necesitar Windows para correr.
2. Demostración en vivo con el pipeline real corriendo: en los logs pegados se ve la secuencia
   click en ícono → activar → turno dictado con texto y latencia → click → apagar, con
   `--estado` antes y después.
3. El humano confirma en la conversación que el click en el ícono enciende y apaga el dictado, y
   que el estado se distingue a simple vista.
4. README de `tools/dictado` documenta el nuevo uso (instalación/anclado incluido, para humanos
   no técnicos); los seis usos existentes siguen intactos.
5. Reporte de decisiones: mecanismo elegido y por qué, qué pasa al reiniciar sesión de Windows,
   y la lista de formas en que podría estar mal/incompleto — resueltas o declaradas.

## COMANDO DE VALIDACIÓN

```bash
cd /home/kyara/code/template/tools/dictado && npm run build && npm run prueba
```

Córrelo tras cada cambio grande y surfea su output en la conversación.

## RESTRICCIONES REALES

- Vive en `tools/dictado/` de este template; respeta el contrato de empaquetado
  (`docs/EMPAQUETAR-HERRAMIENTA.md`): lo nuevo entra en `files`, el núcleo sigue sin dependencias.
- No se borra ni degrada ningún acceso existente (`--tecla`, ESPACIO, programático, `en-vivo`).
- Nada sale a la nube; sin instaladores pesados ni servicios de terceros en Windows.
- El micrófono solo está vivo cuando el estado dice que lo está: apagar apaga de verdad.
