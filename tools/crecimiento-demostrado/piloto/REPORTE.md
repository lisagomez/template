# REPORTE — Crecimiento demostrado (goal del 2026-10-02)

Rama `crecimiento/demostrado`, worktree `.claude/worktrees/crecimiento-demostrado`. Sin push, PR
ni merge. Spec: `docs/goals/crecimiento-demostrado.md`. Decisiones del laboratorio: **dos pymes
sintéticas** con la verdad plantada y **sin LLM real**.

## 1. Decisiones de construcción (y por qué)

| Decisión | Por qué |
|---|---|
| **TypeScript puro**, núcleo sin React, Next ni Supabase (`tools/`) | El contrato de herramientas de la casa: se empaqueta e instala aparte. |
| **Motor propio en memoria, no DuckDB**, y **ningún SQL** | El spec pedía «DSL, o SQL generado desde el DSL». Un evaluador del DSL es más estricto: no hay SQL que generar mal. Sella una pyme en ~0.5 s y no trae binario nativo. DuckDB se justificaría con millones de filas; no medido para eso. |
| **Centavos enteros + decimales exactos (BigInt) + racionales en el kernel** | «Cierra al centavo» es igualdad. Un flotante no decide ningún veredicto, y un flotante ni siquiera se puede sellar (`canoniza` lo rechaza). |
| **Kernel LCF de 11 reglas y 2 teoremas** | Se recalcula cada hecho citado (no se le cree al proponente) y cada regla es una función. 11 está dentro del rango de 10 a 15 que pedía el spec. |
| **La clase Z («solo ajustes») y la forma clásica condicionada** | Hallazgo del diseño: un perdido con nota de crédito tiene R_hasta ≠ 0. El enunciado clásico es FALSO ahí, y lo dice el contraejemplo en Lean. Por eso el kernel exige sus tres hipótesis citadas como hechos. |
| **LMDI (Ang, 2004) cerrado por mayor residuo** | Lleva Δln N + Δln F + Δln T a pesos sin residuo. La única inexactitud es el redondeo, declarado: menos de 1 centavo por término. La suma sí es exacta. |
| **Permutación con semilla en la spec; el cliente como unidad** | Determinista (replay) y honesta con muestras chicas. Las facturas de un cliente no son observaciones independientes. |
| **Comparación interanual por omisión en las preguntas de «¿es ruido?»** | Controla la estacionalidad sin pedir SA-05. Una comparación trimestre contra trimestre exige declararlo. |
| **Seudónimo HMAC con la llave de la pyme** | El RFC de una persona moral es enumerable: una huella sin llave se revierte. La llave no entra a Γ. |
| **Lean 4 core, sin Mathlib, 4.34.1 pineado** | La identidad del puente es aritmética entera sobre listas, y Mathlib serían varios GB. LMDI necesita logaritmos reales: **no formalizado**, y el kernel comprueba la suma entera. |
| **A2A con el SDK 1.1.0 y el patrón de `ventas-whatsapp`** | Agent Card firmada (ES256), token con pyme y skills, «ajeno» = «no existe». Un veredicto, un estado de tarea. |
| **App con server components y sin JS propio** | Todo corre en el servidor y la página solo muestra. Playwright la recorre por URL. |

**Referencias** (consultadas de memoria; en esta sesión no se buscó en la web):
- el kernel LCF de Milner y el de HOL Light (pocas reglas, teoremas solo construibles por el
  kernel);
- *proof-carrying code* (Necula, 1997): el consumidor verifica con un checker pequeño, que es lo que
  hace `verificaCertificado` del lado A2A;
- LMDI (Ang, 2004);
- el *ARR/MRR bridge* de SaaS (nuevos, expansión, contracción, churn);
- las pruebas de permutación (Good).

## 2. Cifras (medidas el 2026-10-02, Ryzen 7 5700G)

| Qué | Resultado |
|---|---|
| Pruebas de la herramienta (`npm run prueba`) | **53/53** en 55 s (11 archivos) |
| Laboratorio de trampas | **19/19**: estado y motivo esperados = obtenidos |
| Snapshots sucios (uno por invariante) | **12/12**: no sellan, y cada uno lleva el nombre de su invariante |
| Puente contra la verdad plantada | **60/60** filas al centavo (2 pymes × 10 transiciones × 3 métricas × 8 clases + factores de N×F×T) |
| Siembras (defensas apagadas en el `dist`) | **19/19** tumbadas |
| Replay entre dos procesos | huellas idénticas de Γ, spec, plan, hechos y certificado |
| Inyección en un concepto de CFDI | Γ sella, el puente no cambia un centavo y la narración que la obedece se bloquea |
| Lean 4.34.1 | `suma_particion`, `suma_delta`, `delta_total` y `puente_clasico` + contraejemplo, en 3 s |
| A2A por HTTP real | tarjeta verificada; COMPLETED con derivación y certificado; REJECTED; INPUT_REQUIRED |
| Capturas de Playwright | **12/12** (6 pasos × escritorio y celular), sin errores de consola |
| Tiempos | Γ ~0.5 s por pyme; una respuesta de 20 a 400 ms; laboratorio ~7 s; RSS de 243 MB |
| Datos | distribuidora: 3,390 CFDI → 2,448 transacciones; tienda: 41,763 tickets + 991 CFDI |

## 3. Hallazgos

1. **La forma clásica del puente es falsa en general.** Hace falta Z y las hipótesis citadas.
   Plantado en 2025-4T → 2026-1T (perdido con nota) y 2025-2T → 2025-3T (Z ≠ ∅).
2. **El extractor no traduce `CfdiRelacionados` ni `InformacionGlobal`**, y su skill A2A tampoco
   los devuelve. Sin lo primero, «toda nota referencia una factura» no se comprueba; sin lo
   segundo, la global no se distingue. Se leen con su mismo analizador. Propuesta en
   `propuesta-cdc.md`.
3. **La global de septiembre se emite en octubre.** Contarla por su fecha movería un mes de
   mostrador de trimestre. Se atribuye por `InformacionGlobal` (SA-07), y hay una siembra que lo
   vigila.
4. **`\b` de JavaScript no ve la frontera después de una vocal acentuada.** «causó» y «creció» se
   escapaban del detector. Lo encontró la trampa `sentido_falso`; se corrigió con fronteras
   Unicode.
5. **El mínimo de n hace trabajo real.** Los mayoristas dan p = 21/2001 ≈ 0.0105 < α. Sin el
   corte por n = 12 < 20, el kernel habría «demostrado» una caída con 12 clientes.
6. **Faltaba una trampa:** con el detector causal apagado, nada caía. Se agregó la 20
   (`causal_en_texto`). Una defensa sin siembra que la vigile no es una defensa.
7. **La raíz compila con target ES2017.** Los literales BigInt (`0n`) no existen ahí; se usa
   `BigInt(n)`.
8. **La notación de trimestre «T» + dígito choca con la gobernanza.** El verificador reserva ese
   patrón para identificadores de caso del corpus y lo caza en todo el árbol (`validate` en rojo,
   1 de 166). No se tocó la regla. Se adoptó la notación de los reportes trimestrales de México:
   «3T 2026», con id `2026-3T`. El parser sigue entendiendo la otra si el dueño la escribe.

## 4. Formas en que esto podría estar mal (y qué se hizo con cada una)

| Riesgo | Qué se hizo | Lo que queda |
|---|---|---|
| La verdad plantada la escribió el mismo autor que el motor | Otro camino de cálculo: por RFC y desde el libro, sin XML, Γ ni motor. Una prueba lee los imports y falla si la verdad toca el sistema. | Un malentendido conceptual compartido (la misma idea equivocada en los dos lados) no lo ve el cotejo. |
| Datos sintéticos demasiado limpios | Defectos por invariante, inyección, cancelaciones con sustitución, PPD con parcialidades, USD, global tardía, perdidos con nota, «solo ajustes». | CFDI reales con IEPS, retenciones, notas que relacionan varias facturas, pagos multi-documento en otra moneda, globales bimestrales: **no medido**. |
| La narración pasa con una cifra verdadera en la frase equivocada | Se comprueban magnitud, precisión, verbo de dirección y conectores causales. | Una cifra que coincide con OTRO hecho pasa. Declarado en el README. |
| El kernel acepta una derivación válida pero irrelevante a la pregunta | La pantalla muestra la afirmación certificada y el árbol, y el narrador usa solo el certificado. | El kernel demuestra φ, no que φ responda la pregunta. |
| Flotantes en LMDI | El redondeo por mayor residuo hace la suma exacta; el replay en la misma máquina es idéntico. | `Math.log` entre motores de JS distintos: **no medido**. Un certificado de LMDI se re-verifica en la misma plataforma. |
| Lean demuestra un enunciado distinto del que se ejecuta | Mismas hipótesis, escritas como sumas igual que en `teoremas.ts`, documentadas una por una. Hay una siembra que quita una hipótesis y cae. | La correspondencia es documental, no extraída del código. |
| Parámetros arbitrarios (banda del 5 %, n ≥ 20, α = 0.05, materialidad de $10,000) | Son de la spec, versionados y con hash, y citables. | Calibrarlos con una pyme real. |
| Prueba pareada por inversión de signo | Asume diferencias simétricas bajo la hipótesis nula. Declarado como supuesto (SA-10). | Sin evaluar con datos reales. |
| Tokens A2A con HMAC | Igual que `ventas-whatsapp`: el laboratorio, con vencimiento y skills. | En producción, OAuth client credentials (C3). |
| Escala | Medido con 3,390 CFDI y 41,763 tickets. | Una pyme de cientos de miles de tickets: **no medido**. |
| Llave del seudónimo | Fija y declarada en el laboratorio. | Con una pyme real va en la bóveda. |

## 5. Propuestas y pendientes (para el laboratorio)

- **Firmar o corregir el contrato** (`src/features/crecimiento-demostrado/BUSINESS_LOGIC.md`) y su
  **AISIA** (§6).
- **CDC-1**: las clases de routing `propuesta-de-derivacion` y `narracion-verificada` para medir
  con un LLM real (y la decisión C4). Ver `propuesta-cdc.md`.
- **CDC-2**: el gate `prueba:lean-crecimiento`, inactivo con su motivo y lo que le falta.
- **Extractor**: leer `CfdiRelacionados` e `InformacionGlobal`.
- **Una pyme real**: su ontología y sus SA los declara su dueño (nodo gris del grafo). Hasta
  entonces, nada de aquí ha visto un dato real.

## 6. Retrospectivo (para el post-mortem del goal-compiler)

**Fricciones:**
- el `\b` con acentos;
- el target ES2017 de la raíz;
- `cpSync` que no copia un directorio dentro de sí mismo;
- el JSON de protobuf que omite los arreglos vacíos (`artifacts`);
- dos expectativas mías mal calculadas en pruebas (un producto decimal y un orden), corregidas con
  la cuenta a la vista.

**Lo que funcionó y no se toca sin medir:**
- el cotejo contra la verdad plantada desde la primera corrida;
- las siembras sobre una copia del `dist`;
- el replay entre procesos;
- la regla de que la cascada solo dibuja hechos del certificado.

**Para el skill:**
- La forma (LOOP para construir, GRAFO el producto) fue correcta: la topología del producto se
  fijó en el spec, y el invariante «ningún agente llega a un hecho sin un script determinista» se
  volvió una prueba de estructura.
- Un hueco del spec: no pedía una trampa para el detector causal. El grafo lo habría mostrado como
  un lazo sin referencia.
