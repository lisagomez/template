# Voz lista para terceros — resultados de la Etapa 2 (2026-09-20)

Compilada y ejecutada el mismo día, sin cifras del piloto con voz propia: donde hizo falta se
usaron las del corpus sintético y se dice. Cada cifra con su fuente.

## Instalación medida en limpio

Entorno: HOME nuevo y vacío en un temporal, proyecto limpio con `npm install` de los tarballs
de `voz` y `dictado`, red real, sin icono (`scripts/laboratorio-voz/mide-instalacion.mjs`).

| Paso | Quién | Tiempo |
|---|---|---|
| Empaquetar dictado (`npm pack`) | script | 0,4 s |
| `npm install` del tarball en el proyecto limpio | script | 1,6 s |
| `dictado instala --sin-icono`: comprobar, runtimes pineados (40,7 s), Parakeet (86,6 s), Silero, WeSpeaker, voz Piper, token, diagnóstico | script | 148,6 s |
| Primera transcripción con lo instalado (`dictado archivo`) | script | 3,2 s |

**Total: 2,6 minutos**, 0 acciones humanas en el script. Meta del plan: < 20 min y ≤ 6
acciones humanas. Lo que queda a mano, y que el instalador lista al final: permitir el
micrófono la primera vez, abrir la dirección en el teléfono y emparejar, y opcionalmente anclar
el icono; solo por LAN sin Tailscale, correr el script de red como administrador. 3 obligatorias
y 1 opcional. Lo que solo Windows puede verificar (icono en la barra, pegado en el foco) no se
mide aquí: la primera corrida destapó que el CLI no encontraba los runtimes instalados sin
variable de entorno, y se corrigió antes de la segunda.

## Diagnóstico sin secretos

`dictado diagnostico` en esta máquina: versión, nueve piezas en verde, pico del micrófono,
demonio vivo, líneas de estado de los logs (nunca las que llevan texto), dos sesiones recientes
con latencia p50, rutas con el usuario tapado. Comprobado con el token real: 0 apariciones; 0
correos, tokens o rutas de usuario. `limpiaParaCompartir` y `lineasUtilesDelLog` con prueba.

## Icono que se actualiza solo

La copia en Windows lleva la huella del script; `dictar --icono` la compara y refresca solo si
cambió («icono actualizado en Windows (version …)» / «icono al día»). Prueba de
`hayQueRefrescarIcono` en verde; `dictado icono instala` ya no hay que repetirlo.

## Red del celular, dos caminos

`docs/DICTADO-CELULAR-RED.md`: Tailscale (recomendado, sin certificado ni administrador) y LAN
(script de red como administrador y certificado). Medido con un iPhone emulado contra la
dirección real de Tailscale: emparejar un navegador limpio por enlace tardó **691 ms**, sin
desborde a 390 px, transcripción y call center por el mismo camino, 0 errores.

## Retención y borrado

`dictado historial --borra [--antes YYYY-MM-DD] --si` (sin `--si` solo dice qué borraría) y
retención automática al arrancar `dictar` con `DICTADO_RETENCION_DIAS` (365 por defecto, la
cifra de la AISIA firmada; 0 = nunca). Pruebas en memoria y en JSONL. Tabla «qué se guarda y
dónde» en el README de dictado.

## Lote sobre el demonio

Las tres reuniones simuladas con `--motor remoto` (el demonio en 127.0.0.1):

| Reunión | Antes (motor por proceso) | Después (demonio) | WER antes → después |
|---|---|---|---|
| r1-discovery, 57,3 s | 12,1 s (0,21×) | 4,2 s (0,07×) | 3,4 % → 2,7 % |
| r2-demo, 38,4 s | 9,0 s (0,24×) | 3,0 s (0,08×) | 3,9 % → 1,9 % |
| r3-negociacion, 33,6 s | 9,3 s (0,28×) | 2,7 s (0,08×) | 5,5 % → 5,5 % |

Meta < 0,15× cumplida. Etiquetado 100 % en las tres. El laboratorio hace lo mismo cuando el
demonio vive.

## Empaquetado sin publicar

`npm run empaqueta` de `voz`, `asesor-ventas` y `dictado`: contrato, build, tarball, integración
en un proyecto limpio y tipos, todo en verde. No se publicó nada: sigue siendo firma humana.

## Laboratorio

Ningún caso ni pieza cambió de estado en esta etapa: las 20 tarjetas siguen 13 LISTO, 5 POR
REGLAS, 2 PUERTA HUMANA. Lo que cambió es lo que hay detrás: el lote sobre el demonio y la
transcripción por el demonio en todas las rutas.

## Lo que queda para la Etapa 3 y fuera

- Llamadas en vivo a dos canales (C3 + AISIA propia + aviso legal, firma).
- La máquina que habla en tiempo real: `/sintetizar` en el demonio y barge-in.
- Educación (muletillas medidas contra conteo manual; menores exigen AISIA) y campo (corpus
  con ruido real).
- Linux de escritorio solo si alguien lo pide; macOS y GPU, no.
- Publicar los paquetes: firma.
- Y antes que nada: el piloto con voz propia, que esta etapa no tuvo.
