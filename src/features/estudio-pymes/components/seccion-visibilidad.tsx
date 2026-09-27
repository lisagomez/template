'use client';

/** Si te encuentran: lo que pegues de tu sitio se revisa aquí; los arreglos salen como archivos para copiar. */
import { useState } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import { jsonLdNegocio, llmsTxt, robotsPropuesto } from '../../../../tools/pymes-marketing/dist/visibilidad/index.js';
import { useEstudio } from '../store/estudio.ts';
import { AreaDeTexto, Copiar, Lista, Pastilla } from './ui-estudio.tsx';

function Archivo({ nombre, contenido }: { nombre: string; contenido: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold"><span>{nombre}</span><Copiar texto={contenido} /></div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{contenido}</pre>
    </div>
  );
}

export function SeccionVisibilidad() {
  const { auditoria, audita, sitio, marca } = useEstudio();
  const [s, setS] = useState(sitio);
  const datos = { nombre: marca?.nombre ?? 'Mi negocio', sitio: s.url || 'https://tu-negocio.mx' };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3">
        <input className="rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 md:col-span-3" placeholder="https://tu-negocio.mx" value={s.url} onChange={(e) => setS({ ...s, url: e.target.value })} />
        <AreaDeTexto valor={s.html} cambia={(html) => setS({ ...s, html })} marcador="HTML de tu página de inicio (Ctrl+U)" />
        <AreaDeTexto valor={s.robots} cambia={(robots) => setS({ ...s, robots })} marcador="Contenido de /robots.txt" />
        <AreaDeTexto valor={s.llms} cambia={(llms) => setS({ ...s, llms })} marcador="Contenido de /llms.txt (si existe)" />
      </div>
      <p className="text-xs text-neutral-500">Esta versión revisa lo que pegas. Leer tu sitio por su dirección desde aquí queda pendiente: exige protegerse de que alguien use el servidor para entrar a redes internas.</p>
      <Boton variante="primario" onClick={() => audita(s)} disabled={!s.url.trim() && !s.html.trim()}>Revisar</Boton>
      {auditoria ? (
        <div className="space-y-3" data-prueba="auditoria">
          <p className="font-semibold">{auditoria.enUnaLinea}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{auditoria.cinco.map((h) => <li key={h.id}><b>{h.titulo}</b> <Pastilla tono={h.impacto === 'alto' ? 'problema' : h.impacto === 'medio' ? 'revisar' : 'neutro'}>{h.impacto} · {h.tiempo}</Pastilla>{h.decision ? <Pastilla tono="sin">lo decides tú</Pastilla> : null}<br /><span className="text-neutral-600 dark:text-neutral-400">{h.detalle}</span></li>)}</ol>
          {auditoria.anexo.length ? <p className="text-sm text-neutral-500">{auditoria.anexo.length} hallazgo(s) más en el anexo, ninguno urgente: {auditoria.anexo.map((h) => h.titulo).join(' · ')}</p> : null}
          <Lista titulo="Lo que no pude revisar" elementos={auditoria.noRevisado} />
          <p className="text-sm">Sin calificación: nadie puede hacer que una IA recomiende un negocio. Revisa de nuevo en {auditoria.revisarEn}.</p>
          <div className="grid gap-2 md:grid-cols-3"><Archivo nombre="robots.txt (si decides abrirlo)" contenido={robotsPropuesto(datos.sitio)} /><Archivo nombre="llms.txt" contenido={llmsTxt(datos)} /><Archivo nombre="JSON-LD para el <head>" contenido={jsonLdNegocio(datos)} /></div>
        </div>
      ) : null}
    </div>
  );
}
