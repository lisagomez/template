# Vendedor con IA en WhatsApp para pymes (fases 0–3, en el laboratorio) — Spec

> Compilado con `/goal-compiler` el 2026-09-30, rama `ventas_ia_waba`. Forma: **LOOP**. El
> producto es multiagente (orquestador + agentes de dominio por A2A), pero construirlo es un solo
> trabajo con una sola línea de meta: el circuito anuncio → chat → pedido → pago → conversión →
> ROAS, demostrado de punta a punta. Si se junta en un solo agente no se pierde nada: los dominios
> se escriben uno tras otro sobre el mismo núcleo.
>
> **Fuente:** `docs/INVESTIGACION-ventas-ia-whatsapp.md` (documento del laboratorio, 29/09/2026).
> Léelo entero: trae los campos de webhook, las ventanas de 24 h y 72 h, la Conversions API, la
> coexistencia, los Flows y el modelo de datos. Sus datos de plataforma son de septiembre de 2026.
>
> **Decidido por el laboratorio (30/09):**
> 1. **Horizonte: fases 0–3**, completas y en el laboratorio. Las fases 4–5 son horizonte: no se
>    construyen, pero la arquitectura no puede impedirlas (multi-inquilino y modelo A2A desde el
>    día uno).
> 2. **El agente no se mide con un LLM real en este goal.** Todo corre contra un LLM simulado; el
>    arnés de evaluación real queda listo y su resultado dice «no medido». La corrida real va
>    después, con llave, CDC del routing y firma.

## Lo que hay hoy (hechos, no suposiciones)

- **A2A**:
  - `@a2a-js/sdk` 1.1.0 pineado;
  - `src/features/a2a/` (tarjeta, puente, ejecutor, almacén de tareas);
  - el skill `add-a2a` y la spec `.claude/specs/005-a2a-interoperabilidad/`.

  Exponer un agente a internet o a un partner es gate humano, con C3 + C4.
- **IA de la casa**:
  - `src/lib/ai/routing.ts` + `.claude/routing-modelos.json`: cada clase de tarea tiene nivel, y
    dar de alta una clase nueva es CDC;
  - `src/lib/ai/contabilidad.ts`: una llamada sin datos de uso se guarda con coste `null`, nunca
    como cero.

  El Vercel AI SDK no está instalado y no hay `OPENROUTER_API_KEY` en el entorno.
- **El patrón del laboratorio**: `/laboratorio-pymes` corre casos sintéticos y declarados de
  verdad, cada uno con su estado (`pasa`, `falla`, `no-medido`), y la app solo usa lo que pasa.
  `tools/pymes-marketing` y `/estudio` ya atienden al dueño de la pyme con su contenido de redes.
- **Gobernanza del mismo terreno**: `.claude/gobernanza/AISIA-asesor-ventas-fase0.md` (C4 de un
  sistema que procesa las palabras de un prospecto) y las plantillas
  `.claude/gobernanza/plantillas/modelo-amenazas.md` y `aisia.md`.
- **ERP** (`erp/ERP-MAESTRO.md`): el CRM conversacional por WhatsApp está DECIDIDO como línea de
  producto y PENDIENTE de fabricación (D-27). Tiene dos bloqueantes:
  - P-01: elección de BSP (Kapso, Cloud API directo u otro);
  - P-02: custodia de los tokens del canal en vault (D-18).

  La regla 10 dice que un pack nuevo solo se fabrica con cliente real. Por eso **esto es
  laboratorio, no el pack**, y no cierra P-01 ni P-02: las deja abiertas detrás de interfaces.
- **Base de datos**: `prueba:migraciones` prueba `supabase/migrations/` en PGlite, y
  `tools/etiquetas-gs1/migraciones/prueba-efimera.sh` es el precedente de «propuesta validada en
  efímero, no aplicada».
- **Pruebas**: `prueba:tools` corre `tools/*/pruebas/*.ts` sin tocar el manifiesto de gates.
  `verifica:gates` tumba cualquier `prueba-*.ts|mjs` o `pruebas/*.ts` que ningún gate alcance.

## MISION

Cuando termines existe, en el laboratorio, el **vendedor con IA en WhatsApp para pymes**, con su
circuito de ingresos completo y medible. El circuito:

- un cliente llega por un anuncio Click-to-WhatsApp o por el QR de una mesa;
- el agente de la pyme lo atiende en segundos con botones, listas y catálogo;
- arma el pedido o la cita y cobra con una liga de pago;
- la venta vuelve a Meta como conversión, con su `ctwa_clid`.

El dueño ve en su tablero cuánto vendió cada campaña y cada canal orgánico, y cuánto le costó cada
conversación en Meta y en IA. Todo corre de punta a punta contra un **simulador fiel de la
plataforma de Meta**, con dos pymes ficticias de Veracruz (un restaurante y una tienda) y sin tocar
un número real.

El nivel: lo que una agencia seria le enseñaría a su primera pyme para cerrar el contrato, no un
bot eco con extras.

### 1. El simulador de Meta (lo que hace posible todo lo demás)

- **Imita lo que la app ve de Meta**:
  - webhooks firmados con `X-Hub-Signature-256` sobre el cuerpo crudo;
  - campos: `messages`, `statuses` con `pricing`, respuestas interactivas, `nfm_reply`, `order`,
    `referral` con `ctwa_clid`, `smb_message_echoes`, `history` en fragmentos, `account_update`
    y `automatic_events`;
  - la verificación GET, los reintentos, las ráfagas y el desorden.
- **Imita la Graph API que la app llama** y acepta o rechaza como Meta: mensajes, medios,
  plantillas, `message_qrdls` y `/{dataset_id}/events` de la Conversions API.
- **Cada forma de payload cita la página de Meta de la que sale, con su fecha.** Lo que no se pudo
  verificar se marca; no se inventa.
- **Los otros dos actores**:
  - un cliente final simulado, con conversaciones guionadas por vertical y sus trampas;
  - un procesador de pagos simulado: liga, webhook de confirmación firmado, pagos fallidos y
    duplicados.
- **La app no sabe que habla con el simulador**: el transporte se inyecta. Pasar a Cloud API real
  o a un BSP es cambiar el adaptador, no la app.

### 2. Fase 0 — Canal

- **Webhook**:
  - verificación GET y firma validada;
  - 200 inmediato y el trabajo en cola;
  - idempotencia por `message.id`: nada se pierde ni se duplica con reintentos y ráfagas.
- **Cada mensaje guarda** su estado, su `pricing` y el país del destinatario. El `wa_id` mexicano
  se normaliza (521 → 52) antes de buscar al contacto.
- **Ventanas bien calculadas**:
  - la de 24 h, solo con mensajes del cliente;
  - la de 72 h, la de un anuncio CTWA;
  - qué mensaje se paga y cuánto, con las 1,000 respuestas de servicio gratis al mes por número.
- **Coexistencia**:
  - el eco del dueño pausa al agente en ese chat;
  - el historial se ingiere por fases y fragmentos;
  - `PARTNER_REMOVED` pausa al inquilino y avisa al dueño.
- **Tokens y secretos del inquilino** detrás de un almacén inyectado y cifrado. Nunca en la
  configuración del agente ni en un log. P-02 queda abierta; la interfaz no.

### 3. Fase 1 — El agente de ventas

- **`AgentGateway`** aísla al proveedor de LLM. Lleva dos adaptadores:
  - el simulado, que incluye uno **adversarial** que intenta salirse del negocio, inventar precios
    y saltarse el traspaso;
  - el real, listo, que sin llave responde «no medido».
- **El orquestador de WhatsApp no hace el trabajo**: delega en los dominios (ventas, catálogo,
  pedidos, citas, soporte, atribución) con el modelo de A2A desde el día uno: `Task`, `Message`,
  `Artifact`, `contextId`, `taskId` y `tenant` en toda llamada.
- **Precio y existencias salen SOLO de herramientas**, nunca del texto del modelo.
- **Solo habla del negocio** (la política de AI Providers de WhatsApp). Las barreras van antes y
  después del modelo, no solo en sus instrucciones.
- **Traspaso a humano** por queja, monto sobre el umbral, dos fallos de comprensión o presupuesto
  agotado. El dueño lo ve en su bandeja, contesta y libera al agente.
- **Presupuesto de tokens y de turnos** por conversación y por inquilino, con la contabilidad de
  la casa.
- **Pocos mensajes ricos** (botones, listas, carrusel, Flows) en vez de muchos textos: desde el
  1/oct/2026 cada respuesta cuesta. Se miden los mensajes por conversación.
- **Opt-in** registrado con fecha y fuente, y aviso de privacidad en el primer contacto.

### 4. Fase 2 — Comercio en el chat

- **Catálogo** sincronizado desde la hoja o el CSV de la pyme. Mensajes de producto, multiproducto
  y carrusel; el webhook `order` se vuelve carrito.
- **Flows**, con su Flow JSON en el repo:
  - calificación de lead (estático);
  - datos de entrega y reserva de cita (dinámicos, con el endpoint de datos cifrado como lo exige
    Meta);
  - checkout.
- **Cobro** con la liga del procesador detrás de un conector (el procesador concreto queda
  abierto). Se confirma por su webhook, se concilia sin diferencias, y el estado del pedido sale
  por una plantilla de utilidad costeada.
- **Idempotencia de punta a punta**: un reintento no crea dos pedidos ni dos cobros.

### 5. Fase 3 — Atribución y ROI

- **El origen de cada conversación**:
  - `ctwa_clid`, anuncio y campaña del primer mensaje;
  - o la etiqueta orgánica (`[QR-MESA]`, `[IG-BIO]`, `[TICKET]`, `[WEB-HERO]`), que se quita
    antes de pasar el mensaje al agente.

  Los enlaces cortos y los QR salen de la API.
- **Conversions API**: `LeadSubmitted` y `Purchase` con `action_source: business_messaging`,
  `event_id` único y un ledger. Un pedido jamás se cuenta dos veces, y se compara contra
  `automatic_events`.
- **`pedidos` y `atribucion` pasan a agentes A2A reales** detrás de un gateway local:
  - Agent Card firmada, verificada antes de delegar;
  - `tenant` obligatorio, y el token manda sobre el `tenant` que diga la solicitud;
  - «no autorizado» indistinguible de «no existe».

  Local: exponerlo es gate humano.
- **Tablero del dueño**: gasto, conversaciones, pedidos, ingresos, costo por venta, ROAS, y el
  costo real por conversación (Meta + IA) por canal y por campaña.

### 6. Dos inquilinos desde el día uno

Un restaurante y una tienda ficticios, con datos sintéticos y declarados (como la «Panadería La
Espiga» de `/laboratorio-pymes`). Ninguno ve, gasta ni atribuye lo del otro, y se prueba.

### 7. El laboratorio del agente

Una página en la línea de `/laboratorio-pymes`: casos por vertical que corren de verdad, cada uno
con su estado (`pasa`, `falla`, `no-medido`). Incluye el arnés de las 200 conversaciones de la
compuerta de la Fase 1. Con el LLM simulado corre entero; con el real dice «no medido» y por qué.

### 8. El paquete para el piloto (se deja listo, NO se ejecuta)

- **Borrador C3**: el modelo de amenazas del canal. Una entrada no autenticada hacia un agente con
  llaves; inyección desde el chat; los Flows; los webhooks del procesador.
- **Borrador C4 (AISIA)**: los clientes finales de la pyme (sus datos, sus pedidos, su dinero), el
  dueño, y el corte de servicio por presupuesto. **Las firmas son humanas: ningún agente las
  fabrica.**
- **Propuesta de CDC** para la clase del agente en `routing-modelos.json`: el diff y la entrada de
  bitácora en borrador, sin aplicar.
- **Esquema de base de datos** con `tenant_id` y RLS en todas las tablas, validado en efímero y
  **no aplicado**.
- **Decisiones abiertas, cada una con tu recomendación**:
  - P-01, el BSP;
  - P-02, la custodia de tokens;
  - el procesador de pagos en México;
  - el proveedor de LLM y su flujo de datos (C4);
  - el checklist para conectar el primer número real.

### Horizonte (fases 4–5: no se construyen, no se impiden)

- Alta autoservicio con Embedded Signup v4 y coexistencia.
- Plataforma multi-pyme con panel.
- Todos los dominios detrás del gateway A2A, con Agent Cards por inquilino.
- Paquetes de país y el dominio fiscal.
- Marketing Messages y alta disponibilidad.

El reporte dice qué de lo construido las habilita y qué las estorbaría.

## LIBERTAD TECNICA

Tú eliges:

- el diseño del simulador;
- cómo se reparte el núcleo;
- la cola y el modelo de datos;
- las barreras de dominio;
- la forma de los Flows;
- la UI de la bandeja, del tablero y del laboratorio.

Lo que la fuente propone como diseño (`AgentGateway`, los seis dominios, las tablas, los
endpoints) es una propuesta sólida, no una receta: cámbialo si encuentras algo mejor y di por qué.
Optimiza por un circuito que aprobarían a la vez un auditor de Meta y el dueño de una pyme, no por
el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

- **La documentación vigente de Meta** de cada pieza que toques: webhooks, precios del 1/oct/2026,
  la ventana de 72 h de CTWA, la Conversions API for Business Messaging, los Flows y su cifrado,
  la coexistencia, los QR. La fuente es de septiembre de 2026 y Meta cambia: lo que difiera, se
  anota en el reporte.
- **2-3 referencias serias** de agentes de venta en WhatsApp, y de simuladores o sandboxes de API
  de mensajería: cómo prueban sin un número real.
- **Next.js 16 cambió**: lee la guía relevante en `node_modules/next/dist/docs/` antes de escribir
  código de Next.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Pruebas en verde, pegadas**, que incluyan:
  - firma inválida rechazada; reintentos y ráfagas sin duplicados; acuse < 1 s, medido;
  - las ventanas de 24 h y 72 h, y el costeo por mensaje con el cupo de 1,000;
  - el agente adversarial: 200 conversaciones con cero respuestas fuera de dominio y cero precios
    inventados, porque las barreras lo frenaron;
  - el traspaso a humano en sus cuatro disparadores, y el eco del dueño pausando al agente;
  - `order` → carrito → liga → pago confirmado → estado del pedido, conciliado sin diferencias,
    y el pago duplicado que no cobra dos veces;
  - un Flow dinámico con su cifrado de ida y vuelta;
  - `ctwa_clid` capturado → `Purchase` aceptado por el simulador, una sola vez; y la etiqueta
    orgánica atribuida y quitada antes de llegar al agente;
  - aislamiento: el inquilino A no lee, no gasta y no atribuye lo del B, tampoco por A2A;
  - la Agent Card firmada verificada, y la tarjeta falsa rechazada.
- **Una conversación de punta a punta por pyme** (anuncio → chat → pedido o cita → pago →
  conversión → tablero), pegada como transcripción, con los mensajes que salen y su costo.
- **Tabla de métricas del laboratorio frente a las compuertas de las fases 0–3**: resolución sin
  humano, primera respuesta, mensajes y costo por conversación, conversión. Cada cifra dice si es
  simulada o «no medido»; ninguna finge ser real.
- **Playwright** (escritorio y celular), capturas pegadas de:
  - la bandeja del dueño tomando un traspaso y liberándolo;
  - el tablero de ROAS de las dos pymes;
  - el laboratorio del agente con sus estados.
- **El paquete para el piloto** (§8), con sus rutas.
- Último output del comando de validación, en verde.
- Reporte de decisiones, y lista de formas en que esto podría estar mal o incompleto (sobre todo
  dónde el simulador podría divergir de Meta), cada una con lo que se hizo.

## COMANDO DE VALIDACION

En el worktree, primero `npm ci`: con `node_modules` enlazado, Turbopack falla. Después
`npm run validate`, que ya corre `tools/*/pruebas/*.ts` por `prueba:tools`. Tras el build, tu
script de capturas de Playwright. Córrelos tras cada cambio grande y pega el output.

## RESTRICCIONES REALES

- **Nada real sale**: ni un número de WhatsApp, ni una WABA, ni un anuncio, ni un cobro, ni un
  evento real a la Conversions API. Conectar el canal exige C3 + C4 firmados y gate humano
  (AGENTS.md, canales de chat externos). Todo va contra el simulador.
- **Solo datos ficticios y declarados**; ningún dato de clientes reales. La base de datos
  compartida no se toca: el esquema es una propuesta validada en efímero.
- **Sin LLM real ni gasto** (decisión del laboratorio): el adaptador real queda listo y su
  resultado es «no medido».
- **Vive en el monorepo**:
  - el núcleo nace en `tools/<nombre>/` sin React, Next ni Supabase
    (`docs/EMPAQUETAR-HERRAMIENTA.md`), sin empaquetar ni publicar;
  - las pantallas, en `src/features/`;
  - el stack de la casa (AGENTS.md, Golden Path).
- **Las pruebas, en `tools/<nombre>/pruebas/`**: fuera de ahí quedan huérfanas, y un gate nuevo en
  `.claude/gates.json` es CDC.
- **CDC (C1)**: no toques skills, prompts de la fábrica, `settings.json`, `.mcp.json`,
  `routing-modelos.json`, `gates.json` ni `AGENTS.md`. Lo que haga falta ahí se deja como
  propuesta.
- `service_role` fuera de las superficies de negocio; RLS en todas las tablas; Zod en toda entrada.
- Dependencias nuevas con **versión exacta**. Ningún secreto se imprime.
- Rama `ventas_ia_waba`, en su worktree. Sin merge ni push sin el sí del laboratorio.
