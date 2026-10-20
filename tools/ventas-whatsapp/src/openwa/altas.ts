/**
 * El puerto de altas de la fachada sobre el BSP de `ventas-whatsapp`: la sesión de OpenWA es el inquilino del alta.
 * La liga es la liga privada y firmada del BSP (sirve una vez, vence) dentro de la página de alta del host.
 */
import type { Almacen } from '../almacen/almacen.js';
import type { Bsp } from '../bsp/alta.js';
import type { AltasOpenWA } from './tipos.js';

export function altasDelBsp(bsp: Bsp, almacen: Almacen, urlAlta: (liga: string) => string): AltasOpenWA {
  const ligas = new Map<string, string>();
  return {
    ligaDeAlta(sesionId) {
      const previa = ligas.get(sesionId);
      if (previa) return previa;
      const url = urlAlta(bsp.ligaDeAlta(sesionId));
      ligas.set(sesionId, url);
      return url;
    },
    async numero(sesionId) {
      const alta = (await bsp.altas()).find((a) => a.inquilinoId === sesionId && (a.estado === 'activa' || a.estado === 'falta_metodo_pago'));
      if (!alta) return null;
      const i = await almacen.inquilino(sesionId);
      if (!i) return null;
      return { phoneNumberId: i.canal.phoneNumberId, wabaId: i.canal.wabaId, telefono: i.canal.telefonoVisible, ...(i.canal.catalogoId ? { catalogoId: i.canal.catalogoId } : {}), estado: alta.estado === 'activa' ? 'activa' : 'falta_metodo_pago' };
    },
  };
}
