'use client';
/**
 * El lienzo del Estudio en tres zonas: la barra de instrucciones arriba, el tablero al centro y el panel de contexto
 * a la derecha. Toda edición —una frase o un clic— es un parche a la especificación que el servidor valida y
 * versiona; el lienzo solo renderiza lo que el servidor resolvió por la capa semántica.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comparacion, Dashboard, Definicion, Estado, FiltroDashboard, RespuestaInstruccion, Senal } from '../types';
import { dimension } from '../services/formato';
import { Barra } from './barra';
import { Tarjeta, type Acciones } from './componente';
import { Panel, type Pestana } from './panel';
import e from './estudio.module.css';

type Tablero = 'growth' | 'ejecutivo' | 'vacio';
const PERIODOS: [string, string, string][] = [['2026-01', '2026-09', 'ene–sep 2026'], ['2026-07', '2026-09', 'último trimestre'], ['2025-01', '2025-12', '2025'], ['2025-01', '2026-09', 'todo (ene 2025–sep 2026)']];

async function pide<T>(cuerpo: unknown): Promise<T> {
  const r = await fetch('/api/estudio-dashboards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: `respuesta ${r.status}` }));
  if (!r.ok) throw new Error([j.error, ...(Array.isArray(j.errores) ? j.errores.map((x: { mensaje: string }) => x.mensaje) : [])].filter(Boolean).join(' · '));
  return j as T;
}

const filtroTexto = (f: FiltroDashboard) => `${dimension(f.dimension)} ${f.operador === 'no_en' || f.operador === 'distinto' ? 'sin' : ''} ${f.valores.join(', ')}`.replace(/\s+/g, ' ');

function Filtros({ d, onQuita, onPeriodo, onComparar, onSinSeleccion }: { d: Dashboard; onQuita: (dim: string) => void; onPeriodo: (desde: string, hasta: string) => void; onComparar: (c: boolean) => void; onSinSeleccion: () => void }) {
  const actual = PERIODOS.findIndex(([a, b]) => a === d.filtros.periodo.desde && b === d.filtros.periodo.hasta);
  return (
    <div className={e.filtros} aria-label="Filtros del tablero">
      <span className={e.etiquetaFiltros}>Filtros</span>
      <label className={e.oculto} htmlFor="periodo">Periodo</label>
      <select id="periodo" className={e.selector} value={actual} onChange={(ev) => { const p = PERIODOS[Number(ev.target.value)]; if (p) onPeriodo(p[0], p[1]); }}>
        {actual < 0 && <option value={-1}>{d.filtros.periodo.desde}..{d.filtros.periodo.hasta}</option>}
        {PERIODOS.map(([, , t], i) => <option key={t} value={i}>{t}</option>)}
      </select>
      <label className={e.chipFiltro} style={{ paddingRight: 9 }}><input type="checkbox" checked={d.filtros.comparar === 'anio_anterior'} onChange={(ev) => onComparar(ev.target.checked)} /> comparar con el año anterior</label>
      {d.filtros.dimensiones.map((f) => <span key={f.dimension} className={e.chipFiltro}>{filtroTexto(f)}<button type="button" aria-label={`Quitar el filtro de ${dimension(f.dimension)}`} onClick={() => onQuita(f.dimension)}>×</button></span>)}
      {d.seleccion && <span className={e.chipFiltro}>selección: {d.seleccion.valores.join(', ')}<button type="button" aria-label="Quitar la selección del mapa" onClick={onSinSeleccion}>×</button></span>}
    </div>
  );
}

export function Estudio({ inicial = 'growth' }: { inicial?: Tablero }) {
  const [tablero, setTablero] = useState<Tablero>(inicial);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaInstruccion | null>(null);
  const [ocupado, setOcupado] = useState<string | null>('Cargando el tablero desde la capa semántica…');
  const [error, setError] = useState<string | null>(null);
  const [senales, setSenales] = useState<readonly Senal[] | null>(null);
  const [pestana, setPestana] = useState<Pestana>('procedencia');
  const [procedencia, setProcedencia] = useState<{ id: string; datos: NonNullable<Estado['datos']['componentes'][string]>; definiciones: Definicion[] } | null>(null);
  const [nuevos, setNuevos] = useState<ReadonlySet<string>>(new Set());
  const [instruccion, setInstruccion] = useState('');
  const definiciones = useRef(new Map<string, Definicion>());

  const corre = useCallback(async <T,>(que: string, f: () => Promise<T>): Promise<T | null> => {
    setOcupado(que); setError(null);
    try { return await f(); } catch (x) { setError(x instanceof Error ? x.message : String(x)); return null; } finally { setOcupado(null); }
  }, []);
  // El estado lo escribe la promesa (react-hooks/set-state-in-effect); `vigente` evita que una respuesta vieja pise a la nueva.
  useEffect(() => {
    let vigente = true;
    pide<Estado>({ accion: 'estado', tablero })
      .then((r) => { if (vigente) { setEstado(r); setOcupado(null); } })
      .catch((x) => { if (vigente) { setError(x instanceof Error ? x.message : String(x)); setOcupado(null); } });
    return () => { vigente = false; };
  }, [tablero]);
  useEffect(() => { pide<{ senales: Senal[] }>({ accion: 'senales' }).then((r) => setSenales(r.senales)).catch(() => setSenales([])); }, []);

  if (!estado) return <div className={e.raiz}><main className={e.centro}><h1>Estudio de dashboards</h1><p className={error ? e.error : e.aviso} role={error ? 'alert' : undefined}>{error ?? ocupado}</p></main></div>;
  const d = estado.tablero.dashboard;
  const parche = (tipo: string, componentes: string[], operaciones: unknown[]) => ({ esquema: 'estudio.parche/1', base: estado.tablero.version, alcance: { tipo, componentes }, operaciones });
  const aplica = async (p: unknown, autor: 'agente' | 'persona', extra: { instruccion?: string; resumen?: string } = {}, tocados: string[] = []) => {
    const r = await corre('Aplicando y volviendo a consultar la capa…', () => pide<Estado & { aplicado: unknown }>({ accion: 'aplicar', tablero, parche: p, autor, ...extra }));
    if (r) { setEstado(r); setNuevos(new Set(tocados)); setRespuesta(null); }
  };
  const acciones: Acciones = {
    cambia: (id, cambios) => void aplica(parche('modificar', [id], [{ op: 'cambiar', id, cambios }]), 'persona', { resumen: `clic en ${id}: ${Object.keys(cambios).join(', ')}` }, [id]),
    selecciona: (valores) => void aplica(parche('filtrar', [], [{ op: 'seleccionar', seleccion: valores.length ? { dimension: estado.geografia.dimension, valores } : null }]), 'persona', { resumen: valores.length ? `selección en el mapa: ${valores.join(', ')}` : 'sin selección' }),
    procedencia: (id) => {
      const datos = (respuesta?.datos ?? estado.datos).componentes[id] ?? estado.datos.componentes[id];
      if (!datos) return;
      const ms = [...new Set(datos.consultas.flatMap((q) => q.consulta.metricas))];
      void Promise.all(ms.map(async (m) => definiciones.current.get(m) ?? pide<Definicion>({ accion: 'describir', metrica: m }).then((x) => { definiciones.current.set(m, x); return x; })))
        .then((defs) => { setProcedencia({ id, datos, definiciones: defs }); setPestana('procedencia'); });
    },
  };
  const vista = respuesta?.propuesta ? { d: respuesta.propuesta.dashboard, datos: respuesta.datos!, marca: new Set(respuesta.propuesta.tocados), modo: 'propuesta' as const } : { d, datos: estado.datos, marca: nuevos, modo: 'nueva' as const };
  return (
    <div className={e.raiz}>
      <div className={e.app}>
        <main className={e.centro} aria-busy={!!ocupado}>
          <header className={e.cabeza}>
            <div>
              <div className={e.ceja}>Distribuidora Golfo Norte · datos ficticios · laboratorio</div>
              <h1>{vista.d.titulo}</h1>
              <span className={e.version}>versión {estado.tablero.version}{estado.tablero.oficial !== null ? ` · oficial v${estado.tablero.oficial}` : ''}{respuesta?.propuesta ? ' · VISTA PREVIA sin aplicar' : ''} · gasto del agente US${estado.gasto.gastadoUsd.toFixed(4)} de {estado.gasto.presupuestoUsd}</span>
            </div>
            <div className={e.acciones}>
              <label className={e.oculto} htmlFor="tablero">Tablero</label>
              <select id="tablero" className={e.selector} value={tablero} onChange={(ev) => { setOcupado('Cargando el tablero desde la capa semántica…'); setTablero(ev.target.value as Tablero); setRespuesta(null); setProcedencia(null); }}>
                <option value="growth">Growth</option><option value="ejecutivo">Ejecutivo</option><option value="vacio">Vacío</option>
              </select>
              <button type="button" className={e.boton} disabled={estado.tablero.version === 0} onClick={() => { const v = estado.tablero.versiones.find((x) => x.n === estado.tablero.version); if (v?.padre !== null && v?.padre !== undefined) void corre('Deshaciendo…', () => pide<Estado>({ accion: 'version', tablero, operacion: 'volver', n: v.padre! })).then((r) => r && setEstado(r)); }}>Deshacer</button>
              <button type="button" className={e.botonFantasma} onClick={() => void corre('Reiniciando…', () => pide<Estado>({ accion: 'reinicia', tablero })).then((r) => { if (r) { setEstado(r); setRespuesta(null); } })}>Reiniciar laboratorio</button>
            </div>
          </header>
          <Barra ocupado={ocupado} agente={estado.agente} respuesta={respuesta} error={error}
            onInstruccion={(t) => { setInstruccion(t); void corre('El agente está leyendo la instrucción…', () => pide<RespuestaInstruccion>({ accion: 'instruccion', tablero, instruccion: t, seleccion: d.seleccion ?? null })).then((r) => r && setRespuesta(r)); }}
            onAplicar={() => respuesta?.propuesta && void aplica(respuesta.propuesta.parche, 'agente', { instruccion, resumen: respuesta.vuelta.texto.slice(0, 300) }, [...respuesta.propuesta.tocados])}
            onDescartar={() => setRespuesta(null)}
            onConfirmaAlerta={(por) => respuesta?.alerta && void corre('Registrando la alerta (sin canal)…', () => pide({ accion: 'alerta', regla: { metrica: respuesta.alerta!.metrica, filtros: respuesta.alerta!.filtros, condicion: respuesta.alerta!.condicion, valor: respuesta.alerta!.valor, unidad: respuesta.alerta!.unidad, ventana: respuesta.alerta!.ventana }, confirmadaPor: por })).then((r) => r && setRespuesta({ ...respuesta, vuelta: { ...respuesta.vuelta, texto: `Alerta registrada por ${por}. Se evalúa en el laboratorio; no se envía a ningún canal.` }, alerta: null }))} />
          <Filtros d={vista.d}
            onQuita={(dim) => void aplica(parche('filtrar', [], [{ op: 'filtrar', quitar: [dim] }]), 'persona', { resumen: `quitar el filtro de ${dim}` })}
            onPeriodo={(desde, hasta) => void aplica(parche('filtrar', [], [{ op: 'periodo', periodo: { desde, hasta } }]), 'persona', { resumen: `periodo ${desde}..${hasta}` })}
            onComparar={(c) => void aplica(parche('filtrar', [], [{ op: 'periodo', periodo: d.filtros.periodo, comparar: c ? 'anio_anterior' : null }]), 'persona', { resumen: c ? 'comparar con el año anterior' : 'sin comparar' })}
            onSinSeleccion={() => acciones.selecciona([])} />
          <div className={e.rejilla}>
            {vista.d.componentes.map((c) => (
              <Tarjeta key={c.id} c={c} datos={vista.datos.componentes[c.id]} cat={estado.catalogo} geografia={estado.geografia} senales={senales}
                seleccion={vista.d.seleccion?.valores ?? []} capaReorden="combinaciones_bajo_reorden" estado={vista.marca.has(c.id) ? vista.modo : 'normal'} acciones={respuesta?.propuesta ? { ...acciones, cambia: () => {}, selecciona: () => {} } : acciones} />
            ))}
            {vista.d.componentes.length === 0 && <p className={e.aviso}>Tablero vacío: pídele uno al agente («Hazme un tablero de ventas por canal»).</p>}
          </div>
        </main>
        <Panel pestana={pestana} onPestana={setPestana} estado={estado} procedencia={procedencia} especificacion={vista.d}
          onVolver={(n) => void corre('Volviendo a esa versión…', () => pide<Estado>({ accion: 'version', tablero, operacion: 'volver', n })).then((r) => r && setEstado(r))}
          onOficial={(n) => void corre('Fijando la versión oficial…', () => pide<Estado>({ accion: 'version', tablero, operacion: 'oficial', n })).then((r) => r && setEstado(r))}
          onComparar={(a, b) => pide<Comparacion>({ accion: 'comparar', tablero, a, b })} />
      </div>
    </div>
  );
}
