'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export interface DatosDeSala {
  id: string; titulo: string; estado: string; version: number | null; huella: string | null;
  bloqueos: string[]; avisos: string[]; carasExtra: number[]; datos: Array<{ indice: number; texto: string }>;
  registro: Array<{ decision: string; version: number; huella: string; creado_en: string; revocada_en: string | null; nota: string | null }>;
  correo: string;
}

const BOTON = 'rounded-xl px-4 py-4 text-base font-semibold disabled:opacity-40';

async function sha256DeArchivo(url: string): Promise<string> {
  const bytes = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function Sala({ d }: { d: DatosDeSala }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const url = `/api/reel/${d.id}/archivo?v=${d.version ?? 0}`;
  const segundo = () => Math.round((video.current?.currentTime ?? 0) * 10) / 10;

  async function manda(ruta: string, cuerpo: unknown, que: string) {
    setOcupado(que); setAviso(null);
    const r = await fetch(`/api/reel/${d.id}/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setOcupado(null);
    if (!r.ok) { setAviso(j.error ?? 'No se pudo'); return false; }
    router.refresh(); return true;
  }
  async function decide(decision: 'aprobada' | 'cambio-pedido') {
    const nota = decision === 'cambio-pedido' ? window.prompt('¿Qué cambio quieres?') ?? '' : undefined;
    if (decision === 'cambio-pedido' && !nota?.trim()) { setAviso('Di qué cambio quieres'); return; }
    setOcupado('huella');
    const huella = await sha256DeArchivo(url);
    await manda('decision', { version: d.version, huella, decision, ...(nota ? { nota } : {}) }, decision);
  }
  async function borra() {
    if (!window.confirm('¿Borrar este proyecto? Se borran el clip, la transcripción, el máster y los registros.')) return;
    const r = await fetch(`/api/reel/${d.id}`, { method: 'DELETE' });
    if (r.ok) { router.push('/reel'); router.refresh(); } else setAviso('No se pudo borrar');
  }

  return (
    <div className="space-y-4" data-prueba="sala">
      {d.version ? (
        <video ref={video} src={url} controls playsInline preload="metadata" poster={`/api/reel/${d.id}/archivo?tipo=hoja&v=${d.version}`} className="aspect-[9/16] w-full rounded-2xl bg-black" data-prueba="video" />
      ) : <p className="rounded-xl bg-amber-50 p-4 text-sm">Este clip no llegó a máster.</p>}
      <p className="text-xs text-gray-600" data-prueba="version">Versión {d.version ?? '—'} · huella {d.huella ? `${d.huella.slice(0, 19)}…` : '—'}</p>

      {d.bloqueos.length > 0 && (
        <ul className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-900" data-prueba="bloqueos">
          {d.bloqueos.map((b) => <li key={b}>✕ {b}</li>)}
        </ul>
      )}
      {d.avisos.length > 0 && <ul className="space-y-1 rounded-xl bg-amber-50 p-4 text-sm" data-prueba="avisos">{d.avisos.map((a) => <li key={a}>• {a}</li>)}</ul>}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={`${BOTON} bg-gray-900 text-white`} disabled={!!ocupado || !d.version} data-prueba="marcar-corte"
          onClick={() => { const s = segundo(); void manda('ajustes', { tipo: 'corte', segundo: s, hasta: s + 1.5 }, 'corte'); }}>✂ Quitar 1.5 s aquí</button>
        <button type="button" className={`${BOTON} bg-gray-100`} disabled={!!ocupado || !d.version} data-prueba="cambiar-texto"
          onClick={() => { const nota = window.prompt('Texto correcto para este momento'); if (nota?.trim()) void manda('ajustes', { tipo: 'texto', segundo: segundo(), nota }, 'texto'); }}>✎ Cambiar texto aquí</button>
        <button type="button" className={`${BOTON} bg-emerald-700 text-white`} disabled={!!ocupado || !d.version || d.bloqueos.length > 0} data-prueba="aprobar" onClick={() => void decide('aprobada')}>✓ Aprobar</button>
        <button type="button" className={`${BOTON} border border-gray-300`} disabled={!!ocupado || !d.version} data-prueba="pedir-cambio" onClick={() => void decide('cambio-pedido')}>Pedir cambio</button>
      </div>
      {d.datos.map((x) => <button key={x.indice} type="button" className="w-full rounded-xl border border-red-300 p-3 text-sm" data-prueba="cubrir" disabled={!!ocupado} onClick={() => void manda('ajustes', { tipo: 'cubrir', indice: x.indice }, 'cubrir')}>Cubrir: {x.texto}</button>)}
      {ocupado && <p className="text-sm text-gray-700" data-prueba="ocupado">{ocupado === 'huella' ? 'Calculando la huella del archivo que viste…' : 'Preparando la versión nueva en el servidor…'}</p>}
      {aviso && <p role="alert" className="text-sm text-red-700" data-prueba="aviso">{aviso}</p>}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Registro</h2>
        <ul className="mt-2 space-y-2 text-sm" data-prueba="registro">
          {d.registro.map((r) => (
            <li key={r.creado_en} className={r.revocada_en ? 'text-gray-400 line-through' : ''}>
              {r.decision === 'aprobada' ? 'Aprobada' : 'Cambio pedido'} por {d.correo} · {new Date(r.creado_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} · versión {r.version} · {r.huella.slice(0, 19)}…
              {r.nota ? ` · «${r.nota}»` : ''}{r.revocada_en ? ' · revocada (el archivo cambió)' : ''}
            </li>
          ))}
          {!d.registro.length && <li className="text-gray-500">Sin decisiones todavía.</li>}
        </ul>
        <p className="mt-2 text-xs text-gray-500">Aprobar no publica: descargas el archivo aprobado y lo subes tú.</p>
      </section>
      <button type="button" onClick={() => void borra()} className="w-full rounded-xl border border-gray-300 p-3 text-sm text-red-700" data-prueba="borrar">Borrar proyecto</button>
    </div>
  );
}
