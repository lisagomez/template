# Calibración sobre corpus propio — 2026-09-20

Corpus: `./medicion/corpus-propio/sintetico` (90 archivos, 3 condiciones) · motor `sherpa:nemo-parakeet-tdt-0.6b-v3-int8`

## A · Precisión y latencia por condición

| condición | n | WER crudo | WER con cifras igualadas | CER | p50 | p95 |
|---|---|---|---|---|---|---|
| celular | 30 | 11.2 % | 6.3 % | 7.5 % | 253 ms | 297 ms |
| limpio | 30 | 10.9 % | 5.1 % | 8.0 % | 247 ms | 312 ms |
| ruido | 30 | 9.8 % | 4.5 % | 7.2 % | 267 ms | 316 ms |

WER crudo compara palabra a palabra tal como sale del motor; «con cifras igualadas» convierte los números en palabras de ambas partes a cifras («tres mil cuatrocientos doce» = «3412»), que es lo que un lector considera correcto. El resto de errores son nombres propios y jerga (los términos del diccionario).

## B · VAD: cierre por silencio y relleno (limpio + ruido)

| cierre | relleno | frases partidas | sin voz | con palabras comidas |
|---|---|---|---|---|
| 500 ms | 100 ms | 0/60 (0.0 %) | 0 | 1 (1.7 %) |
| 500 ms | 250 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 500 ms | 400 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 700 ms | 100 ms | 0/60 (0.0 %) | 0 | 1 (1.7 %) |
| 700 ms | 250 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 700 ms | 400 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 1000 ms | 100 ms | 0/60 (0.0 %) | 0 | 1 (1.7 %) |
| 1000 ms | 250 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 1000 ms | 400 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 1500 ms | 100 ms | 0/60 (0.0 %) | 0 | 1 (1.7 %) |
| 1500 ms | 250 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |
| 1500 ms | 400 ms | 0/60 (0.0 %) | 0 | 0 (0.0 %) |

### Puerta de energía: turnos fantasma sobre ruido sin voz (6 s de ruido rosa)

| ruido | turnos que abre el VAD | pasan −60 | pasan −50 | pasan −45 | pasan −40 |
|---|---|---|---|---|---|
| -60 dBFS | 0 | 0 | 0 | 0 | 0 |
| -50 dBFS | 0 | 0 | 0 | 0 | 0 |
| -45 dBFS | 0 | 0 | 0 | 0 | 0 |
| -40 dBFS | 0 | 0 | 0 | 0 | 0 |
| -35 dBFS | 0 | 0 | 0 | 0 | 0 |

## C · Corrección por similitud del diccionario

Términos: Luis Fernando Ramírez, Aceros del Norte, Monterrey, Supabase, Hermes, SaaS Factory, Guadalajara, Ana Martínez, Pedro Aguilar, Carla, Cotizapp

| condición | archivos con sustitución | mejora | empeora | igual |
|---|---|---|---|---|
| celular | 0 | 0 | 0 | 30 |
| limpio | 0 | 0 | 0 | 30 |
| ruido | 0 | 0 | 0 | 30 |
