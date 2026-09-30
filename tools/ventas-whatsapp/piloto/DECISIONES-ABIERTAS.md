# Decisiones abiertas para el piloto — con recomendación

> 2026-09-30. Lo que el laboratorio NO decide: son del laboratorio (el humano). Cada una trae la
> recomendación del agente y qué del código ya está listo para cualquiera de las opciones.

| # | Decisión | Opciones | Recomendación | Qué ya está listo |
|---|---|---|---|---|
| P-01 | **BSP** (ERP-MAESTRO D-27) → ahora **BSP propio** (N-02) | Tech Provider propio · Solution Partner propio · Kapso u otro BSP ajeno | **Tech Provider propio para el piloto** (Meta le cobra a la pyme; nosotros sin riesgo de crédito) y **Solution Partner cuando haya escala** (P-10). Kapso queda como plan B si la revisión de la app de Meta no llega a tiempo | La capa BSP (`src/bsp/`): alta por Embedded Signup, bóveda de tokens, cobro, conciliación y baja, contra el simulador. El transporte sigue siendo una interfaz (`ClienteGraph`): si se usa Kapso, cambia el adaptador y nada más |
| P-02 | **Custodia de tokens** del canal (D-18) | Vault dedicado · Supabase Vault · secretos del orquestador de contenedores | **Vault dedicado por inquilino**, con rotación documentada; nunca en `.env` compartido ni en la configuración del agente | `clienteGraphMultiInquilino` pide el token por recurso a una función inyectada: se conecta al vault sin tocar el resto |
| P-03 | **Procesador de pagos** en México | Mercado Pago · Conekta · Stripe MX · Clip | El que (a) firme sus webhooks, (b) tenga API para verificar un pago y (c) permita ligas con referencia propia. Verificar el pago contra su API antes de marcar «pagado» (brecha del C3) | `ConectorPagos` (crear liga, leer webhook, reporte); el simulado y el HTTP ya lo implementan |
| P-04 | **Proveedor de LLM y flujo de datos** (C4) | Modelo del nivel `capaz` · el de `ligero` · pesos abiertos en proveedor ajeno · autohospedado | Medir con el arnés de 200 y elegir el más barato que dé 0/200; **seudonimizar** teléfono y nombre antes de mandar texto; contrato de no entrenamiento | `modeloCompatibleOpenAI` (sin llave = «no medido»); propuesta de CDC en `CDC-routing-PROPUESTA.md` |
| P-05 | **Tarjeta de tarifas oficial en MXN** | Bajarla de Meta (CSV) · seguir con la del laboratorio | Bajarla antes de fijar precios: la del laboratorio mezcla fuentes secundarias | La tarjeta es un dato con fuente y bandera `verificada`; el tablero dice «estimado» mientras sea `false` |
| P-06 | **Cupo de 1,000 mensajes de servicio** gratis | Confirmarlo en la documentación o la factura de Meta | Confirmarlo en el primer mes del piloto (hoy solo lo publican proveedores) | `cupoServicioMensual` con `verificado: false`; la sensibilidad «sin cupo» ya se calcula (USD 0.010 por conversación en el laboratorio) |
| P-07 | **Retención y borrado** | 12 meses · 6 meses · a petición | Conversaciones y pedidos 12 meses, historial de coexistencia 90 días, borrado a petición en ≤ 20 días hábiles | Todo está por inquilino y por contacto: el borrado es por llave |
| P-08 | **Pyme piloto real** (regla 10 del ERP) | Restaurante · tienda local | Una del giro que se quiera repetir (restaurante o tienda en Veracruz, como propone la fuente), fuera de giros regulados | Las dos verticales corren en el laboratorio; la semilla ficticia se sustituye por la hoja real de la pyme |
| P-09 | **Proveedor de números y trámites** (N-01) | SIM de operador a nombre de la pyme · números virtuales mexicanos (p. ej. Twilio) · los dos | **SIM a nombre de la pyme para VENTA** (el número es suyo y se lo lleva) y **virtuales solo para RENTA** si el proveedor permite portarlos o transferirlos. Antes de vender: verificar con el proveedor qué pide el registro de líneas móviles con identidad del titular (reforma de telecomunicaciones de 2025, **no verificado aquí**) y si un número virtual recibe el código de Meta por SMS o voz | `creaGestorNumeros` (pool, ciclo de vida, cuarentena, cobro) y el alta en Meta simulada con sus límites; el `BuzonNumeros` es la interfaz donde se conecta el SMS del proveedor. `pp-twilio` vuelve a ser candidato de la imprenta (con su CDC) |
| P-10 | **De Tech Provider a Solution Partner** (N-02) | Quedarse en Tech Provider · pasar a Solution Partner en la escala | Pasar cuando (a) haya un volumen que justifique el margen sobre Meta y (b) exista una política de crédito por pyme firmada. Dos riesgos propios, firmables: el impago de la pyme y el **tipo de cambio** (la línea de crédito se comparte en AUD, EUR, GBP, IDR, INR o USD: **no en MXN**) | `facturaMes` con las dos modalidades, `concilia` contra la factura de Meta y `estadoCredito`: aviso al 80 %, y al 100 % se frena solo el marketing; lo demás lo decide una persona |


## Líneas de negocio (decididas por el laboratorio el 2026-09-30)

| # | Qué | Reglas que no se negocian | Dónde está |
|---|---|---|---|
| N-01 | **Gestión y venta de números** (antes D-02, descartada; el laboratorio la reincorporó el mismo día). Para la pyme que no trae número: **VENTA** (línea a nombre de la pyme, alta y administración) o **RENTA** (número de nuestro pool) | (1) Meta exige que el número sea de quien lo registra: en VENTA, a nombre de la pyme, y si se va **se lo lleva**. (2) En RENTA se dice **antes de vender** si se puede portar o transferir. (3) **Cuarentena** de 90 días antes de reasignar un número: los clientes del dueño anterior le seguirían escribiendo y el nuevo leería sus pedidos y direcciones. Es daño a terceros: **no se firma** ni se acorta por presupuesto (límite de C5). (4) El PIN de dos pasos no se guarda en el pool ni en una traza. (5) Calidad en ROJO: se avisa y se frenan envíos no esenciales | `src/dominios/numeros.ts`, `src/simulador/numeros.ts`, `pruebas/numeros.ts`; costos en `ROADMAP-COSTOS.md` |
| N-02 | **BSP propio**: dar de alta a las pymes con nuestra app de Meta (Embedded Signup) en vez de un BSP ajeno. Tech Provider primero, Solution Partner después (P-10) | (1) El código de Embedded Signup vive **30 s**: se canjea al recibirlo, servidor a servidor. (2) El token de negocio vale para toda la WABA: vive en la bóveda (P-02) y **nunca** en el inquilino, el almacén ni una traza. (3) Como Solution Partner, al tope de crédito **no se corta el servicio** a los clientes de la pyme: eso lo decide una persona. (4) La pyme sigue siendo dueña de su WABA; la baja revoca nuestro acceso y le deja su número | `src/bsp/alta.ts`, `src/bsp/facturacion.ts`, `src/simulador/bsp.ts`, `pruebas/bsp.ts` |

## Descartadas (decididas por el laboratorio el 2026-09-30)

| # | Qué | Por qué se descarta | Qué queda en su lugar |
|---|---|---|---|
| D-01 | **TypeSafe** (modelo Jev de decisiones tipadas) como barrera semántica o enrutador | Decisión del laboratorio. Pesaba: proveedor de IA nuevo fuera del stack de la casa (CDC), el texto del cliente saldría a un tercero sin región documentada (C4), el español «no igual de bien» según su propia documentación, y su ejemplo usa `jev-latest` | Su PATRÓN, sin el proveedor: enrutador determinista antes del modelo (intención con reglas explicables; el LLM solo como respaldo) y umbrales en código. Ver `optimizacion` en `REPORTE.md` |
| ~~D-02~~ | ~~Gestión de teléfonos como modelo de negocio~~ | **Revertida** el mismo día por el laboratorio: pasa a ser la línea N-01 | — |

## Checklist para conectar el PRIMER número real (en orden)

1. ☐ C3 (`C3-modelo-de-amenazas-BORRADOR.md`) y C4 (`C4-AISIA-BORRADOR.md`) **firmados**.
2. ☐ P-02 resuelta: token de usuario de sistema en el vault, nunca en `.env`.
3. ☐ Rate-limit por remitente y lista de bloqueo (brecha del C3).
4. ☐ P-03 resuelta y verificación del pago contra la API del procesador.
5. ☐ CDC del routing aprobado y corrida real del arnés de 200 en verde (P-04).
6. ☐ **Nuestra app de Meta como Tech Provider** (N-02): verificación de nuestro negocio, revisión de
   la app con los permisos avanzados y Embedded Signup configurado. La pyme entra por Embedded
   Signup con su portafolio y su WABA; **método de pago registrado en Meta** por la pyme (Tech
   Provider) o nuestra línea de crédito compartida (Solution Partner, P-10). Sin él, desde el
   1/oct/2026 no se entregan mensajes de servicio.
7. ☐ Número: coexistencia (si la pyme ya usa la app), el suyo dedicado o **uno de la línea N-01**
   (P-09 resuelta, sin estar en la app de consumo, en cuarentena cumplida si es reciclado); registro
   con PIN (no en coexistencia); nombre visible y perfil.
8. ☐ Webhook suscrito (`messages` y, en coexistencia, `history`, `smb_app_state_sync`,
   `smb_message_echoes`); `waba_id` y `phone_number_id` en el inquilino.
9. ☐ Catálogo en Commerce Manager con los mismos `retailer_id` que la hoja; Flows publicados
   (los JSON de `flows/`), llave pública del endpoint subida al número.
10. ☐ Dataset de la Conversions API creado para la WABA.
11. ☐ `VENTAS_WA_GRAPH_URL` a la Graph API y `VENTAS_WA_C3_C4_FIRMADOS=1` — la app no arranca el
    canal real sin esta última.
12. ☐ Prueba con un número de baja actividad antes de anunciar.
13. ☐ Esquema en la base: la propuesta validada en efímero se aplica **con gate humano**
    (migración) y el trabajador del webhook declara su uso de `service_role` (C7).
