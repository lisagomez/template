'use client';

/**
 * /etiquetas/escanear — el dia con el celular, sin navegar menus. La persona dice donde esta
 * (escanea la etiqueta de la zona o del rack, o la toca) y cada escaneo hace la accion de ESA zona
 * para SU rol; lo decide el servidor, la pantalla solo ayuda:
 *   recibo → recibir (directo con (17)(10), o la recepcion con foto aqui mismo);
 *   almacen → lote, semaforo, rack y «baja primero ese»; entra lo de recibo, ubica en el rack;
 *   piso → ¿se vende? el color a pantalla completa; retirar ES el escaneo; la pieza suelta, por foto;
 *   merma → la baja con su motivo.
 * Escaneo continuo, color + vibracion + sonido, contador de la sesion, «deshacer» (una CORRECCION)
 * y la ronda de hoy, que se cierra con los escaneos. Sin señal, el escaneo se encola y se sube solo.
 */
import { useCallback, useEffect, useState } from 'react';
import { esErrorLectura, leeUbicacion, nombreZona, parseaLectura, ZONAS, ZONAS_DEL_ROL, type VistaEscaneo, type Zona } from '../services/nucleo.ts';
import { accion, type EstadoCliente } from '../services/cliente.ts';
import { encola, esSinSenal, nuevoIdCliente, pendientes, sincroniza } from '../services/cola.ts';
import type { AccionEtiquetas } from '../services/esquemas.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { useZona, MINUTOS_SIN_ACTIVIDAD, type ContextoZona } from '../hooks/use-zona.ts';
import { BandejaRevisiones } from './bandeja-revisiones.tsx';
import { EntradaPistola } from './entrada-pistola.tsx';
import { LectorCamara } from './lector-camara.tsx';
import { boton, campo, tarjeta } from './marco.tsx';
import { PantallaRecibir, type RecepcionInicial } from './pantalla-recibir.tsx';
import { PiezaSuelta } from './pieza-suelta.tsx';
import { DestelloEscaneo, TarjetaEscaneo } from './resultado-escaneo.tsx';
import { RondaPanel } from './ronda-panel.tsx';
import { VincularGtin } from './vincular-gtin.tsx';

type Escanea = Extract<AccionEtiquetas, { accion: 'escanea' }>;
type RespEscanea = { ok: boolean; vista: VistaEscaneo; eventos: { seq: number; tipo: string; hash: string }[]; repetido?: boolean };
type Embebido = { tipo: 'recepcion'; r: RecepcionInicial } | { tipo: 'pieza'; sku: string; descripcion: string } | { tipo: 'vincular'; gtin: string };

const COLOR_ZONA: Record<Zona, string> = { recibo: 'bg-sky-700', almacen: 'bg-indigo-700', piso: 'bg-emerald-700', merma: 'bg-neutral-800' };
const MOTIVOS = ['dañado', 'empaque roto', 'retiro del proveedor', 'mal estado'];
const vistaLocal = (color: VistaEscaneo['color'], titulo: string, detalle: string[], sonido: VistaEscaneo['sonido'] = 'aviso'): VistaEscaneo => ({ tipo: color === 'error' ? 'error' : 'info', color, titulo, detalle, sonido });

function zonasDe(est: EstadoCliente): readonly Zona[] {
  return est.rol === 'recibo' || est.rol === 'almacenista' || est.rol === 'operacion' ? ZONAS_DEL_ROL[est.rol] : [];
}

function ElegirZona({ est, z, alFijar }: { est: EstadoCliente; z: ContextoZona | null; alFijar: (z: ContextoZona) => void }) {
  const [sitio, setSitio] = useState(z?.sitio ?? est.configuracion.sitios[0]?.clave ?? '');
  const [rack, setRack] = useState(z?.posicion ?? '');
  return (
    <div className="space-y-2" data-prueba="elegir-zona">
      <p className="text-sm">Escanea la etiqueta de tu zona o del rack. Si no hay etiqueta, tócala:</p>
      <div className="flex flex-wrap gap-2">
        <select className={`${campo} w-auto`} value={sitio} onChange={(x) => setSitio(x.target.value)} data-prueba="sitio-escanear">{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select>
        {zonasDe(est).map((id) => <button key={id} type="button" className={`rounded-lg px-3 py-2 text-sm font-bold text-white ${COLOR_ZONA[id]}`} onClick={() => alFijar({ sitio, zona: id, ...(id === 'almacen' && rack ? { posicion: rack } : {}) })} data-prueba={`zona-${id}`}>{nombreZona(id)}</button>)}
      </div>
      <label className="flex items-center gap-2 text-sm">Rack (solo almacén)<input className="w-28 rounded-lg border border-neutral-300 bg-white px-2 py-1 font-mono uppercase dark:border-neutral-700 dark:bg-neutral-900" value={rack} placeholder="B-01-1" maxLength={8} onChange={(x) => setRack(x.target.value.toUpperCase())} /></label>
    </div>
  );
}

/** La cola sin señal: cuantos faltan por subir y lo que el servidor dijo de los que ya subieron. */
function useCola(alSubir: (n: number) => void) {
  const [porSubir, setPorSubir] = useState(0);
  const [subidos, setSubidos] = useState<string[]>([]);
  const cuenta = useCallback(() => void pendientes().then((p) => setPorSubir(p.length), () => undefined), []);
  const sube = useCallback(async () => {
    const r = await sincroniza((a) => accion<RespEscanea>(a)).catch(() => null);
    if (!r) return;
    setPorSubir(r.quedan);
    if (r.hechos.length) {
      setSubidos(r.hechos.map((h) => (h.rechazo ? `✗ ${h.accion.texto.slice(0, 40)}: el servidor lo rechazó (${h.rechazo})` : `✓ ${(h.respuesta as RespEscanea).vista.titulo}${(h.respuesta as RespEscanea).repetido ? ' (ya había llegado)' : ''}`)));
      alSubir(r.hechos.length);
    }
  }, [alSubir]);
  useEffect(() => {
    void Promise.resolve().then(cuenta);
    const alVolver = () => void sube();
    window.addEventListener('online', alVolver);
    const t = setInterval(() => { if (navigator.onLine) void sube(); }, 10_000);
    return () => { window.removeEventListener('online', alVolver); clearInterval(t); };
  }, [cuenta, sube]);
  return { porSubir, subidos, cuenta, sube };
}

type Opciones = { veces: number; todas: boolean; motivo: string };

/** El pedido de un escaneo con el contexto de zona de ESE momento (viaja igual si se encola sin señal). */
function pedidoDe(est: EstadoCliente, z: ContextoZona | null, texto: string, o: Opciones): Escanea {
  const zonaActual = z ?? { sitio: est.configuracion.sitios[0]?.clave ?? '', zona: zonasDe(est)[0] ?? 'recibo' };
  return {
    accion: 'escanea', sitio: zonaActual.sitio, zona: zonaActual.zona, ...(zonaActual.posicion ? { posicion: zonaActual.posicion } : {}), texto,
    ...(o.veces > 1 ? { veces: o.veces } : {}), ...(o.todas ? { todas: true as const } : {}), ...(zonaActual.zona === 'merma' && o.motivo ? { motivo: o.motivo } : {}), idCliente: nuevoIdCliente(),
  };
}

function BarraZona({ est, z, sesion, porSubir }: { est: EstadoCliente; z: ContextoZona | null; sesion: number; porSubir: number }) {
  return (
    <div className={`rounded-xl p-3 text-white ${z ? COLOR_ZONA[z.zona] : 'bg-neutral-500'}`} data-prueba="zona-actual" data-zona={z?.zona ?? ''}>
      <p className="text-xs uppercase tracking-wide opacity-80">{z ? est.configuracion.sitios.find((s) => s.clave === z.sitio)?.nombre ?? z.sitio : 'Sin zona'}</p>
      <p className="text-3xl font-black">{z ? `${nombreZona(z.zona)}${z.posicion ? ` · ${z.posicion}` : ''}` : 'Escanea tu zona'}</p>
      <p className="text-xs opacity-80">Esta sesión: <b data-prueba="contador-sesion">{sesion}</b> escaneo(s){porSubir ? <> · <b data-prueba="por-subir">{porSubir}</b> por subir</> : null} · se olvida a los {MINUTOS_SIN_ACTIVIDAD} min sin escanear</p>
    </div>
  );
}

function OpcionesZona({ zona, o, cambia }: { zona?: Zona; o: Opciones; cambia: (o: Opciones) => void }) {
  if (zona !== 'almacen' && zona !== 'piso' && zona !== 'merma') return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {zona !== 'merma' ? <label className="flex items-center gap-1">Cajas por escaneo<input type="number" min={1} max={500} className="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" value={o.veces} onChange={(x) => cambia({ ...o, veces: Math.min(500, Math.max(1, Number(x.target.value) || 1)) })} data-prueba="veces-escanear" /></label> : null}
      {zona !== 'merma' ? <label className="flex items-center gap-1"><input type="checkbox" checked={o.todas} onChange={(x) => cambia({ ...o, todas: x.target.checked })} data-prueba="todas-escanear" />Todas las de ese lote</label> : null}
      {zona === 'merma' ? <label className="flex items-center gap-1">Motivo<select className={`${campo} w-auto`} value={o.motivo} onChange={(x) => cambia({ ...o, motivo: x.target.value })} data-prueba="motivo-merma"><option value="">vencido (no hace falta)</option>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select></label> : null}
    </div>
  );
}

/** Lo que el escaneo abre AQUI MISMO, sin cambiar de pantalla: la recepcion con foto, la pieza suelta o vincular un codigo. */
function PanelEmbebido({ e, z, x, alCerrar }: { e: Etiquetas; z: ContextoZona | null; x: Embebido; alCerrar: () => void }) {
  return (
    <div className={`${tarjeta} space-y-2 border-2 border-sky-600`} data-prueba="embebido" data-tipo={x.tipo}>
      <button type="button" className={`${boton} float-right text-xs`} onClick={alCerrar}>Cerrar</button>
      {x.tipo === 'recepcion' ? <PantallaRecibir key={x.r.texto ?? x.r.revision?.revision} e={e} inicial={x.r} /> : null}
      {x.tipo === 'pieza' && z ? <PiezaSuelta key={x.sku} e={e} est={e.estado!} sitio={z.sitio} sku={x.sku} descripcion={x.descripcion} /> : null}
      {x.tipo === 'vincular' ? <VincularGtin e={e} gtin={x.gtin} alVincular={() => { alCerrar(); void e.recarga(); }} /> : null}
    </div>
  );
}

/** Escanear, responder y deshacer. El estado de la pantalla vive aqui; la pantalla solo lo pinta. */
function useEscaneo(e: Etiquetas, zona: ReturnType<typeof useZona>) {
  const est = e.estado!;
  const [destello, setDestello] = useState<VistaEscaneo | null>(null);
  const [ultimo, setUltimo] = useState<VistaEscaneo | null>(null);
  const [sesion, setSesion] = useState(0);
  const [opciones, setOpciones] = useState<Opciones>({ veces: 1, todas: false, motivo: '' });
  const [embebido, setEmbebido] = useState<Embebido | null>(null);
  const [version, setVersion] = useState(0);
  const refresca = useCallback(() => setVersion((v) => v + 1), []);
  // Al subir lo encolado, la tarjeta deja de decir «sin señal» (el detalle de cada uno va en la lista).
  const alSubir = useCallback((n: number) => { setUltimo(vistaLocal('ok', `Con señal otra vez: se subieron ${n} escaneo(s)`, ['Abajo, lo que el servidor hizo con cada uno.'], 'ok')); refresca(); }, [refresca]);
  const cola = useCola(alSubir);
  const muestra = (v: VistaEscaneo) => { setDestello(v); setUltimo(v); };
  const recepcion = (r: Omit<RecepcionInicial, 'alTerminar'>) => setEmbebido({ tipo: 'recepcion', r: { ...r, alTerminar: () => { setEmbebido(null); refresca(); } } });
  const responde = (p: Escanea, r: RespEscanea) => {
    const v = r.vista;
    setSesion((n) => n + 1);
    if (v.tipo === 'zona' && v.zona) { zona.fija(v.zona); setEmbebido(null); }
    if (v.tipo === 'recibir-con-foto') recepcion({ sitio: p.sitio, texto: p.texto });
    if (v.tipo === 'pieza-suelta' && v.articulo) setEmbebido({ tipo: 'pieza', sku: v.articulo.sku, descripcion: v.articulo.descripcion });
    if (v.tipo === 'desconocido' && v.articulo?.gtin) setEmbebido({ tipo: 'vincular', gtin: v.articulo.gtin });
    muestra(v);
    if (r.eventos.length) refresca();
  };
  const alLeer = (texto: string) => {
    const lectura = parseaLectura(texto);
    const esUbicacion = !esErrorLectura(lectura) && Boolean(leeUbicacion(lectura.elementos, est.configuracion.sitios));
    if (!zona.zona && !esUbicacion) return muestra(vistaLocal('aviso', 'Primero dime dónde estás', ['Escanea la etiqueta de tu zona o del rack, o tócala en la pantalla.']));
    zona.toca();
    const p = pedidoDe(est, zona.zona, texto, opciones);
    void accion<RespEscanea>(p).then((r) => responde(p, r), async (err: unknown) => {
      if (!esSinSenal(err)) return muestra(vistaLocal('error', 'El servidor no lo aceptó', [err instanceof Error ? err.message : String(err)], 'error'));
      await encola(p); cola.cuenta(); setSesion((n) => n + 1);
      muestra(vistaLocal('aviso', 'Sin señal: guardado para subir', ['Se manda solo, en orden, al volver la señal. El servidor decide cada uno.']));
    });
  };
  const deshaz = async () => {
    if (!ultimo?.deshacer || !zona.zona) return;
    const r = await accion<{ ok: boolean; motivo?: string; evento?: { seq: number } }>({ accion: 'deshaz', sitio: zona.zona.sitio, evento: ultimo.deshacer }).catch((x: unknown) => ({ ok: false, motivo: String(x), evento: undefined }));
    muestra(r.ok ? vistaLocal('info', 'Deshecho', [`Quedó como corrección #${r.evento?.seq} en la cadena: el escaneo no se borra.`], 'ok') : vistaLocal('error', 'No se pudo deshacer', [r.motivo ?? ''], 'error'));
    if (r.ok) refresca();
  };
  const cierraDestello = useCallback(() => setDestello(null), []);
  return { destello, cierraDestello, ultimo, sesion, opciones, setOpciones, embebido, setEmbebido, version, cola, alLeer, deshaz, recepcion };
}

export function PantallaEscanear({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const zona = useZona();
  const z = zona.zona;
  const x = useEscaneo(e, zona);
  return (
    <div className="space-y-3">
      {x.destello ? <DestelloEscaneo v={x.destello} alCerrar={x.cierraDestello} /> : null}
      <BarraZona est={est} z={z} sesion={x.sesion} porSubir={x.cola.porSubir} />
      {!z ? <div className={tarjeta}><ElegirZona est={est} z={z} alFijar={zona.fija} /></div> : null}
      <div className={`${tarjeta} space-y-2`}>
        <LectorCamara alLeer={x.alLeer} />
        <EntradaPistola alLeer={x.alLeer} />
        <OpcionesZona {...(z ? { zona: z.zona } : {})} o={x.opciones} cambia={x.setOpciones} />
        {z ? <button type="button" className={`${boton} text-xs`} onClick={() => { zona.fija(null); x.setEmbebido(null); }} data-prueba="cambiar-zona">Cambiar de zona</button> : null}
      </div>
      {x.ultimo && !x.destello ? <TarjetaEscaneo v={x.ultimo} alDeshacer={() => void x.deshaz()} /> : null}
      {x.cola.subidos.length ? <div className={`${tarjeta} text-sm`} data-prueba="sincronizados"><p className="font-semibold">Subido al volver la señal:</p><ul className="list-inside list-disc">{x.cola.subidos.map((s, i) => <li key={`${i}${s}`}>{s}</li>)}</ul></div> : null}
      {x.embebido ? <PanelEmbebido e={e} z={z} x={x.embebido} alCerrar={() => x.setEmbebido(null)} /> : null}
      {z?.zona === 'recibo' && est.rol !== 'almacenista' ? <BandejaRevisiones e={e} version={x.version} alRetomar={(r) => x.recepcion({ sitio: r.sitio, revision: r })} /> : null}
      {z ? <RondaPanel sitio={z.sitio} zona={z.zona} version={x.version} /> : null}
      <p className="text-xs text-neutral-500">Zonas de este dispositivo: {zonasDe(est).map(nombreZona).join(', ') || 'ninguna'}. {ZONAS.length - zonasDe(est).length ? 'Las demás las rechaza el servidor.' : ''}</p>
    </div>
  );
}
