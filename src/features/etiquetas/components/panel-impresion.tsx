'use client';

/**
 * Los dos caminos hasta la Zebra:
 *  - Zebra Browser Print (la app de Zebra en este equipo): se le pide la lista y se le manda el ZPL.
 *  - El agente local del sitio: el servidor firma un ticket para ESTE ZPL y ESTA impresora, y el
 *    navegador se lo entrega al agente, que encola, reintenta y reporta.
 * Si la revision bloquea, no se imprime por ninguno.
 */
import { useState } from 'react';
import {
  baseBrowserPrint, enviaAlAgente, enviaBrowserPrint, estadoEnAgente, impresorasBrowserPrint, type DispositivoZebra,
} from '../../../../tools/etiquetas-gs1/dist/navegador/index.js';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { boton, botonPrimario, campo } from './marco.tsx';

interface Props {
  readonly e: Etiquetas;
  readonly zpl: string | null;
  readonly bloquea: boolean;
  readonly sitio: string;
  readonly impresora: string;
  readonly copias: number;
  readonly despues?: () => Promise<void>;
}

export function PanelImpresion({ e, zpl, bloquea, sitio, impresora, copias, despues }: Props) {
  const cfgSitio = e.estado?.configuracion.sitios.find((s) => s.clave === sitio);
  const [baseBp, setBaseBp] = useState(() => (typeof window === 'undefined' ? 'http://127.0.0.1:9100' : baseBrowserPrint(window.location.protocol)));
  const [dispositivos, setDispositivos] = useState<DispositivoZebra[]>([]);
  const [uid, setUid] = useState('');
  const [agente, setAgente] = useState(cfgSitio?.agente ?? '');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const puede = Boolean(zpl) && !bloquea && !ocupado;

  const corre = async (f: () => Promise<string>) => {
    setOcupado(true);
    setMensaje({ tipo: 'info', texto: 'Enviando…' });
    try {
      const texto = await f();
      setMensaje({ tipo: 'ok', texto });
      if (despues) await despues();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : String(err) });
    } finally { setOcupado(false); }
  };

  const buscaBp = () => void impresorasBrowserPrint(baseBp).then(
    (d) => { setDispositivos(d); setUid(d[0]?.uid ?? ''); setMensaje({ tipo: 'info', texto: `${d.length} impresora(s) en Browser Print` }); },
    () => setMensaje({ tipo: 'error', texto: `No contesta Browser Print en ${baseBp}. ¿Está instalada y abierta la app de Zebra? En https hay que aceptar su certificado una vez abriendo ${baseBp}/available.` }),
  );

  const imprimeBp = () => corre(async () => {
    const d = dispositivos.find((x) => x.uid === uid);
    if (!d || !zpl) throw new Error('elige una impresora de Browser Print');
    await enviaBrowserPrint(baseBp, d, zpl);
    return `Enviado a ${d.name} por Browser Print.`;
  });

  const imprimeAgente = () => corre(async () => {
    if (!zpl) throw new Error('no hay ZPL');
    if (!agente) throw new Error(`el sitio ${sitio} no tiene agente configurado (Ajustes → Sitios)`);
    const { ticket } = await e.ejecuta<{ ticket: string }>({ accion: 'ticket', sitio, impresora, zpl, copias });
    const r = await enviaAlAgente(agente, ticket, { impresora, zpl, copias });
    for (let i = 0; i < 40; i++) {
      await new Promise((x) => setTimeout(x, 600));
      const s = await estadoEnAgente(agente, ticket, r.id);
      if (s.estado === 'impreso') return `Impreso en ${impresora} (intento ${s.intentos}).`;
      if (s.estado === 'fallido') throw new Error(`El agente no pudo imprimir: ${s.ultimoError ?? 'sin detalle'}`);
      setMensaje({ tipo: 'info', texto: `En el agente: ${s.estado}${s.ultimoError ? ` — ${s.ultimoError}` : ''}${s.intentos ? ` (intento ${s.intentos})` : ''}` });
    }
    return `El agente lo tiene en cola (${r.id.slice(0, 8)}); seguirá reintentando.`;
  });

  return (
    <section className="space-y-3" aria-labelledby="t-imprimir" data-prueba="imprimir">
      <h2 id="t-imprimir" className="text-base font-semibold">Imprimir</h2>
      {bloquea ? <p className="text-sm text-red-700 dark:text-red-400">La revisión tiene errores: corrígelos antes de imprimir.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-sm font-medium">Zebra Browser Print</p>
          <input className={campo} value={baseBp} onChange={(x) => setBaseBp(x.target.value)} aria-label="Dirección de Browser Print" data-prueba="base-bp" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={boton} onClick={buscaBp} data-prueba="busca-bp">Buscar impresoras</button>
            {dispositivos.length ? <select className={campo} value={uid} onChange={(x) => setUid(x.target.value)} aria-label="Impresora de Browser Print">{dispositivos.map((d) => <option key={d.uid} value={d.uid}>{d.name}</option>)}</select> : null}
          </div>
          <button type="button" className={botonPrimario} disabled={!puede || !uid} onClick={() => void imprimeBp()} data-prueba="imprime-bp">Imprimir con Browser Print</button>
        </div>
        <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-sm font-medium">Agente del sitio {sitio}</p>
          <input className={campo} value={agente} onChange={(x) => setAgente(x.target.value)} placeholder="http://127.0.0.1:9180" aria-label="Dirección del agente" data-prueba="url-agente" />
          {!e.estado?.agenteConSecreto ? <p className="text-xs text-amber-700 dark:text-amber-400">El servidor no tiene ETIQUETAS_AGENTE_SECRETO: no puede firmar trabajos para el agente.</p> : null}
          <button type="button" className={botonPrimario} disabled={!puede || !impresora} onClick={() => void imprimeAgente()} data-prueba="imprime-agente">Imprimir con el agente ({impresora || 'sin impresora'})</button>
        </div>
      </div>
      {mensaje ? <p className={`rounded-lg px-3 py-2 text-sm ${mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : mensaje.tipo === 'error' ? 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200' : 'bg-neutral-100 dark:bg-neutral-800'}`} role="status" data-prueba="estado-impresion">{mensaje.texto}</p> : null}
    </section>
  );
}
