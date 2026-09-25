# Dictado y voz alineadas — post-mortem (Fase 5 del goal-compiler)

Ejecutado el 2026-09-21 en un run; convergió con la definición de hecho completa (PR #140,
mezclado). Cierra el ciclo: lo aprendido se vuelve regla o arreglo, y lo que funcionó se
declara intocable.

## 1. Retrospectivo del ejecutor

**Fricciones**
- El empaquetador de dictado falló en cuanto voz pasó a peer obligatorio: en el proyecto limpio,
  npm intentó bajar `@tu-scope/voz@0.5.0` de un registro donde no está. Arreglado en el
  empaquetador (instala primero el tarball del peer de la familia) y documentado en el contrato.
- La prueba de ida y vuelta WAV cazó un defecto que dictado arrastraba: `floatAPcm16` escalaba
  asimétrico (×32767 en positivo) y perdía hasta 1,1 LSB frente a `pcm16aFloat` (÷32768). La de
  voz es simétrica con tope: inversa exacta.
- `npm run mide` de voz instalaba `onnxruntime-node` **sin versión**; y la demo pineaba
  `onnxruntime-web@1.29.0` mientras yo había supuesto 1.30.0. `RUNTIMES` tomó las versiones que
  de verdad se usaban; la medición corrió con el runtime pineado.
- El bloque sembrado se añadió al final del README y hubo que recolocarlo en la sección de
  medición: la siembra debe crear el marcador donde toca, no donde cae.
- Tipos: `bytes.buffer` es `ArrayBuffer | SharedArrayBuffer` para `tsc` de la raíz (Node 24) y la
  prueba no compilaba aunque corría; se pasó por `new Uint8Array(bytes).buffer as ArrayBuffer`.

**Gaps del spec**
- No preveía que alinear el contrato obligara a tocar el empaquetador (un peer obligatorio de la
  familia). La DoF pedía «el empaquetador de dictado instala ese tarball en el proyecto limpio» y
  eso, sin el cambio, era imposible: bien que lo pidiera.
- Afirmaba (de nuevo) que dictado siembra su README por marcadores; es prosa a mano. El mismo
  hecho no verificado que en el goal anterior, copiado de un spec al otro.
- «Cifras iguales» para voz exigía correr su medición, que baja pesos y audio de red (~2 min):
  funcionó, pero el spec no decía qué hacer sin red.

**Qué funcionó**
- Superconjunto compatible: el `Transcriptor` con opciones acepta uno de 0.4 sin adaptador, y
  se demostró en tipos (dos veces) y en ejecución.
- El `typecheck` de la raíz como gate del contrato: `pruebas/contrato.ts` compila las igualdades
  `Igual<A, B>`; si voz cambia una firma, la raíz se pone roja antes que nada.
- La medición de voz repetida decimal a decimal contra el README del 2026-09-01: la prueba más
  fuerte de «ninguna cifra se mueve», y de paso de que el runtime pineado era el correcto.
- El diff de la superficie pública (`.d.ts` antes/después) como evidencia de «solo añadidos».

## 2. Mapa hallazgo → elemento del loop

| Hallazgo | Elemento | Qué era frágil |
|---|---|---|
| peer de la familia en el registro | arista empaquetar → integrar | el proyecto limpio no conocía a los hermanos |
| escala PCM asimétrica | nodo audio (dos copias) | dos aritméticas para la misma conversión, sin prueba de ida y vuelta |
| runtime sin pinear en `mide` | nodo medición de voz | «medido» con una versión que nadie apuntó |
| bloque al final del README | arista medición → README | siembra sin marcador previo |
| hecho copiado entre specs | nodo spec (hechos) | el compilador reutilizó una afirmación sin `grep` |

## 3. Hallazgos convertidos en reglas y arreglos

- `scripts/empaqueta-herramienta.mjs` + `docs/EMPAQUETAR-HERRAMIENTA.md`: peers obligatorios de
  la familia desde `tools/<x>/`.
- `.claude/rules/aprendizajes-stack.md`: «un peer obligatorio de la familia no está en el
  registro», «PCM16: escala simétrica con tope, e ida y vuelta probada».
- Ya en el run: `RUNTIMES` con lo que se usa; `mide` de voz pinea y siembra; marcador
  `MEDICION` colocado en su sección.

Pendiente de CDC (no aplicado; se suma a la propuesta del post-mortem de ajustes): en la skill
`goal-compiler`, la misma línea de «hechos del spec se comprueban con `grep`», porque el hecho
falso viajó de un spec al siguiente; y en la DoF de toda meta que mida contra red: «si la
medición baja algo de red, la DoF dice qué vale como evidencia sin red».

## 4. Intocable

- voz es la dueña del contrato; dictado importa tipos, no los copia. `contrato.ts` vigila.
- Perfiles con nombre y medición; `bargeIn` no cambia nunca por alinear a otro.
- Versiones pineadas por tarball; publicar es firma humana.
- Medir la referencia (voz) al tocarla, y comparar con el README fecha por fecha.

## 5. Lo que sigue

- **El presupuesto de las rules quedó al límite (5 999 de 6 000 tokens)** tras condensar las
  entradas del 20 y del 21: el próximo aprendizaje del stack no cabe sin mover alguno a un
  documento bajo demanda (o subir el tope, decisión consciente en el JSON). No se subió el tope.

- La app tiene su propia cabecera WAV (`laboratorio-voz/services/wav.ts`, estéreo): tercera
  copia, candidata a `codificaWav` cuando se toque el laboratorio.
- Sembrar el README de dictado desde `ultima-medicion-cpu.json`, como ya hace voz.
- Publicar voz 0.5.0 (firma).
