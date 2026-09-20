# Voz lista para usuarios — resultados de las Etapas 0 y 1 (2026-09-20)

Lo que el goal construyó y midió. Cada cifra con su fuente; el verde nunca tapa la cifra.

## Antes / después: latencia de las rutas web (frase de 3,9 s, Parakeet int8)

| Ruta | Antes (CLI por proceso) | Después (demonio) | Sin demonio (caída al CLI) |
|---|---|---|---|
| `/api/dictado/movil` | p50 2 940 ms · p95 3 879 ms | **p50 319 ms** · p95 339 ms · motor 197 ms | p50 2 935 ms, `via: cli` |
| `/api/laboratorio/transcribir` | p50 2 921 ms · p95 3 091 ms | **p50 312 ms** · p95 349 ms · motor 210 ms | p50 2 886 ms, `via: cli` |

Meta del plan: < 800 ms. Medido con `scripts/laboratorio-voz/mide-latencia.mjs` (7 repeticiones).
El demonio: `npm run demonio` en `tools/dictado` (servicio HTTP en 127.0.0.1:47125, Bearer = token
del celular, 917 MB de RAM); `en-vivo` lo levanta y lo para. Las rutas lo prueban con `/health`
(400 ms de tope, caché de 3 s) y caen al CLI si no responde.

## Trayectoria del dictado (forma, sin contenido)

Sesión real de `dictar` con `--entrada` (archivo como micrófono, 5 frases sintéticas, 29 s):
5 turnos, 0 sin voz, latencia p50 237 ms · p95 301 ms, motor p50 237 ms, pico −15,5 dBFS.
`herramientas-44bb4690` ingerida (`npm run trayectorias:ingesta`), verificada sin contenido
(29 archivos conformes) y visible en `npm run trayectorias:informe` como `latenciaP50Ms` de
`herramientas · dictado` (sin base de comparación hasta tener 3 por periodo).

## Micrófono

- Cerrado en espera por defecto: abre en 262 ms la primera vez y en 71 ms al reabrir (PulseAudio
  de WSLg, medido con el micrófono real y `--alterna-cada 5000`); cierra 1,5 s después de parar.
- `--ganancia-db auto`: sube 6 dB si una escucha con texto entra por debajo de −30 dBFS, baja 6 dB
  si satura, avisa si el micrófono satura sin ganancia. Opcional; probado en `pruebas/ganancia.ts`.

## Calibración sobre corpus propio (sintético, 90 audios)

| condición | WER crudo | WER cifras igualadas | CER | p50 |
|---|---|---|---|---|
| limpio | 10,9 % | 5,1 % | 8,0 % | 247 ms |
| ruido de oficina | 9,8 % | 4,5 % | 7,2 % | 267 ms |
| celular | 11,2 % | 6,3 % | 7,5 % | 253 ms |

VAD: 0/60 frases partidas con cierres de 500 a 1500 ms; 0 palabras comidas con relleno ≥ 250 ms;
0 turnos fantasma con ruido rosa de −60 a −35 dBFS. Diccionario por similitud: 0 sustituciones en
90 archivos. **Decisión: sin cambio de umbrales** (entrada firmada en `BITACORA-CDC.md` el 2026-09-20). Pendiente: la
misma tabla con voz propia (`frases.txt`, tres condiciones, `calibra.mjs`).

## Reuniones de ventas simuladas (dos voces Piper, una pista)

| reunión | duración | turnos | etiquetado | WER | proceso | score | huecos |
|---|---|---|---|---|---|---|---|
| r1-discovery | 57,3 s | 12/12 | 100 % | 3,4 % | 12,1 s (0,21×) | 58 | impacto, proceso, presupuesto, competencia |
| r2-demo | 38,4 s | 8/8 | 100 % | 3,9 % | 9,0 s (0,24×) | 30 | 7 dimensiones |
| r3-negociacion | 33,6 s | 8/8 | 100 % | 5,5 % | 9,3 s (0,28×) | 45 | 7 dimensiones |

Umbrales: etiquetado ≥ 90 % ✓ · WER < 10 % ✓ · proceso < 0,15× ✗ (el lote arranca el motor por
proceso, ~3 s fijos; con el demonio sirviendo también al lote bajaría) · score ±10 del veredicto
humano: pendiente de veredicto. Acta Markdown exportable desde el panel de reunión (probado: 70
líneas). Golden set del asesor: 5 guiones con rango esperado, 13/13 pruebas, rangos pendientes de
veredicto humano.

## Laboratorio

- WER/CER con texto de referencia en el panel de transcribir (muestra: 0,0 %, 589 ms por el demonio).
- Veredicto con rol, dispositivo y métricas; informe con columnas WER, latencia y quién·dónde.
- «Tus datos de dictado»: diccionario, snippets e historial con corrección y candidatos (probado:
  término añadido, snippet añadido, corrección con candidato «Cotizapp» aceptado).
- Defecto cazado: el motor del asesor cachea por id de transcripción y el laboratorio usaba
  siempre el mismo id; ahora el id deriva del contenido (prueba en `reglas.ts`).
- Defecto cazado: la muestra mono con 500 ms de hueco salía como un solo turno con cierre de
  700 ms; ahora 1 s de hueco y cierre de 500 ms (el defecto del CLI).

## Firmas (2026-09-20, por quien decide, en sesión)

- `BUSINESS_LOGIC.md`: firmado como hipótesis del piloto; los [supuesto] se confirman con las
  cifras del piloto y la entrevista `/new-app` antes de la Etapa 2.
- `.claude/gobernanza/AISIA-asesor-ventas-fase0.md`: firmada, retención de 12 meses.
- `BITACORA-CDC.md`: entrada de calibración y micrófono en espera, firmada.
- `propuesta-cdc-pyannet.md`: NO firmable todavía; exige medir antes de aprobar.

## Lo que queda para la Etapa 2 (terceros)

Instalador de máquina nueva sin corpus, icono que se actualiza solo, red del celular con dos
caminos documentados, `dictado diagnostico`, retención y borrado, GPU sin medir. Y antes: dos
semanas de piloto con voz propia para fijar los umbrales con datos reales.
