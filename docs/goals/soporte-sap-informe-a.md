# Soporte SAP — informe de la corrida A

> Spec: [`docs/goals/soporte-sap.md`](soporte-sap.md) · Diseño: [`docs/SDD-soporte-sap.md`](../SDD-soporte-sap.md) ·
> Plan y C3: [`.claude/PRPs/PRP-008-soporte-sap.md`](../../.claude/PRPs/PRP-008-soporte-sap.md) · AISIA (borrador):
> [`soporte-sap-AISIA.md`](soporte-sap-AISIA.md) ·  CDC: firmado el 2026-10-04, en la [bitácora](../../.claude/gobernanza/BITACORA-CDC.md) (la propuesta se borró al firmar) ·
> Capturas: [`soporte-sap-capturas/`](soporte-sap-capturas/) · Grafo: [`docs/grafos/soporte-sap.json`](../grafos/soporte-sap.json)

**Qué quedó.** Soporte SAP construido y probado **en laboratorio** (datos sintéticos, simulador en lugar de
SAP, sin modelo): el producto de tres niveles (laboratorio → consultora → cliente) con el A2A como Forward
Deployed Engineer, la sala A2A y el chat del HIL conviviendo, documentos leídos por el extractor, contratos
SLA medidos, datos mapeados, limpios y enriquecidos, métricas del ciclo de vida en una capa semántica dbt +
MetricFlow, impactos en MXN y accionables, y la arquitectura, el almacenamiento, el respaldo y el consumo por
tamaño. Nada se desplegó, expuso ni empujó; el concepto «producto» queda para la corrida B.

## 1. La evidencia, punto por punto

| Lo que pide el HECHO | Resultado | Cómo se reproduce |
|---|---|---|
| validate tras el último commit | **28/28 gates activos en verde** (8 inactivos declarados); el conteo final va en la conversación | `npm run validate` |
| Sala: cada sabotaje la pone en rojo, después verde; aprobar desde el chat falla | S1–S7 (incluidos S2b y «el chat aprueba») tumban su comprobación; sin sabotaje, verde; con los dos esquemas en una base, el rol del chat no inserta aprobaciones y el sabotaje que se lo permite tumba `S2b·estr` | `npm --prefix tools/sala-a2a run prueba`, `pruebas/chat.ts` |
| Aislamiento de 3 niveles, buckets incluidos | 56 intentos con el rol real, 0 cruces | `node tools/soporte-sap/evidencia/aislamiento.ts` |
| 0 fugas del anonimizador | 0 en 277 casos, incluidas las 63 entradas del revisor adversarial (la v1 fugaba 54) | `node tools/soporte-sap/evidencia/anonimizacion.ts` |
| Documentos: evidencia por campo, instrucciones sembradas 0 obedecidas, sin umbral todo a revisión | captura (OCR local), spool (capa 0) y CFDI (XML) con evidencia por campo, todos «por revisar»; 3 documentos con instrucciones sembradas, 0 obedecidas | `node tools/soporte-sap/evidencia/documentos.ts` |
| Cadena sha256: alterar, borrar o reordenar sale en rojo | las tres alteraciones dan rojo con su motivo | `node tools/soporte-sap/evidencia/cadena.ts` |
| Mapeo: entrada = mapeadas + revisión + descartadas, procedencia | la cuenta cierra en los dos exportes; un valor limpio y uno enriquecido rastreados hasta su original y su regla | `node tools/soporte-sap/evidencia/datos.ts` |
| `dbt build` y MetricFlow en verde | dbt PASS=53 (5 semillas, 12 modelos, 36 pruebas); MetricFlow 0 errores (2 avisos del parser de dbt 1.12, explicados) | `node tools/soporte-sap/semantica/corre.mjs` |
| La misma métrica da el mismo número en N1, N2, N3, SLA, pricing y chat | MTTR de Andina 39.040222 y de Alimentos del Bajío 42.569149 en las seis superficies; un centinela plantado en el corte aparece igual en todas; un componente que agrega se pone en rojo | `node tools/soporte-sap/evidencia/semantica.ts`, `pruebas/semantica.ts` |
| Reloj de SLA en sus bordes | fuera de horario, P1 24×7, feriado, espera, resolver en pausa, reapertura, cambio de prioridad (las dos modalidades), plazo vencido sin responder y alerta al 80 %; el cumplimiento recalculado desde los eventos es el de la capa semántica | `pruebas/sla.ts`, `node tools/soporte-sap/evidencia/chat-sla.ts` |
| MXN con fórmula, supuestos y rango | 3 accionables con evidencia del corte, fórmula, supuestos (D15) y rango; cambiar el costo hora muestra el antes y el después | `node tools/soporte-sap/evidencia/impactos.ts` |
| Matriz dominio × capa sin celdas vacías | 96 celdas, ninguna vacía; reuso 40.7 % amplio / 14.8 % estricto | `node tools/soporte-sap/clis/ss-reuso.mjs`, SDD §2 |
| Respaldo por capa con fuentes | tabla por capa (BD gestionada o propia, Storage, VPS) con Supabase, PostgreSQL y las tres preguntas al proveedor | SDD §13 |
| Restaurar solo al tenant A con B intacto, cronometrado S/M/L | A = su export y B intacta en los tres tamaños; restauración en efímero, corrida final: S 197 ms, M 436 ms, L 1 263 ms (la primera medición, en la fase 5, dio 62/129/395 ms: varía con la carga de la máquina) | `node tools/soporte-sap/evidencia/respaldo.ts` |
| Consumo S/M/L marcado medido/derivado/supuesto | cada cifra con su naturaleza, transitiva | `node tools/soporte-sap/evidencia/estimado.ts`, SDD §14 |
| Capturas de Playwright del recorrido (pasos 1–12) | 17 capturas, 0 comprobaciones en rojo, 0 errores de consola | `node src/features/soporte-sap/pruebas/recorrido.mjs <url> <carpeta>` con el laboratorio encendido |
| Pricing sin cifras inventadas | precio, modelo de cobro y precios unitarios por decidir; costo «no medido», nunca cero; aviso al 80 % y P1/P2 a una persona al tope | `node tools/soporte-sap/evidencia/pricing.ts`, `pruebas/pricing.ts` |
| `verifica:inventario` y `revisa:readmes` en verde | 241 unidades con asiento (los 7 CLIs con `producto` y grado «no medido»); 20/20 README conformes | `npm run verifica:inventario`, `npm run revisa:readmes` |
| Informe y grafo | este archivo; grafo con 55 elementos en ámbar, 1 morado y 4 grises (los de la corrida B) | `docs/grafos/soporte-sap.json` |
| Propuesta de CDC fuera del registro, `regresion --trampa` en verde, firma pendiente | capa A 147/147, capa B 22/22 (corpus completo; los casos en sesión fría los decide el laboratorio)  | `.claude/gobernanza/BITACORA-CDC.md` (firmado el 2026-10-04) |

Además: el job de la capa semántica en Docker, contra el esquema del producto con el rol real, escribió
1 186 valores en `ss_metrica` **iguales** al corte del laboratorio (`node tools/soporte-sap/semantica/ensayo-produccion.mjs`).

## 2. Las decisiones y por qué

- **Stack.** El del monorepo (Next.js 16, Supabase con RLS, Zod) más lo que el problema pedía: **PGlite**
  para probar el esquema en proceso (sin Docker en el gate), **dbt Core + MetricFlow locales** (Apache 2.0)
  para una sola definición por métrica, y **ningún modelo**: el triage, el chat y el supervisor son
  deterministas. Con modelo, el texto de los tickets saldría del perímetro (D7).
- **La sala como herramienta aparte** (`tools/sala-a2a`), alineada con `SPEC-sala-a2a` r2, porque su
  invariante —ningún componente que ejecuta un modelo fabrica una aprobación— sirve a más de un producto. Dos
  cierres (política `as restrictive` + sin permiso a servicios) y una suite que solo cuenta si cada sabotaje
  la tumba.
- **El enjambre como par ejecutor → supervisor**, no el trío de hermes-os-a2a (que no vive aquí): el
  supervisor re-ejecuta contra el simulador en vez de leer la previsión del ejecutor. Así encontró el defecto
  del periodo que nadie buscaba.
- **El chat no aprueba porque no puede**: no importa la sala ni conoce la tabla; lo que pide aprobación lo
  promueve al hilo del plan.
- **El corte semántico como fuente única**: `ss_metrica` en producción (con RLS por nivel y «visible al
  cliente»), `corte.json` en el laboratorio. Las superficies leen; una prueba estática y un centinela vigilan
  que no calculen.
- **El anonimizador por exclusión** (lo que no es vocabulario es nombre) y **RR. HH. siempre a revisión
  humana**, después de que un revisor independiente encontrara 54 fugas en la v1.
- **Contratos como datos** con metas citadas (SAP Enterprise Support §2.1.1) o «por decidir», y una plantilla
  con 35 huecos para el texto legal.
- **El manifiesto**: los CLIs del producto en `clis/manifiesto.json` y en el inventario con su clasificador de
  producto y su grado («no medido»); adoptar uno es CDC.
- **El laboratorio como runtime en memoria detrás de una variable** que `configura:deploy` rechaza en
  producción: la app se recorre de punta a punta sin Supabase, y no se puede desplegar por error.

## 3. Reuso

Reuso **40.7 % amplio** (reusado o compuesto) y **14.8 % estricto** (reusado tal cual), sobre 81 celdas
aplicables de la matriz dominio × capa. Salió de activos existentes: despliegue (11 celdas), extractor
documental (6), A2A (4), grafo de conocimiento (3), motor de IA (3), app base (2), auth (2), conocimiento (1)
y trayectorias (1). Se fabricó (48 celdas): el dominio de tres niveles, la sala, el anonimizador, la cadena,
el mapeo y la limpieza, la capa semántica, los contratos y el reloj, el chat, el pricing, los impactos, el
respaldo por tenant y la app. El extractor recibió una versión nueva (0.8.0) en vez de un parche.

## 4. El A2A como FDE: qué fue a medida y qué volvería al núcleo

| A medida (de una consultora o un cliente) | Al núcleo (propuesto, sin firmar) |
|---|---|
| el mapeo de MesaUno (Andina) y el de TicketeraDos (Boreal), versionados | la regla del caso «app Fiori en blanco» que enseñó el experto (propuesta de siembra) |
| el contrato N2–N3 de cada cliente y sus versiones | el CLI `ss-limpiar-cache` (propuesta; imprimirlo es CDC) |
| los parámetros de impacto (D15) de cada cliente | las correcciones que una revisión deja en un plan, cuando se repiten |

La frontera la traza `fronteraNucleo` sobre el registro del FDE; ninguna propuesta sale decidida (solo un
humano decide) y lo que va al núcleo pasa por `generaliza` (sin transacciones Z, sociedades ni nombre del
cliente) además del anonimizador.

## 5. Decisiones abiertas del laboratorio, con mi recomendación

| | Decisión | Recomendación |
|---|---|---|
| D1 | ¿Lo aprendido con una consultora sirve a las demás? | Aislado por consultora; al núcleo solo lo generalizado, anonimizado, marcado como general por el experto y firmado. Que el contrato lo diga. |
| D2 | ¿La validación del experto firma una regla? | No: el experto valida y el laboratorio firma en `tools/conocimiento`, como hoy. |
| D3 | Modelo de operación A, B o mixto | **Mixto** hasta GATE 3: la consultora opera su N2 (y su SLA con el cliente); el laboratorio opera solo el N1 (sala, sandbox, núcleo) y no compromete disponibilidad. |
| D4 | Qué tabla firma en la sala | `auth.uid()` con `ss_miembro` sobre `auth.users`, como ya está en el esquema. |
| D5 | Cifras del pricing y tiers | Tier mensual por mezcla crítica y 24×7 (las variables ya salen del corte) más bolsa de horas para lo a medida; las cifras, con el plan comercial. |
| D6 | Quién ejecuta en el SAP real | La consultora, con sus accesos, sobre el plan verificado en el simulador y aprobado en la sala; el laboratorio, nunca. |
| D7 | Modelos con datos de clientes | Prohibido un modelo externo sobre tickets crudos y documentos; a lo sumo sobre el sandbox anonimizado y con decisión C4; preferir autohospedado. |
| D8 | Retención y salida | Mientras dure el contrato; al salir, export por tenant y borrado también en los respaldos. El plazo exacto, con asesoría legal. |
| D9 | Umbrales del extractor y corpus real | Medirlos con el primer corpus real de una consultora, con consentimiento; hasta entonces todo a revisión (como está). |
| D10 | Dónde vive la base | Primero decidir si la residencia en México es requisito: si sí, Postgres propio en Querétaro con pgBackRest o WAL-G; si no, Supabase Pro con PITR y el contrato lo dice. |
| D11 | Cortes S/M/L | Los del laboratorio (8/20/45 incidencias al mes por cliente) como punto de partida; confirmarlos con los datos de las primeras tres consultoras. |
| D12 | Proveedor del VPS | Después de D10, en la misma región: cotizar dos de las cuatro con región en Querétaro (SDD §15). |
| D13 | Qué compromete el laboratorio en N1–N2 | Solo la respuesta a escalamientos, cuando la sala registre la hora de respuesta; sin disponibilidad ni créditos antes de GATE 3. |
| D14 | Qué ve el superadministrador | Lo que ya hace la app: agregados, sandbox anonimizado y lo escalado; originales solo con acceso motivado de 72 h que otorga la consultora. |
| D15 | Parámetros de los impactos en MXN | Que el FDE los capture por cliente en el onboarding, con rango; hasta entonces, los del laboratorio marcados como supuesto. |

## 6. Las formas en que esto podría estar mal o incompleto

**Resueltas en la corrida** (cada una con su prueba y su aprendizaje en el PRP): cuatro controles del C3 que el
SQL no tenía; 54 fugas del anonimizador v1; identificadores con forma de caso-trampa en archivos versionados;
el simulador que no normalizaba el periodo; la promoción del chat a un hilo de segundo nivel; un impacto en MXN
que mezclaba denominadores (6.4 «tardías» donde había 1); la RLS de `ss_metrica` sin «visible al cliente» y sin
etapa; la vista del laboratorio que mostraba el título de un caso no escalado; una demo que eligió una
incidencia de nómina con datos sintéticos de una persona; y una huella sha256 suelta que tumbó `audita:secretos`.

**Abiertas, dichas como son:**

1. **Todo es sintético**: corpus, matriz, notas, exportes. Los números (por ejemplo, ~16 h de consultor por
   incidencia) son artefactos del generador, no del negocio.
2. El anonimizador se midió contra el corpus y contra 63 entradas adversariales; texto real puede romperlo (D9).
3. **Sin Supabase real**: Auth, Realtime y el JWT no se probaron; la RLS sí, en PGlite y en Postgres 17.
4. La app de producción no existe todavía: la de laboratorio usa identidades elegibles y estado en memoria.
5. La Agent Card del FDE tiene sus habilidades en el núcleo, pero ninguna app la sirve (exponerla es gate humano).
6. El contrato N1–N2 no se puede medir: el corpus no trae escalamientos con hora de respuesta.
7. La salud de la cuenta, el riesgo de baja, los umbrales del FODA y los de los tiers son supuestos.
8. El pricing no tiene ningún costo en pesos hasta que existan precios unitarios (D10, D12, D7).
9. Los rangos en MXN son amplios (de $1,250 a $240,000 en el accionable para el cliente): reflejan supuestos sin
   fuente, no precisión.
10. El corte no aplica un tamaño mínimo de grupo; un cliente solo en su tamaño puede quedar expuesto ante el
    laboratorio.
11. `ss_semantica` no tiene RLS porque la API no lo expone; si alguien lo expusiera, quedarían a la vista los
    agregados.
12. La capa B de la regresión: el corpus está completo, pero los casos no se corrieron en sesiones frías.
13. Una etapa sin clientes en el corte aparece como «sin dato» y no como 0 (MetricFlow no devuelve la fila).
14. El reloj en vivo del recorrido muestra tramos de 0 minutos (domingo, P4 hábil); los minutos reales de pausa
    y reanudación se ven en el reloj del corpus.
15. **Las mediciones varían con la carga.** Al repetir el estimado en el cierre, con la máquina ocupada, la CPU
    por incidencia salió en 1.545 ms en vez de 0.518 ms, y sin las variables de Tesseract el OCR quedó «no
    medido»; se conservó la medición original y aquí queda la diferencia. Hace falta medir en la máquina destino.
16. `tools/dictado` (ajeno a esta corrida) salió una vez con código distinto de 0 bajo la carga del validate;
    solo dio 148/148 y la siguiente corrida fue verde.

## 7. El último validate

`npm run validate` tras el commit de la fase 12 (`9b3677f`): **28/28 gates activos en verde**, 8 inactivos
declarados con su motivo. El de este commit se pega en la conversación al cerrar.
