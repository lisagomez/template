# Spike de llamada a dos canales — 2026-09-21

Reunión `r1-discovery` (57.3 s, 12 turnos, dos voces Piper) montada en dos pistas con sangrado de -60 dB del otro canal. Un Silero por canal, bloques de 320 ms, cada fin de turno al demonio y el asesor sobre lo acumulado. **Audio propio: nada se conectó a una llamada real.**

| métrica | valor | umbral |
|---|---|---|
| etiquetado correcto | 100 % | 100 % |
| turnos en el canal equivocado (o fantasmas por sangrado) | 0 | 0 |
| WER | 2.7 % | < 10 % |
| fin de turno → insight (transcribir + analizar) p50 / p95 | 240 / 324 ms | p50 < 1 500 ms |
| más el cierre del VAD | +500 ms | fijo |
| turnos detectados / verdad | 12 / 12 | |
| turnos descartados por sangrado (regla de dominancia activa) | 1 | |
| proceso / duración | 0.06× | |
| score del asesor · insights · huecos | 58 · 7 · impacto, proceso_decision, presupuesto, competencia | |

## Por turno

| turno | canal | duración | transcribir | analizar | total | insights (nuevos) |
|---|---|---|---|---|---|---|
| 1 | asesor | 5.7 s | 299 ms | 11 ms | 309 ms | 0 (+0) |
| 2 | cliente | 5.8 s | 322 ms | 2 ms | 324 ms | 1 (+1) |
| 3 | asesor | 2.9 s | 156 ms | 1 ms | 157 ms | 1 (+0) |
| 4 | cliente | 4.3 s | 240 ms | 0 ms | 240 ms | 1 (+0) |
| 5 | asesor | 2.5 s | 154 ms | 4 ms | 158 ms | 1 (+0) |
| 6 | cliente | 4.5 s | 255 ms | 1 ms | 256 ms | 2 (+1) |
| 7 | asesor | 4.1 s | 225 ms | 0 ms | 225 ms | 2 (+0) |
| 8 | cliente | 4.6 s | 251 ms | 4 ms | 255 ms | 4 (+2) |
| 9 | asesor | 2.1 s | 126 ms | 0 ms | 126 ms | 4 (+0) |
| 10 | cliente | 3.3 s | 195 ms | 0 ms | 196 ms | 5 (+1) |
| 11 | asesor | 4.6 s | 238 ms | 1 ms | 239 ms | 6 (+1) |
| 12 | cliente | 4.2 s | 247 ms | 1 ms | 248 ms | 7 (+1) |

Lo que el spike NO mide: la captura real (WSLg no ve el audio de Zoom/Teams en Windows), la cancelación de eco de una llamada, ni el consentimiento. Eso es el ayudante de Windows (PRP nuevo, CDC si trae DLL) y las tres firmas.
