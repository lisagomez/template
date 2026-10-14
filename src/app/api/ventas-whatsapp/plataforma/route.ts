/**
 * /api/ventas-whatsapp/plataforma — quien opera la plataforma (N-01 números, N-02 BSP propio).
 * GET: las altas por Embedded Signup y su embudo, el pool de números, y la factura del mes en las
 * dos modalidades del BSP. POST: una acción validada con Zod. Solo en el laboratorio: el BSP real
 * necesita ser Tech Provider y C3/C4 firmados. Ni tokens de negocio ni PIN salen de aquí.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { esquemaPlataforma } from '@/features/ventas-whatsapp/services/esquemas';
import { esPlataforma } from '@/features/ventas-whatsapp/services/servidor/puerta';
import { plataformaDelServidor, vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';
import { estadoCredito, facturaMes, mesDeFacturacion, TARJETA_LABORATORIO, type Inquilino } from '@/features/ventas-whatsapp/services/nucleo';
import { CSV_RESTAURANTE, CSV_TIENDA, restaurante, SUPUESTOS_LABORATORIO, tienda } from '../../../../../tools/ventas-whatsapp/dist/laboratorio/index.js';

export const dynamic = 'force-dynamic';

/** Línea de crédito ficticia por pyme como Solution Partner (USD 50), para ver el semáforo. */
const LIMITE_CREDITO_MICROS = 50_000_000;
const ORIGEN_SIMULADO = 'https://www.facebook.com';

export async function GET(peticion: Request): Promise<Response> {
  const p = esPlataforma(peticion.headers.get('authorization'));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
  const pl = plataformaDelServidor();
  if (!pl.ok) return NextResponse.json({ error: pl.error }, { status: 503 });
  const mes = mesDeFacturacion(Date.now(), TARJETA_LABORATORIO);
  const s = SUPUESTOS_LABORATORIO;
  const politica = { margen: s.bsp.valor.margenSobreMeta, tipoDeCambio: s.tipoDeCambio.valor, cuotaMensualCentavos: (s.planMensualMxn.valor.multipyme ?? 0) * 100 };
  const [altas, embudo, numeros, numerosMes, techProvider, solutionPartner] = await Promise.all([
    pl.bsp.altas(), pl.bsp.embudo(), pl.numeros.lista(), pl.numeros.facturacion(),
    facturaMes(pl.almacen, mes, { ...politica, modalidad: 'tech_provider' }), facturaMes(pl.almacen, mes, { ...politica, modalidad: 'solution_partner' }),
  ]);
  const credito = solutionPartner.map((l) => ({ inquilinoId: l.inquilinoId, ...estadoCredito(l.metaMicros, LIMITE_CREDITO_MICROS) }));
  return NextResponse.json({ altas, embudo, numeros, numerosMes, factura: { mes, techProvider, solutionPartner, credito }, ahora: Date.now() });
}

const perfilDe = (giro: 'restaurante' | 'tienda', sufijo: string) => (canal: Inquilino['canal']): Inquilino =>
  ({ ...(giro === 'restaurante' ? restaurante(canal) : tienda(canal)), nombre: `${giro === 'restaurante' ? 'Restaurante' : 'Tienda'} de laboratorio ${sufijo}` });

export async function POST(peticion: Request): Promise<Response> {
  const p = esPlataforma(peticion.headers.get('authorization'));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
  const pl = plataformaDelServidor();
  const v = vendedorDelServidor();
  if (!pl.ok || !v.ok) return NextResponse.json({ error: pl.ok ? 'canal sin configurar' : pl.error }, { status: 503 });
  const cuerpo = esquemaPlataforma.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'petición inválida', detalle: cuerpo.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const a = cuerpo.data;
  const n = SUPUESTOS_LABORATORIO.numeros.valor;
  try {
    switch (a.accion) {
      case 'liga': return NextResponse.json({ liga: pl.bsp.ligaDeAlta(a.inquilinoId) });
      case 'simulaAlta': {
        const id = randomBytes(4).toString('hex');
        const s = pl.metaBsp.signup({ wabaId: `waba_${id}`, businessId: `bm_${id}`, ...(a.numero === 'propio' ? { phoneNumberId: `pn_${id}` } : {}), ...(a.numero === 'abandona' ? { abandonaEn: 'PHONE_NUMBER_SETUP' } : {}) });
        const r = await pl.bsp.recibe({
          liga: a.liga, code: s.code, origen: ORIGEN_SIMULADO, mensaje: s.mensaje, perfil: perfilDe(a.perfil, id), telefonoVisible: a.numero === 'propio' ? `52229${randomInt(1_000_000, 9_999_999)}` : '',
          ...(a.numero === 'venta' || a.numero === 'renta' ? { delPool: { modalidad: a.numero, nombreVisible: `${a.perfil === 'restaurante' ? 'Cocina' : 'Tienda'} de laboratorio` } } : {}),
        });
        if (!('rechazo' in r) && r.inquilinoId && r.estado !== 'fallida') await v.vendedor.panel.sincronizaCatalogo(r.inquilinoId, a.perfil === 'restaurante' ? CSV_RESTAURANTE : CSV_TIENDA);
        return NextResponse.json(r, { status: 'rechazo' in r ? 409 : 200 });
      }
      case 'confirmaPago': return NextResponse.json(await pl.bsp.confirmaMetodoPago(a.wabaId) ?? { error: 'alta desconocida' });
      case 'baja': return NextResponse.json(await pl.bsp.baja(a.wabaId, a.motivo) ?? { error: 'alta desconocida' });
      case 'numeroAlPool': {
        const venta = a.modalidad === 'venta';
        const r = await pl.numeros.altaEnPool({
          e164: `+52229${randomInt(1_000_000, 9_999_999)}`, modalidad: a.modalidad, origen: venta ? 'sim_mx' : 'virtual', proveedor: 'proveedor-de-laboratorio', titular: venta ? 'pyme' : 'plataforma',
          costoMensualCentavos: venta ? 0 : n.costoRentaMxn * 100, precioMensualCentavos: (venta ? n.administracionMxn : n.rentaMxn) * 100, precioAltaCentavos: venta ? n.altaVentaMxn * 100 : 0, portable: false,
        });
        return NextResponse.json(r, { status: r.ok ? 200 : 409 });
      }
      case 'liberaNumero': { const r = await pl.numeros.libera(a.e164, a.motivo); return NextResponse.json(r, { status: r.ok ? 200 : 409 }); }
    }
  } catch {
    return NextResponse.json({ error: 'no se pudo completar la acción' }, { status: 500 });
  }
}
