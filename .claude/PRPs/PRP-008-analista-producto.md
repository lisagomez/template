# PRP-008: Analista de producto (rol con contrato A2A: dolores con evidencia, casos de uso y propuestas product first)

> **Estado**: FASE 1 CONSTRUIDA EN LA RAMA `paintpoints` (2026-10-02), **CDC sin firmar** · fase 2 BLOQUEADA (gate humano) · fase 3 a la segunda corrida
> **Fecha**: 2026-10-02
> **Proyecto**: la fábrica (monorepo del laboratorio)
> **Spec**: sin spec, a propósito. El QUÉ quedó acordado en el goal compilado
> (`.claude/goals/analista-producto/spec.md`, con grafo y plan al lado) y en la decisión del
> laboratorio: análisis, SDD, PRP, skill y contrato A2A. Con el QUÉ acordado y solo el plan
> pendiente, el decision tree pide PRP directo. Diseño: `docs/SDD-analista-producto.md`.
> **CDC aplicable**: **sí**. Hay un skill nuevo, una clase de routing (C8), un gate nuevo en
> `.claude/gates.json`, una rama del decision tree en `AGENTS.md` y la cuenta de skills en cuatro
> documentos. Diff, regresión y aprobación humana; la firma la escribe el laboratorio.

---

## Objetivo

Que la fábrica tenga un rol repetible que diga **dónde duele, a quién, con qué evidencia y qué
producto lo resolvería recombinando lo que ya existe**, y que no pueda afirmar un dolor sin la cita
que lo prueba.

## Por Qué

| Problema | Solución |
|----------|----------|
| El repo tiene 38 activos, siete productos y cientos de documentos, y nadie ha cruzado todo eso para ver dónde duele | un rol que recorre el inventario entero y deja la cobertura en N/N |
| Un análisis hecho «a ojo» (como el borrador del pedido, escrito leyendo solo el README) afirma dolores que el repo no sostiene | un verificador determinista: sin cita que exista y diga lo afirmado, el dolor es hipótesis |
| Las propuestas suelen arrancar por la tecnología | one-pagers con orden verificable: usuario, tarea y coste antes de cualquier pieza |
| La prioridad se discute sin insumos visibles | una cuenta con factores declarados, la solidez calculada y vetos C3/C4 que no se ponderan |

**Valor**: decidir qué producto construir después con la evidencia a la vista, y repetirlo cada
mes para ver qué dolor se cerró y cuál nació. **No medido** todavía: el valor real se verá cuando
una decisión del laboratorio salga de un informe.

## Qué

### Criterios de Éxito
- [x] SDD con decisiones, descartes, C3, C4 y lo que no cierra (`docs/SDD-analista-producto.md`)
- [x] Skill `analista-producto` con su contrato capa A y `npm run regresion` en verde
- [x] Agent Card y estados tipados con `@a2a-js/sdk` 1.1.0, probados, y **ninguna ruta** que los sirva
- [x] Verificador de evidencia en verde sobre la corrida, y su `--prueba` tumbando cada siembra
- [x] Primera corrida en `docs/analisis/2026-10-02/` con cobertura N/N del inventario
- [ ] CDC firmado por el laboratorio (hueco listo en `~/propuesta-cdc.md`)
- [ ] Fase 2 desbloqueada por el laboratorio con C3, C4 y C8 resueltos

### Comportamiento Esperado
1. Alguien pide «¿dónde duele?» (o `/analista-producto`).
2. El rol mide con scripts (cifras con su comando), lee el inventario y las fuentes, y escribe
   hallazgos con su cita y su grado.
3. El verificador recalcula los grados, comprueba cada cita y la cobertura, y pone rojo lo que no
   cuadra. El rol corrige hasta verde o declara lo que no pudo.
4. Agrupa en casos de uso por categoría, puntúa, veta y escribe los one-pagers.
5. Entrega el informe al laboratorio abriendo por lo que hay que decidir, y deja las preguntas
   que solo el laboratorio puede contestar. Los handoffs (`/prp`, `/spec-generator`, `/new-app`)
   **se recomiendan, no se ejecutan**.

---

## Contexto

### Referencias
- `inventario/activos.json` + spec 014: la fase 0 que se consume.
- `BUSINESS_LOGIC.md` (índice del portafolio) y el contrato de cada producto: la sección «Dolor».
- `.claude/skills/add-a2a/SKILL.md`, spec 005, `docs/SDD-puente-a2a-extractor.md` y
  `src/features/a2a/tarjeta.ts`: el patrón de Card con los tipos del SDK.
- `scripts/verifica-gates.mjs --prueba`: el patrón de «la prueba de la prueba».
- Referencias externas: *Opportunity Solution Tree* (Torres), GRADE y ODI (Ulwick); qué se toma y
  qué no, en el SDD §2.

### Arquitectura Propuesta
```
.claude/skills/analista-producto/
├── SKILL.md                    # el procedimiento del rol
├── esquema.md                  # analisis.json, campo por campo
└── plantilla-one-pager.md      # el orden product first
scripts/analista-producto/
├── tarjeta.ts                  # Agent Card + estados + rechazos (tipos del SDK, no servido)
├── medidores.mjs               # lista blanca de medidores de solo lectura → mediciones/
├── verifica-evidencia.mjs      # el comparador (y su --prueba)
└── prueba-analista.ts          # el gate prueba:analista
docs/analisis/<fecha>/          # lo único que el rol escribe
├── INFORME.md · analisis.json · propuestas/*.md · mediciones/*.txt
```

### Modelo de Datos
No hay tablas: el rol no toca Supabase. Su «dato» es `analisis.json`, versionado en git, y no se
respalda aparte (se reconstruye corriendo el rol sobre el mismo commit).

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*
- **Activos que toca**: el repo privado (lectura) y la decisión del laboratorio sobre qué construir.
- **Fronteras que cruza**: el texto del repo entra como dato no confiable (README, PR, trayectorias).
- **Atacante relevante**: O1 inyección de requerimientos (un documento que «ordena» marcar algo
  como resuelto) · O2 evidencia falsa (cita fabricada, grado inflado).
- **Controles**: comparador determinista que no lee instrucciones; grado recalculado; el rol sin
  llaves y con escritura solo en `docs/analisis/`; nada servido. **Brecha abierta**: el significado
  de una cita lo juzga quien lee (SDD §3.4).

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*
- **Partes afectadas**: el laboratorio, y los terceros que aparecen en los documentos (titulares en
  corpus, clientes de pilotos), que **no se citan**: se cita el documento que describe el corpus.
- **Daño posible con el sistema operando bien**: priorizar lo que le duele a la fábrica sobre lo que
  le duele al cliente, porque la evidencia es de operación. Mitigación: `importancia_usuario` es
  `null`, lo dice el informe en su primera sección y se convierte en pregunta.
- **Reversibilidad**: total; es un documento y nadie lo ejecuta.
- **Decisión**: mitigar.

---

## Blueprint (Assembly Line)

### Fase 1: El rol y su primera corrida (este goal)
**Objetivo**: SDD, este PRP, skill, contrato A2A no servido, medidores, verificador, gate y la
primera corrida sobre el repo.
**Validación**: `npm run prueba:analista` en verde (Card, transiciones, 0 rutas, `--prueba` y
verificador sobre la corrida); `npm run regresion`; `npm run validate` completo tras el último
commit; propuesta CDC con el diff y la firma en hueco.

### Fase 2: Servicio A2A vivo en la red interna — **BLOQUEADA, gate humano**
**Objetivo**: que Hermes (u otro agente de la red interna) pida un análisis por JSON-RPC y reciba
una Task con el informe y el JSON, sin que nadie abra una sesión.
**Gates que la desbloquean, todos antes de escribir una ruta**:
1. **Flujo de datos (C4)**: el servicio necesita un motor LLM. Con un proveedor (OpenRouter), **el
   contenido del repo sale del perímetro**. Con pesos abiertos alojados fuera, también («pesos
   abiertos no es alojado por ti»). Lo decide el laboratorio, no el precio.
2. **Modelo de amenazas de la superficie (C3)**: es entrada no autenticada hacia un agente que lee
   todo el repo privado. Hay que decidir quién puede pedir, con qué clave y qué alcance de lectura
   tiene.
3. **Routing (C8) y contabilidad**: el motor del servidor pasa por `routing-modelos.json`
   (`analisis-de-producto`) y por `src/lib/ai/contabilidad.ts`. Un uso sin datos de coste se guarda
   `null`. **Cuota y límite de tasa por consumidor**, el hueco mayor que nombra `add-a2a`.
4. **Superficie de `add-a2a`**: tres rutas y ni una más, prueba de opacidad enumerada, health mudo,
   fail-safe probado con la capacidad caída y con entrada corrupta, sin `service_role`.
5. **CDC propio** y la regresión de la capa B en sesión limpia.
**Validación**: las pruebas de `add-a2a` en verde; `prueba:analista` sigue verde; exponer fuera de
la red interna es **otro** gate humano.

### Fase 3: Corridas comparables
**Objetivo**: que la segunda corrida diga qué dolores se cerraron (con el commit o PR), cuáles
nacieron y cuáles persisten, comparando su `analisis.json` con el anterior.
**Validación**: el verificador compara las dos corridas, y un dolor dado por cerrado lleva la cita
del cambio que lo cerró.

### Fase N: Validación final
**Validación**:
- [x] `npm run validate` pasa (lo corre el goal tras el último commit)
- [ ] la firma del laboratorio en `BITACORA-CDC.md`

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

### 2026-10-02: un gate «propuesto sin aplicar» deja huérfana su prueba
- **Error**: el goal pedía proponer el gate sin aplicarlo, pero `verifica-gates.mjs` (comprobación 4)
  pone rojo cualquier `prueba-*` que ningún gate corra.
- **Fix**: el gate entra aplicado en la rama, dentro del mismo CDC sin firmar. Nada se integra sin
  la firma, así que «aplicado en la rama» y «propuesto» protegen igual. Renombrar el archivo para
  esquivar la comprobación habría sido hacerle trampa al gate.
- **Aplicar en**: todo goal que construya un verificador con prueba propia.

---

## Gotchas

- [ ] El patrón `\bT\d{1,2}\b` está prohibido en todo archivo versionado (identificadores de la capa B):
      los IDs del análisis usan `D-`, `HP-`, `CU-`, `P-`, `C-` y `H1…H6`.
- [ ] `mide:mcp`, `trayectorias:informe` y `vigila:versiones` **escriben** en el árbol: el rol no los
      corre, cita su última salida versionada.
- [ ] Lo que se paga en cada sesión está al 90 % de su presupuesto (`mide:contexto`): la descripción del
      skill y la rama del decision tree tienen que ser cortas.
- [ ] `INCIDENTES.md` está vacío: no es evidencia de que no haya habido incidentes.

## Anti-Patrones

- NO afirmar un dolor sin cita: es hipótesis.
- NO inflar el grado: lo recalcula el verificador.
- NO ejecutar el handoff de una propuesta: se recomienda.
- NO servir el rol ni leer `golden-sets` o `.env*`.
- NO editar un skill o cambiar de modelo sin CDC (control C1).

---

*Fase 1 construida en la rama; CDC pendiente de la firma del laboratorio.*
