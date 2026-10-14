/**
 * Optimización de mensajes: cada mensaje del negocio cuesta (desde el 1/oct/2026, a tarifa de
 * utilidad pasado el cupo). Un turno que produce varios mensajes se junta en uno cuando cabe en
 * los límites de Meta: texto + texto = un texto; texto + interactivo = el texto va en el cuerpo del
 * interactivo. Nunca se junta una plantilla (tiene su propia aprobación) ni se corta contenido.
 */
import { validaMensaje, type MensajeSaliente } from '../meta/mensajes.js';

const conCuerpo = new Set(['botones', 'lista', 'carrusel', 'productos', 'cta_url', 'flow']);

export function compacta(salientes: MensajeSaliente[]): MensajeSaliente[] {
  const salida: MensajeSaliente[] = [];
  for (const m of salientes) {
    const previo = salida[salida.length - 1];
    if (previo && JSON.stringify(previo) === JSON.stringify(m)) continue;
    if (previo?.tipo === 'texto' && m.tipo === 'texto') {
      const junto: MensajeSaliente = { tipo: 'texto', texto: `${previo.texto}\n\n${m.texto}` };
      if (!validaMensaje(junto).length) { salida[salida.length - 1] = junto; continue; }
    }
    if (previo?.tipo === 'texto' && conCuerpo.has(m.tipo) && 'cuerpo' in m) {
      const junto = { ...m, cuerpo: `${previo.texto}\n\n${m.cuerpo ?? ''}`.trim() } as MensajeSaliente;
      if (!validaMensaje(junto).length) { salida[salida.length - 1] = junto; continue; }
    }
    salida.push(m);
  }
  return salida;
}
