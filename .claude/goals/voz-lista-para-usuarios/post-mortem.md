# Voz lista para usuarios — post-mortem de las Etapas 0 y 1 (Fase 5 del goal-compiler)

Ejecutado el 2026-09-20 en un run; convergió con la definición de hecho completa (PR #129) y
las firmas humanas llegaron en sesión (PR #130). Este documento cierra el ciclo: lo aprendido
se vuelve regla o arreglo, y lo que funcionó se declara intocable.

## 1. Retrospectivo del ejecutor

**Fricciones**
- El demonio «vivo» no bajaba la latencia: el WAV que ffmpeg escribe a una tubería lleva
  tamaños desconocidos y el servicio lo rechazaba; la ruta caía al CLI en silencio. Costó una
  medición engañosa hasta que la ruta empezó a decir por dónde pasó (`via`).
- El proceso de `dictar` con el micrófono cerrado en espera salía en silencio: sin handles,
  Node no espera promesas. Un latido con referencia lo resolvió.
- La entrada de bitácora con «pendiente» tumbó el `validate`. El verificador tenía razón.
- La calibración corriendo en paralelo con las capturas infló una latencia (991 ms) que sin
  contención fue 589 ms: las mediciones se repiten solas, nunca con otra carga al lado.
- Dos defectos del propio laboratorio salieron al probarlo de verdad: el caché del asesor por
  id (todo análisis devolvía el primero) y la reunión mono en un solo turno por un desajuste de
  silencios entre la muestra y el lote.

**Gaps del spec**
- El spec pedía «trayectoria de una sesión de `dictar`» sin decir cómo obtener una sin persona:
  la entrada por archivo (`--entrada`) fue la pieza que faltaba y sirve también para calibrar.
- El spec no decía que las firmas humanas van como propuesta fuera de los registros
  append-only. Ahora lo dice la regla de gobernanza.
- «Proceso < 0,15× la duración» para el lote no contaba el arranque del motor por proceso: el
  umbral sigue sin cumplirse (0,21–0,28×) hasta que el lote también use el demonio.

**Qué funcionó**
- Medir antes de construir: la latencia base (2 940 ms) y el `via` en la respuesta hicieron
  visible cada cambio.
- Reglas puras con prueba antes de la pantalla: ganancia, trayectoria, acta del CLI, asesor.
- El laboratorio como banco de aceptación: sus capturas cazaron los dos defectos.
- La honestidad en la medición: WER crudo y con cifras igualadas, voz sintética declarada.

## 2. Mapa hallazgo → elemento del loop

| Hallazgo | Elemento | Qué era frágil |
|---|---|---|
| WAV por tubería | arista construir → validar (demonio) | respaldo silencioso sin dato de vía |
| Node sin handles | lazo validar (sesión real) | prueba con salida a pantalla que no mostró el `exit` |
| bitácora sin firma | lazo validar → gobernanza | el spec no distinguía redactar de decidir |
| contención de CPU | arista evidencia → evaluador | dos mediciones simultáneas en la misma máquina |
| caché del asesor por id | nodo reglas (asesor) | clave sin huella de contenido; el laboratorio reutilizaba el id |
| reunión en un turno | arista muestra → lote | dos defectos de silencio elegidos por separado |

## 3. Hallazgos convertidos en reglas y arreglos

- `tools/asesor-ventas/src/motor.ts`: la clave del caché lleva huella del contenido; prueba
  nueva (14/14) y nota en el README.
- `.claude/rules/aprendizajes-stack.md`: «WAV por tubería con tamaños desconocidos» y «Node sin
  handles sale en silencio».
- `.claude/rules/aprendizajes-gobernanza.md`: «una entrada sin firma tumba el gate: propuesta
  fuera del registro, firma después».
- Ya en el run: `via` en toda respuesta de transcripción; `--entrada` y `--alterna-cada` como
  herramientas de prueba; muestra mono con 1 s de hueco y lote a 500 ms.

Pendiente de CDC (no aplicado, se suma a la propuesta del post-mortem anterior): en la skill
`goal-compiler`, plantilla del spec, una línea en RESTRICCIONES: «las firmas humanas que el spec
pida se entregan como propuesta fuera de los registros append-only; el agente nunca escribe
"pendiente" dentro de una bitácora». Y en la DoF: «cada medición de latencia se hace sin otra
carga en la máquina, y se dice».

## 4. Intocable

- Demonio primero, CLI de respaldo, y la respuesta dice por dónde pasó.
- El archivo como micrófono para toda prueba del pipeline en vivo.
- Trayectorias de forma, verificadas sin contenido, como única telemetría.
- Mediciones como scripts del repo (`mide-latencia`, `calibra`, `mide-reuniones`), repetibles.
- Propuesta antes que firma; la firma es humana y queda en el registro con fecha y nombre.

## 5. Lo que sigue

- Piloto de dos semanas con voz propia: grabar las 30 frases en tres condiciones y dictar a
  diario; las trayectorias acumulan latencia, sin voz, respaldo y pico por sesión.
- Entrevista `/new-app` antes de la Etapa 2, y re-firma de `BUSINESS_LOGIC.md`.
- El lote sobre el demonio (mejora 0.2 del plan) para bajar el proceso a < 0,15×.
- Etapa 2 (terceros) se compila como goal aparte con esas cifras.
