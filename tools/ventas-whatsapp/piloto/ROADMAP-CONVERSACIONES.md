<!-- ALTO: ARTEFACTO AUTOGENERADO por roadmapConversacionesMarkdown(). No lo edites a mano: node tools/ventas-whatsapp/e2e/genera-roadmaps.mjs -->
# Roadmap de conversaciones-plantilla

> Generado por `roadmapConversacionesMarkdown()` (`src/laboratorio/documentos.ts`); no se edita a mano. Cada guion
> dice su fase, sus piezas, cuántos mensajes del negocio cuesta y cuánto sale en Meta en tres escenarios (reglas del
> 1/oct/2026, tarjeta NO verificada). «Probada» apunta a un caso del laboratorio o a una prueba que existe.

## Fase 1

| Guion | Vertical | Quién empieza | Pasos | Mensajes del negocio | Por anuncio | Orgánico en cupo | Orgánico fuera de cupo | Estado | Evidencia o lo que falta |
|---|---|---|---|---:|---:|---:|---:|---|---|
| Saludo → menú en carrusel | ambas | cliente | cliente saluda o pregunta qué hay → carrusel del catálogo con aviso de privacidad en el pie | 1 | USD 0.0000 | USD 0.0000 | USD 0.0085 | probada | caso:saludo-catalogo |
| Precio de un producto | ambas | cliente | «¿cuánto cuesta…?» → producto o lista con el precio del catálogo | 1 | USD 0.0000 | USD 0.0000 | USD 0.0085 | probada | caso:precio-del-catalogo |
| Horario, envíos, pagos, cambios | ambas | cliente | pregunta de política → respuesta de la FAQ, sin modelo | 1 | USD 0.0000 | USD 0.0000 | USD 0.0085 | probada | caso:politica-envios |
| Tema ajeno o inyección | ambas | cliente | pregunta ajena → declina y ofrece el menú, sin modelo | 1 | USD 0.0000 | USD 0.0000 | USD 0.0085 | probada | caso:fuera-de-dominio |
| Queja → dueño | ambas | cliente | queja → mensaje de empatía y caso en la bandeja; el dueño toma, contesta y libera | 2 | USD 0.0000 | USD 0.0000 | USD 0.0170 | probada | caso:queja-traspaso |

## Fase 2

| Guion | Vertical | Quién empieza | Pasos | Mensajes del negocio | Por anuncio | Orgánico en cupo | Orgánico fuera de cupo | Estado | Evidencia o lo que falta |
|---|---|---|---|---:|---:|---:|---:|---|---|
| Pedido a domicilio | restaurante | cliente | carrusel → carrito (order) → Flow de entrega cifrado → liga → pago → confirmación | 4 | USD 0.0000 | USD 0.0000 | USD 0.0340 | probada | caso:purchase-una-vez |
| Compra con envío y factura | tienda | cliente | carrusel → carrito → Flow de checkout con RFC → liga → pago → confirmación | 4 | USD 0.0000 | USD 0.0000 | USD 0.0340 | probada | caso:compra-completa |
| Reservación de mesa | restaurante | cliente | «quiero reservar» → Flow dinámico (día, personas, hora) → confirmación | 2 | USD 0.0000 | USD 0.0000 | USD 0.0170 | probada | caso:reserva-mesa |
| Pago confirmado fuera de la ventana | ambas | negocio | el pago llega después de 24 h → plantilla de utilidad `estado_pedido` | 1 | USD 0.0085 | USD 0.0085 | USD 0.0085 | probada | prueba:comercio.ts |
| Pedido sobre el umbral → dueño | ambas | cliente | carrito grande → queda en revisión y pasa al dueño; no se cobra solo | 1 | USD 0.0000 | USD 0.0000 | USD 0.0085 | probada | prueba:traspaso.ts |

## Fase 3

| Guion | Vertical | Quién empieza | Pasos | Mensajes del negocio | Por anuncio | Orgánico en cupo | Orgánico fuera de cupo | Estado | Evidencia o lo que falta |
|---|---|---|---|---:|---:|---:|---:|---|---|
| Lead calificado desde un anuncio | tienda | cliente | anuncio → Flow estático de 3 preguntas → LeadSubmitted a Meta → recomendaciones | 2 | USD 0.0000 | USD 0.0000 | USD 0.0170 | probada | prueba:atribucion.ts |
| QR de la mesa (orgánico atribuido) | restaurante | cliente | escanea el QR → «Quiero pedir [QR-MESA]» → pedido; la venta se atribuye al QR | 4 | USD 0.0000 | USD 0.0000 | USD 0.0340 | probada | prueba:atribucion.ts |

## Fase 4

| Guion | Vertical | Quién empieza | Pasos | Mensajes del negocio | Por anuncio | Orgánico en cupo | Orgánico fuera de cupo | Estado | Evidencia o lo que falta |
|---|---|---|---|---:|---:|---:|---:|---|---|
| Recordatorio de reservación | restaurante | negocio | un día antes → plantilla `recordatorio_reserva` con botones confirmar / cambiar | 1 | USD 0.0085 | USD 0.0085 | USD 0.0085 | pendiente | falta el programador de avisos y su guion (la plantilla ya está registrada) |
| Encuesta después de la entrega | ambas | negocio | al entregar → plantilla con Flow estático de calificación → alerta si es baja (requisito: redactarla solo como servicio (riesgo de recategorización)) | 2 | USD 0.0085 | USD 0.0085 | USD 0.0085 | pendiente | falta el evento «entregado» y la plantilla aprobada |

## Fase 5

| Guion | Vertical | Quién empieza | Pasos | Mensajes del negocio | Por anuncio | Orgánico en cupo | Orgánico fuera de cupo | Estado | Evidencia o lo que falta |
|---|---|---|---|---:|---:|---:|---:|---|---|
| Carrito abandonado | tienda | negocio | carrito sin pagar 24 h → plantilla de marketing con la liga (requisito: opt-in de marketing y tope de frecuencia) | 1 | USD 0.0397 | USD 0.0397 | USD 0.0397 | pendiente | fase 5 |
| Reactivación de clientes inactivos | ambas | negocio | segmento con opt-in → Marketing Messages API con precio máximo (requisito: opt-in, horario local, calidad del número) | 1 | USD 0.0397 | USD 0.0397 | USD 0.0397 | pendiente | fase 5 |

## Plantillas de Meta que piden estos guiones

| Plantilla | Categoría | Para qué | Fase | Registrada | Riesgo |
|---|---|---|---:|---|---|
| `estado_pedido` | utility | Pago recibido o estado del pedido cuando la ventana de 24 h ya cerró | 2 | sí (simulador) | — |
| `recordatorio_reserva` | utility | Recordar la reservación el día anterior | 4 | sí (simulador) | Registrada en el simulador pero sin guion que la use todavía |
| `encuesta_postventa` | utility | Calificar la entrega (Flow estático) | 4 | no | Meta puede recategorizarla a marketing si pide recompra: redactarla solo como servicio |
| `carrito_abandonado` | marketing | Recordar un carrito sin pagar después de la ventana | 5 | no | Marketing: exige opt-in de marketing registrado y cuesta la tarifa más alta |
| `reactivacion_cliente` | marketing | Volver a traer a un cliente inactivo (Marketing Messages API, precio máximo) | 5 | no | Frecuencia por contacto y calidad del número (restricciones de Meta) |

**Estado**: 12 de 16 guiones probados en el laboratorio (fases 1-3); lo pendiente es de las fases 4-5.
