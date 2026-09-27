'use client';

/**
 * /etiquetas/recibir — recibir mercancia AUNQUE la caja no traiga GS1-128:
 *   1. escanear el codigo que trae (EAN-13, UPC-A, EAN-8, ITF-14, GS1-128, Digital Link);
 *   2. ver la foto del articulo y decir cuantas cajas llegan (pieza o caja: no es lo mismo);
 *   3. fotografiar donde viene la caducidad (guia de encuadre y rafaga);
 *   4. la maquina PROPONE; quien registra CONFIRMA o CORRIGE (o lo deja pendiente);
 *   5. el lote entra y sale su etiqueta GS1-128 de la casa: desde ahi, se lee por codigo.
 * Si el codigo ya trae (17) y (10) (GS1-128, DataMatrix, Digital Link), no hace falta foto.
 */
import { useState } from 'react';
import {
  categoriaPorId, disenaDesdeDatos, esErrorLectura, interpreta, parseaLectura, PERFIL_EJEMPLO, perfilParaVistaLocal, revisa, simbolosDe, aZpl, TEXTO_FORMATO,
  type Devolucion, type Interpretacion, type Lectura,
} from '../services/nucleo.ts';
import { subeFoto, type EstadoCliente, type FotoSubida } from '../services/cliente.ts';
import { gtinLegible } from '../services/presenta.ts';
import { enlaceExpediente } from '../services/tipos-expediente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { BandejaRevisiones } from './bandeja-revisiones.tsx';
import { CamaraFoto, type Captura } from './camara-foto.tsx';
import { EntradaPistola } from './entrada-pistola.tsx';
import { FotoArticulo, fotoDe } from './foto.tsx';
import { LectorCamara } from './lector-camara.tsx';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';
import { comoEstado } from './pantalla-lector.tsx';
import { PanelImpresion } from './panel-impresion.tsx';
import { RevisionCaducidad, type Decision, type RevisionAbierta } from './revision-caducidad.tsx';
import { VincularGtin } from './vincular-gtin.tsx';
import { VistaEtiqueta } from './vista-etiqueta.tsx';

type Codigo = { gtin: string; nivel: 'unidad' | 'caja'; formato?: string };
type Hecho = { ok: boolean; motivo?: string; existencia?: { lote: string; caducidad: string; cantidad: number; gtin: string }; rechazada?: Devolucion; corregida?: { fecha: boolean; lote: boolean }; eventos?: { seq: number; tipo: string; hash: string }[] };

function Consejos({ est, sku }: { est: EstadoCliente; sku: string }) {
  const donde = fotoDe(est, sku, 'caducidad');
  return (
    <div className="space-y-2 text-sm" data-prueba="consejos">
      {donde ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950" data-prueba="donde-viene">
          <FotoArticulo est={est} sku={sku} vista="caducidad" className="h-16 w-24 rounded" />
          <span><b>Dónde viene:</b> {donde.nota ?? 'ver la foto'}</span>
        </div>
      ) : <p className="rounded-lg bg-neutral-100 p-2 dark:bg-neutral-800">Nadie ha documentado todavía dónde viene la caducidad de este artículo: al confirmar puedes guardar tu foto para los siguientes.</p>}
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-600 dark:text-neutral-300">
        <li>Lee primero el <b>paquete o la tarima</b>: es el mismo lote para todas las piezas y se registra una vez.</li>
        <li>Botella con líquido oscuro: busca la fecha donde hay <b>aire detrás</b> (cuello), o inclina la botella para que la burbuja quede detrás.</li>
        <li><b>Sin flash de frente</b> (rebota en el plástico): alumbra de lado, rasante, para que la tinta brille distinto.</li>
        <li>Mete solo la fecha y el lote en el recuadro. La ráfaga toma 5 cuadros mientras giras la pieza y usa los 2 más nítidos.</li>
      </ul>
    </div>
  );
}

function EtiquetaDeLaCasa({ e, sitio, sku, lote, caducidad, cajas }: { e: Etiquetas; sitio: string; sku: string; lote: string; caducidad: string; cajas: number }) {
  const est = e.estado!;
  const art = est.articulos.find((a) => a.sku === sku);
  const perfil = est.impresoras.find((p) => p.sitio === sitio) ?? { ...PERFIL_EJEMPLO, sitio };
  if (!art?.gtinCaja) return null;
  const datos = { tipo: 'caja' as const, producto: art.descripcion, gtin: art.gtinCaja, caducidad, lote, sitio, ...(art.unidadesPorCaja > 1 ? { unidades: art.unidadesPorCaja } : {}) };
  const diseno = disenaDesdeDatos(datos, perfil, Number(est.hoy.slice(0, 4)));
  const r = revisa({ simbolos: simbolosDe(datos), diseno, perfil, categoria: categoriaPorId(est.configuracion.categorias, art.categoria), hoy: est.hoy });
  const zpl = r.bloquea ? null : aZpl(diseno, perfil, { copias: cajas });
  return (
    <div className="grid gap-3 md:grid-cols-2" data-prueba="etiqueta-casa">
      <div><VistaEtiqueta diseno={diseno} zpl={zpl} zplVistaLocal={r.bloquea ? null : aZpl(diseno, perfilParaVistaLocal(perfil))} perfil={perfil} labelaryPermitido={est.configuracion.labelaryPermitido} /></div>
      <PanelImpresion e={e} zpl={zpl} bloquea={r.bloquea} sitio={sitio} impresora={perfil.id} copias={cajas} />
    </div>
  );
}

function Identificado({ est, inter, lectura, cajas, setCajas, alSeguir, alRecibirDirecto }: { est: EstadoCliente; inter: Interpretacion; lectura: Lectura; cajas: number; setCajas: (n: number) => void; alSeguir: () => void; alRecibirDirecto: () => void }) {
  const art = inter.articulo!;
  const pendientes = est.revisiones.filter((r) => r.sku === art.sku);
  const directo = Boolean(inter.lote && inter.caducidadIso);
  return (
    <div className="space-y-3" data-prueba="identificado">
      <div className="flex gap-3">
        <FotoArticulo est={est} sku={art.sku} className="h-28 w-28 rounded-xl" />
        <div className="space-y-1">
          <p className="text-xl font-bold" data-prueba="producto-recibir">{art.descripcion}</p>
          <p className="font-mono text-xs">{art.sku} · GTIN {gtinLegible(inter.gtin!)}</p>
          <p className="text-sm" data-prueba="nivel-leido">Leíste {inter.nivel === 'caja' ? <b>la CAJA</b> : <b>la PIEZA</b>} ({lectura.formato ? TEXTO_FORMATO[lectura.formato] : lectura.simbologia ?? 'GS1'}){inter.nivel === 'unidad' && art.unidadesPorCaja > 1 ? `: la caja trae ${art.unidadesPorCaja} piezas.` : '.'}</p>
          <p className="text-xs text-neutral-500">¿Es lo que tienes enfrente? Si la foto no coincide, no sigas.</p>
        </div>
      </div>
      {pendientes.length ? <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">Ya hay {pendientes.reduce((s, r) => s + r.cajas, 0)} caja(s) de este artículo por confirmar (bandeja, abajo).</p> : null}
      {directo ? (
        <div className="space-y-2 rounded-lg bg-emerald-50 p-2 text-sm dark:bg-emerald-950" data-prueba="directo">
          <p>El código ya trae lote <b>{inter.lote}</b> y caducidad <b>{inter.caducidadIso}</b>: no hace falta foto.</p>
          <button type="button" className={botonPrimario} onClick={alRecibirDirecto} data-prueba="recibir-directo">Recibir {inter.cajas} caja(s)</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">¿Cuántas cajas{inter.nivel === 'unidad' && art.unidadesPorCaja > 1 ? ` de ${art.unidadesPorCaja} piezas` : ''} llegan?<input type="number" min={1} className={`${campo} w-32`} value={cajas} onChange={(x) => setCajas(Math.max(1, Number(x.target.value) || 1))} data-prueba="cajas-recibir" /></label>
          <button type="button" className={botonPrimario} onClick={alSeguir} disabled={!art.gtinCaja} data-prueba="a-foto">Siguiente: foto de la caducidad</button>
          {!art.gtinCaja ? <p className="text-sm text-red-700">El artículo no tiene GTIN de caja: asígnalo en el catálogo antes de recibir.</p> : null}
        </div>
      )}
    </div>
  );
}

export function PantallaRecibir({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [sitio, setSitio] = useState(est.configuracion.sitios[0]?.clave ?? '');
  const [texto, setTexto] = useState<string | null>(null);
  const [cajas, setCajas] = useState(1);
  const [paso, setPaso] = useState<'escanear' | 'foto' | 'revision' | 'hecho'>('escanear');
  const [revision, setRevision] = useState<RevisionAbierta | null>(null);
  const [reemplaza, setReemplaza] = useState<string | undefined>(undefined);
  const [subida, setSubida] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [version, setVersion] = useState(0);

  const r = texto === null ? null : parseaLectura(texto);
  const lectura = r && !esErrorLectura(r) ? r : null;
  const inter = lectura ? interpreta(lectura.elementos, comoEstado(est), est.hoy) : null;
  const codigo: Codigo | null = inter?.gtin ? { gtin: inter.gtin, nivel: inter.nivel ?? 'unidad', ...(lectura?.formato ? { formato: lectura.formato } : {}) } : null;
  const reinicia = () => { setTexto(null); setPaso('escanear'); setRevision(null); setReemplaza(undefined); setHecho(null); setSubida(null); setCajas(1); setVersion((v) => v + 1); void e.recarga(); };
  const falla = (x: unknown) => { setAviso(x instanceof Error ? x.message : String(x)); setOcupado(false); };

  const captura = async (c: Captura) => {
    if (!inter?.articulo || !codigo) return;
    setOcupado(true); setAviso(null);
    try {
      const subidas: FotoSubida[] = [];
      for (const [i, f] of c.fotos.entries()) subidas.push(await subeFoto(f, (n, err) => setSubida(`Subiendo foto ${i + 1} de ${c.fotos.length}${n > 1 ? ` · intento ${n}${err ? ` (${err})` : ''}` : ''}…`)));
      const quitado = subidas.some((s) => s.gpsQuitado) ? ' Se le quitó la ubicación GPS y los metadatos EXIF.' : subidas.some((s) => s.exifQuitado) ? ' Se le quitaron los metadatos EXIF.' : '';
      setSubida(`Fotos guardadas; leyendo la fecha con el motor local…${quitado}`);
      type R = { ok: boolean; motivo?: string; folio: string; revision: string; propuesta: RevisionAbierta['propuesta']; recortes: string[] };
      const x = await e.ejecuta<R>({ accion: 'lee-caducidad', sitio, sku: inter.articulo.sku, cajas, codigo, foto: subidas[0]!.huella, tomas: subidas.slice(1).map((s) => s.huella), zona: c.zona, ...(reemplaza ? { reemplaza } : {}) });
      if (!x.ok) { setAviso(x.motivo ?? 'no se pudo'); setOcupado(false); return; }
      setRevision({ sitio, sku: inter.articulo.sku, cajas, revision: x.revision, folio: x.folio, propuesta: x.propuesta, completa: subidas[0]!.huella, recortes: x.recortes });
      setSubida(quitado ? `Fotos guardadas.${quitado}` : null);
      setPaso('revision'); setOcupado(false);
    } catch (err) { falla(err); }
  };

  const decide = (d: Decision) => {
    if (!revision) return;
    setOcupado(true);
    void e.ejecuta<Hecho>({ accion: 'revision-confirma', sitio: revision.sitio, revision: revision.revision, caducidad: d.caducidad, lote: d.lote, ...(d.formato ? { formato: d.formato } : {}), ...(d.tipo ? { tipo: d.tipo } : {}) }).then(async (x) => {
      if (x.ok && d.dondeCaducidad) await e.ejecuta({ accion: 'foto-articulo', sku: revision.sku, vista: 'caducidad', huella: revision.completa, nota: d.dondeCaducidad });
      setHecho(x); setOcupado(false);
      if (x.ok) { setPaso('hecho'); void e.recarga(); } else setAviso(x.motivo ?? 'no se pudo');
    }, falla);
  };

  const recibeDirecto = () => void e.ejecuta<Hecho>({ accion: 'recepcion', sitio, texto: texto! }).then((x) => { setHecho(x); if (x.ok) setPaso('hecho'); else setAviso(x.motivo ?? 'no se pudo'); void e.recarga(); }, falla);

  return (
    <div className="space-y-4">
      <div className={`${tarjeta} space-y-3`}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Estoy en<select className={campo} value={sitio} onChange={(x) => setSitio(x.target.value)} data-prueba="sitio-recibir">{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
          {paso !== 'escanear' ? <button type="button" className={boton} onClick={reinicia} data-prueba="nueva-recepcion">Nueva recepción</button> : null}
          <span className="text-xs text-neutral-500" data-prueba="motor">Lectura de fechas: {est.motor ? `motor local ${est.motor}` : 'sin motor instalado (se teclea)'}</span>
        </div>
        {paso === 'escanear' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><p className="text-sm font-medium">1 · Escanea el código que trae la caja</p><LectorCamara alLeer={(t) => { setTexto(t); setAviso(null); }} /></div>
            <EntradaPistola alLeer={(t) => { setTexto(t); setAviso(null); }} />
          </div>
        ) : null}
        {paso === 'escanear' && r && esErrorLectura(r) ? <p className="text-sm text-red-700" data-prueba="error-recibir">{r.mensaje}</p> : null}
        {paso === 'escanear' && inter?.articulo && lectura ? <Identificado est={est} inter={inter} lectura={lectura} cajas={cajas} setCajas={setCajas} alSeguir={() => setPaso('foto')} alRecibirDirecto={recibeDirecto} /> : null}
        {paso === 'escanear' && inter?.gtin && !inter.articulo ? <VincularGtin e={e} gtin={inter.gtin} {...(lectura?.formato ? { formato: lectura.formato } : {})} alVincular={() => void e.recarga()} /> : null}
        {paso === 'foto' && inter?.articulo ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><p className="text-sm font-medium">2 · Foto de donde viene la caducidad {reemplaza ? '(otra toma)' : ''}</p><CamaraFoto alCapturar={(c) => void captura(c)} /></div>
            <Consejos est={est} sku={inter.articulo.sku} />
          </div>
        ) : null}
        {subida ? <p className="text-sm text-neutral-600 dark:text-neutral-300" role="status" data-prueba="subida">{subida}</p> : null}
        {paso === 'revision' && revision ? (
          <RevisionCaducidad key={revision.revision} est={est} r={revision} ocupado={ocupado} alDecidir={decide}
            alOtraFoto={() => { setReemplaza(revision.revision); setPaso('foto'); }} alPendiente={() => { setAviso(`Pendiente ${revision.folio}: las ${revision.cajas} caja(s) se quedan en recibo hasta que confirmes.`); reinicia(); }} />
        ) : null}
        {paso === 'hecho' && hecho ? <Resultado e={e} hecho={hecho} sitio={revision?.sitio ?? sitio} sku={revision?.sku ?? inter?.articulo?.sku ?? ''} cajas={revision?.cajas ?? inter?.cajas ?? cajas} /> : null}
        {aviso ? <p className="text-sm" role="status" data-prueba="aviso-recibir">{aviso}</p> : null}
      </div>
      <BandejaRevisiones e={e} version={version} alRetomar={(x) => { setRevision(x); setSitio(x.sitio); setTexto(null); setPaso('revision'); }} />
    </div>
  );
}

function Resultado({ e, hecho, sitio, sku, cajas }: { e: Etiquetas; hecho: Hecho; sitio: string; sku: string; cajas: number }) {
  if (hecho.rechazada) {
    const d = hecho.rechazada;
    return (
      <div className="space-y-1 rounded-xl border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950 dark:text-red-100" role="alert" data-prueba="rechazo-recibir">
        <p className="text-xl font-black">RECHAZADO en recepción</p>
        <p>{d.regla}. Le quedan {d.diasRestantes} días (caduca {d.caducidad}).</p>
        <p className="font-semibold">Devolución al proveedor {d.folio}: {d.cajas} caja(s) del lote {d.lote}.</p>
      </div>
    );
  }
  const x = hecho.existencia!;
  return (
    <div className="space-y-3" data-prueba="recibido">
      <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Recibido: {x.cantidad} caja(s) · lote <b>{x.lote}</b> · caducidad <b>{x.caducidad}</b>{hecho.corregida ? ` · ${hecho.corregida.fecha || hecho.corregida.lote ? 'corregida por ti' : 'confirmada tal cual'}` : ''} · evento #{hecho.eventos?.[0]?.seq} en la cadena de {sitio}. <a className="font-semibold underline" href={enlaceExpediente({ gtin: x.gtin, lote: x.lote, caducidad: x.caducidad })}>Ver expediente</a></p>
      <p className="text-sm font-medium">3 · Etiqueta GS1-128 de la casa para las {cajas} caja(s): desde aquí se leen por código.</p>
      <EtiquetaDeLaCasa e={e} sitio={sitio} sku={sku} lote={x.lote} caducidad={x.caducidad} cajas={cajas} />
    </div>
  );
}

