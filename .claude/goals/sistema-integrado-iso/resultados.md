# Resultados — goal `sistema-integrado-iso` (rama `app/iso`)

Estado al **2026-09-30**. Lo que dice «pendiente» lo está de verdad: **no hay `OPENROUTER_API_KEY`** en la máquina y
ninguna corrida real de agente ocurrió todavía. No se simuló ninguna.

## Definición de hecho, punto por punto

| # | Punto | Estado | Evidencia |
|---|---|---|---|
| 1 | PRP-008 con tabla de fases | ✓ | `.claude/PRPs/PRP-008-sistema-integrado-iso.md`: 9 firmadas, 11 bloqueadas con quién firma, 1 manual |
| 2 | Investigación | ✓ | `investigacion.md`. Hallazgo que cambió el spec: 9001:2026 salió el 16-sep-2026 y 19011:2026 en mayo |
| 3 | Supabase local + aislamiento | ✓ | `supabase@2.118.0`, 7 migraciones aplicadas, `npm run sgi:rls` **42/42** (`public/laboratorio-sgi/rls.json`) |
| 4 | Catálogo | ✓ (borrador) | 130 requisitos; L2 verde; L1 **no medido** declarado (sin copia licenciada); `revision-catalogo.md` con respuesta y correcciones aplicadas |
| 5 | Motor | ✓ | El acta subió 9001 de 11.6 % a 17.4 % y 42001 de 5.9 % a 10.6 % en la app real (recorrido, paso 2). Puerta con rol equivocado rechazada (mot-3, bas-3). Migración: 73 siguen, 2 remapeados, 4 nuevos |
| 6 | Llave enmascarada y corrida real por agente | **✗ PENDIENTE** | `OPENROUTER_API_KEY: AUSENTE`. El corredor (`npm run sgi:agentes`) está listo y se niega a inventar |
| 7 | Capturas de Playwright | ◐ | 9/9 pasos deterministas contra el build de producción, sin errores de consola. 10 pasos con agente sin correr: informe GAP, política de IA aprobada y rechazada a otro rol, riesgos, impacto, SoA, hallazgo del agente, reporte |
| 8 | La casa | ◐ | Inventario de sus 9 agentes (paso 16). Su SoA, su impacto y su política de IA esperan la corrida real |
| 9 | Laboratorio | ◐ | 33/33 deterministas en verde + L8 (32 archivos). 46 casos con LLM «no medidos». Las 10 trampas tienen caso |
| 10 | Empaquetado, READMEs, guías, aviso, inventario | ✓ | `empaqueta` en verde (6 subpaths en un proyecto limpio); 18/18 READMEs conformes; guías y aviso en `docs/`; 3 asientos (238 unidades, 0 NUEVO) |
| 11 | Propuesta CDC y bloqueados | ✓ | `propuesta-cdc.md` (diff del routing + prompts), `propuestas.md` |
| 12 | `validate` verde tras el commit | ver abajo | |

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
| Una regla de gobernanza que no vi | `verify:gobernanza` cazó un patrón prohibido en `orquestador.ts` (un literal de fecha). Se cambió el código, no la regla |
| El aviso de hidratación en desarrollo | Solo en la primera compilación de cada ruta con Turbopack; el recorrido final corre contra el build de producción, sin errores de consola |
| Los agentes redactan genérico o inventan | Los 46 casos lo miden, **pero todavía no corren**. Hasta entonces, «agentes» y «laboratorio» siguen en ámbar |

## Gasto

- **US$0.00**: ninguna llamada al modelo.
- **Tope del goal**: US$15, con aviso al 80 %.
- **Estimación** (no es medición): unos US$3-5 para los 46 casos más los ~10 pasos con agente del recorrido.
