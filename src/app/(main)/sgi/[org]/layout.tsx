import Link from 'next/link';
import { contextoDePagina } from '@/features/sgi/services/pagina';
import { cambiarModo } from '@/features/sgi/services/acciones';
import { ROL, NO_CERTIFICA, nombreEdicion } from '@/features/sgi/components/textos';

export const dynamic = 'force-dynamic';

const SECCIONES = [
  ['', 'Roadmap', 'Camino'], ['diagnostico', 'Diagnóstico', 'Diagnóstico'], ['documentos', 'Documentos', 'Documentos'],
  ['contexto', 'Contexto e IA', 'Entorno'], ['evidencias', 'Evidencias', 'Pruebas'], ['riesgos', 'Riesgos e impacto', 'Riesgos'],
  ['soa', 'SoA (Anexo A)', 'Cuidados de IA'], ['kpis', 'Objetivos e indicadores', 'Metas'], ['auditoria', 'Auditoría y CAPA', 'Revisiones'],
  ['calendario', 'Calendario', 'Fechas'], ['migracion', 'Migrar de edición', 'Nueva edición'],
] as const;

export default async function Marco({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, modo } = await contextoDePagina(org);
  const marca = ctx.despacho?.marca ?? {};
  const primario = marca.color_primario ?? '#334155';
  const acento = marca.color_acento ?? '#b45309';
  return (
    <div style={{ ['--sgi-primario' as string]: primario, ['--sgi-acento' as string]: acento }} className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: primario }} data-prueba="marca">
              {(marca.nombre_corto ?? ctx.org.nombre).slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="text-xs text-gray-500">{ctx.despacho ? `${marca.nombre_corto ?? ctx.despacho.nombre}${marca.lema ? ` · ${marca.lema}` : ''}` : 'Sistema integrado'}</p>
              <h1 className="text-lg font-semibold leading-tight" data-prueba="organizacion">{ctx.org.nombre}{ctx.org.es_casa && <span className="ml-2 align-middle text-xs font-normal text-gray-500">(la app misma)</span>}</h1>
              <p className="text-xs text-gray-600">{ctx.proyecto?.ediciones.map((e) => nombreEdicion(e, modo)).join(' + ')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-600" data-prueba="roles">Tus roles: {ctx.roles.map((r) => ROL[r]).join(', ') || '—'}</span>
            <form action={cambiarModo} className="flex items-center gap-1">
              <input type="hidden" name="volver" value={`/sgi/${org}`} />
              <button name="modo" value="pyme" className={`rounded-l-lg px-2 py-1 ring-1 ring-gray-300 ${modo === 'pyme' ? 'bg-gray-900 text-white' : 'bg-white'}`} data-prueba="modo-pyme">Sin jerga</button>
              <button name="modo" value="experto" className={`rounded-r-lg px-2 py-1 ring-1 ring-gray-300 ${modo === 'experto' ? 'bg-gray-900 text-white' : 'bg-white'}`} data-prueba="modo-experto">Experto</button>
            </form>
            <Link href="/sgi" className="rounded-lg px-2 py-1 ring-1 ring-gray-300">Mis organizaciones</Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {SECCIONES.filter(([s]) => ctx.proyecto?.usa_ia || s !== 'soa').map(([s, experto, pyme]) => (
            <Link key={s} href={`/sgi/${org}${s ? `/${s}` : ''}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-100">{modo === 'pyme' ? pyme : experto}</Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">{children}</div>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-gray-500" data-prueba="no-certifica">{NO_CERTIFICA} Los requisitos del catálogo son paráfrasis propias: consulta tu copia de la norma.</footer>
    </div>
  );
}
