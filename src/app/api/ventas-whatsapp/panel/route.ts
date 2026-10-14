/**
 * /api/ventas-whatsapp/panel — el panel del dueño. GET: su bandeja (casos con la conversación),
 * su tablero de ROAS y sus alertas. POST: una acción validada con Zod (tomar, responder, liberar,
 * bloquear, catálogo, QR, gasto de campaña, conciliar, reintentar conversiones). El token decide el
 * inquilino. La `semilla` (alta de la pyme ficticia) solo existe en el laboratorio.
 */
import { NextResponse } from 'next/server';
import { esquemaAccion } from '@/features/ventas-whatsapp/services/esquemas';
import { inquilinoDelPanel } from '@/features/ventas-whatsapp/services/servidor/puerta';
import { almacenDelServidor, anclajeDelServidor, vendedorDelServidor } from '@/features/ventas-whatsapp/services/servidor/runtime';
import { configuracion } from '@/features/ventas-whatsapp/services/servidor/configuracion';
import { CSV_RESTAURANTE, CSV_TIENDA, restaurante, tienda } from '../../../../../tools/ventas-whatsapp/dist/laboratorio/index.js';

export const dynamic = 'force-dynamic';

export async function GET(peticion: Request): Promise<Response> {
  const p = inquilinoDelPanel(peticion.headers.get('authorization'));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
  const v = vendedorDelServidor();
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 503 });
  const inquilino = await v.vendedor.panel.inquilino(p.inquilino);
  if (!inquilino) return NextResponse.json({ error: 'la pyme aún no está dada de alta' }, { status: 404 });
  // El cronómetro del lado del dueño: al abrir el panel se revisan las ventanas que están por cerrar.
  await v.vendedor.panel.revisaVentanas(p.inquilino);
  const a = anclajeDelServidor();
  const bloqueados = ((await almacenDelServidor()?.de(p.inquilino).lista('contactos')) ?? []).filter((c) => c.bloqueado).map((c) => c.waId);
  const [bandeja, tablero, integridad] = await Promise.all([
    v.vendedor.panel.bandeja(p.inquilino), v.vendedor.panel.tablero(p.inquilino),
    a ? v.vendedor.panel.integridad(p.inquilino, a.anclas, a.verifica) : v.vendedor.panel.integridad(p.inquilino),
  ]);
  return NextResponse.json({
    inquilino: { id: inquilino.id, nombre: inquilino.nombre, giro: inquilino.giro, ciudad: inquilino.ciudad, dueno: inquilino.dueno.nombre, estado: inquilino.estado, ficticio: inquilino.ficticio },
    bandeja, tablero, a2a: v.pasarela !== null, integridad, bloqueados, ahora: Date.now(),
  });
}

export async function POST(peticion: Request): Promise<Response> {
  const p = inquilinoDelPanel(peticion.headers.get('authorization'));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
  const v = vendedorDelServidor();
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 503 });
  const cuerpo = esquemaAccion.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'petición inválida', detalle: cuerpo.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const a = cuerpo.data;
  const panel = v.vendedor.panel;
  const t = p.inquilino;
  try {
    switch (a.accion) {
      case 'tomar': return NextResponse.json(await panel.tomaCaso(t, a.casoId));
      case 'responder': { const r = await panel.responde(t, a.conversacionId, a.texto); return NextResponse.json(r, { status: r.ok ? 200 : 409 }); }
      case 'liberar': return NextResponse.json(await panel.liberaCaso(t, a.casoId));
      case 'liberarPausa': await panel.liberaPausa(t, a.conversacionId); return NextResponse.json({ ok: true });
      case 'bloquear': { const c = await panel.bloquea(t, a.conversacionId, a.motivo); return NextResponse.json({ ok: c !== null }, { status: c ? 200 : 404 }); }
      case 'catalogo': return NextResponse.json(await panel.sincronizaCatalogo(t, a.csv));
      case 'qr': return NextResponse.json(await panel.creaQr(t, a.etiqueta, a.mensaje));
      case 'gasto': return NextResponse.json(await panel.registraGasto(t, a.campanaId, a.nombre, a.gastoCentavos, a.anuncios));
      case 'conciliar': return NextResponse.json(await panel.concilia(t));
      case 'reintentar': return NextResponse.json(await panel.reintentaConversiones(t));
      case 'anclar': {
        const a = anclajeDelServidor();
        if (!a || !v.vendedor.trazabilidad) return NextResponse.json({ error: 'sin trazabilidad o sin llave de anclaje' }, { status: 409 });
        return NextResponse.json({ ancla: await v.vendedor.trazabilidad.ancla(t, a.anclas, a.firmar) });
      }
      case 'semilla': {
        const c = configuracion();
        if (!c.ok || c.valor.VENTAS_WA_LABORATORIO !== '1') return NextResponse.json({ error: 'la semilla solo existe en el laboratorio' }, { status: 403 });
        const inquilino = a.pyme === 'restaurante' ? restaurante(a.canal) : tienda(a.canal);
        if (inquilino.id !== t) return NextResponse.json({ error: 'este token no es de esa pyme' }, { status: 403 });
        await panel.alta(inquilino);
        return NextResponse.json(await panel.sincronizaCatalogo(t, a.pyme === 'restaurante' ? CSV_RESTAURANTE : CSV_TIENDA));
      }
    }
  } catch {
    return NextResponse.json({ error: 'no se pudo completar la acción' }, { status: 500 });
  }
}
