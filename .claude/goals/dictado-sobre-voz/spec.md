# Dictado y voz alineadas — una sola familia — Spec

Compilado por `/goal-compiler` el 2026-09-21. Forma: **LOOP**. Lo que se pega en `/goal` es
`goal.txt`, NO este archivo. Punto de partida: `main` con el PR #139 (ajustes) mezclado, o la rama
`ajustes-dictado` si aún no lo está. Decisiones de quien decide (2026-09-21): **«voz está más
completo»** → `tools/voz` es la referencia del contrato y de la forma; y **«alinear los dos»** →
la alineación va en las dos direcciones: dictado toma de voz el contrato y la forma de
documentar; voz toma de dictado lo que dictado hace mejor como paquete (medición que deja un
JSON y siembra el README, pesos pineados declarados, «qué se guarda y dónde»). voz sube a 0.5.0
sin publicar, compatible con 0.4.0.

## LO QUE HAY (hechos medidos el 2026-09-21)

`tools/voz` 0.4.0: núcleo TypeScript puro sin dependencias (`ModeloVoz`, `ModeloHablante`,
`Turno`, `EventoVoz`, `OpcionesDetector`, `Transcriptor`), VAD con histéresis y relleno
(`creaDetectorVoz`, defectos 500/120/200 ms pensados para barge-in), `modeloEnergia`, fbank,
remuestreo, diarización por lotes y en vivo, registro de voces, `transcribeTurnos`; entradas
`.`, `./node` (Silero, WeSpeaker, `leeWav`, `pcm16aFloat`, `preparaParaModelo`) y `./browser`
(micrófono); 90 pruebas contra `dist/`, `npm run mide`, `npm run demo`; README con «Qué hace y
qué no», cinco usos, **«Los mandos que de verdad importan»** y **«Avisos que ahorran una tarde»**.
La app la consume en el navegador (`src/features/laboratorio-voz/hooks/use-interrupcion.ts`
importa `tools/voz/dist/{index,browser/index}.js`).

`tools/dictado` 0.1.0 consume voz (`creaDetectorVoz`, `creaModeloSilero`, `fbank`,
`creaDiarizador`, `fusionaTurnos`, `creaModeloHablante`, `leeWav`, `pcm16aFloat`,
`preparaParaModelo`), pineada exacta por tarball (`scripts/prepara-voz.mjs` la rechaza si no
está pineada o si `tools/voz` cambió de versión sin querer). Diverge en cuatro sitios:

| Dónde | dictado hoy | voz hoy | Alinear = |
|---|---|---|---|
| Tipos del contrato (`Muestras`, `Turno`, `EventoVoz`, `DetectorVoz`) | **redeclarados** en `src/types.ts` «estructuralmente iguales» para no importar voz ni en tipos; nadie comprueba que sigan iguales | los define | una sola dueña: o dictado importa los de voz, o una prueba de tipos demuestra que son idénticos (`satisfies`); un comentario no vale |
| `Transcriptor` | superconjunto con `OpcionesTranscribe` (idioma, pista) y `Transcripcion` (idioma, ms) | `transcribe(muestras, hz)` sin opciones; `transcribeTurnos` no puede pasar idioma ni pista | el contrato con opciones vive en voz (compatible hacia atrás: un `Transcriptor` 0.4 sigue valiendo); `transcribeTurnos` las pasa; dictado usa el de voz |
| Defectos del VAD | `DEFECTOS_DICTADO` (1000/200/250, umbrales 0,5/0,35) en `src/node/vad.ts`, **medidos** (700 ms parte el 6,7 % de las frases) | 500/120/200 para barge-in, sin nombre | voz ofrece los perfiles con nombre y con su medición (`bargeIn` = lo de hoy, sin cambiar a nadie; `dictado` = lo medido); dictado los toma de ahí |
| Energía y nivel | `nivelDb` en `audio.ts`, puerta de energía en `cli-dictar.ts` (pico por ventana de 30 ms contra un umbral), `ganancia.ts` | `modeloEnergia` (RMS → probabilidad) y nada de dB | una sola aritmética de nivel: voz la ofrece (`nivelDb`/pico por ventanas junto a `modeloEnergia`) y dictado la usa; la ganancia automática es de dictado |
| WAV | `floatAPcm16`, `escribeWav` en dictado | `pcm16aFloat`, `leeWav` en voz | las inversas viven juntas, en `voz/node` |
| Forma del README | 11 secciones de uso, sin «mandos» ni «avisos» | «Qué hace y qué no» · usos · **mandos que importan** · **avisos que ahorran una tarde** · pruebas · medición · demo | dictado gana esas dos tablas con SUS mandos (silencio, ganancia, umbral de voz, pegado, respaldo, retención) y SUS avisos (los vividos: saturación, mic cerrado, pkill, WAV por tubería…) |
| Pruebas | 118 contra `dist/`, por módulo | 90 contra `dist/`, por módulo | igual ya; lo nuevo entra con prueba |

Lo que **no** se alinea porque no es de voz: WER (`texto/wer.ts`), cantidades (`numeros.ts`),
posproceso, pegado, historial, ajustes, píldora, remoto. Voz no transcribe ni pega: se aparta.

**Y en la otra dirección, lo que voz toma de dictado** (medido el 2026-09-21):

| Dónde | voz hoy | dictado hoy | Alinear = |
|---|---|---|---|
| Medición | `npm run mide` imprime por consola y «los números de referencia están en el README»: se copian a mano | deja `medicion/ultima-medicion-cpu.json` (fecha, máquina, corpus, motores) y el README lleva marcadores (`<!-- LECTURA_MOTORES -->`) que se siembran desde ahí; el catálogo de `/ajustes` lo lee | voz deja su JSON con la misma forma (fecha, máquina, corpus, cifras por caso) y siembra su README por marcadores; a mano, nunca más |
| Pesos | URLs sueltas dentro de `medicion/mide.mjs` | `src/node/pesos.ts`: `NECESARIOS` y `RUNTIMES` pineados (URL exacta, MB), probados (`pruebas/instala.ts`) | voz declara sus pesos y runtimes pineados en un módulo probado, y `mide` y `demo` los leen de ahí |
| Qué se guarda y dónde | el registro de voces (vectores con nombre) sobrevive a la sesión, y el README no dice dónde ni cómo se borra | §10 «Qué se guarda y dónde (y cómo se borra)»: tabla con contenido sí/no y cómo borrar | voz gana esa tabla (registro de voces, banco de pesos, audio de medición): datos biométricos, C4 |
| Diagnóstico | nada | `dictado diagnostico` sin secretos, pegable en un issue | voz gana un `npm run diagnostico` mínimo (versión, runtimes, pesos presentes, sin rutas de usuario) reutilizando `limpiaParaCompartir` o su equivalente |

## MISION

Que `dictado` sea una consumidora **limpia** de `voz`: un solo dueño para cada contrato y cada
aritmética de audio, cero copias «estructuralmente iguales» sin prueba, defectos con nombre y
medición en el sitio que los mide, y la misma forma de documentar y probar que voz (la más
completa de las dos). Que voz 0.5.0 sea un superconjunto compatible de 0.4.0: la app en el
navegador y cualquier consumidor de 0.4 siguen sin tocar una línea. Y que nada de esto mueva
una cifra: ni la latencia del dictado ni los defectos medidos del VAD ni el barge-in del
laboratorio.

Nivel referencia: dos paquetes de una misma familia que se leen como escritos por la misma mano:
mismo esqueleto de README, mismos guiones (`build`, `prueba`, `mide`, `empaqueta`), misma forma
de medición, mismos pesos declarados, mismo cuidado con lo que se guarda.

## LIBERTAD TECNICA

Tú decides cómo se comparte el contrato (importar tipos de voz frente a copia verificada por
prueba de tipos), dónde viven los perfiles del detector, la forma de las utilidades de nivel,
y cómo se demuestra la compatibilidad 0.4 → 0.5. Lo de arriba es diagnóstico y sugerencia, no
receta, salvo RESTRICCIONES. Reafirma el objetivo en una línea antes de cada edición grande.

## INVESTIGA ANTES DE CONSTRUIR

Lee entero `tools/voz/src/{types,index,node/index,vad/detector,vad/energia,asr/adaptador}.ts`
y su README; `tools/dictado/src/{types,index,node/{vad,audio,ganancia,index,cli-dictar}}.ts`,
`scripts/prepara-voz.mjs` y su README; `docs/SDD-dictado.md` §3 y §5; `docs/EMPAQUETAR-HERRAMIENTA.md`
y `scripts/empaqueta-herramienta.mjs` (el empaquetador PRUEBA la integración instalando el
tarball en un proyecto limpio); y cómo la app importa voz en el navegador. Mira 2-3 referencias
de cómo una familia de paquetes comparte un contrato sin duplicarlo (peer de tipos, paquete de
tipos, re-export) y decide.

## DEFINICION DE HECHO (evidencia visible en la conversación)

1. Validación en verde pegada tras cada cambio grande; al cerrar, `npm run empaqueta voz`,
   `npm run empaqueta dictado` y `npm run validate` en verde, pegados.
2. **Superficie pública de voz antes/después** (lista de exports y firmas): solo añadidos, ninguna
   firma rota; prueba pegada de que un `Transcriptor` escrito contra 0.4 sigue compilando contra
   0.5, y que la app (`use-interrupcion.ts`) compila y `prueba:laboratorio` sigue en verde.
3. **Tabla de duplicados retirados de dictado** (símbolo, archivo, líneas antes/después, qué lo
   sustituye en voz), y `wc -l` de `src/types.ts`, `node/vad.ts`, `node/audio.ts` antes/después.
4. Prueba de tipos (o import directo) que demuestra que el contrato de dictado ES el de voz, en
   verde; pruebas nuevas de voz (perfiles, opciones de transcripción, nivel) en verde, con la
   cuenta total de voz y de dictado.
5. **Cifras iguales**: defectos del VAD por perfil (los de barge-in intactos, los de dictado los
   medidos) impresos desde código; `dictar --entrada` antes/después (p50 de 5: arranque → motor
   listo y latencia fin de habla → pegado); `npm run mide` de voz o su subconjunto rápido, si
   existe, con las mismas cifras.
6. `dictado` pinea voz 0.5.0 exacta (tarball regenerado, `prepara-voz.mjs` conforme), y el
   empaquetador de dictado instala ese tarball en el proyecto limpio: output pegado.
7. README de dictado con «Los mandos que de verdad importan» y «Avisos que ahorran una tarde»
   (los suyos, vividos y medidos, no inventados), y README de voz con lo nuevo (perfiles,
   opciones de transcripción, nivel, `changelog` 0.5.0); SDD §2 y §3 al día («le faltó» → hecho).
8. **voz alineada a dictado**: `npm run mide` de voz deja `medicion/ultima-medicion*.json` con la
   misma forma que el de dictado y siembra el README por marcadores (diff del README pegado, cifras
   iguales a las que ya había o explicación de la diferencia); `pesos.ts` de voz con URLs y
   versiones pineadas y su prueba; sección «Qué se guarda y dónde (y cómo se borra)» con el registro
   de voces; `npm run diagnostico` de voz con su salida pegada (sin rutas de usuario ni secretos).
9. Un cuadro final **«la familia»**: para cada rasgo (esqueleto de README, guiones, medición JSON,
   pesos declarados, pruebas contra dist, empaquetado probado, qué se guarda, diagnóstico) qué
   tiene cada paquete después, todo ✓.
10. Reporte de decisiones y **formas en que podría estar mal**, resueltas: un consumidor de voz
   0.4 que pase un `Transcriptor` viejo; el navegador (sin Node) tras tocar `voz/node`; dictado
   instalado desde tarball en un proyecto sin voz; el tarball viejo 0.4.0 aún referenciado por
   alguien; un perfil de detector que cambie sin querer las cifras del laboratorio; el
   `prepara-voz.mjs` que rechaza la subida de versión.

## COMANDO DE VALIDACION

`(cd tools/voz && npm run build && npm run prueba) && (cd tools/dictado && npm run build && npm run prueba) && npm run typecheck && npm run lint && npm run prueba:laboratorio`
tras cada cambio grande, con el output pegado. Antes de cerrar: `npm run empaqueta voz && npm run empaqueta dictado && npm run validate`. Mediciones sin otra carga.

## RESTRICCIONES REALES

- voz es la referencia del contrato: en contrato crece solo en lo que dictado tuvo que
  inventarse; en forma de paquete toma lo de dictado (medición JSON, pesos, qué se guarda,
  diagnóstico); **no** absorbe transcripción, pegado, historial ni ajustes. Su núcleo sigue sin dependencias y sin Node ni
  React; `./browser` sigue funcionando y la app no cambia de comportamiento.
- voz 0.5.0 es compatible con 0.4.0 (solo añadidos); los defectos de barge-in no cambian.
- Los defectos medidos de dictado no cambian (1000/200/250, 0,5/0,35, Parakeet, 8 hilos).
- Versiones pineadas exactas por tarball; **publicar no**: es firma humana.
- Sin LLM; el audio no se guarda; ningún secreto en pantalla.
- No tocar `settings.json` de Claude, skills, prompts, atajos ni la píldora.
- Español sin jerga; nombres en español.
