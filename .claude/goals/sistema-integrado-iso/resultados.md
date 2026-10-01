# Resultados — goal `sistema-integrado-iso` (rama `app/iso`)

Estado al **2026-10-01**. La llave llegó (`OPENROUTER_API_KEY`: presente, 73 caracteres, prefijo `sk-o…`) y hubo
**corridas reales**: 8 grabadas en el laboratorio y 7 desde la app en el recorrido. Se detuvo de nuevo por **saldo**:
la llave tiene un tope propio de US$5 en OpenRouter (quedan US$0.18) y la cuenta tiene US$0.47. El tope del goal
(US$15) no se alcanzó: el gasto medido es US$4.69. Nada se simuló: lo que dice «no medido» no corrió.

Post-mortem: `post-mortem.md` (escrito al detenerse el 30/09; la sección 6 suma lo aprendido con las corridas reales).

## Definición de hecho, punto por punto

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| 1 | PRP-008 con tabla de fases | ✓ | `.claude/PRPs/PRP-008-sistema-integrado-iso.md`: 9 firmadas, 11 bloqueadas con quién firma, 1 manual |
| 2 | Investigación | ✓ | `investigacion.md`. Hallazgo que cambió el spec: 9001:2026 salió el 16-sep-2026 y 19011:2026 en mayo |
| 3 | Supabase local + aislamiento | ✓ | `supabase@2.118.0`, 7 migraciones aplicadas, `npm run sgi:rls` **42/42** (`public/laboratorio-sgi/rls.json`) |
| 4 | Catálogo | ✓ (borrador) | 130 requisitos; L2 verde; L1 **no medido** declarado (sin copia licenciada); `revision-catalogo.md` con respuesta y correcciones aplicadas |
| 5 | Motor | ✓ | El acta subió 9001 de 11.6 % a 17.4 % y 42001 de 5.9 % a 10.6 % en la app real (recorrido, paso 2). Puerta con rol equivocado rechazada (mot-3, bas-3). Migración: 73 siguen, 2 remapeados, 4 nuevos |
| 6 | Llave enmascarada y corrida real por agente | ◐ | Llave: presente, largo 73, prefijo `sk-o`. **5 de 9 agentes con corrida real**, cada una con IDs citados (todos existen: el validador y el laboratorio los comprueban), traza (modelo pineado, versión de prompts, huellas de insumos, intentos, rechazos) y costo: diagnóstico (6), contexto (2), documental (2), riesgos e IA (4: matriz, impacto, SoA de Maquinados y de la casa), portafolio (1). **Sin medir por saldo**: capacitación, proveedores, KPIs y auditoría (la de auditoría se intentó en el paso 11 y el proveedor la rechazó con 402) |
| 7 | Capturas de Playwright | ◐ | **15/19 pasos en verde** con agentes reales, contra el build de producción: roadmap con %, informe GAP (paso 6), política de IA rechazada al dueño de proceso y aprobada por la alta dirección con huella (pasos 4-5), riesgos (7), impacto de IA (8), hallazgo a CAPA (10), panel del consultor con marca blanca (12), reporte del agente portafolio (13), DOCX/PDF con huella (15), la casa (16), migración (18). En rojo: **3** (la política sí se redactó y se aprobó; falló el guion, que leía el aviso viejo; corregido, falta repetirlo), **9** (la SoA salió marcada genérica; corregido y verificado sin agente con `verifica-soa.ts`: versión en revisión, aprobada por la alta dirección, captura 12), **11 y 17-impacto** (rechazados por saldo) |
| 8 | La casa | ◐ | Inventario de sus 9 agentes (paso 16) ✓. **Su SoA la propuso su propio agente** (paso 17: 39 IDs, US$0.44) ✓. Su impacto de IA: rechazado por saldo. Su política de IA (`doc-3`): no medida |
| 9 | Laboratorio | ◐ | 33/33 deterministas en verde + L8 (32 archivos). **Con LLM: 8 medidos, 7 pasan y 1 falla** (`dia-5`, trampa 1: la única respuesta completa citó el ID inventado; el validador la rechazó y el ID no llegó a ninguna salida, pero tampoco hubo informe). 38 «no medidos» por saldo. Las 10 trampas tienen caso; medidas con LLM: solo la 1 |
| 10 | Empaquetado, READMEs, guías, aviso, inventario | ✓ | `empaqueta` en verde (6 subpaths en un proyecto limpio); 18/18 READMEs conformes; guías y aviso en `docs/`; 3 asientos (238 unidades, 0 NUEVO) |
| 11 | Propuesta CDC y bloqueados | ✓ | `propuesta-cdc.md` (diff del routing + prompts), `propuestas.md` |
| 12 | `validate` verde tras el commit | ✗ (medido) | Sobre `1df6bcc` y `3f7bd78`: 29/29. Sobre **`56294be`** (con las corridas reales), `validate --sigue`: **28/29 en verde, 8 inactivos declarados, 1 rojo: `prueba:laboratorio-sgi` por `dia-5`**. Es lo que tiene que hacer: el gate exige cero fallas y la trampa 1 falló de verdad. No se afloja el gate; se arregló el mensaje de reintento (CDC) y falta medirlo con saldo |

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
| Los agentes redactan genérico o inventan | 8 de 46 medidos: ningún ID inexistente llegó a una salida aceptada; la trampa 1 sí engañó al modelo (lo paró el validador). 38 sin medir por saldo |
| Un modelo que razona se come el límite de salida | **Medido**: Opus 5 razona por omisión dentro de `max_tokens`; con 600 de límite, 600 se fueron en razonar y la respuesta salió vacía. Tope de razonamiento aparte (4,000) y «truncada» en vez de «ilegible» |
| Los límites de salida quedaron chicos | **Medido**: al menos 9 de 15 llamadas reales se truncaron al primer intento (diagnóstico a 6,000, riesgos a 5,000, contexto a 3,500, portafolio a 2,500) y el reintento las rescató. Límites subidos con ese dato: 8,000 / 9,000 / 6,000 / 4,000. Capacitación, proveedores y KPIs siguen sin medir |
| «Hazla más breve» recorta lo que no se puede recortar | **Medido**: tras truncarse, la SoA de Maquinados decidió 20 de 38 controles. El reintento ahora pide textos más cortos y conservar todas las propuestas |
| Una matriz fotografiada parece genérica | **Medido**: la SoA de Maquinados quedó «genérica» y no se podía aprobar. Toda versión armada desde una matriz abre con la organización, sus ediciones y sus sistemas de IA; verificado sin agente |
| La cuenta del gasto pierde lo descartado | **Medido**: al repetir `dia-1` se borraba el costo del intento anterior (US$0.30). El corredor acumula ahora el gasto de corridas reemplazadas y sondas |
| El tope del goal no es el único tope | **Medido**: la llave tenía un límite propio de US$5 y la cuenta otro saldo; con 4 llamadas a Opus en paralelo, OpenRouter reserva el máximo de cada una y rechazó 38 con 402 |

## Gasto

- **Laboratorio** (`corridas.json`): **US$2.7341**, de los cuales US$0.3264 son corridas reemplazadas y 4 sondas de diagnóstico.
- **App** (`sgi_traza`, 7 llamadas del recorrido): **US$1.9597**.
- **Total medido: US$4.69** de los US$15 del goal (31 %). OpenRouter reporta US$4.82 para la llave (sus precios exactos).
- **Por llamada**: Sonnet 5 entre US$0.03 y US$0.07; Opus 5 entre US$0.21 y US$0.54.
- **Lo que falta** (estimación, no medición): unos US$5-6 para los 38 casos y unos US$1.5 para repetir los pasos 3, 9, 11 y 17.
  **Necesita** subir el tope de la llave (hoy US$5) y agregar saldo a la cuenta.
