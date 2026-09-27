'use client';

/**
 * /etiquetas/ajustes — los parametros de la instalacion: prefijo de empresa GS1 (nunca uno
 * ajeno), prefijo interno de circulacion restringida, SSCC, umbrales del semaforo por categoria
 * (marcados como ejemplo hasta que alguien los fije), sitios con su agente, y Labelary.
 */
import { useState } from 'react';
import { capacidadGtin13, promocionDe, revisaPrefijoEmpresa, type Categoria, type Sitio } from '../services/nucleo.ts';
import { olvida } from '../services/cliente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';

export function PantallaAjustes({ e }: { e: Etiquetas }) {
  const cfg = e.estado!.configuracion;
  const [prefijo, setPrefijo] = useState(cfg.prefijoEmpresa);
  const [interno, setInterno] = useState(cfg.prefijoInterno);
  const [extension, setExtension] = useState(cfg.extensionSscc);
  const [categorias, setCategorias] = useState<Categoria[]>([...cfg.categorias]);
  const [sitios, setSitios] = useState<Sitio[]>([...cfg.sitios]);
  const [aviso, setAviso] = useState<string | null>(null);
  const rp = revisaPrefijoEmpresa(prefijo);
  const guarda = (x: Parameters<typeof e.ejecuta>[0]) => void e.ejecuta(x).then(() => setAviso('Guardado.'), (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)));
  const cat = (i: number, x: Partial<Categoria>) => setCategorias((v) => v.map((c, j) => (j === i ? { ...c, ...x } : c)));
  const sit = (i: number, x: Partial<Sitio>) => setSitios((v) => v.map((s, j) => (j === i ? { ...s, ...x } : s)));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${tarjeta} space-y-3`}>
        <h2 className="text-base font-semibold">Numeración GS1</h2>
        <label className="block text-sm">Prefijo de empresa GS1 (el del certificado de GS1 México)<input className={`${campo} font-mono`} value={prefijo} onChange={(x) => setPrefijo(x.target.value.replace(/\D/g, ''))} maxLength={12} data-prueba="prefijo" /></label>
        {rp.ok ? <p className="text-xs text-neutral-600 dark:text-neutral-300">Da {capacidadGtin13(prefijo).toLocaleString('es-MX')} GTIN-13 de marca propia. {rp.avisos.join(' ')}</p> : <p className="text-xs text-red-700">{rp.mensaje}</p>}
        <label className="block text-sm">Prefijo de los códigos internos<select className={campo} value={interno} onChange={(x) => setInterno(x.target.value)}><option value="04">04 · circulación restringida dentro de la empresa (lo que dice la norma)</option><option value="02">02 · regional, lo define GS1 México</option>{Array.from({ length: 10 }, (_, i) => `2${i}`).map((p) => <option key={p} value={p}>{p} · regional, lo define GS1 México (peso variable)</option>)}</select></label>
        {interno !== '04' ? <p className="text-xs text-amber-700">02 y 20-29 son de circulación restringida REGIONAL: los asigna GS1 México (en tiendas se usan para peso variable) y pueden chocar con las básculas. Para códigos solo de la cadena, GS1 indica 04.</p> : null}
        <label className="block text-sm">Dígito de extensión del SSCC<input className={campo} type="number" min={0} max={9} value={extension} onChange={(x) => setExtension(Math.min(9, Math.max(0, Number(x.target.value) || 0)))} /></label>
        <button type="button" className={botonPrimario} disabled={!rp.ok} onClick={() => guarda({ accion: 'config', prefijoEmpresa: prefijo, prefijoInterno: interno, extensionSscc: extension })}>Guardar numeración</button>
      </section>
      <section className={`${tarjeta} space-y-3`}>
        <h2 className="text-base font-semibold">Semáforo por categoría {cfg.categoriasDeEjemplo ? <span className="ml-1 rounded bg-amber-200 px-1.5 py-0.5 text-xs text-amber-900">valores de ejemplo</span> : null}</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-300">Días de vida restante: amarillo con los de alerta o menos, naranja (promoción) con los de promoción, rojo (bloqueo de venta normal) con los de retiro. Al recibir: la fracción de la vida útil que debe quedarle (regla de 2/3 = 67 %) si el catálogo trae la vida útil; si no, el mínimo en días. {cfg.categoriasDeEjemplo ? 'Son ejemplos para arrancar, no una regla: fíjalos con calidad.' : ''}</p>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead className="text-neutral-500"><tr><th>Categoría</th><th>Alerta</th><th>Promoción</th><th>Retiro</th><th>Mín. recibir</th><th>% vida útil</th></tr></thead>
          <tbody>{categorias.map((c, i) => (
            <tr key={c.id}><td className="py-1 pr-2">{c.nombre}</td>
              {(['alertaDias', 'promocionDias', 'retiroDias', 'minimoRecepcionDias'] as const).map((k) => <td key={k} className="pr-1"><input className={campo} type="number" min={0} max={3650} value={k === 'promocionDias' ? promocionDe(c) : c[k]} onChange={(x) => cat(i, { [k]: Math.max(0, Number(x.target.value) || 0) })} aria-label={`${c.nombre} ${k}`} /></td>)}
              <td className="pr-1"><input className={campo} type="number" min={5} max={100} value={Math.round((c.fraccionRecepcion ?? 2 / 3) * 100)} onChange={(x) => cat(i, { fraccionRecepcion: Math.min(100, Math.max(5, Number(x.target.value) || 67)) / 100 })} aria-label={`${c.nombre} fracción de vida útil al recibir`} /></td>
            </tr>
          ))}</tbody>
        </table>
        </div>
        <button type="button" className={botonPrimario} onClick={() => guarda({ accion: 'config', categorias })}>Guardar umbrales</button>
      </section>
      <section className={`${tarjeta} space-y-3`}>
        <h2 className="text-base font-semibold">Sitios</h2>
        {sitios.map((s, i) => (
          <div key={s.clave} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[110px_1fr_110px_1fr_150px]">
            <span className="self-center font-mono text-xs">{s.clave}</span>
            <input className={campo} value={s.nombre} onChange={(x) => sit(i, { nombre: x.target.value })} aria-label={`Nombre de ${s.clave}`} />
            <select className={campo} value={s.tipo} onChange={(x) => sit(i, { tipo: x.target.value as Sitio['tipo'] })}><option value="cedis">CEDIS</option><option value="sucursal">Sucursal</option></select>
            <input className={campo} value={s.agente ?? ''} placeholder="agente: http://127.0.0.1:9180" onChange={(x) => { const v = x.target.value; sit(i, v ? { agente: v } : { agente: undefined }); }} aria-label={`Agente de ${s.clave}`} />
            <input className={`${campo} font-mono`} value={s.gln ?? ''} placeholder="GLN (13 cifras)" maxLength={13} onChange={(x) => { const v = x.target.value.replace(/\D/g, ''); sit(i, v ? { gln: v } : { gln: undefined }); }} aria-label={`GLN de ${s.clave}`} />
          </div>
        ))}
        <button type="button" className={boton} onClick={() => setSitios((v) => [...v, { clave: `SITIO-${v.length + 1}`, nombre: 'Nuevo sitio', tipo: 'sucursal' }])}>+ Sitio</button>
        <button type="button" className={`${botonPrimario} ml-2`} onClick={() => guarda({ accion: 'config', sitios: sitios.map((s) => ({ clave: s.clave, nombre: s.nombre, tipo: s.tipo, ...(s.agente ? { agente: s.agente } : {}), ...(s.gln ? { gln: s.gln } : {}) })) })}>Guardar sitios</button>
      </section>
      <section className={`${tarjeta} space-y-3`}>
        <h2 className="text-base font-semibold">Labelary (servicio externo)</h2>
        <p className="text-sm">Labelary dibuja el ZPL en sus servidores. Activarlo permite a quien opera mandarle etiquetas —con productos, GTIN y lotes— fuera de la empresa, siempre con aviso y a propósito. La vista local (SVG y motor ZPL en el navegador) no saca nada.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.labelaryPermitido} onChange={(x) => guarda({ accion: 'config', labelaryPermitido: x.target.checked })} data-prueba="labelary" /> Permitir Labelary en esta instalación</label>
        <h2 className="pt-2 text-base font-semibold">Este dispositivo</h2>
        <button type="button" className={boton} onClick={() => { olvida(); location.reload(); }}>Desemparejar</button>
      </section>
      {aviso ? <p className="text-sm lg:col-span-2" role="status">{aviso}</p> : null}
    </div>
  );
}
