# Calibración sobre corpus propio — 2026-09-21

Corpus: `./medicion/corpus-propio/campo` (330 archivos, 11 condiciones) · motor `sherpa:nemo-parakeet-tdt-0.6b-v3-int8`

## A · Precisión y latencia por condición

| condición | n | WER crudo | WER con cifras igualadas | CER | p50 | p95 |
|---|---|---|---|---|---|---|
| almacen | 30 | 9.8 % | 4.2 % | 7.1 % | 234 ms | 273 ms |
| calle | 30 | 10.1 % | 3.6 % | 7.8 % | 224 ms | 271 ms |
| flojo | 30 | 8.9 % | 3.9 % | 6.2 % | 220 ms | 268 ms |
| fuerte | 30 | 11.2 % | 4.9 % | 8.1 % | 224 ms | 257 ms |
| limpio | 30 | 10.9 % | 4.5 % | 8.0 % | 224 ms | 264 ms |
| reverb | 30 | 12.1 % | 6.1 % | 8.1 % | 232 ms | 275 ms |
| snr00 | 30 | 18.1 % | 12.4 % | 11.1 % | 242 ms | 277 ms |
| snr05 | 30 | 13.9 % | 7.9 % | 8.9 % | 235 ms | 281 ms |
| snr10 | 30 | 12.1 % | 6.1 % | 8.1 % | 334 ms | 480 ms |
| snr20 | 30 | 11.2 % | 5.5 % | 7.6 % | 327 ms | 421 ms |
| taller | 30 | 11.2 % | 5.1 % | 8.0 % | 350 ms | 420 ms |

WER crudo compara palabra a palabra tal como sale del motor; «con cifras igualadas» convierte los números en palabras de ambas partes a cifras («tres mil cuatrocientos doce» = «3412»), que es lo que un lector considera correcto. El resto de errores son nombres propios y jerga (los términos del diccionario).

## B · VAD: cierre por silencio y relleno (almacen + limpio + snr00 + snr10)

| cierre | relleno | frases partidas | sin voz | con palabras comidas |
|---|---|---|---|---|
| 500 ms | 100 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 500 ms | 250 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 500 ms | 400 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 700 ms | 100 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 700 ms | 250 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 700 ms | 400 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 1000 ms | 100 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 1000 ms | 250 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 1000 ms | 400 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 1500 ms | 100 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 1500 ms | 250 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |
| 1500 ms | 400 ms | 0/120 (0.0 %) | 0 | 6 (5.0 %) |

### Puerta de energía: turnos fantasma sobre ruido sin voz (6 s de ruido rosa)

| ruido | turnos que abre el VAD | pasan −60 | pasan −50 | pasan −45 | pasan −40 |
|---|---|---|---|---|---|
| -60 dBFS | 0 | 0 | 0 | 0 | 0 |
| -50 dBFS | 0 | 0 | 0 | 0 | 0 |
| -45 dBFS | 0 | 0 | 0 | 0 | 0 |
| -40 dBFS | 0 | 0 | 0 | 0 | 0 |
| -35 dBFS | 0 | 0 | 0 | 0 | 0 |
| calle sin voz (-25 dBFS pico) | 0 | 0 | 0 | 0 | 0 |
| taller sin voz (-27 dBFS pico) | 0 | 0 | 0 | 0 | 0 |

## C · Corrección por similitud del diccionario

Términos: Luis Fernando Ramírez, Aceros del Norte, Monterrey, Supabase, Hermes, SaaS Factory, Guadalajara, Ana Martínez, Pedro Aguilar, Carla, Cotizapp

| condición | archivos con sustitución | mejora | empeora | igual |
|---|---|---|---|---|
| almacen | 0 | 0 | 0 | 30 |
| calle | 0 | 0 | 0 | 30 |
| flojo | 0 | 0 | 0 | 30 |
| fuerte | 0 | 0 | 0 | 30 |
| limpio | 0 | 0 | 0 | 30 |
| reverb | 0 | 0 | 0 | 30 |
| snr00 | 0 | 0 | 0 | 30 |
| snr05 | 0 | 0 | 0 | 30 |
| snr10 | 0 | 0 | 0 | 30 |
| snr20 | 0 | 0 | 0 | 30 |
| taller | 0 | 0 | 0 | 30 |
