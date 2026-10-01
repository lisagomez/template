# AISIA (C4) — Vendedor con IA en WhatsApp para pymes — BORRADOR

> Fecha: 2026-09-30 · Estado: **BORRADOR, sin firmar** · Revisión: al conectar el primer
> número real, al activar el modelo real (y con él, el flujo de datos hacia su proveedor), al
> abrir la pasarela A2A, al agregar un giro regulado, o tras un incidente.
>
> La redactó el agente del goal `docs/goals/ventas-ia-waba.md`. **La firma es humana.** Precedente
> en el mismo terreno: `.claude/gobernanza/AISIA-asesor-ventas-fase0.md`.

## 1. Partes afectadas

- **El cliente final de la pyme** (no es usuario del producto, no firmó nada): escribe a un
  negocio y le contesta un agente. Sus datos (nombre, teléfono, dirección, pedidos, lo que dice)
  quedan guardados; su dinero pasa por una liga.
- **El dueño de la pyme**: su negocio habla con su voz; si el agente se equivoca, el cliente
  se enoja con ÉL. Su número de WhatsApp es su canal de ventas y puede ser restringido.
- **El laboratorio** (quien opera la plataforma): responde ante la pyme por lo que el agente dijo.
- **Terceros mencionados** en los mensajes (a quién va dirigido un pedido, un familiar).
- **Los clientes del dueño anterior de un número reciclado** (N-01): siguen escribiéndole al número
  que conocían, sin saber que ya es de otro negocio.
- **La pyme que compra o renta un número o entra por nuestro BSP** (N-01, N-02): su canal depende
  de nosotros; si se va, necesita llevarse su número y su WABA.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Precio o promesa equivocada** | El catálogo de la pyme está desactualizado y el agente cotiza bien… un precio viejo. O el modelo real interpreta mal «para dos». |
| **Cobro indebido o doble** | El procesador manda un pago con monto distinto; un cliente paga dos ligas. |
| **Datos personales retenidos sin fin** | Historial de coexistencia (hasta 6 meses) y conversaciones se guardan «por si acaso». |
| **Datos hacia un proveedor de IA** | Con el modelo real, el texto del cliente sale a un proveedor ajeno (aunque sea de pesos abiertos: **no es alojado por nosotros**). |
| **Corte de servicio por presupuesto** | Se agota el presupuesto de IA del mes y el cliente queda sin respuesta. |
| **Traspaso que nadie atiende** | El agente pasa la queja al dueño y el dueño no ve la bandeja: el cliente queda peor que sin agente. |
| **Número restringido** | Mensajes que el cliente percibe como spam bajan la calidad del número y Meta limita a la pyme. |
| **Atribución que engaña al dueño** | El tablero dice ROAS 3× con costos de Meta ESTIMADOS con una tarjeta no verificada; el dueño sube el gasto en anuncios. |
| **Opacidad** | El cliente no sabe que habla con un agente. |
| **Número reciclado** | Un número liberado se reasigna y el negocio nuevo lee pedidos, direcciones y quejas de los clientes del anterior. |
| **Pyme atrapada** | La pyme rentó un número que no se puede portar y, al irse, pierde el canal donde la conocen. |
| **Corte por crédito** | Como Solution Partner, una regla automática corta a la pyme al tope de crédito y sus clientes se quedan sin respuesta. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Precio o promesa equivocada | Media | Media | Sí: el dueño corrige y honra o ajusta |
| Cobro indebido o doble | **Alta** (dinero ajeno) | Baja con los controles | Sí, con reembolso — pero el daño es a un tercero |
| Datos retenidos sin fin | Media-alta | Alta sin política | Sí: borrado |
| Datos al proveedor de IA | **Alta** | Cierta con el modelo real | **No**: el dato ya salió |
| Corte por presupuesto | Media | Media | Sí |
| Traspaso sin atender | Media | Media-alta | Sí |
| Número restringido | **Alta** para la pyme | Baja-media | Parcial y lento |
| Atribución engañosa | Media | Media | Sí |
| Opacidad | Baja-media | Alta | Sí |
| Número reciclado | **Alta** (datos de terceros) | Cierta sin cuarentena | **No**: lo leído ya se leyó |
| Pyme atrapada | Alta para la pyme | Media en renta | Parcial |
| Corte por crédito | Media-alta | Media sin política | Sí, pero el cliente ya no fue atendido |

## 4. Mitigaciones

Marco legal (reglas del motor de la casa, `tools/conocimiento`, dominio `mx-datos-personales-prospeccion`,
LFPDPPP nueva del DOF 20/03/2025): `MX-LFPDPPP2025-14-17-CONTACTO-PF` (aviso de privacidad y base de licitud
del contacto de persona física) y `MX-LFPDPPP2025-35-36-TRANSFERENCIA-INTL` (transferencias a terceros: Meta,
el procesador y, con el modelo real, el proveedor de LLM). El dominio está redactado para prospección B2B:
para atención a clientes finales se propone su propia regla (`GRAFO-REVISION.md`).

Implementadas y probadas en el laboratorio:
- **Precios solo del catálogo**, nunca del modelo; montos no respaldados se bloquean en la
  salida. El catálogo se sincroniza de la hoja de la pyme de forma **atómica** (una hoja con
  errores no se aplica a medias).
- **Dinero**: el agente nunca cobra por sí mismo. Pedido sobre el umbral → queda en revisión y
  lo confirma el dueño. Pago con monto que no cuadra → revisión + caso. Webhook duplicado → no
  se cobra dos veces. Conciliación diaria sin diferencias.
- **Nunca silencio**: presupuesto agotado, modelo caído o dos fallos de comprensión → pasa al
  dueño con un mensaje al cliente. Cortar el servicio NO es la política.
- **Aviso de privacidad** en el primer mensaje (sin gastar un mensaje aparte) y FAQ completa;
  datos de tarjeta o claves que el cliente escriba **no se guardan**.
- **Opt-in** registrado con fecha y fuente (solo mensajes de servicio: sin marketing).
- **Tablero honesto**: marca «tarjeta NO verificada», «IA SIMULADA» y las llamadas sin costo.
- **Temas restringidos por giro** (el restaurante no vende alcohol por chat).
- **Ids seudónimos**: la conversación se identifica con un HMAC del teléfono, no con el teléfono (viaja como
  `contextId` de A2A y en las trazas).
- **Trazabilidad sin datos personales**: cadena de hashes por inquilino con huellas (HMAC) y seudónimos;
  borrar el texto de un mensaje por derechos ARCO no rompe la verificación.
- **Propósito en A2A**: un tercero (p. ej. una agencia) solo ve lo que su token permite (reporte agregado).

Líneas de números y BSP propio (N-01, N-02), probadas en el laboratorio:
- **Cuarentena** de 90 días antes de reasignar un número liberado, sin el nombre visible anterior.
- **VENTA a nombre de la pyme** (se lo lleva al irse); en RENTA, portabilidad dicha **antes** de vender.
- **Al tope de crédito no se corta el servicio**: se frena el marketing y una persona decide.
- La **baja** revoca nuestro acceso y deja a la pyme con su WABA y su número.
- **Frontera del número** (2026-10-01): ante una ráfaga, los clientes que ya existían siguen atendidos; los
  contactos nuevos de más reciben una cortesía con el menú (no silencio) y las quejas siguen llegando al dueño.

Pendientes antes del piloto (bloquean la firma, a juicio del agente):
- **Retención**: definir y aplicar (propuesta: conversaciones y pedidos 12 meses; historial de
  coexistencia 90 días; borrado a petición del cliente con «BORRAR MIS DATOS» atendido por el
  dueño en ≤ 20 días hábiles; los plazos exactos de respuesta, contra la LFPDPPP 2025 vigente).
- **Flujo de datos al proveedor de IA** (C4): elegir proveedor y región; seudonimizar teléfono
  y nombre antes de mandar el texto; contrato de no entrenamiento. Sin esto, el modelo real no
  se enciende.
- **Aviso al dueño fuera de la app** cuando la bandeja tiene casos (sin datos del cliente en el
  aviso).
- **Revisión legal** del aviso de privacidad y del contrato con la pyme (quién es responsable
  del contenido, del consentimiento y del tratamiento de datos).
- **Giros regulados** (salud, finanzas, alcohol): fuera del piloto.

**Riesgos que NO se pueden firmar** (límite de C5): el dinero y los datos del cliente final son
de un tercero. Si una mitigación de cobro o de datos no está, se rediseña; no se acepta con firma.
Lo mismo con la **cuarentena de números** (los datos son de los clientes del dueño anterior) y con
**cortar el servicio por crédito** (quien se queda sin respuesta no firmó nada). En cambio, el
impago de una pyme y el tipo de cambio de la línea de crédito son riesgos **nuestros**: esos sí se
firman (P-10).

## 5. Decisión (propuesta)

**Mitigar y NO conectar todavía.** El laboratorio demuestra el circuito con las barreras
activas; el piloto se abre cuando: la corrida con el modelo real salga en verde, estén la
retención, el flujo de datos al proveedor, el rate-limit por remitente (C3) y el vault de
tokens (P-02), y esta AISIA y el modelo de amenazas estén firmados.

Firmada por: ____________  Rol: ____________  Fecha: ____________
