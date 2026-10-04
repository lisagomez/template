# SDD — Soporte SAP

> **Estado:** diseño del producto Soporte SAP, corrida A del goal
> [`docs/goals/soporte-sap.md`](goals/soporte-sap.md) (2026-10-04, rama `soporte/sap`). Todo corre
> en laboratorio: SAP simulado, corpus sintético declarado como tal y LLM simulado. Nada de esto
> se ha estrenado con una consultora real.
>
> Se escribe por fases del grafo [`docs/grafos/soporte-sap.json`](grafos/soporte-sap.json). La
> matriz de la §2 la vigila una prueba (`tools/soporte-sap/pruebas/arquitectura.ts`): una celda
> vacía, un activo que no existe en el inventario o una cuenta de reuso que no cuadra ponen el gate
> en rojo.

## 1. Qué es y para quién

Soporte SAP equipa a una **consultora de soporte o AMS de SAP** (nivel 2, el cliente que paga)
para atender más incidencias de sus clientes (nivel 3), más rápido y con evidencia, sin perder el
control humano. Por encima está el laboratorio (nivel 1), que opera el sandbox donde se aprende
cada incidencia nueva y el espacio de producción donde el agente prepara soluciones que un humano
aprueba.

| Nivel | Quién | Qué ve | Qué hace |
|---|---|---|---|
| N1 · laboratorio | superadministrador, experto (HIL) y el agente A2A con su Agent Card | operación agregada, sandbox anonimizado, sala | aprueba, enseña, gobierna el núcleo |
| N2 · consultora | consultor, un workspace por cliente que atiende | sus tickets, su SLA, sus horas, su base de conocimiento | atiende, escala al laboratorio por la sala |
| N3 · empresa atendida | usuario del cliente final | sus incidencias y el tablero de su servicio | levanta incidencias con adjuntos |

**Lo que no es.** No se conecta a ningún SAP real: «implementar la solución» en el laboratorio
es aplicarla al simulador, y en el SAP de un N3 es una acción irreversible sobre un tercero que va
con gate humano por acción y no está cableada (D6). No usa un LLM real (D7). No fija precios ni
cifras de SLA (D5, D13).

## 2. Arquitectura por dominio y por capas

Las capas parten de las cuatro del ERP (`erp/ERP-MAESTRO.md` §1.3: datos, CLI-first, operación
A2A y enjambre acotado) y les suman presentación e infraestructura:

| Capa | Qué vive ahí |
|---|---|
| **Presentación** | pantallas bento-grid de la app (Next.js) |
| **Servicio y A2A** | rutas de la app, Agent Card, la superficie opaca de la sala |
| **Dominio y CLIs** | reglas deterministas en `tools/`, y los CLIs que las exponen |
| **Agentes** | quién propone: orquestador, ejecutor, supervisor, FDE, chat |
| **Datos** | tablas con RLS, buckets, crudo inmutable, capa semántica |
| **Infraestructura** | Docker, el VPS sin proveedor fijo, Supabase gestionado |

**Cómo se lee cada celda** (la prueba lo exige así):

- `R` **reusado**: un activo del inventario lo cubre tal cual. Nombra su `TPL-…`.
- `C` **compuesto**: un activo del inventario más pegamento nuevo. Nombra su `TPL-…` y qué se suma.
- `F` **a fabricar**: no hay activo; dice qué se fabrica.
- `N` **no aplica**: dice por qué. No cuenta en el denominador del reuso.

<!-- matriz:inicio -->
| Dominio | Presentación | Servicio y A2A | Dominio y CLIs | Agentes | Datos | Infraestructura |
|---|---|---|---|---|---|---|
| Identidad y tenencia | C TPL-feature-auth + selector de rol del laboratorio | C TPL-app-base + guardas por rol y nivel | F modelo de tres niveles y roles | C TPL-feature-a2a + identidad del agente por su Agent Card | C TPL-feature-auth + tablas de organización y membresía con RLS | R TPL-app-base |
| Sandbox | F vista del experto | F rutas del sandbox | C TPL-grafo-conocimiento + ciclo de aprendizaje | F aprendizaje con el HIL sobre el modelo simulado | F casos anonimizados y propuestas de siembra | R TPL-despliegue |
| Producción | F vista del superadministrador | F rutas de producción | C TPL-grafo-conocimiento + categorizador de incidencias | F orquestador, ejecutor y supervisor (patrón del trío, SDD de fases 6 y 7) | F incidencias y eventos por workspace | R TPL-despliegue |
| Consultora (N2) | F workspace del consultor | F rutas del workspace | F horas y control de SLA por cliente | F FDE de la consultora | F workspaces, clientes y horas | R TPL-despliegue |
| Cliente (N3) | F tablero del servicio y alta de incidencias | F rutas del cliente | F FODA desde la capa semántica | N el N3 no conversa con agentes: su canal es la incidencia (C3) | F incidencias y adjuntos del cliente | R TPL-despliegue |
| Sala A2A | F hilos y aprobación como fila | F herramienta sala-a2a: card opaca y RPC | F invariantes de la sala | C TPL-feature-a2a + el agente publica en el canal | F esquema de la sala con política restrictiva | R TPL-despliegue |
| Chat del HIL | F conversación 1:1 del superadministrador y el experto | F ruta del chat | F intenciones, alcance por rol y promoción a la sala | C TPL-motor-ia + modelo simulado hasta el CDC del routing | F conversaciones por rol | R TPL-despliegue |
| Documentos | C TPL-extractor-documental + cola de revisión en el ticket | C TPL-extractor-documental + puerto de lectura del producto | R TPL-extractor-documental | C TPL-feature-a2a + puente del extractor por A2A | R TPL-extractor-documental | R TPL-despliegue |
| Conocimiento y matriz | F base de conocimiento con fuente | F rutas de consulta | R TPL-grafo-conocimiento | N el veredicto nunca lo da un agente (RF-4 de la spec 004) | C TPL-conocimiento + dominio sintético de laboratorio | N corre en proceso, sin servicio propio |
| Enjambre y FDE | F registro de lo hecho a medida y lo que vuelve al núcleo | C TPL-feature-a2a + capacidades FDE en la Agent Card | F playbook FDE por consultora | F FDE, orquestador, ejecutor y supervisor | F propuestas y registro FDE | N corre en proceso en el laboratorio |
| Datos de la consultora | F revisión del mapeo | F rutas de onboarding | C TPL-extractor-documental + mapeo contextual, limpieza y enriquecimiento | F el FDE propone el mapeo | F crudo inmutable y procedencia por campo | N corre en proceso |
| Métricas | F tableros que leen el corte semántico | F accesor único de métricas | F proyecto dbt con MetricFlow | C TPL-trayectorias + autodiagnóstico como propuestas | C TPL-motor-ia + marts con la contabilidad como fuente de costo | F Postgres efímero y entorno dbt pineado |
| SLA | F reloj y contratos en pantalla | F rutas de contratos | F reloj, contratos versionados y créditos | N el SLA lo mide el reloj, no un agente | F contratos y resultados por ticket | N corre en proceso |
| Costos, pricing e impactos | F tablas de tier, accionables e impactos | F rutas de costos | F modelo de pricing e impactos en MXN | N el precio lo decide el laboratorio (ERP-7) | C TPL-motor-ia + presupuesto con aviso al 80 % | N corre en proceso |
| Respaldo y restauración | N sin pantalla: es operación | N sin superficie de servicio | F export y restauración por tenant | N ningún agente restaura | C TPL-extractor-documental + retención y supresión de originales | C TPL-despliegue + regla 3-2-1-1-0 de FASE0 §9, proveedor por decidir (D12) |
| Despliegue | N sin pantalla | C TPL-despliegue + rutas del producto detrás de Caddy | R TPL-despliegue | N sin agente | N sin datos propios | C TPL-despliegue + servicios del producto en el compose |
<!-- matriz:fin -->

<!-- reuso:inicio -->
**Cuenta de reuso** (la calcula `ss-reuso` desde la matriz; la prueba la vuelve a contar):

- reusadas (R): 12 · compuestas (C): 21 · a fabricar (F): 48 · no aplica (N): 15
- denominador = R + C + F = 12 + 21 + 48 = 81
- **reuso amplio** = (R + C) / denominador = 33 / 81 = **40.7 %**
- **reuso estricto** = R / denominador = 12 / 81 = **14.8 %**
- celdas por activo: TPL-despliegue (11), TPL-extractor-documental (6), TPL-feature-a2a (4), TPL-grafo-conocimiento (3), TPL-motor-ia (3), TPL-app-base (2), TPL-feature-auth (2), TPL-conocimiento (1), TPL-trayectorias (1)
<!-- reuso:fin -->
