'use client';

/**
 * La ficha de un articulo: su foto (y otras vistas), y DONDE viene impresa su caducidad con una
 * nota de como se ve mejor. Cada foto se toma con la camara del celular o se sube de un archivo;
 * el servidor la normaliza y le quita EXIF y GPS. Cambiar una foto no borra la anterior (queda en
 * el historial); quitarla tampoco.
 *
 * Carga masiva: varias fotos a la vez nombradas por SKU (`YOG-001.jpg`, `YOG-001-caja.jpg`,
 * `YOG-001-caducidad.jpg`). Se eligio asi y no un URL por renglon en el Excel: el servidor nunca
 * descarga de internet (SSRF) y la foto no sale de la red de quien la sube.
 */
import { useState } from 'react';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { subeFoto } from '../services/cliente.ts';
import type { VistaFoto } from '../services/nucleo.ts';
import { FotoArticulo, fotoDe } from './foto.tsx';
import { boton, campo, tarjeta } from './marco.tsx';

const VISTAS: readonly [VistaFoto, string][] = [['principal', 'Foto principal'], ['caja', 'La caja'], ['etiqueta', 'La etiqueta'], ['caducidad', 'Dónde viene la caducidad']];

async function ponFoto(e: Etiquetas, sku: string, vista: VistaFoto, f: Blob, nota?: string): Promise<string> {
  const s = await subeFoto(f);
  const r = await e.ejecuta<{ ok: boolean; motivo?: string }>({ accion: 'foto-articulo', sku, vista, huella: s.huella, miniatura: s.miniatura, ancho: s.ancho, alto: s.alto, ...(nota ? { nota } : {}) });
  if (!r.ok) throw new Error(r.motivo ?? 'no se pudo');
  return s.gpsQuitado ? 'Guardada. Se le quitó la ubicación GPS y los metadatos EXIF.' : s.exifQuitado ? 'Guardada. Se le quitaron los metadatos EXIF.' : 'Guardada.';
}

export function FichaArticulo({ e, sku, alCerrar }: { e: Etiquetas; sku: string; alCerrar: () => void }) {
  const est = e.estado!;
  const a = est.articulos.find((x) => x.sku === sku);
  const [nota, setNota] = useState(fotoDe(est, sku, 'caducidad')?.nota ?? '');
  const [aviso, setAviso] = useState<string | null>(null);
  const formato = est.formatosFecha.find((f) => f.sku === sku);
  if (!a) return null;
  const sube = (vista: VistaFoto, f: File | undefined) => { if (f) void ponFoto(e, sku, vista, f, vista === 'caducidad' ? nota.trim() || undefined : undefined).then(setAviso, (x: unknown) => setAviso(x instanceof Error ? x.message : String(x))); };
  const quita = (vista: VistaFoto) => void e.ejecuta({ accion: 'foto-articulo', sku, vista, retirada: true }).then(() => setAviso('Quitada (sigue en el historial).'));
  return (
    <section className={`${tarjeta} space-y-3`} data-prueba="ficha">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">Ficha · {a.descripcion} <span className="font-mono text-xs text-neutral-500">{a.sku}</span></h2>
        <button type="button" className={boton} onClick={alCerrar}>Cerrar</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VISTAS.map(([vista, titulo]) => (
          <div key={vista} className="space-y-1.5" data-prueba={`vista-${vista}`}>
            <p className="text-sm font-medium">{titulo}</p>
            <FotoArticulo est={est} sku={sku} vista={vista} className="h-40 w-full rounded-lg" />
            {vista === 'caducidad' ? <input className={campo} placeholder="dónde y cómo se ve mejor" value={nota} maxLength={200} onChange={(x) => setNota(x.target.value)} data-prueba="nota-caducidad" /> : null}
            <div className="flex flex-wrap gap-1.5">
              <label className={`${boton} cursor-pointer`}>{fotoDe(est, sku, vista) ? 'Cambiar' : 'Tomar o subir'}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(x) => { sube(vista, x.target.files?.[0]); x.target.value = ''; }} data-prueba={`subir-${vista}`} />
              </label>
              {fotoDe(est, sku, vista) ? <button type="button" className={boton} onClick={() => quita(vista)}>Quitar</button> : null}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-300">Formato de su fecha: {formato ? <b>{formato.formato} ({formato.tipo === 'consumo-preferente' ? 'consumo preferente' : 'caducidad'})</b> : 'todavía no aprendido (se fija con la primera recepción que se confirme eligiendo una lectura)'}. Fotos en el historial: {est.fotos.filter((f) => f.sku === sku).length} vigentes.</p>
      {aviso ? <p className="text-sm" role="status" data-prueba="aviso-ficha">{aviso}</p> : null}
    </section>
  );
}

/** `YOG-001-caja.jpg` → { sku: 'YOG-001', vista: 'caja' }; el SKU se busca sin distinguir mayusculas. */
export function destinoDeArchivo(nombre: string, skus: readonly string[]): { sku: string; vista: VistaFoto } | undefined {
  const base = nombre.replace(/\.[a-z0-9]+$/i, '').trim();
  const m = /^(.*?)(?:[-_ ](principal|frente|etiqueta|caja|caducidad))?$/i.exec(base);
  const sku = skus.find((s) => s.toLowerCase() === (m?.[1] ?? '').toLowerCase());
  return sku ? { sku, vista: ((m?.[2] ?? 'principal').toLowerCase() as VistaFoto) } : undefined;
}

export function FotosEnLote({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [archivos, setArchivos] = useState<File[]>([]);
  const [avance, setAvance] = useState<string | null>(null);
  const skus = est.articulos.map((a) => a.sku);
  const plan = archivos.map((f) => ({ f, d: destinoDeArchivo(f.name, skus) }));
  const sube = async () => {
    let n = 0;
    for (const { f, d } of plan) {
      if (!d) continue;
      setAvance(`Subiendo ${++n} de ${plan.filter((p) => p.d).length}: ${f.name}…`);
      try { await ponFoto(e, d.sku, d.vista, f); } catch (x) { setAvance(`${f.name}: ${x instanceof Error ? x.message : String(x)}`); return; }
    }
    setAvance(`Listo: ${n} foto(s) guardadas, sin EXIF ni GPS.`);
    setArchivos([]);
  };
  return (
    <div className="space-y-2" data-prueba="fotos-lote">
      <p className="text-xs text-neutral-600 dark:text-neutral-300">Fotos en lote: nómbralas por SKU (<code>YOG-001.jpg</code>, <code>YOG-001-caja.jpg</code>, <code>YOG-001-caducidad.jpg</code>) y elígelas todas a la vez. El servidor no descarga fotos de internet.</p>
      <input type="file" accept="image/*" multiple className="text-sm" onChange={(x) => setArchivos([...(x.target.files ?? [])])} data-prueba="fotos-lote-archivos" />
      {plan.length ? <ul className="text-xs">{plan.map(({ f, d }) => <li key={f.name} className={d ? '' : 'text-red-700'}>{f.name} → {d ? `${d.sku} · ${d.vista}` : 'no corresponde a ningún SKU (se salta)'}</li>)}</ul> : null}
      {plan.some((p) => p.d) ? <button type="button" className={boton} onClick={() => void sube()} data-prueba="fotos-lote-subir">Subir {plan.filter((p) => p.d).length} foto(s)</button> : null}
      {avance ? <p className="text-sm" role="status">{avance}</p> : null}
    </div>
  );
}
