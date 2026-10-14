# Plan de orquestación — Sistema integrado ISO 9001 + ISO/IEC 42001 para pymes y consultores: catálogo propio versionado, motor de requisitos, capa agéntica con humano en el ciclo, app multiempresa y la app como su primer inquilino

> Derivado DETERMINISTA del grafo `sistema-integrado-iso` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1

**→ produce `investigacion.md: estado de hoy de cada edición (9001, 42001, 23894, 42005, 42006, 19011) con fuente y fecha, licencia del texto ISO, LFPDPPP vigente, acreditación en México (EMA), y 2-3 plataformas de referencia con lo que se toma de cada una`**
- ◆ spawnear subagente (Sonnet) · **lo existente leído antes de investigar fuera** (desde Base existente: cuentas y profiles (/add-login), migraciones en supabase/migrations, puente A2A (@a2a-js/sdk 1.1.0, src/features/a2a), grafo-conocimiento + conocimiento, extractor-documental, contabilidad.ts, routing-modelos.json, molde de laboratorio (/laboratorio-pymes), npm run empaqueta, inventario (spec 014))

## Fase 2 · ⚡ GRUPOS EN PARALELO

**→ produce `PRP-008 sobre prp-base.md: fases firmada/bloqueada (quién firma y por qué), decisiones de stack, modelo de amenazas C3 (multiempresa, subida de evidencias, inyección en documentos, capa agéntica, A2A), AISIA C4 de la propia app y flujo de datos hacia el proveedor LLM`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **ediciones vigentes, riesgos legales y referentes** (desde investigacion.md: estado de hoy de cada edición (9001, 42001, 23894, 42005, 42006, 19011) con fuente y fecha, licencia del texto ISO, LFPDPPP vigente, acreditación en México (EMA), y 2-3 plataformas de referencia con lo que se toma de cada una)
- ◆ spawnear subagente (Sonnet) · **qué se reusa y qué es nuevo** (desde Base existente: cuentas y profiles (/add-login), migraciones en supabase/migrations, puente A2A (@a2a-js/sdk 1.1.0, src/features/a2a), grafo-conocimiento + conocimiento, extractor-documental, contabilidad.ts, routing-modelos.json, molde de laboratorio (/laboratorio-pymes), npm run empaqueta, inventario (spec 014))

**→ produce `Catálogo de requisitos versionado (norma + edición) con IDs propios estables: paráfrasis y preguntas guía, referencia por número de cláusula, información documentada obligatoria marcada, tipos de evidencia, controles del Anexo A de 42001 parafraseados, mapeo cruzado 9001↔42001; estado 'borrador sin revisión experta' hasta que firme un auditor competente`**
- ◆ spawnear subagente (Sonnet) · **ediciones a catalogar; redacción propia, nunca texto de la norma** (desde investigacion.md: estado de hoy de cada edición (9001, 42001, 23894, 42005, 42006, 19011) con fuente y fecha, licencia del texto ISO, LFPDPPP vigente, acreditación en México (EMA), y 2-3 plataformas de referencia con lo que se toma de cada una)

**Gates al cerrar la fase:**
- ↻ derechos de autor [gris] — referencia: cero texto de la norma: si el laboratorio deja su copia licenciada FUERA del repo (ruta por variable de entorno), un script mide solapamiento de n-gramas y no admite fragmentos de 8+ palabras seguidas; sin copia, 'no medido' declarado + revisor dedicado que no redactó el catálogo
- ↻ cobertura [gris] — referencia: cada cláusula 4-10 de cada norma/edición y cada control del Anexo A tiene ≥1 requisito; IDs únicos y estables; mapeo cruzado en ambos sentidos sin huérfanos

## Fase 3 · ⚡ GRUPOS EN PARALELO

**→ produce `Supabase local en Docker con CLI pineado; migraciones del repo + las nuevas aplicadas; entorno aparte que no pisa .env.local`**
- ◆ subagente con scripts · **CLI pineado, docker, migraciones** (desde PRP-008 sobre prp-base.md: fases firmada/bloqueada (quién firma y por qué), decisiones de stack, modelo de amenazas C3 (multiempresa, subida de evidencias, inyección en documentos, capa agéntica, A2A), AISIA C4 de la propia app y flujo de datos hacia el proveedor LLM)

**→ produce `Motor de requisitos (núcleo TypeScript puro, empaquetado en tools/): avance determinista por cláusula, norma y global; una evidencia cubre N requisitos de ambas normas; puertas de fase (evidencia obligatoria + aprobación del rol correcto); migración de edición por diff de catálogos`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **formato del catálogo y mapeo cruzado** (desde Catálogo de requisitos versionado (norma + edición) con IDs propios estables: paráfrasis y preguntas guía, referencia por número de cláusula, información documentada obligatoria marcada, tipos de evidencia, controles del Anexo A de 42001 parafraseados, mapeo cruzado 9001↔42001; estado 'borrador sin revisión experta' hasta que firme un auditor competente)
- ◆ spawnear subagente (Sonnet) · **reglas de puerta por fase** (desde PRP-008 sobre prp-base.md: fases firmada/bloqueada (quién firma y por qué), decisiones de stack, modelo de amenazas C3 (multiempresa, subida de evidencias, inyección en documentos, capa agéntica, A2A), AISIA C4 de la propia app y flujo de datos hacia el proveedor LLM)

**→ produce `Generador documental: plantillas propias → DOCX y PDF con control de versiones, flujo borrador → revisión → aprobación por rol, y detector de documento genérico (sin datos de la organización)`**
- ◆ spawnear subagente (Sonnet) · **plantillas atadas a IDs de requisito** (desde Catálogo de requisitos versionado (norma + edición) con IDs propios estables: paráfrasis y preguntas guía, referencia por número de cláusula, información documentada obligatoria marcada, tipos de evidencia, controles del Anexo A de 42001 parafraseados, mapeo cruzado 9001↔42001; estado 'borrador sin revisión experta' hasta que firme un auditor competente)

**Gates al cerrar la fase:**
- ↻ humano en el ciclo [gris] — referencia: ninguna fase cierra sin evidencia obligatoria + aprobación del rol correcto; aprobaciones inmutables; el avance es determinista y reproducible
- ↻ genérico [gris] — referencia: un borrador sin datos de la organización se marca y no pasa a revisión

## Fase 4 · ⚡ GRUPOS EN PARALELO

**→ produce `Esquema multiempresa: organización, proyecto de SG, norma/edición, requisito, fase, tarea, evidencia (M:N con requisito), documento versionado, parte interesada, riesgo, objetivo, indicador, sistema de IA, evaluación de impacto, control Anexo A con estado SoA, proveedor, auditoría, hallazgo, NC, acción correctiva; aprobaciones inmutables (quién, cuándo, rol, huella, versión); traza de cada artefacto; RLS por organización y rol (consultor, admin pyme, alta dirección, dueño de proceso, auditor interno)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **migraciones nuevas + pruebas de RLS contra Postgres real** (desde Supabase local en Docker con CLI pineado; migraciones del repo + las nuevas aplicadas; entorno aparte que no pisa .env.local)
- ◆ spawnear subagente (Sonnet) · **entidades, roles y matriz de permisos** (desde PRP-008 sobre prp-base.md: fases firmada/bloqueada (quién firma y por qué), decisiones de stack, modelo de amenazas C3 (multiempresa, subida de evidencias, inyección en documentos, capa agéntica, A2A), AISIA C4 de la propia app y flujo de datos hacia el proveedor LLM)

**→ produce `Capa agéntica: orquestador, diagnóstico, contexto, riesgos e IA, documental, capacitación, proveedores, KPIs, auditoría, portafolio; cada salida cita IDs del catálogo (validador rechaza IDs inexistentes), guarda traza (agente, modelo pineado, insumos con huella, versión de prompt, aprobador), texto de evidencias delimitado contra inyección, datos personales minimizados antes de salir; LLM inyectado por routing-modelos.json; costo por contabilidad.ts`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **el orquestador consulta puertas y avance; nunca los decide** (desde Motor de requisitos (núcleo TypeScript puro, empaquetado en tools/): avance determinista por cláusula, norma y global; una evidencia cubre N requisitos de ambas normas; puertas de fase (evidencia obligatoria + aprobación del rol correcto); migración de edición por diff de catálogos)
- ◆ spawnear subagente (Sonnet) · **IDs citables** (desde Catálogo de requisitos versionado (norma + edición) con IDs propios estables: paráfrasis y preguntas guía, referencia por número de cláusula, información documentada obligatoria marcada, tipos de evidencia, controles del Anexo A de 42001 parafraseados, mapeo cruzado 9001↔42001; estado 'borrador sin revisión experta' hasta que firme un auditor competente)
- ◆ spawnear subagente (Sonnet) · **responsabilidades, contratos de entrada/salida, C3/C4** (desde PRP-008 sobre prp-base.md: fases firmada/bloqueada (quién firma y por qué), decisiones de stack, modelo de amenazas C3 (multiempresa, subida de evidencias, inyección en documentos, capa agéntica, A2A), AISIA C4 de la propia app y flujo de datos hacia el proveedor LLM)

**Gates al cerrar la fase:**
- ↻ aislamiento [gris] — referencia: la organización B no lee, cambia, borra ni suplanta nada de A; matriz de roles probada; el consultor solo ve clientes asignados; service_role fuera de superficies (C7)
- ↻ citas [gris] — referencia: 100 % de las recomendaciones citan IDs existentes del catálogo; un ID inexistente se rechaza
- ↻ inyección [gris] — referencia: una instrucción escondida en una evidencia no cambia ninguna salida ni estado

## Fase 5

**→ produce `App: roadmap de 9 fases con puertas y % por cláusula/norma/global; diagnóstico adaptativo → informe GAP; repositorio de evidencias; matrices de contexto, riesgos, impacto de IA y SoA; KPIs; auditoría y CAPA; calendario; modo pyme sin jerga; panel del consultor multicliente con biblioteca de plantillas, marca blanca y reporte de avance`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **persistencia con RLS** (desde Esquema multiempresa: organización, proyecto de SG, norma/edición, requisito, fase, tarea, evidencia (M:N con requisito), documento versionado, parte interesada, riesgo, objetivo, indicador, sistema de IA, evaluación de impacto, control Anexo A con estado SoA, proveedor, auditoría, hallazgo, NC, acción correctiva; aprobaciones inmutables (quién, cuándo, rol, huella, versión); traza de cada artefacto; RLS por organización y rol (consultor, admin pyme, alta dirección, dueño de proceso, auditor interno))
- ◆ spawnear subagente (Sonnet) · **avance y puertas** (desde Motor de requisitos (núcleo TypeScript puro, empaquetado en tools/): avance determinista por cláusula, norma y global; una evidencia cubre N requisitos de ambas normas; puertas de fase (evidencia obligatoria + aprobación del rol correcto); migración de edición por diff de catálogos)
- ◆ spawnear subagente (Sonnet) · **propuestas que el humano aprueba** (desde Capa agéntica: orquestador, diagnóstico, contexto, riesgos e IA, documental, capacitación, proveedores, KPIs, auditoría, portafolio; cada salida cita IDs del catálogo (validador rechaza IDs inexistentes), guarda traza (agente, modelo pineado, insumos con huella, versión de prompt, aprobador), texto de evidencias delimitado contra inyección, datos personales minimizados antes de salir; LLM inyectado por routing-modelos.json; costo por contabilidad.ts)
- ◆ spawnear subagente (Sonnet) · **DOCX/PDF versionados** (desde Generador documental: plantillas propias → DOCX y PDF con control de versiones, flujo borrador → revisión → aprobación por rol, y detector de documento genérico (sin datos de la organización))

**Gates al cerrar la fase:**
- ↻ certificación [gris] — referencia: ningún texto de la app promete certificar; se dice preparación para la auditoría de un organismo acreditado

## Fase 6 · ⚡ GRUPOS EN PARALELO

**→ produce `La app como su primer inquilino: su propio sistema de gestión de IA (inventario de sus agentes, evaluación de impacto, SoA, política de IA) cargado en la app, con las aprobaciones pendientes del laboratorio`**
- ◆ subagente con scripts · **la app se usa a sí misma para su 42001** (desde App: roadmap de 9 fases con puertas y % por cláusula/norma/global; diagnóstico adaptativo → informe GAP; repositorio de evidencias; matrices de contexto, riesgos, impacto de IA y SoA; KPIs; auditoría y CAPA; calendario; modo pyme sin jerga; panel del consultor multicliente con biblioteca de plantillas, marca blanca y reporte de avance)

**→ produce `Laboratorio (mismo molde que /laboratorio-pymes): ≥5 casos por agente y por pieza del motor, con las trampas del spec; corridas reales con la llave de OpenRouter, estado real y costo por corrida`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **casos contra la app real** (desde App: roadmap de 9 fases con puertas y % por cláusula/norma/global; diagnóstico adaptativo → informe GAP; repositorio de evidencias; matrices de contexto, riesgos, impacto de IA y SoA; KPIs; auditoría y CAPA; calendario; modo pyme sin jerga; panel del consultor multicliente con biblioteca de plantillas, marca blanca y reporte de avance)
- ▸ correr script (determinista) · **corridas reales con costo** (desde Capa agéntica: orquestador, diagnóstico, contexto, riesgos e IA, documental, capacitación, proveedores, KPIs, auditoría, portafolio; cada salida cita IDs del catálogo (validador rechaza IDs inexistentes), guarda traza (agente, modelo pineado, insumos con huella, versión de prompt, aprobador), texto de evidencias delimitado contra inyección, datos personales minimizados antes de salir; LLM inyectado por routing-modelos.json; costo por contabilidad.ts)

**Gates al cerrar la fase:**
- ↻ costo [gris] — referencia: costo por corrida desde contabilidad.ts, null cuando no hay uso; tope del goal US$15 con aviso al 80 %

## Fase 7

**→ produce `Propuestas para firma: entrada CDC (prompts + clases nuevas del routing), Supabase en la nube, exponer A2A fuera de localhost, conectores externos, cobros por suscripción/asiento, datos reales de clientes hacia el proveedor LLM, BUSINESS_LOGIC.md del producto, gates nuevos, respaldo de lo nuevo`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **resultados que sostienen la entrada CDC** (desde Laboratorio (mismo molde que /laboratorio-pymes): ≥5 casos por agente y por pieza del motor, con las trampas del spec; corridas reales con la llave de OpenRouter, estado real y costo por corrida)
- ◆ spawnear subagente (Sonnet) · **AISIA y SoA de la app para firma** (desde La app como su primer inquilino: su propio sistema de gestión de IA (inventario de sus agentes, evaluación de impacto, SoA, política de IA) cargado en la app, con las aprobaciones pendientes del laboratorio)

## Fase 8

**→ produce `READMEs product-first de lo nuevo, guía de la pyme y del consultor, aviso de privacidad en borrador ('por verificar con asesoría legal'), asiento en el inventario`**
- ◆ spawnear subagente (Sonnet) · **lo bloqueado y quién firma, en la documentación** (desde Propuestas para firma: entrada CDC (prompts + clases nuevas del routing), Supabase en la nube, exponer A2A fuera de localhost, conectores externos, cobros por suscripción/asiento, datos reales de clientes hacia el proveedor LLM, BUSINESS_LOGIC.md del producto, gates nuevos, respaldo de lo nuevo)

## Fase 9

**→ produce `Rama propia con todo commiteado, npm run validate en verde después del commit, grafo.json con estados y evidencia, resultados.md`**
- ▸ correr script (determinista) · **commit + npm run validate** (desde READMEs product-first de lo nuevo, guía de la pyme y del consultor, aviso de privacidad en borrador ('por verificar con asesoría legal'), asiento en el inventario)

**Gates al cerrar la fase:**
- ↻ validate [gris] — referencia: npm run validate en verde después del commit, con asiento en el inventario de todo lo nuevo
