/**
 * Una conversación de punta a punta por pyme, contada como transcripción: cada mensaje del
 * cliente, cada mensaje que sale del negocio con lo que Meta cobró (categoría, tipo, costo), el
 * cobro, la conversión que llega a Meta y el tablero del dueño al final.
 */
import { formatoDinero, formatoUsd } from '../comun/base.js';
import { creaCircuito, type OpcionesCircuito } from './circuito.js';

export interface Transcripcion {
  pyme: string;
  lineas: string[];
  costoMetaUsd: number;
  costoIaUsd: number;
  mensajesSalientes: number;
}

export async function transcribe(o: Pick<OpcionesCircuito, 'flows'> = {}): Promise<Transcripcion[]> {
  const c = creaCircuito(o);
  const pymes = await c.prepara();
  const salida: Transcripcion[] = [];
  const guiones = {
    restaurante: { waId: '5212291234567', nombre: 'Ana (ficticia)', campana: 'Tacos de octubre', gasto: 50_000, entrada: 'Hola, vi su anuncio. ¿Qué tienen de comer?', items: [{ retailerId: 'tacos-pastor', cantidad: 2 }, { retailerId: 'cafe-lechero', cantidad: 1 }], pantalla: 'ENTREGA', datos: { zona: 'Boca del Río', direccion: 'Calle Ficticia 12', horario: '19:00-20:00', recoger: false } },
    tienda: { waId: '5212281234567', nombre: 'Luisa (ficticia)', campana: 'Huipiles bordados', gasto: 120_000, entrada: 'Hola, ¿tienen huipiles rojos?', items: [{ retailerId: 'huipil-rojo-m', cantidad: 1 }], pantalla: 'ENVIO', datos: { zona: 'Veracruz', direccion: 'Av. Ficticia 34, CP 91700', rfc: 'XAXX010101000', razon_social: 'Público en general', recoger: false } },
  } as const;
  for (const clave of ['restaurante', 'tienda'] as const) {
    const i = pymes[clave];
    const g = guiones[clave];
    const camp = c.meta.anuncios.creaCampana(g.campana, g.gasto);
    await c.vendedor.panel.registraGasto(i.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
    const lineas: string[] = [`# ${i.nombre} (${i.giro}, ${i.ciudad}) — datos ficticios`];
    const cl = c.meta.cliente(i.canal.phoneNumberId, g.waId, g.nombre);
    let vistos = 0;
    const vuelca = () => {
      for (const r of cl.recibidos.slice(vistos)) {
        const p = r.precio;
        lineas.push(`  ← negocio: ${r.resumen.replace(/\s+/g, ' ').slice(0, 170)}`);
        if (p) lineas.push(`      [Meta: ${p.categoria} · ${p.tipo} · ${p.billable ? formatoUsd(p.costoMicros) : 'USD 0 (gratis)'}]`);
      }
      vistos = cl.recibidos.length;
    };
    lineas.push(`  → cliente (clic en el anuncio «${camp.nombre}»): ${g.entrada}`);
    cl.llegaPorAnuncio(camp.anuncios[0]!, g.entrada);
    await c.asienta(); vuelca();
    lineas.push(`  → cliente (carrito del catálogo): ${g.items.map((x) => `${x.cantidad} × ${x.retailerId}`).join(', ')}`);
    cl.pide([...g.items]);
    await c.asienta(); vuelca();
    lineas.push(`  → cliente (llena el Flow «${g.pantalla}»): ${JSON.stringify(g.datos)}`);
    await cl.llenaFlow({ [g.pantalla]: { ...g.datos }, RESUMEN: { confirmar: true } });
    await c.asienta(); vuelca();
    const u = cl.ultimo();
    const liga = u?.mensaje.tipo === 'cta_url' ? c.procesador.ligaDeUrl(u.mensaje.url) : undefined;
    if (liga) {
      lineas.push(`  → cliente paga ${formatoDinero(liga.montoCentavos)} en la página del procesador (el procesador manda su webhook DOS veces)`);
      await c.procesador.paga(liga.id, { duplicaWebhook: true });
      await c.asienta(); vuelca();
    }
    const eventos = c.meta.capi.aceptados.filter((e) => e.user_data.whatsapp_business_account_id === i.canal.wabaId);
    for (const e of eventos) lineas.push(`  ⇢ Conversions API: ${e.event_name} ${e.event_id} ${e.custom_data ? `${e.custom_data.value} ${e.custom_data.currency}` : ''} (ctwa_clid ${e.user_data.ctwa_clid?.slice(0, 10)}…) → aceptado`);
    const t = await c.vendedor.panel.tablero(i.id);
    const f = t.filas.find((x) => x.canal === camp.nombre)!;
    const admin = c.meta.anuncios.reporte().find((r) => r.campanaId === camp.id)!;
    lineas.push(`  ▣ tablero: ${f.conversaciones} conversación · ${f.pedidosPagados} pedido pagado · ingresos ${formatoDinero(f.ingresosCentavos)} · gasto ${formatoDinero(f.gastoCentavos ?? 0)} · ROAS ${f.roas} (Administrador de anuncios: ${admin.roas})`);
    lineas.push(`  ▣ costo de la conversación: Meta ${formatoUsd(f.costoMetaMicros)} · IA ${formatoUsd(f.costoIaMicros)} (simulada) · ${cl.recibidos.length} mensajes salientes · tarjeta ${t.tarjeta.verificada ? 'verificada' : 'NO verificada'}`);
    salida.push({ pyme: i.nombre, lineas, costoMetaUsd: f.costoMetaMicros / 1e6, costoIaUsd: f.costoIaMicros / 1e6, mensajesSalientes: cl.recibidos.length });
  }
  return salida;
}
