import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { docx, pdf, huella, type DocumentoFuente } from '../../../../../../tools/sistema-integrado/dist/documentos/index.js';

/** Exporta la versión EXACTA a DOCX o PDF, leída con la sesión (RLS). La huella del archivo va en X-Huella. */
export async function GET(peticion: NextRequest, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const formato = peticion.nextUrl.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';
  if (!/^[0-9a-f-]{36}$/.test(version)) return NextResponse.json({ error: 'versión inválida' }, { status: 400 });
  const sb = await createClient();
  const { data: v } = await sb.from('sgi_documento_version').select('numero, contenido, estado, huella, organizacion_id, sgi_documento(titulo, requisitos), sgi_organizacion(nombre)').eq('id', version).maybeSingle();
  if (!v) return NextResponse.json({ error: 'no existe o no tienes acceso' }, { status: 404 });
  const { data: ap } = await sb.from('sgi_aprobacion').select('rol, creado_en, huella').eq('objeto_id', version).eq('decision', 'aprobado').is('revocada_en', null).limit(1).maybeSingle();
  const d = v.sgi_documento as unknown as { titulo: string; requisitos: string[] };
  const o = v.sgi_organizacion as unknown as { nombre: string };
  const fuente: DocumentoFuente = {
    titulo: d.titulo, organizacion: o.nombre, version: Number(v.numero), estado: v.estado as DocumentoFuente['estado'],
    secciones: ((v.contenido as { secciones?: DocumentoFuente['secciones'] }).secciones ?? []), requisitos: d.requisitos,
    ...(ap ? { aprobacion: { rol: String(ap.rol).replace('_', ' '), cuando: String(ap.creado_en).slice(0, 10), huella: String(ap.huella) } } : {}),
  };
  const bytes = formato === 'pdf' ? pdf(fuente) : docx(fuente);
  const nombre = `${d.titulo.normalize('NFD').replace(/[^\w]+/g, '-').replace(/-+$/, '')}-v${v.numero}.${formato}`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'content-type': formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${nombre}"`,
      'x-huella': await huella(bytes),
      'x-huella-version': String(v.huella),
    },
  });
}
