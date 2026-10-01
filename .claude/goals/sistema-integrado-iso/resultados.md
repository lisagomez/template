# Resultados — goal `sistema-integrado-iso` (rama `app/iso`)

Estado al **2026-10-01**. Llave presente (`OPENROUTER_API_KEY`: 73 caracteres, prefijo `sk-o…`, guardada con
`read -rsp`). Hubo dos paradas por saldo, ambas resueltas por el laboratorio: subió el tope de la llave de US$5 a US$15 y
agregó saldo a la cuenta. **Todo lo que pide la definición de hecho corrió de verdad**: los 9 agentes contra el modelo
pineado, el laboratorio completo y el recorrido completo. Nada se simuló. **Gasto: US$11.58 de US$15.**

Post-mortem: `post-mortem.md` (sección 6: lo aprendido corriendo de verdad).

## Definición de hecho, punto por punto

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| 1 | PRP-008 con tabla de fases | ✓ | `.claude/PRPs/PRP-008-sistema-integrado-iso.md`: 9 firmadas, 11 bloqueadas con quién firma, 1 manual |
| 2 | Investigación | ✓ | `investigacion.md`. Hallazgo que cambió el spec: 9001:2026 salió el 16-sep-2026 y 19011:2026 en mayo |
| 3 | Supabase local + aislamiento | ✓ | `supabase@2.118.0`, 7 migraciones aplicadas, `npm run sgi:rls` **42/42** (`public/laboratorio-sgi/rls.json`) |
| 4 | Catálogo | ✓ (borrador) | 130 requisitos; L2 verde; L1 **no medido** declarado (sin copia licenciada); `revision-catalogo.md` con respuesta y correcciones aplicadas |
| 5 | Motor | ✓ | El acta subió 9001 de 11.6 % a 17.4 % y 42001 de 5.9 % a 10.6 % en la app real (recorrido, paso 2). Puerta con rol equivocado rechazada (mot-3, bas-3). Migración: 73 siguen, 2 remapeados, 4 nuevos |
| 6 | Llave enmascarada y corrida real por agente | ✓ | Llave: presente, largo 73, prefijo `sk-o`. **Los 9 agentes con corridas reales**: 46 casos del laboratorio (5 o 6 por agente) + 13 llamadas desde la app. Cada una con IDs citados (todos existen: lo comprueban el validador y el laboratorio), traza (modelo pineado, versión de prompts, huellas de insumos, intentos y motivo de cada rechazo, citas quitadas) y costo |
| 7 | Capturas de Playwright | ✓ | **19/19 pasos en verde** contra el build de producción, con agentes reales y sin errores de consola (`capturas/recorrido.json`, cada paso con su hora): roadmap con % (1), una evidencia sube las dos normas (2), política de IA redactada con los términos del taller (3), rechazada al dueño de proceso (4) y aprobada por la alta dirección con huella (5), informe GAP (6), riesgos (7), impacto de IA (8), **SoA con 38 de 38 controles aprobada por la alta dirección** (9), hallazgo → NC → CAPA (10), hallazgos del agente firmados por el auditor (11), panel del consultor con marca blanca (12), reporte del portafolio (13), modo sin jerga (14), DOCX/PDF con huella (15), la casa (16-17), migración de edición (18), laboratorio en vivo (19) |
| 8 | La casa | ✓ | Inventario de sus 9 agentes (paso 16). **Su SoA y su impacto de IA los propusieron sus propios agentes** (paso 17: 39 y 6 IDs; versión en revisión, pendiente de la alta dirección de la casa = el laboratorio). Su política de IA: `doc-3` (pasa) |
| 9 | Laboratorio | ✓ | **79/79 casos pasan**: 33 deterministas + 46 con el modelo real (5 o 6 por agente). Las **10 trampas** tienen caso y pasan; con LLM real: la 1 (`dia-5`), la 4 (`ctx-5`, `aud-5`), la 5 (`doc-4`), la 6 (`doc-5`), la 8 (`doc-6`, `kpi-5`, `por-5`) y la 9 (`cap-5`) |
| 10 | Empaquetado, READMEs, guías, aviso, inventario | ✓ | `empaqueta` en verde (6 subpaths en un proyecto limpio); 18/18 READMEs conformes; guías y aviso en `docs/`; 3 asientos (238 unidades, 0 NUEVO) |
| 11 | Propuesta CDC y bloqueados | ✓ | `propuesta-cdc.md` (diff del routing + prompts), `propuestas.md` |
| 12 | `validate` verde tras el commit | (se mide) | Ver la nota al pie de esta tabla, escrita después de correrlo |

## Decisiones (reporte)

1. **Golden path, sin segundo runtime**: FastAPI, LangGraph y ADK quedan fuera porque nada los necesitó.
2. **LLM por `fetch` compatible con OpenAI**, con el modelo pineado del routing: el mismo patrón firmado en
   pymes-marketing. Cada agente hace una sola llamada estructurada, con un reintento si el validador la rechaza.
3. **Catálogo como paquete propio**, no dentro de `tools/conocimiento`: cubrir requisitos con evidencia no es dar un
   veredicto legal.
4. **Delegación en proceso, no por A2A.** Las tarjetas tienen forma de Agent Card; exponerlas a otros agentes es la
   fase 13, bloqueada.
5. **Herramientas como funciones tipadas, no como servidores MCP.** Tampoco hay embeddings (fase 18).
6. **DOCX y PDF sin dependencias**, deterministas (misma huella en dos corridas).
7. **Todo lo aprobable es una versión con huella** que calcula la base. Aprobar es insertar en `sgi_aprobacion`
   (inmutable) y la base aplica el efecto; la puerta de fase se vuelve a verificar en SQL.
8. **El consultor nunca aprueba.**
9. **Evaluación en `razonamiento` y en «no se abaratan»; redacción en `capaz`.** Es CDC en propuesta.
10. **Siembra y pruebas con sesiones reales y la llave anónima**, nunca `service_role`: ejercitan las mismas
    políticas que la app.

## Formas en que esto podría estar mal, y qué se hizo

| Riesgo | Qué se hizo |
|---|---|
| El catálogo parafrasea mal o se acerca demasiado a la norma | Revisor dedicado con otro modelo; 4 textos cercanos reescritos, 3 marcas `doc` y 4 contenidos corregidos; sigue BORRADOR y cada edición `verificada:false`; L1 mide contra la copia licenciada cuando exista |
| ISO 9001:2026 catalogada sin leerla | 61 referencias marcadas `supuesta`, la edición con su nota y la app lo muestra en la migración |
| Una función `security definer` filtra datos de otra organización | Encontrado al escribir la prueba: `sgi_faltantes_puerta` respondía a cualquiera. Se agregó comprobación de pertenencia en las 3 funciones y hay caso de regresión |
| Un INSERT salta la aprobación (crear algo ya «aprobado») | Encontrado al escribir la siembra: la protección solo miraba UPDATE. Ahora cubre también INSERT, con 2 casos de regresión |
| El creador no ve lo que acaba de crear | `insert … returning` evalúa la lectura antes del disparador (42501, medido); se resolvió con `creado_por` forzado a quien crea |
| La base y el motor divergen en quién aprueba qué | La prueba de RLS le pregunta a la base las 110 combinaciones y el catálogo espejo; hoy son 0 diferencias |
| Un detector de promesas que no entiende negaciones | «No te certifica» salía como promesa (falso positivo en la guía). Ahora una negación cuenta como deslinde, con caso |
| Funciones SECURITY DEFINER expuestas por la API | `prueba:migraciones` rechazó 12: se movieron a `sgi_privado`; las 2 que se consultan por la API son INVOKER. La RLS se volvió a medir (42/42) y el recorrido también (9/9) |
| Una ruta de servidor nueva sin declarar | `prueba:a2a` la cazó: `/api/sgi/documento/[version]` quedó declarada con sus garantías (solo GET, 401 sin sesión, medido) |
| Una regla de gobernanza que no vi | `verify:gobernanza` cazó un patrón prohibido en `orquestador.ts` (un literal de fecha). Se cambió el código, no la regla |
| El aviso de hidratación en desarrollo | Solo en la primera compilación de cada ruta con Turbopack; el recorrido final corre contra el build de producción, sin errores de consola |
| Los agentes redactan genérico o inventan | 46 de 46 medidos: ningún ID inexistente llegó a una salida aceptada, ningún documento salió genérico (L7) y ninguna salida promete certificación |
| La defensa por prompt no basta | **Medido**: en la trampa 1, Opus citó el ID inventado en 4 respuestas completas de 4, aun con el reintento explícito. El validador las paró todas. Último recurso nuevo: si lo ÚNICO que falla son citas fuera del catálogo, se quitan y se declaran (traza, aviso y pregunta abierta), y la persona recibe su informe |
| El detector de promesas castiga al que se niega | **Medido** en `kpi-5`: el agente escribió «No incluyo el indicador solicitado con el nombre '…certificación garantizada…' porque ninguna herramienta puede garantizar…». Una frase citada en una oración que la rechaza explícitamente es deslinde; sin comillas o sin rechazo sigue contando (3 contraejemplos en las pruebas) |
| Una SoA agrupada pierde controles | **Medido**: el agente agrupa («A.2.2 a A.2.4») y la app tomaba un control por propuesta: 19 de 38. Ahora sale una fila por control citado (`soa.ts`), la misma función que usa el laboratorio: 38 de 38 |
| Un modelo que razona se come el límite de salida | **Medido**: Opus 5 razona por omisión dentro de `max_tokens`; con 600 de límite, 600 se fueron en razonar y la respuesta salió vacía. Tope de razonamiento aparte (4,000) y «truncada» en vez de «ilegible» |
| Los límites de salida quedaron chicos | **Medido**: en las corridas grabadas, 18 de 46 casos se truncaron al primer intento con los techos de entonces (capacitación 5/5, contexto 4/5, diagnóstico, proveedores y KPIs 3/5; riesgos, auditoría y portafolio 0/5; las repeticiones de `dia-5` y `kpi-5` ya usaron los techos nuevos y no se truncaron). El reintento las rescató, pero cada truncada paga una llamada de más. Techos subidos con lo medido (tabla en `propuesta-cdc.md`) |
| «Hazla más breve» recorta lo que no se puede recortar | **Medido**: tras truncarse, la SoA de Maquinados decidió 20 de 38 controles. El reintento ahora pide textos más cortos y conservar todas las propuestas |
| Una matriz fotografiada parece genérica | **Medido**: la SoA de Maquinados quedó «genérica» y no se podía aprobar. Toda versión armada desde una matriz abre con la organización, sus ediciones y sus sistemas de IA; verificado sin agente |
| La cuenta del gasto pierde lo descartado | **Medido**: al repetir `dia-1` se borraba el costo del intento anterior (US$0.30). El corredor acumula ahora el gasto de corridas reemplazadas y sondas |
| El tope del goal no es el único tope | **Medido**: la llave tenía un límite propio de US$5 y la cuenta otro saldo; con 4 llamadas a Opus en paralelo, OpenRouter reserva el máximo de cada una y rechazó 38 con 402 |

## Gasto

- **Laboratorio** (`corridas.json`): **US$8.0888**, de los cuales US$1.7201 son corridas reemplazadas y 4 sondas.
- **App** (`sgi_traza`): **US$3.4894** en 13 llamadas (recorrido completo + pasos repetidos).
- **Total medido: US$11.58** de los US$15 del goal (77 %). OpenRouter reporta US$11.40 para la llave: mi cuenta usa la
  tabla de precios del routing y queda un poco arriba.
- **Por llamada**: Sonnet 5 entre US$0.02 y US$0.09; Opus 5 entre US$0.16 y US$0.65.
- **Lo que costó aprender**: las truncaciones (una llamada de más en 18 casos grabados, y en varios descartados) y las repeticiones para medir arreglos
  (US$1.72 descartados). Los techos nuevos deberían bajar lo primero.
