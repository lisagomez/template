<!-- ALTO: ARTEFACTO AUTOGENERADO desde detector.json y silero/*.json. No lo edites a mano: node scripts/centro-de-mando/resume-detector.ts -->
# Detector de voz del centro de mando: energía contra Silero, con ruido de sala

**Medido el 2026-10-17** (WSL2, Ryzen 7 5700G, sin GPU). Generado por `scripts/centro-de-mando/resume-detector.ts`; el método está en la cabecera de `mide-detector.ts` y de `mide.ts`.

## Fuera del navegador: el mismo detector del HUD sobre el mismo audio

46 frases (8.3 min por condición): frases leídas reales de FLEURS es_419 y las 16 órdenes del HUD dichas por Piper, a −26 dBFS de nivel activo, con 1,2-2,5 s de ruido entre una y otra y 60 s de ruido solo al final. Ruidos: rosa (continuo), teclado y golpes, música sintética, murmullo de seis voces reales de FLEURS (frases que no son de prueba) y cinco salas reales de DEMAND (oficina, junta, sala de estar, cocina, cafetería; CC BY 4.0). Se evalúa por frase: **entera** = un solo turno la cubre de punta a punta (±300 ms) y no toca otra frase; el cierre es del fin real de la voz a que el detector emite el fin del turno. «Ambos» = Silero con una puerta de nivel a 3 dB sobre el suelo calibrado.

| Ruido | SNR | Frases enteras: energía · **Silero** · ambos | Órdenes enteras: energía · **Silero** · ambos | Cierre p50: energía · Silero | Disparos falsos/min: energía · Silero |
|---|---|---|---|---|---|
| limpio | — | 82.6 % · **87 %** · 84.8 % | 100 % · **100 %** · 100 % | 614 ms · 714 ms | 0 · 0 |
| rosa | 20 dB | 65.2 % · **87 %** · 78.3 % | 100 % · **100 %** · 100 % | 521 ms · 729 ms | 0 · 0 |
| rosa | 10 dB | 6.5 % · **89.1 %** · 65.2 % | 18.8 % · **100 %** · 100 % | 409 ms · 736 ms | 0 · 0 |
| rosa | 5 dB | 0 % · **89.1 %** · 34.8 % | 0 % · **100 %** · 81.3 % | — · 729 ms | 0 · 0 |
| rosa | 0 dB | 0 % · **89.1 %** · 0 % | 0 % · **100 %** · 0 % | — · 761 ms | 0 · 0 |
| teclado | 20 dB | 78.3 % · **87 %** · 84.8 % | 100 % · **100 %** · 100 % | 591 ms · 729 ms | 10 · 0 |
| teclado | 10 dB | 63 % · **84.8 %** · 76.1 % | 100 % · **100 %** · 100 % | 489 ms · 732 ms | 10 · 0 |
| teclado | 5 dB | 34.8 % · **84.8 %** · 71.7 % | 93.8 % · **100 %** · 100 % | 494 ms · 736 ms | 10 · 0 |
| teclado | 0 dB | 8.7 % · **89.1 %** · 67.4 % | 25 % · **100 %** · 100 % | 409 ms · 751 ms | 10 · 0 |
| musica | 20 dB | 67.4 % · **89.1 %** · 82.6 % | 100 % · **100 %** · 100 % | 527 ms · 729 ms | 0 · 0 |
| musica | 10 dB | 10.9 % · **84.8 %** · 71.7 % | 31.3 % · **87.5 %** · 100 % | 400 ms · 736 ms | 0 · 0 |
| musica | 5 dB | 0 % · **84.8 %** · 73.9 % | 0 % · **87.5 %** · 100 % | — · 737 ms | 0 · 0 |
| musica | 0 dB | 0 % · **89.1 %** · 45.7 % | 0 % · **100 %** · 75 % | — · 688 ms | 0 · 0 |
| murmullo | 20 dB | 67.4 % · **71.7 %** · 76.1 % | 100 % · **75 %** · 93.8 % | 522 ms · 778 ms | 0 · 1 |
| murmullo | 10 dB | 13 % · **0 %** · 15.2 % | 37.5 % · **0 %** · 25 % | 441 ms · — | 0 · 0 |
| murmullo | 5 dB | 6.5 % · **0 %** · 17.4 % | 18.8 % · **0 %** · 31.3 % | 409 ms · — | 0 · 0 |
| murmullo | 0 dB | 0 % · **0 %** · 13 % | 0 % · **0 %** · 25 % | — · — | 0 · 0 |
| OOFFICE | 20 dB | 69.6 % · **87 %** · 82.6 % | 100 % · **100 %** · 100 % | 537 ms · 729 ms | 0 · 0 |
| OOFFICE | 10 dB | 30.4 % · **89.1 %** · 84.8 % | 87.5 % · **100 %** · 100 % | 494 ms · 735 ms | 0 · 0 |
| OOFFICE | 5 dB | 0 % · **89.1 %** · 82.6 % | 0 % · **100 %** · 100 % | — · 736 ms | 0 · 0 |
| OOFFICE | 0 dB | 0 % · **89.1 %** · 82.6 % | 0 % · **100 %** · 100 % | — · 736 ms | 0 · 0 |
| OMEETING | 20 dB | 69.6 % · **82.6 %** · 82.6 % | 100 % · **81.3 %** · 93.8 % | 563 ms · 761 ms | 1 · 12 |
| OMEETING | 10 dB | 32.6 % · **45.7 %** · 71.7 % | 87.5 % · **31.3 %** · 81.3 % | 505 ms · 863 ms | 1 · 8 |
| OMEETING | 5 dB | 4.3 % · **32.6 %** · 69.6 % | 12.5 % · **31.3 %** · 81.3 % | 897 ms · 1375 ms | 1 · 8 |
| OMEETING | 0 dB | 0 % · **10.9 %** · 54.3 % | 0 % · **12.5 %** · 81.3 % | — · 1275 ms | 1 · 7 |
| DLIVING | 20 dB | 67.4 % · **87 %** · 78.3 % | 100 % · **100 %** · 100 % | 511 ms · 729 ms | 0 · 0 |
| DLIVING | 10 dB | 10.9 % · **80.4 %** · 67.4 % | 31.3 % · **87.5 %** · 100 % | 423 ms · 743 ms | 0 · 0 |
| DLIVING | 5 dB | 0 % · **78.3 %** · 43.5 % | 0 % · **81.3 %** · 93.8 % | — · 782 ms | 0 · 0 |
| DLIVING | 0 dB | 0 % · **78.3 %** · 6.5 % | 0 % · **81.3 %** · 18.8 % | — · 865 ms | 0 · 0 |
| DKITCHEN | 20 dB | 67.4 % · **87 %** · 87 % | 100 % · **100 %** · 100 % | 521 ms · 729 ms | 1 · 0 |
| DKITCHEN | 10 dB | 17.4 % · **87 %** · 82.6 % | 50 % · **100 %** · 100 % | 423 ms · 735 ms | 1 · 0 |
| DKITCHEN | 5 dB | 0 % · **87 %** · 82.6 % | 0 % · **100 %** · 100 % | — · 732 ms | 1 · 0 |
| DKITCHEN | 0 dB | 0 % · **89.1 %** · 73.9 % | 0 % · **100 %** · 93.8 % | — · 742 ms | 1 · 0 |
| PCAFETER | 20 dB | 67.4 % · **87 %** · 78.3 % | 100 % · **100 %** · 100 % | 527 ms · 732 ms | 1 · 0 |
| PCAFETER | 10 dB | 13 % · **87 %** · 69.6 % | 37.5 % · **100 %** · 100 % | 423 ms · 768 ms | 1 · 0 |
| PCAFETER | 5 dB | 0 % · **89.1 %** · 47.8 % | 0 % · **93.8 %** · 93.8 % | — · 927 ms | 1 · 1 |
| PCAFETER | 0 dB | 0 % · **56.5 %** · 2.2 % | 0 % · **31.3 %** · 6.3 % | — · 1562 ms | 1 · 7 |

| Detector | Frases enteras con ruido (media) | (mediana) | Órdenes enteras (media) |
|---|---|---|---|
| energia | 24.2 % | 10.9 % | 42.5 % |
| silero | 73.3 % | 87 % | 80 % |
| ambos-3 | 61.2 % | 71.7 % | 82.7 % |

Silero cuesta 0.136 ms por marco de 32 ms en Node (p50 de todas las condiciones).

## De punta a punta en el HUD (Chromium con micrófono falso)

Las órdenes y la conversación como en `resumen.md`; «resueltas por orden local» = el turno llegó al enrutador y salió por una orden. Con ruido, la voz va a −26 dBFS y el ruido suena desde antes de encender.

| Detector | Condición | Órdenes: resueltas por orden local | Fin real → suena, p50 · p95 | «Para.»: cortes | Reacción p50 | Frases del turno viejo tras callar | Auto-interrupciones con eco −20 dB |
|---|---|---|---|---|---|---|---|
| energia | PCAFETER a 10 dB | 1 de 16 | 1307 ms · 56755 ms | 3 de 8 | 2314 ms | 0 | 0 de 6 |
| energia | limpio | 31 de 32 | 617 ms · 997 ms | 8 de 8 | 227 ms | 0 | 0 de 6 |
| silero | PCAFETER a 10 dB | 15 de 16 | 768 ms · 2073 ms | 4 de 8 | 287 ms | 1 | 0 de 6 |
| silero (antes del arreglo del eco) | limpio | 30 de 32 | 730 ms · 1871 ms | 8 de 8 | 204 ms | 0 | 6 de 6 |
| silero | limpio | 31 de 32 | 708 ms · 1011 ms | 8 de 8 | 204 ms | 0 | 0 de 6 |

