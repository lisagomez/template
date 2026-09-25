'use client';

/**
 * La etiqueta vista de cuatro maneras:
 *  - SVG (bwip-js), la vista de siempre, local;
 *  - el ZPL tal cual se manda a la Zebra;
 *  - el ZPL dibujado por un motor ZPL real (zebrash, en WebAssembly) DENTRO del navegador;
 *  - Labelary, solo si la instalacion lo permite Y se pide a proposito: es un servicio externo y
 *    mandarle el ZPL saca datos del negocio fuera del perimetro (C4).
 */
import { useEffect, useState } from 'react';
import bwipjs from 'bwip-js/browser';
import { aSvg } from '../../../../tools/etiquetas-gs1/dist/svg.js';
import type { Diseno, PerfilImpresora } from '../services/nucleo.ts';
import { boton } from './marco.tsx';

type Pestana = 'svg' | 'zpl' | 'motor' | 'labelary';

export function svgDe(diseno: Diseno): { svg: string } | { error: string } {
  try {
    return { svg: aSvg(diseno, bwipjs) };
  } catch (e) {
    return { error: `bwip-js (BWIPP) rechazó el código: ${e instanceof Error ? e.message.replace(/^bwipp\.[\w#]+:\s*/, '') : String(e)}` };
  }
}

export function VistaMotorLocal({ zpl, perfil, etiqueta, auto = false }: { zpl: string; perfil: PerfilImpresora; etiqueta: string; auto?: boolean }) {
  const [png, setPng] = useState<string | null>(null);
  const [estado, setEstado] = useState<'inicial' | 'dibujando' | 'error'>('inicial');
  const [dibujado, setDibujado] = useState('');
  const dibuja = () => {
    setEstado('dibujando');
    import('zpl-renderer-js')
      .then((m) => m.zplToBase64Async(zpl, perfil.anchoMm, perfil.altoMm, Math.round(perfil.dpi / 25.4)))
      .then((b64) => { setPng(`data:image/png;base64,${b64}`); setDibujado(zpl); setEstado('inicial'); })
      .catch(() => setEstado('error'));
  };
  useEffect(() => {
    if (!auto) return undefined;
    const t = setTimeout(dibuja, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se redibuja solo cuando cambia el ZPL
  }, [auto, zpl]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={boton} onClick={dibuja} disabled={estado === 'dibujando'} data-prueba="dibuja-motor">{estado === 'dibujando' ? 'Dibujando…' : png && dibujado === zpl ? 'Volver a dibujar' : 'Dibujar con el motor ZPL local'}</button>
        <span className="text-xs text-neutral-500">zebrash en tu navegador: el ZPL no sale de este equipo.</span>
      </div>
      {estado === 'error' ? <p className="text-sm text-red-700">El motor local no pudo dibujar este ZPL.</p> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- PNG local en data URL: next/image no aporta nada */}
      {png ? <img src={png} alt={etiqueta} className="w-full rounded border border-neutral-300 bg-white" data-prueba="png-motor" /> : null}
      {png && dibujado !== zpl ? <p className="text-xs text-amber-700">La etiqueta cambió desde el último dibujo.</p> : null}
      {perfil.corrimientoIzq || perfil.corrimientoSup ? <p className="text-xs text-amber-700" data-prueba="aviso-ls-lt">El motor local no aplica ^LS ni ^LT: aquí se simulan sumándolos a ^LH. La Zebra recibe los comandos reales.</p> : null}
    </div>
  );
}

function VistaLabelary({ zpl, perfil, permitido }: { zpl: string; perfil: PerfilImpresora; permitido: boolean }) {
  const [acepto, setAcepto] = useState(false);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!permitido) {
    return <p className="rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900" data-prueba="labelary-apagado">Labelary está <strong>apagado</strong> en esta instalación. Es un servicio de un tercero: verlo ahí significa mandarle el ZPL, que lleva nombre de producto, GTIN y lote. Se puede activar en Ajustes si quien decide lo acepta; mientras tanto usa el motor local, que dibuja lo mismo sin salir del equipo.</p>;
  }
  const pide = async () => {
    setError(null);
    try {
      const r = await fetch(`https://api.labelary.com/v1/printers/${Math.round(perfil.dpi / 25.4)}dpmm/labels/${(perfil.anchoMm / 25.4).toFixed(2)}x${(perfil.altoMm / 25.4).toFixed(2)}/0/`, { method: 'POST', headers: { accept: 'image/png', 'content-type': 'application/x-www-form-urlencoded' }, body: zpl });
      if (!r.ok) throw new Error(`Labelary respondió ${r.status}`);
      setPng(URL.createObjectURL(await r.blob()));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">Esto envía el ZPL a <strong>api.labelary.com</strong>, fuera de la empresa. Úsalo solo con etiquetas que puedan salir.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /> Entiendo que el ZPL sale del perímetro</label>
      <button type="button" className={boton} disabled={!acepto} onClick={() => void pide()}>Ver en Labelary</button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- blob local: next/image no aporta nada */}
      {png ? <img src={png} alt="Etiqueta dibujada por Labelary" className="w-full rounded border bg-white" /> : null}
    </div>
  );
}

export function VistaEtiqueta({ diseno, zpl, zplVistaLocal, perfil, labelaryPermitido }: { diseno: Diseno; zpl: string | null; zplVistaLocal: string | null; perfil: PerfilImpresora; labelaryPermitido: boolean }) {
  const [pestana, setPestana] = useState<Pestana>('svg');
  const s = svgDe(diseno);
  const [copiado, setCopiado] = useState(false);
  const pestanas: [Pestana, string][] = [['svg', 'Vista'], ['zpl', 'ZPL'], ['motor', 'Motor ZPL local'], ['labelary', 'Labelary']];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1" role="tablist">
        {pestanas.map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} className={`rounded-md px-2.5 py-1 text-sm ${pestana === id ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800'}`} onClick={() => setPestana(id)} data-prueba={`pestana-${id}`}>{texto}</button>
        ))}
      </div>
      {pestana === 'svg' ? (
        'svg' in s
          ? <div className="rounded-md bg-neutral-300 p-3 dark:bg-neutral-700"><div className="mx-auto max-w-full overflow-hidden rounded bg-white shadow [&>svg]:h-auto [&>svg]:w-full" data-prueba="svg-etiqueta" dangerouslySetInnerHTML={{ __html: s.svg }} /></div>
          : <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" data-prueba="svg-error">{s.error}</p>
      ) : null}
      {pestana === 'zpl' ? (
        <div className="space-y-2">
          <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-100" data-prueba="zpl">{zpl ?? 'Este código no se puede expresar en ZPL modo D (ver la revisión).'}</pre>
          <button type="button" className={boton} disabled={!zpl} onClick={() => { if (zpl) void navigator.clipboard.writeText(zpl).then(() => setCopiado(true)); }}>{copiado ? 'Copiado' : 'Copiar ZPL'}</button>
        </div>
      ) : null}
      {pestana === 'motor' ? (zplVistaLocal ? <VistaMotorLocal zpl={zplVistaLocal} perfil={perfil} etiqueta="Etiqueta dibujada por el motor ZPL local" /> : <p className="text-sm">No hay ZPL que dibujar.</p>) : null}
      {pestana === 'labelary' ? (zpl ? <VistaLabelary zpl={zpl} perfil={perfil} permitido={labelaryPermitido} /> : null) : null}
      <p className="text-xs text-neutral-500">{Math.round(diseno.ancho)} × {Math.round(diseno.alto)} puntos a {diseno.dpi} dpi ({perfil.anchoMm} × {perfil.altoMm} mm)</p>
    </div>
  );
}
