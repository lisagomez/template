/**
 * El roadmap de conversaciones-plantilla: cada guion de conversación que el vendedor sabe (o
 * sabrá) llevar, con su fase, sus piezas (interactivos, Flows, plantillas de Meta), cuántos mensajes
 * del negocio cuesta y cuánto sale en tres escenarios (llegó por anuncio, orgánico dentro del cupo,
 * orgánico fuera del cupo). El estado se GANA: «probada» apunta a un caso del laboratorio o a una
 * prueba que existe; «pendiente» dice qué falta.
 *
 * Y el catálogo de plantillas de Meta que esos guiones necesitan, con su categoría: una plantilla
 * de «utilidad» con tono promocional la recategoriza Meta a marketing (más cara y exige opt-in).
 */
import { decidePrecio, TARJETA_LABORATORIO, type CategoriaPrecio, type Ventanas } from '../meta/tarifas.js';
import type { CategoriaPlantilla } from '../meta/mensajes.js';

export type EstadoGuion = 'probada' | 'construida' | 'pendiente';

export interface PlantillaMeta {
  nombre: string;
  categoria: CategoriaPlantilla;
  proposito: string;
  fase: number;
  /** Registrada en el simulador y usada por el vendedor. */
  registrada: boolean;
  riesgo?: string;
}

export interface GuionConversacion {
  id: string;
  nombre: string;
  vertical: 'restaurante' | 'tienda' | 'ambas';
  fase: 0 | 1 | 2 | 3 | 4 | 5;
  disparador: 'cliente' | 'negocio';
  pasos: string;
  /** Mensajes del negocio: libres (servicio) y plantillas por categoría. */
  mensajesLibres: number;
  plantillas: Array<{ nombre: string; categoria: CategoriaPlantilla }>;
  estado: EstadoGuion;
  /** `caso:<id>` del laboratorio o `prueba:<archivo>` que la sostiene; o lo que falta. */
  evidencia: string;
  requisito?: string;
}

export const PLANTILLAS_META: PlantillaMeta[] = [
  { nombre: 'estado_pedido', categoria: 'utility', proposito: 'Pago recibido o estado del pedido cuando la ventana de 24 h ya cerró', fase: 2, registrada: true },
  { nombre: 'recordatorio_reserva', categoria: 'utility', proposito: 'Recordar la reservación el día anterior', fase: 4, registrada: true, riesgo: 'Registrada en el simulador pero sin guion que la use todavía' },
  { nombre: 'encuesta_postventa', categoria: 'utility', proposito: 'Calificar la entrega (Flow estático)', fase: 4, registrada: false, riesgo: 'Meta puede recategorizarla a marketing si pide recompra: redactarla solo como servicio' },
  { nombre: 'carrito_abandonado', categoria: 'marketing', proposito: 'Recordar un carrito sin pagar después de la ventana', fase: 5, registrada: false, riesgo: 'Marketing: exige opt-in de marketing registrado y cuesta la tarifa más alta' },
  { nombre: 'reactivacion_cliente', categoria: 'marketing', proposito: 'Volver a traer a un cliente inactivo (Marketing Messages API, precio máximo)', fase: 5, registrada: false, riesgo: 'Frecuencia por contacto y calidad del número (restricciones de Meta)' },
];

export const GUIONES: GuionConversacion[] = [
  { id: 'saludo-y-menu', nombre: 'Saludo → menú en carrusel', vertical: 'ambas', fase: 1, disparador: 'cliente', pasos: 'cliente saluda o pregunta qué hay → carrusel del catálogo con aviso de privacidad en el pie', mensajesLibres: 1, plantillas: [], estado: 'probada', evidencia: 'caso:saludo-catalogo' },
  { id: 'precio-de-producto', nombre: 'Precio de un producto', vertical: 'ambas', fase: 1, disparador: 'cliente', pasos: '«¿cuánto cuesta…?» → producto o lista con el precio del catálogo', mensajesLibres: 1, plantillas: [], estado: 'probada', evidencia: 'caso:precio-del-catalogo' },
  { id: 'politicas', nombre: 'Horario, envíos, pagos, cambios', vertical: 'ambas', fase: 1, disparador: 'cliente', pasos: 'pregunta de política → respuesta de la FAQ, sin modelo', mensajesLibres: 1, plantillas: [], estado: 'probada', evidencia: 'caso:politica-envios' },
  { id: 'fuera-de-dominio', nombre: 'Tema ajeno o inyección', vertical: 'ambas', fase: 1, disparador: 'cliente', pasos: 'pregunta ajena → declina y ofrece el menú, sin modelo', mensajesLibres: 1, plantillas: [], estado: 'probada', evidencia: 'caso:fuera-de-dominio' },
  { id: 'queja-a-humano', nombre: 'Queja → dueño', vertical: 'ambas', fase: 1, disparador: 'cliente', pasos: 'queja → mensaje de empatía y caso en la bandeja; el dueño toma, contesta y libera', mensajesLibres: 2, plantillas: [], estado: 'probada', evidencia: 'caso:queja-traspaso' },
  { id: 'pedido-a-domicilio', nombre: 'Pedido a domicilio', vertical: 'restaurante', fase: 2, disparador: 'cliente', pasos: 'carrusel → carrito (order) → Flow de entrega cifrado → liga → pago → confirmación', mensajesLibres: 4, plantillas: [], estado: 'probada', evidencia: 'caso:purchase-una-vez' },
  { id: 'compra-con-envio-y-factura', nombre: 'Compra con envío y factura', vertical: 'tienda', fase: 2, disparador: 'cliente', pasos: 'carrusel → carrito → Flow de checkout con RFC → liga → pago → confirmación', mensajesLibres: 4, plantillas: [], estado: 'probada', evidencia: 'caso:compra-completa' },
  { id: 'reserva-de-mesa', nombre: 'Reservación de mesa', vertical: 'restaurante', fase: 2, disparador: 'cliente', pasos: '«quiero reservar» → Flow dinámico (día, personas, hora) → confirmación', mensajesLibres: 2, plantillas: [], estado: 'probada', evidencia: 'caso:reserva-mesa' },
  { id: 'aviso-fuera-de-ventana', nombre: 'Pago confirmado fuera de la ventana', vertical: 'ambas', fase: 2, disparador: 'negocio', pasos: 'el pago llega después de 24 h → plantilla de utilidad `estado_pedido`', mensajesLibres: 0, plantillas: [{ nombre: 'estado_pedido', categoria: 'utility' }], estado: 'probada', evidencia: 'prueba:comercio.ts' },
  { id: 'monto-alto', nombre: 'Pedido sobre el umbral → dueño', vertical: 'ambas', fase: 2, disparador: 'cliente', pasos: 'carrito grande → queda en revisión y pasa al dueño; no se cobra solo', mensajesLibres: 1, plantillas: [], estado: 'probada', evidencia: 'prueba:traspaso.ts' },
  { id: 'lead-calificado', nombre: 'Lead calificado desde un anuncio', vertical: 'tienda', fase: 3, disparador: 'cliente', pasos: 'anuncio → Flow estático de 3 preguntas → LeadSubmitted a Meta → recomendaciones', mensajesLibres: 2, plantillas: [], estado: 'probada', evidencia: 'prueba:atribucion.ts' },
  { id: 'qr-en-mesa', nombre: 'QR de la mesa (orgánico atribuido)', vertical: 'restaurante', fase: 3, disparador: 'cliente', pasos: 'escanea el QR → «Quiero pedir [QR-MESA]» → pedido; la venta se atribuye al QR', mensajesLibres: 4, plantillas: [], estado: 'probada', evidencia: 'prueba:atribucion.ts' },
  { id: 'recordatorio-de-reserva', nombre: 'Recordatorio de reservación', vertical: 'restaurante', fase: 4, disparador: 'negocio', pasos: 'un día antes → plantilla `recordatorio_reserva` con botones confirmar / cambiar', mensajesLibres: 0, plantillas: [{ nombre: 'recordatorio_reserva', categoria: 'utility' }], estado: 'pendiente', evidencia: 'falta el programador de avisos y su guion (la plantilla ya está registrada)' },
  { id: 'encuesta-postventa', nombre: 'Encuesta después de la entrega', vertical: 'ambas', fase: 4, disparador: 'negocio', pasos: 'al entregar → plantilla con Flow estático de calificación → alerta si es baja', mensajesLibres: 1, plantillas: [{ nombre: 'encuesta_postventa', categoria: 'utility' }], estado: 'pendiente', evidencia: 'falta el evento «entregado» y la plantilla aprobada', requisito: 'redactarla solo como servicio (riesgo de recategorización)' },
  { id: 'carrito-abandonado', nombre: 'Carrito abandonado', vertical: 'tienda', fase: 5, disparador: 'negocio', pasos: 'carrito sin pagar 24 h → plantilla de marketing con la liga', mensajesLibres: 0, plantillas: [{ nombre: 'carrito_abandonado', categoria: 'marketing' }], estado: 'pendiente', evidencia: 'fase 5', requisito: 'opt-in de marketing y tope de frecuencia' },
  { id: 'reactivacion', nombre: 'Reactivación de clientes inactivos', vertical: 'ambas', fase: 5, disparador: 'negocio', pasos: 'segmento con opt-in → Marketing Messages API con precio máximo', mensajesLibres: 0, plantillas: [{ nombre: 'reactivacion_cliente', categoria: 'marketing' }], estado: 'pendiente', evidencia: 'fase 5', requisito: 'opt-in, horario local, calidad del número' },
];

export interface CostosGuion { desdeAnuncioUsd: number; organicoEnCupoUsd: number; organicoFueraDeCupoUsd: number }

/** Lo que cuesta UN guion en Meta, en tres escenarios, con las reglas del simulador (1/oct/2026). */
export function costosDeGuion(g: GuionConversacion, ahora = Date.parse('2026-10-05T18:00:00Z')): CostosGuion {
  const t = TARJETA_LABORATORIO;
  const suma = (ventanas: Ventanas, servicioEnElMes: number) => {
    let micros = 0;
    for (let k = 0; k < g.mensajesLibres; k++) {
      const d = decidePrecio({ categoria: 'service', ventanas, ahora, pais: 'MX', servicioEnElMes, tarjeta: t });
      micros += d.permitido ? d.costoMicros : 0;
    }
    for (const p of g.plantillas) {
      // Las plantillas del negocio salen fuera de la ventana (si no, sería un mensaje libre).
      micros += decidePrecio({ categoria: p.categoria as CategoriaPrecio, ventanas: {}, ahora, pais: 'MX', servicioEnElMes, tarjeta: t }).costoMicros;
    }
    return Math.round(micros) / 1e6;
  };
  const cliente = g.disparador === 'cliente';
  return {
    desdeAnuncioUsd: suma(cliente ? { ultimoDelCliente: ahora, anuncioSinResponder: ahora } : {}, 0),
    organicoEnCupoUsd: suma(cliente ? { ultimoDelCliente: ahora } : {}, 0),
    organicoFueraDeCupoUsd: suma(cliente ? { ultimoDelCliente: ahora } : {}, t.cupoServicioMensual.cantidad),
  };
}
