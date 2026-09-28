'use client';

/**
 * La PIEZA SUELTA en piso: solo trae el EAN del proveedor. Con la foto de su fecha (motor local)
 * se identifica el lote comparando lo leido con los lotes de ese articulo en el sitio. Si no cuadra
 * con ninguno es un HALLAZGO (mercancia que no entro por recepcion o un lote mal capturado) y queda
 * en la cadena con su foto. Sin cantidades: lo usa el almacenista.
 */
import { useState } from 'react';
import type { EstadoSemaforo } from '../services/nucleo.ts';
import { subeFoto, type EstadoCliente } from '../services/cliente.ts';
import { COLOR_SEMAFORO } from '../services/presenta.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { CamaraFoto, type Captura } from './camara-foto.tsx';
import { FotoArticulo } from './foto.tsx';
import { botonPrimario, campo } from './marco.tsx';
import { retroalimenta } from './resultado-escaneo.tsx';

type Candidato = { lote: { gtin: string; lote: string; caducidad: string }; semaforo: EstadoSemaforo; dias: number; ubicacion: string; porLote: boolean };
type Identificacion = { estado: 'identificado' | 'varios' | 'no-cuadra' | 'sin-fecha'; candidatos: Candidato[]; leido: { fechas: string[]; lote?: string }; mensaje: string };
type Resp = { ok: boolean; motivo?: string; identificacion?: Identificacion; recortes?: string[]; textoLeido?: string[] };

export function PiezaSuelta({ e, est, sitio, sku, descripcion }: { e: Etiquetas; est: EstadoCliente; sitio: string; sku: string; descripcion: string }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [r, setR] = useState<(Resp & { foto: string }) | null>(null);
  const [motivo, setMotivo] = useState('');
  const [hallazgo, setHallazgo] = useState<string | null>(null);
  const captura = async (c: Captura) => {
    try {
      setEstado('Subiendo la foto…');
      const fotos = [];
      for (const f of c.fotos) fotos.push(await subeFoto(f));
      setEstado('Leyendo la fecha con el motor local…');
      const x = await e.ejecuta<Resp>({ accion: 'identifica-pieza', sitio, sku, foto: fotos[0]!.huella, tomas: fotos.slice(1, 3).map((f) => f.huella), zona: c.zona });
      setR({ ...x, foto: fotos[0]!.huella }); setEstado(x.ok ? null : x.motivo ?? 'no se pudo');
      if (x.identificacion) retroalimenta(x.identificacion.estado === 'identificado' ? 'ok' : 'aviso');
    } catch (err) { setEstado(err instanceof Error ? err.message : String(err)); }
  };
  const registra = () => {
    if (!r) return;
    void e.ejecuta<{ ok: boolean; folio?: string; motivo?: string; evento?: { seq: number } }>({ accion: 'registra-hallazgo', sitio, sku, foto: r.foto, recortes: (r.recortes ?? []).slice(0, 3), textoLeido: (r.textoLeido ?? []).slice(0, 3).map((t) => t.slice(0, 400)), ...(motivo.trim().length >= 3 ? { motivo: motivo.trim() } : {}) })
      .then((x) => { setHallazgo(x.ok ? `Hallazgo ${x.folio} registrado en la cadena (evento #${x.evento?.seq}). El supervisor lo ve en su tablero.` : x.motivo ?? 'no se pudo'); retroalimenta(x.ok ? 'ok' : 'error'); });
  };
  const id = r?.identificacion;
  return (
    <div className="space-y-3" data-prueba="pieza-suelta">
      <div className="flex items-center gap-3">
        <FotoArticulo est={est} sku={sku} className="h-16 w-16 rounded-lg" />
        <p className="text-sm"><b>{descripcion}</b>: la pieza no dice su lote. Encuadra su fecha en el recuadro.</p>
      </div>
      {!id ? <CamaraFoto alCapturar={(c) => void captura(c)} texto="Foto de la fecha de la pieza" /> : null}
      {estado ? <p className="text-sm" role="status" data-prueba="estado-pieza">{estado}</p> : null}
      {id ? (
        <div className="space-y-2" data-prueba="identificacion" data-estado={id.estado}>
          <p className="text-sm font-semibold">{id.mensaje}</p>
          {id.candidatos.map((c) => (
            <div key={`${c.lote.lote}${c.lote.caducidad}`} className={`rounded-lg p-2 text-sm ${COLOR_SEMAFORO[c.semaforo]}`} data-prueba="candidato">
              Lote <b>{c.lote.lote}</b> · caduca <b>{c.lote.caducidad}</b> · {c.ubicacion}{c.porLote ? ' · coincidió también el lote' : ''}
            </div>
          ))}
          {id.estado === 'no-cuadra' || id.estado === 'sin-fecha' ? (
            hallazgo ? <p className="rounded-lg bg-fuchsia-100 p-2 text-sm text-fuchsia-950 dark:bg-fuchsia-950 dark:text-fuchsia-100" data-prueba="hallazgo-registrado">{hallazgo}</p> : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">¿Qué ves? (opcional)<input className={campo} value={motivo} onChange={(x) => setMotivo(x.target.value)} maxLength={200} placeholder="p. ej. pieza sin recepción en el exhibidor" /></label>
                <button type="button" className={botonPrimario} onClick={registra} data-prueba="registrar-hallazgo">Registrar hallazgo</button>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
