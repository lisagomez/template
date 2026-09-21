# Spike de llamada a dos canales — 2026-09-21

Reunión `r1-discovery` (57.3 s, 12 turnos, dos voces Piper) montada en dos pistas con sangrado de -20 dB del otro canal. Un Silero por canal, bloques de 320 ms, cada fin de turno al demonio y el asesor sobre lo acumulado. **Audio propio: nada se conectó a una llamada real.**

| métrica | valor | umbral |
|---|---|---|
| etiquetado correcto | 50 % | 100 % |
| turnos en el canal equivocado (o fantasmas por sangrado) | 12 | 0 |
| WER | 100.7 % | < 10 % |
| fin de turno → insight (transcribir + analizar) p50 / p95 | 238 / 316 ms | p50 < 1 500 ms |
| más el cierre del VAD | +500 ms | fijo |
| turnos detectados / verdad | 24 / 12 | |
| turnos descartados por sangrado (regla de dominancia APAGADA) | 0 | |
| proceso / duración | 0.11× | |
| score del asesor · insights · huecos | 63 · 10 · impacto, proceso_decision, presupuesto, competencia | |

## Por turno

| turno | canal | duración | transcribir | analizar | total | insights (nuevos) |
|---|---|---|---|---|---|---|
| 1 | asesor | 5.7 s | 306 ms | 11 ms | 316 ms | 0 (+0) |
| 2 | cliente | 5.7 s | 322 ms | 2 ms | 324 ms | 0 (+0) |
| 3 | asesor | 5.9 s | 293 ms | 1 ms | 294 ms | 0 (+0) |
| 4 | cliente | 5.8 s | 301 ms | 2 ms | 303 ms | 1 (+1) |
| 5 | asesor | 2.9 s | 155 ms | 3 ms | 158 ms | 1 (+0) |
| 6 | cliente | 2.9 s | 176 ms | 0 ms | 177 ms | 1 (+0) |
| 7 | asesor | 4.3 s | 245 ms | 0 ms | 246 ms | 1 (+0) |
| 8 | cliente | 4.3 s | 243 ms | 0 ms | 244 ms | 1 (+0) |
| 9 | asesor | 2.5 s | 142 ms | 0 ms | 143 ms | 1 (+0) |
| 10 | cliente | 2.5 s | 155 ms | 0 ms | 155 ms | 1 (+0) |
| 11 | asesor | 4.5 s | 233 ms | 1 ms | 234 ms | 1 (+0) |
| 12 | cliente | 4.6 s | 263 ms | 0 ms | 264 ms | 2 (+1) |
| 13 | asesor | 4.1 s | 216 ms | 0 ms | 217 ms | 2 (+0) |
| 14 | cliente | 4.1 s | 238 ms | 0 ms | 238 ms | 3 (+1) |
| 15 | asesor | 4.6 s | 233 ms | 0 ms | 233 ms | 3 (+0) |
| 16 | cliente | 4.6 s | 281 ms | 1 ms | 281 ms | 5 (+2) |
| 17 | asesor | 2.1 s | 128 ms | 0 ms | 128 ms | 5 (+0) |
| 18 | cliente | 2.1 s | 142 ms | 0 ms | 143 ms | 6 (+1) |
| 19 | asesor | 3.4 s | 193 ms | 0 ms | 193 ms | 6 (+0) |
| 20 | cliente | 3.4 s | 207 ms | 1 ms | 207 ms | 7 (+1) |
| 21 | asesor | 4.6 s | 253 ms | 1 ms | 254 ms | 8 (+1) |
| 22 | cliente | 4.6 s | 268 ms | 1 ms | 269 ms | 9 (+1) |
| 23 | asesor | 4.2 s | 225 ms | 1 ms | 226 ms | 9 (+0) |
| 24 | cliente | 4.2 s | 245 ms | 1 ms | 246 ms | 10 (+1) |

Lo que el spike NO mide: la captura real (WSLg no ve el audio de Zoom/Teams en Windows), la cancelación de eco de una llamada, ni el consentimiento. Eso es el ayudante de Windows (PRP nuevo, CDC si trae DLL) y las tres firmas.
