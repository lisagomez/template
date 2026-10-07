# @tu-scope/soporte-sap

Soporte SAP de tres niveles para consultoras de AMS: tu equipo atiende a tus clientes con un agente que
categoriza, encuentra la solución conocida y la prepara, y con un laboratorio experto detrás; tú y tu
cliente ven los mismos números. En laboratorio: datos sintéticos, simulador en lugar de SAP y sin modelo.

## Qué hace

Lo que compra una consultora (N2) para atender a sus clientes (N3):

- **Triage con evidencia.** Cada incidencia llega con sus adjuntos (captura del error, spool en PDF, el
  XML del CFDI) leídos en local; el agente la categoriza por impacto y urgencia (ITIL) con esa evidencia y
  deja su razón y su traza sha256.
- **La solución conocida, preparada y verificada.** Si el grafo de conocimiento tiene la regla, un
  ejecutor prepara el plan y un supervisor, otro agente, lo comprueba contra el simulador; el plan llega a
  la sala A2A y lo aprueba **una persona**. Lo aprobado es exactamente lo que se aplica.
- **Lo que nadie sabía, aprendido sin exponer a nadie.** Sin regla, el caso entra anonimizado al sandbox
  (0 fugas en 277 casos, incluidas las 63 del revisor adversarial) y el experto del laboratorio lo enseña;
  sale una propuesta de regla y de CLI que firma el laboratorio.
- **SLA medido, no declarado.** Contratos N1–N2 y N2–N3 como datos versionados y un reloj con tramos de
  evidencia (corre, pausa en la espera del cliente, se reanuda).
- **Una sola versión de cada número.** Una capa semántica (dbt + MetricFlow, local) alimenta los tableros
  del laboratorio, de la consultora y del cliente, el SLA, el pricing y el chat: la misma métrica da el
  mismo número en todos.
- **Dinero y acciones.** Accionables con impacto proyectado en MXN (fórmula, supuestos y rango), un FODA
  donde cada punto cita su dato y un modelo de pricing por tier con el costo medido.
- **Onboarding de datos.** Mapea los exportes de la herramienta de tickets anterior al esquema
  contextual, limpia y enriquece con procedencia; entrada = limpias + revisión + descartadas.

### Qué no hace

- No toca un SAP real: implementa contra un **simulador**. Quién ejecuta en el SAP de un cliente y con qué
  acceso es una decisión abierta (D6).
- No aprueba nada solo: ni el agente ni el chat insertan una aprobación; lo impide la base (`as
  restrictive` y sin permiso a servicios) y una suite con sabotajes lo vigila.
- No pone precios ni cifras legales: precio, créditos, exclusiones y disponibilidad son parámetros por
  decidir; las metas de SLA de laboratorio citan una referencia pública o dicen «por decidir».
- No promete disponibilidad ni RPO/RTO antes de GATE 3.
- No llama a un modelo: el triage y el chat son deterministas; con modelo, el dato saldría del perímetro
  (D7, C4).

## Casos de uso

- **Una consultora con 20 clientes SAP** reparte su bandeja con la prioridad y la evidencia ya puestas, y
  resuelve lo repetido con el plan que ya verificó el supervisor.
- **Un cliente que impugna una prioridad** la ve calculada con su razón y la impugna; la resuelve su
  consultora, a su nombre.
- **Una consultora que migra de su herramienta de tickets** importa su historial con la cuenta cerrada y
  cada valor rastreable a su original.
- **El laboratorio que vende el producto** ve agregados por consultora y por tamaño, nunca la operación
  de un cliente que no se le escaló.
- **La renovación de un cliente**: salud de la cuenta y riesgo de baja (con su fórmula a la vista) y los
  accionables en MXN para la conversación.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`); la capa semántica, Python 3.12 con `requirements.lock`
  (dbt-core 1.12.5, dbt-metricflow 0.15.0) instalado por `uv`.
- **Dependencias del sistema**: el núcleo, ninguna (el motor de reglas, el lector de documentos y el
  almacén se inyectan). Para leer imágenes, Tesseract local (`spa`) y Python 3; para la capa semántica,
  Docker con `postgres@sha256:b0f9…` (el corredor lo levanta y lo tira).
- **CPU, GPU y memoria**: CPU de aplicación 0.518 ms por incidencia y OCR 0.29 s por página (medidos,
  2026-10-04, `medicion/estimado.json`); sin GPU. La máquina por tamaño (S, M, L) se deriva en el SDD §14 y
  §15. Memoria: no medido.
- **Servicios externos**: ninguno en el laboratorio. En producción, Supabase (Auth, base y Storage) con la
  propuesta de esquema aplicada (no aplicada todavía).
- **Variables de entorno**: `SOPORTE_SAP_LABORATORIO` (solo laboratorio; `configura:deploy` la rechaza en
  producción), `TESSERACT_CMD`, `TESSDATA_PREFIX`, `LD_LIBRARY_PATH` (OCR local), `SS_DBT_VENV` (opcional)
  y, en el corredor de la capa semántica, `SS_PG_HOST`, `SS_PG_PORT`, `SS_PG_USER`, `SS_PG_PASSWORD`,
  `SS_PG_DB`.
- **Almacenamiento**: 22 tablas `ss_*` con RLS forzada y tres buckets privados (`ss-originales`,
  `ss-sandbox`, `ss-exportes`) con ruta por tenant y nombre por sha256 (`migraciones/propuesta-soporte-sap.sql`);
  respaldo por tenant con export lógico (SDD §13). Crecimiento por tamaño: SDD §14.
- **Salida del perímetro (C4)**: ninguna. Los documentos se leen en local, dbt y MetricFlow corren
  locales, el corredor apaga la telemetría y no hay modelo. Un motor externo de OCR se rechaza aun con
  firma: los tickets llevan datos de terceros (límite de C5).

## Estado

Laboratorio (`blueprint`): 148 pruebas propias en verde, la suite de la sala con sus sabotajes S1–S7, y
el recorrido de la app (`/soporte-sap`) con Playwright. Nada se ha desplegado ni expuesto; el esquema es
una propuesta probada en un Postgres efímero.

## Cómo está hecho

| Pieza | Dónde |
|---|---|
| Niveles, roles y tenencia; RLS y buckets | `migraciones/propuesta-soporte-sap.sql`, `pruebas/aislamiento.ts`, `pruebas/esquema.ts` |
| Triage, matriz sobre el grafo, simulador | `src/categoriza.ts`, `src/matriz.ts`, `src/simulador.ts` |
| Ejecutor → supervisor → sala | `src/enjambre.ts` (la sala es `tools/sala-a2a`) |
| Ingesta de documentos | `src/ingesta.ts` (el extractor documental se inyecta) |
| Anonimizador | `src/anonimiza.ts`, `src/lexico.ts`, `pruebas/_adversariales.ts` |
| Cadena de eventos | `src/cadena.ts` |
| Mapeo, limpieza y enriquecimiento | `src/mapeo.ts`, `src/limpieza.ts` |
| Capa semántica y corte | `semantica/` (dbt + MetricFlow), `src/corte.ts`, `src/superficies.ts` |
| Contratos SLA y reloj | `src/sla.ts`, `contratos/plantilla-contrato-sla.md` |
| Chat del HIL | `src/chat.ts` |
| Pricing, impactos y FODA | `src/pricing.ts`, `src/impactos.ts` |
| Respaldo por tenant y estimado | `src/respaldo.ts`, `src/estimado.ts` |
| CLIs (dry-run, «no medido») | `clis/` y `clis/manifiesto.json` |

Evidencias reproducibles: `node tools/soporte-sap/evidencia/<tema>.ts` (aislamiento, cadena, documentos,
anonimizacion, datos, estimado, respaldo, semantica, chat-sla, pricing, impactos) y
`node tools/soporte-sap/semantica/corre.mjs` para regenerar el corte. Diseño completo:
[`docs/SDD-soporte-sap.md`](../../docs/SDD-soporte-sap.md).
