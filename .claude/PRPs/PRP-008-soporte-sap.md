# PRP-008: Soporte SAP (corrida A: el producto en laboratorio)

> **Estado**: EN EJECUCIÓN por `/goal` (corrida A, 2026-10-04, rama `soporte/sap`).
> **Spec del goal**: [`docs/goals/soporte-sap.md`](../../docs/goals/soporte-sap.md) · **Diseño**: [`docs/SDD-soporte-sap.md`](../../docs/SDD-soporte-sap.md)
> · **Grafo**: [`docs/grafos/soporte-sap.json`](../../docs/grafos/soporte-sap.json)
> **CDC aplicable**: SÍ para lo que toque el inventario (campo de producto y fuente de CLIs) y
> cualquier gate nuevo; va como propuesta fuera de la bitácora, con la firma del laboratorio
> pendiente. Ningún skill, prompt, modelo ni `routing-modelos.json` cambia en este PRP.
> **Aprobación del plan**: en esta corrida el PRP se escribe y se ejecuta en el mismo `/goal`; la
> aprobación humana llega con la firma del CDC y nada se mergea sin ella.

---

## Objetivo

Soporte SAP construido y probado en laboratorio: una consultora de soporte SAP (N2) atiende las
incidencias de sus clientes (N3) con triage, base de conocimiento con fuente citada, evidencia
leída de sus documentos y control de SLA y horas; el laboratorio (N1) aprende cada incidencia
nueva en su sandbox y aprueba en la sala A2A lo que el agente prepara. Todo contra un SAP
simulado, con corpus sintético y LLM simulado.

## Por Qué

| Problema | Solución |
|---|---|
| Una mesa AMS resuelve una y otra vez lo mismo, y el conocimiento vive en la cabeza de quien lo resolvió | matriz problema-solución sobre el motor determinista del grafo, alimentada por el sandbox (KCS) |
| El triage depende de capturas y documentos que alguien tiene que leer | ingesta con el extractor documental, evidencia por campo y revisión humana |
| El SLA se discute con hojas de cálculo | contratos versionados y un reloj que mide desde los eventos con traza |
| Un agente que «arregla» en el SAP del cliente es un riesgo que nadie firma | el agente propone; un humano aprueba en una fila que ningún modelo puede escribir; la aplicación real no está cableada (D6) |

**Valor de negocio**: es el primer producto vendible del laboratorio y el primero que compone
activos existentes (extractor, grafo, A2A, contabilidad, despliegue) para un modelo de negocio.
Su % de reuso es la línea base del siguiente (ERP-MAESTRO §1.9).

## Qué

### Criterios de éxito

Los puntos 1–21, 23 y 24 de la definición de hecho del spec del goal, con su evidencia pegada en
la conversación. En resumen: `validate` en verde; sabotajes de la sala; aislamiento de tres
niveles; 0 fugas del anonimizador; documentos; cadena; recorrido con Playwright; pricing sin
cifras inventadas; inventario; deploy para cualquier VPS; entregables escritos; arquitectura;
almacenamiento; respaldo y restauración por tenant; estimado S/M/L; FDE; chat; SLA; mapeo y
limpieza; capa semántica; impactos en MXN; informe A; CDC propuesto.

## Contexto

- Reusa: `TPL-extractor-documental`, `TPL-grafo-conocimiento`, `TPL-conocimiento`,
  `TPL-feature-a2a`, `TPL-motor-ia`, `TPL-trayectorias`, `TPL-app-base`, `TPL-feature-auth`,
  `TPL-despliegue`. La matriz de reuso está en la §2 del SDD.
- La sala sigue `SPEC-sala-a2a` r2 y `prp-sala-a2a-fase-a` r2 (hermes-os-a2a@e122f54).
- Precedentes: `docs/goals/ventas-ia-waba.md` (simulador, LLM simulado, «no medido») y la
  migración validada en efímero de `tools/etiquetas-gs1`.

## Blueprint

Las fases las deriva `grafo2plan.py` del grafo (la tabla está en el spec del goal). Corrida A:

1. Arquitectura por dominio y por capas — ✅ matriz sin celdas vacías, reuso contado.
2. SDD — ✅.
3. Esquema de almacenamiento · este PRP · C3/C4 en borrador · playbook FDE.
4. `tools/sala-a2a` · dominio SAP (matriz, corpus, simulador) · cadena de eventos.
5. Respaldo y restauración · ingesta de documentos · CLIs · mapeo contextual.
6. Estimado por tamaño · BUSINESS_LOGIC · anonimizador · limpieza y enriquecimiento.
7. Capa semántica en dbt.
8. Contratos SLA · chat del HIL.
9. Modelo de pricing.
10. Impactos en MXN y accionables.
11. App Soporte SAP.
12. Configuración Docker para cualquier VPS · inventario · README comercial.
13. Evidencia de punta a punta e informe A.

## Gobernanza

### Modelo de amenazas (C3)

**Activos que toca**, por daño: datos personales de empleados y usuarios de los clientes N3 que
llegan en tickets y adjuntos (RR. HH., nómina, RFC/CURP/NSS) · la integridad de las aprobaciones
(un plan aprobado que no lo aprobó nadie) · los originales de los clientes · el conocimiento
acumulado (el foso, ERP §1.7) · el presupuesto de modelo y OCR (denial-of-wallet).

**Fronteras que cruza**: el texto y los adjuntos del N3 (no confiables: archivos falsificables e
inyección indirecta) · la sala, que es superficie **externa** porque las consultoras son terceros
· el chat del HIL · los exportes de tickets de cada consultora · la salida del modelo (simulado
hoy) · las propuestas del agente.

**Atacantes relevantes**: O1 (un usuario del N3 o de una consultora que escribe instrucciones en
un ticket, un adjunto o un mensaje de la sala) · O2 (un exporte o un documento con datos falsos que
se toman por evidencia) · O3 (el experto que aprueba en verde tras cuarenta planes buenos) · O4
(abuso de la sala o de la ingesta para quemar OCR) · O5 (las dependencias de dbt y la imagen de
Postgres).

**Controles y brechas**:

- **Aprobaciones**: fila humana con política `as restrictive` y ningún `insert` para servicios;
  el chat no tiene camino; sabotajes S1–S6 y S2b que se ven fallar. *Brecha*: la fatiga del
  aprobador (O3) no la cierra una política; la mitigan el veredicto del supervisor visible y el
  antes y el después del simulador en el mismo mensaje.
- **Inyección**: el contenido de tickets, adjuntos y mensajes es dato delimitado; las decisiones
  (categoría, veredicto, tier) son deterministas y no leen instrucciones. *Brecha*: el día que el
  modelo sea real, el corpus de inyecciones se corre contra él antes de encenderlo.
- **Datos personales**: anonimizador fail-closed antes del sandbox, cuarentena sin copia del dato,
  originales que el laboratorio no baja sin acceso motivado, OCR local. *Brecha*: un dato
  sensible con una forma que ningún detector conoce; por eso la cuarentena y no un «probablemente
  limpio».
- **Aislamiento**: RLS con `force` en todo, agente acotado por tarea, buckets por ruta de tenant.
  *Brecha*: Realtime y el JWT con `org_id` no se prueban sin un Supabase real.
- **Superficie**: nada expuesto. Exponer la sala o el canal N1–N2 es gate humano con este C3 y la
  AISIA firmados.

### Evaluación de impacto (C4)

Borrador fuera del registro: [`docs/goals/soporte-sap-AISIA.md`](../../docs/goals/soporte-sap-AISIA.md).
Se firma junto con el BUSINESS_LOGIC del producto.

## Aprendizajes

- **2026-10-04 · un cuerpo SQL se valida al crearse.** `ss_priv.baja_original` nombraba
  `ss_acceso_motivado` antes de que existiera y la propuesta no se aplicaba. Las funciones que leen
  una tabla van después de ella.
