# Vendedor en WhatsApp (`/ventas-whatsapp`) y su laboratorio (`/laboratorio-ventas-whatsapp`)

Para el dueño de una pyme: la bandeja de lo que el agente de WhatsApp le pasó y el tablero de lo que
vendió cada anuncio. Para el laboratorio: la prueba de todo el circuito contra el simulador de Meta.

## Qué hace

- **`/ventas-whatsapp`**, el panel del dueño. El token del dispositivo decide qué pyme ve.
  - **Bandeja**: las conversaciones que el agente le pasó (queja, monto alto, no se entendieron,
    presupuesto, pidió una persona), con la conversación completa. Las toma, contesta desde el panel
    y las devuelve al agente.
  - **Tablero**: por campaña y por canal orgánico muestra ingresos, pedidos, gasto, costo por venta y
    ROAS, más el costo por conversación en Meta y en IA, con avisos honestos («tarjeta no
    verificada», «IA simulada»).
  - **Cronómetro** en cada caso: cuánto queda de la ventana de 24 h o de las 72 h gratis, o «solo
    plantilla». Al abrir el panel se revisan las ventanas por cerrar y se avisa.
  - **Integridad**: la cadena de hashes del negocio, verificada contra sus anclas firmadas.
- **`/laboratorio-ventas-whatsapp`**: cada visita corre en el servidor:
  - los casos del agente;
  - las compuertas de las fases 0 a 3;
  - el A/B de la optimización;
  - una conversación de punta a punta por pyme.

  Muestra además el roadmap de costos (ficticio, con las líneas de números y de BSP propio) y el de
  conversaciones-plantilla.
- **Rutas** (`/api/ventas-whatsapp/*`):
  - `webhook` (Meta), `flows` (endpoint de datos cifrado) y `pagos` (procesador);
  - `panel` (acciones validadas con Zod);
  - `a2a/{pedidos|atribucion}`: la pasarela A2A local, con Agent Card firmada.

### Qué no hace

- **No habla con la Graph API real** mientras `VENTAS_WA_C3_C4_FIRMADOS` no esté declarado: sin C3
  y C4 firmados, el canal queda contra el simulador.
- No usa un LLM real: el agente es el modelo simulado de la herramienta.
- No usa Supabase ni `service_role`: guarda en un archivo local. El esquema con RLS es una propuesta
  aparte (`tools/ventas-whatsapp/migraciones/`).
- No da de alta pymes reales: la `semilla` solo existe con `VENTAS_WA_LABORATORIO=1` y solo crea las
  pymes ficticias. El alta por Embedded Signup (BSP propio) y la venta de números existen en la
  herramienta, contra el simulador; la app todavía no los expone.

## Casos de uso

- **Doña Chela recibe una queja**: el agente contesta con empatía y le pasa la conversación. Ella la
  toma en el panel, escribe «te mando otro pedido sin costo», el cliente lo recibe por WhatsApp, y
  luego la devuelve al agente.
- **Martha revisa su campaña de huipiles**: el tablero le dice cuánto vendió, cuánto gastó y su
  ROAS, el mismo que ve Meta en su Administrador de anuncios.
- **El laboratorio decide si hay piloto**: abre el laboratorio y ve qué pasa, qué no está medido y
  por qué.

## Requerimientos de infraestructura

- **Runtime**: Next.js 16 del repo (Node ≥ 22.18). La herramienta `tools/ventas-whatsapp`, construida
  por `prepara:gate`.
- **Dependencias del sistema**: ninguna.
- **CPU, GPU y memoria**: sin GPU. El acuse del webhook por HTTP midió p95 6.2 ms y máximo 7.8 ms en
  72 webhooks, con la app construida en WSL2. La página del laboratorio corre unas 570 conversaciones
  en cada visita (casos, métricas, adversarial y A/B): tiempo no medido. Memoria: no medido.
- **Servicios externos**: los de la herramienta (Meta, el procesador de pagos). En el laboratorio son
  los simuladores de `e2e/capturas.mjs`.
- **Variables de entorno**: `VENTAS_WA_APP_SECRET`, `VENTAS_WA_VERIFY_TOKEN`, `VENTAS_WA_FLOW_SECRET`,
  `VENTAS_WA_FLOWS_LLAVE`, `VENTAS_WA_GRAPH_URL`, `VENTAS_WA_TOKENS`, `VENTAS_WA_PAGOS_URL`,
  `VENTAS_WA_PAGOS_SECRETO`, `VENTAS_WA_PANEL_TOKENS`, `VENTAS_WA_DOMINIOS_LIGA`,
  `VENTAS_WA_LABORATORIO`, `VENTAS_WA_C3_C4_FIRMADOS`, `VENTAS_WA_A2A_LLAVE`, `VENTAS_WA_A2A_SECRETO`,
  `VENTAS_WA_TRAZA_LLAVE`, `VENTAS_WA_ANCLA_LLAVE` y `VENTAS_WA_DATOS`. Sin las obligatorias, las rutas
  responden 503.
- **Almacenamiento**: `.datos/ventas-whatsapp/` (fuera de git), con el almacén JSON, la cola durable
  del webhook y las anclas de la cadena en un archivo aparte.
- **Salida del perímetro (C4)**: en el laboratorio, ninguna. Con un número real, lo que describe la
  herramienta (Meta, el procesador y, con el modelo real, el proveedor de LLM).

## Archivos

- `services/servidor/configuracion.ts`: el entorno validado con Zod, con la guarda de la Graph API
  real.
- `services/servidor/runtime.ts`: el vendedor del proceso (almacén, transporte, pagos, cola durable y
  la pasarela A2A si hay llave).
- `services/servidor/puerta.ts`: el token del panel, que decide el inquilino.
- `services/esquemas.ts`: las acciones del panel (Zod).
- `components/panel-dueno.tsx`: la bandeja y el tablero.
- `components/laboratorio-ventas.tsx`: el laboratorio.
