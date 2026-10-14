import Link from 'next/link';
import { notFound } from 'next/navigation';
import { APROBACION_DE_DOCUMENTO, type TipoDocumento } from '../../../../../../../tools/sistema-integrado/dist/index.js';
import { requisito } from '../../../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { enviarARevision } from '@/features/sgi/services/acciones';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';
import { FormAprobar } from '@/features/sgi/components/aprobar';
import { ESTADO_DOC, ROL } from '@/features/sgi/components/textos';
import type { Rol } from '../../../../../../../tools/sistema-integrado/dist/index.js';

export const dynamic = 'force-dynamic';

export default async function Version({ params, searchParams }: { params: Promise<{ org: string; version: string }>; searchParams: Busqueda }) {
  const { org, version } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx, modo } = await contextoDePagina(org);
  const { data: v } = await sb.from('sgi_documento_version').select('id, numero, contenido, huella, estado, generico, motivo_generico, creado_en, traza_id, sgi_documento(id, tipo, titulo, requisitos)').eq('id', version).maybeSingle();
  if (!v) notFound();
  const doc = v.sgi_documento as unknown as { id: string; tipo: string; titulo: string; requisitos: string[] };
  const secciones = ((v.contenido as { secciones?: { titulo: string; parrafos: string[] }[] }).secciones ?? []);
  const [{ data: traza }, { data: aps }] = await Promise.all([
    v.traza_id ? sb.from('sgi_traza').select('agente, modelo, version_prompt, requisitos_citados, uso, costo_usd, intentos, alertas, insumos, creado_en').eq('id', v.traza_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('sgi_aprobacion').select('decision, rol, motivo, creado_en, huella, version, revocada_en').eq('objeto_id', version).order('creado_en'),
  ]);
  const tipoAprobacion = APROBACION_DE_DOCUMENTO[doc.tipo as TipoDocumento];
  const volver = `/sgi/${org}/documentos/${version}`;
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <p className="text-sm"><Link className="underline" href={`/sgi/${org}/documentos`}>← Documentos</Link></p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tarjeta titulo={`${doc.titulo} · versión ${v.numero}`} accion={<Insignia tono={v.estado === 'aprobado' ? 'verde' : v.generico ? 'rojo' : v.estado === 'en_revision' ? 'ambar' : 'gris'}>{v.generico ? 'Genérico' : ESTADO_DOC[String(v.estado)]}</Insignia>}>
            <article className="space-y-4" data-prueba="contenido">
              {secciones.map((s) => (
                <section key={s.titulo}><h3 className="font-semibold">{s.titulo}</h3>{s.parrafos.map((p, i) => <p key={i} className="mt-1 text-sm leading-relaxed text-gray-800">{p}</p>)}</section>
              ))}
            </article>
            <p className="mt-4 break-all text-xs text-gray-500" data-prueba="huella">Huella de esta versión (la calcula la base): {String(v.huella)}</p>
          </Tarjeta>
          {v.generico && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" data-prueba="generico">{String(v.motivo_generico)} No puede pasar a revisión.</p>}
          {!v.generico && !v.generico && v.estado === 'borrador' && (
            <form action={enviarARevision.bind(null, org)}><input type="hidden" name="version" value={version} /><Boton data-prueba="enviar-revision">Enviar a revisión</Boton></form>
          )}
          {v.estado === 'en_revision' && <FormAprobar org={org} tipo={tipoAprobacion} objeto={version} huella={String(v.huella)} roles={ctx.roles} volver={volver} />}
          <Tarjeta titulo="Aprobaciones de esta versión">
            <ul className="space-y-1 text-sm" data-prueba="aprobaciones">{(aps ?? []).map((a, i) => (
              <li key={i}><Insignia tono={a.decision === 'aprobado' ? 'verde' : 'rojo'}>{String(a.decision)}</Insignia> {ROL[a.rol as Rol]} · {new Date(String(a.creado_en)).toLocaleString('es-MX')} · v{String(a.version)} · <span className="break-all text-xs text-gray-500">{String(a.huella).slice(0, 23)}…</span>{a.motivo ? ` · «${String(a.motivo)}»` : ''}{a.revocada_en ? ' · revocada' : ''}</li>
            ))}{!aps?.length && <li className="text-gray-600">Sin aprobaciones todavía. La aprueba: {tipoAprobacion === 'politica' || tipoAprobacion === 'soa' || tipoAprobacion === 'evaluacion_impacto' || tipoAprobacion === 'objetivos' ? 'alta dirección' : 'el rol que corresponde'}.</li>}</ul>
          </Tarjeta>
        </div>
        <div className="space-y-4">
          <Tarjeta titulo="Exportar">
            <div className="flex gap-2">
              <a className="rounded-lg px-3 py-2 text-sm ring-1 ring-gray-300" href={`/api/sgi/documento/${version}?formato=docx`} data-prueba="docx">DOCX</a>
              <a className="rounded-lg px-3 py-2 text-sm ring-1 ring-gray-300" href={`/api/sgi/documento/${version}?formato=pdf`} data-prueba="pdf">PDF</a>
            </div>
            <p className="mt-2 text-xs text-gray-500">Cada archivo lleva en el pie su versión, estado, requisitos y quién aprobó; su huella viaja en la cabecera X-Huella.</p>
          </Tarjeta>
          <Tarjeta titulo="Requisitos que atiende">
            <ul className="space-y-2 text-sm">{doc.requisitos.map((id) => <li key={id}><span className="text-xs text-gray-500">{id}</span><br />{modo === 'pyme' ? requisito(id)?.sencillo : requisito(id)?.tema}</li>)}</ul>
          </Tarjeta>
          {traza && (
            <Tarjeta titulo="Traza (quién la propuso)">
              <dl className="space-y-1 text-xs" data-prueba="traza">
                <div><dt className="inline font-semibold">Agente:</dt> <dd className="inline">{String(traza.agente)}</dd></div>
                <div><dt className="inline font-semibold">Modelo (pineado):</dt> <dd className="inline">{String(traza.modelo)}</dd></div>
                <div><dt className="inline font-semibold">Versión de prompts:</dt> <dd className="inline">{String(traza.version_prompt)}</dd></div>
                <div><dt className="inline font-semibold">IDs citados:</dt> <dd className="inline">{(traza.requisitos_citados as string[]).join(', ')}</dd></div>
                <div><dt className="inline font-semibold">Costo:</dt> <dd className="inline">{traza.costo_usd === null ? 'sin reportar (null)' : `US$${Number(traza.costo_usd).toFixed(4)}`} · intentos {String(traza.intentos)}</dd></div>
                <div><dt className="inline font-semibold">Insumos (huellas):</dt> <dd className="inline">{(traza.insumos as { tipo: string }[]).map((x) => x.tipo).join(', ')}</dd></div>
              </dl>
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
