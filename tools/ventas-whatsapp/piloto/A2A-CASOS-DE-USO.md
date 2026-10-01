# A2A por propósito — casos de uso del vendedor en WhatsApp

> 2026-09-30. Qué agentes hablan con cuáles, **para qué**, con qué alcance y en qué estado. La
> regla que sostiene todo: el inquilino lo pone el TOKEN (nunca la petición), las skills del token
> acotan el propósito, y lo que no es del propósito responde lo mismo que lo que no existe.
> Exponer cualquier agente fuera de la red local es **gate humano con C3 + C4** (AGENTS.md).

## Qué NO es A2A aquí

Meta (Cloud API, Conversions API, Embedded Signup y la línea de crédito del BSP), el procesador de
pagos, el proveedor de números y el proveedor de LLM son **APIs y webhooks**, no agentes: se
integran por adaptador (`ClienteGraph`, `GraphBsp`, `RegistroNumerosMeta`, `BuzonNumeros`,
`ConectorPagos`, `ModeloLenguaje`). Y los tokens de negocio y los PIN **nunca** cruzan A2A. A2A es para que un **agente** delegue en otro **agente** una tarea con estado.

## Casos por propósito

| # | Propósito | Quién → a quién | Skills (alcance del token) | Qué cruza | Estado | Gobierno |
|---|---|---|---|---|---|---|
| 1 | **Orquestar la venta** | Orquestador de WhatsApp → los 6 dominios | todas, en proceso | Tareas con `tenant`, `contextId`, `taskId` | **Hecho y probado** (fases 1-2) | Interno |
| 2 | **Separar lo que más cambia por pyme** | Bus de la plataforma → `pedidos` y `atribucion` remotos | todas las de esos dominios | Igual que 1, por JSON-RPC con el SDK oficial y Agent Card firmada | **Hecho y probado** (fase 3, local) | Local; exponer = gate |
| 3 | **Agencia de anuncios que ve el ROAS** | Agente de la agencia → `atribucion` | `reporte_roas` (solo lectura) | Agregado por canal: conversaciones, pedidos, ingresos, gasto, ROAS. Sin teléfonos ni nombres | **Hecho y probado** (token con skills; mandar conversiones → «no existe») | Fase 5; exponer = gate + C4 (qué ve la agencia) |
| 4 | **Leer el comprobante de una transferencia** (SPEI) | `pedidos` → `extractor-documental` (el puente A2A de la casa, `/a2a`) | `extraccion-documental` | La foto o el PDF del comprobante: monto, referencia, banco. Datos bancarios del cliente | Propuesto | El extractor PROPONE; confirmar el pago es del dueño (dinero ajeno: no firmable). El motor de OCR se inyecta: si sale del perímetro es C4 |
| 5 | **Facturar la venta (CFDI)** | `pedidos` → el ERP de la casa (motor fiscal auditado) como dominio `fiscal` | `emitir_cfdi` (a definir en el ERP) | RFC y razón social del checkout, partidas del pedido | Propuesto (fase 4+, paquetes de país) | Timbrar es irreversible: gate humano. Regla 10 del ERP |
| 6 | **Existencias desde el POS o el ERP de la pyme** | Agente del POS → `catalogo` | `sincronizar_csv`, `descontar` | Productos, precios, existencias. Sin datos de clientes | Propuesto | Token solo con esas skills; la sincronización ya es atómica |
| 7 | **Cotizar y programar el envío** | `pedidos` → agente de logística (pack LOGÍSTICA del ERP) | `cotizar_envio`, `programar_guia` (a definir) | Dirección de entrega y peso: dato personal | Propuesto | C4: la dirección sale al operador logístico |
| 8 | **Preguntar a Hermes cómo va el día** | Hermes (agente de la casa) → `atribucion`, `pedidos` | `reporte_roas`, `estado_pedido`, `conciliar` (lectura) | Agregados y estados | Propuesto | Solo lectura; Hermes no toca dinero |
| 9 | **Reglas citadas** («¿este giro o producto se puede vender por WhatsApp?», «¿el aviso cumple la LFPDPPP?») | `soporte` y el laboratorio → el motor `grafo-conocimiento` | — | La pregunta, sin datos del cliente | Propuesto (ver `GRAFO-REVISION.md`) | Es una **biblioteca**, no un agente: se usa en proceso; A2A solo si un día se sirve aparte |
| 10 | **Seguir el alta de una pyme** (BSP propio, N-02) | Agente de ventas de la plataforma (o Hermes) → BSP | `estado_alta` (lectura, a definir) | Pasos del alta por WABA y dónde se cayó el embudo. Sin tokens, PIN ni códigos | Propuesto | Interno; la capa BSP ya guarda los pasos sin secretos (`pruebas/bsp.ts`) |
| 11 | **Facturar la cuota, el margen y los números** | BSP (`facturaMes`) y línea N-01 → el ERP de la casa como dominio `fiscal` | `emitir_cfdi` (a definir en el ERP) | RFC de la pyme, conceptos y montos. Datos de la pyme, no de sus clientes | Propuesto (con P-10) | El cobro de Meta como Solution Partner lleva tipo de cambio: el ERP lo toma del cierre, no del agente |
| 12 | **Avisar al dueño que su número bajó de calidad** | Pool de números → orquestador de la pyme (bandeja) | `alerta_calidad` (a definir) | Número, calidad y qué hacer. Sin conversaciones | Propuesto | La alerta ya existe en `revisaCalidad`; falta llevarla a la bandeja |

## Cómo se da de alta un propósito nuevo

1. El dominio publica la skill en su Agent Card (firmada).
2. El token del consumidor lleva `dominios`, `skills` y `proposito`. Nada más.
3. Prueba: lo del propósito responde y lo de fuera responde «no existe» (`pruebas/a2a.ts`, caso 4).
4. La cadena de hashes registra cada tarea que cambia algo, con su `tenant`, `contextId` y `taskId`.
5. Si el agente vive fuera de la red local: C3 (superficie nueva) + C4 (qué datos ve) + gate humano.
