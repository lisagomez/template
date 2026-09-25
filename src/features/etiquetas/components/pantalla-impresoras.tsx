'use client';

/**
 * /etiquetas/impresoras — un perfil por impresora y sitio: dpi, tamaño real, desplazamientos
 * (^LH, ^LS, ^LT), oscuridad (^MD) y velocidad (^PR). La etiqueta de calibracion se imprime,
 * se mide con una regla contra el papel y se corrigen los desplazamientos hasta que el recuadro
 * toque los cuatro bordes. Se ve antes (lo guardado) y despues (lo que estas editando).
 */
import { useState } from 'react';
import { etiquetaCalibracion, mmAPuntos, perfilParaVistaLocal, type PerfilImpresora } from '../services/nucleo.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';
import { PanelImpresion } from './panel-impresion.tsx';
import { VistaMotorLocal } from './vista-etiqueta.tsx';

const NUMEROS: { clave: keyof PerfilImpresora; texto: string; ayuda: string; min: number; max: number; paso?: number }[] = [
  { clave: 'anchoMm', texto: 'Ancho (mm)', ayuda: 'Ancho real de la etiqueta', min: 20, max: 170, paso: 0.1 },
  { clave: 'altoMm', texto: 'Alto (mm)', ayuda: 'Alto real, sin el espacio entre etiquetas', min: 10, max: 400, paso: 0.1 },
  { clave: 'origenX', texto: '^LH x (puntos)', ayuda: 'Mueve todo a la derecha', min: 0, max: 32000 },
  { clave: 'origenY', texto: '^LH y (puntos)', ayuda: 'Mueve todo hacia abajo', min: 0, max: 32000 },
  { clave: 'corrimientoIzq', texto: '^LS (puntos)', ayuda: 'Corrimiento a la izquierda (negativo = derecha)', min: -9999, max: 9999 },
  { clave: 'corrimientoSup', texto: '^LT (puntos)', ayuda: 'Corrimiento vertical de la impresión', min: -120, max: 120 },
  { clave: 'oscuridad', texto: '^MD oscuridad', ayuda: 'Relativa: de -30 a 30', min: -30, max: 30 },
  { clave: 'velocidad', texto: '^PR velocidad (ips)', ayuda: 'Más lento = barras más nítidas', min: 2, max: 14 },
];

export function PantallaImpresoras({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [id, setId] = useState(est.impresoras[0]?.id ?? '');
  const guardada = est.impresoras.find((p) => p.id === id);
  const [borrador, setBorrador] = useState<PerfilImpresora | null>(guardada ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const elige = (nuevo: string) => { setId(nuevo); setBorrador(est.impresoras.find((p) => p.id === nuevo) ?? null); setAviso(null); };
  const nueva = () => {
    const sitio = est.configuracion.sitios[0]?.clave ?? '';
    const p: PerfilImpresora = { id: `zebra-${Date.now().toString(36)}`, nombre: 'Nueva Zebra', sitio, dpi: 203, anchoMm: 101.6, altoMm: 50.8, origenX: 0, origenY: 0, corrimientoIzq: 0, corrimientoSup: 0, oscuridad: 0, velocidad: 4, perfilLectura: 'pistola' };
    setId(p.id); setBorrador(p);
  };
  const guarda = () => {
    if (!borrador) return;
    void e.ejecuta({ accion: 'impresora', perfil: borrador }).then(() => setAviso('Perfil guardado.'), (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)));
  };
  const pon = (x: Partial<PerfilImpresora>) => setBorrador((b) => (b ? { ...b, ...x } : b));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {est.impresoras.map((p) => <button key={p.id} type="button" className={`${boton} ${p.id === id ? 'ring-2 ring-blue-600' : ''}`} onClick={() => elige(p.id)}>{p.nombre} <span className="text-xs text-neutral-500">· {p.sitio}</span></button>)}
        <button type="button" className={boton} onClick={nueva}>+ Nueva impresora</button>
      </div>
      {borrador ? (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form className={`${tarjeta} space-y-3`} onSubmit={(x) => { x.preventDefault(); guarda(); }} data-prueba="perfil">
            <label className="block text-sm">Nombre<input className={campo} value={borrador.nombre} onChange={(x) => pon({ nombre: x.target.value })} maxLength={60} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Sitio<select className={campo} value={borrador.sitio} onChange={(x) => pon({ sitio: x.target.value })}>{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
              <label className="text-sm">Resolución<select className={campo} value={borrador.dpi} onChange={(x) => pon({ dpi: Number(x.target.value) as PerfilImpresora['dpi'] })} data-prueba="dpi"><option value={203}>203 dpi</option><option value={300}>300 dpi</option><option value={600}>600 dpi</option></select></label>
            </div>
            <label className="block text-sm">Quién lee las etiquetas<select className={campo} value={borrador.perfilLectura} onChange={(x) => pon({ perfilLectura: x.target.value as PerfilImpresora['perfilLectura'] })}><option value="pistola">Pistola o celular (lectura manual)</option><option value="automatico">Escáner automático (banda, túnel)</option></select></label>
            <div className="grid grid-cols-2 gap-2">
              {NUMEROS.map((n) => (
                <label key={n.clave} className="text-xs" title={n.ayuda}>{n.texto}
                  <input className={campo} type="number" min={n.min} max={n.max} step={n.paso ?? 1} value={Number(borrador[n.clave])} data-prueba={`campo-${n.clave}`}
                    onChange={(x) => pon({ [n.clave]: Math.min(n.max, Math.max(n.min, Number(x.target.value) || 0)) } as Partial<PerfilImpresora>)} />
                </label>
              ))}
            </div>
            <p className="text-xs text-neutral-500">A {borrador.dpi} dpi, 1 mm = {(borrador.dpi / 25.4).toFixed(1)} puntos: si el recuadro sale 2 mm a la derecha, pon ^LH x = {mmAPuntos(2, borrador.dpi)} menos, o ^LS = {mmAPuntos(2, borrador.dpi)}.</p>
            <button type="submit" className={botonPrimario} data-prueba="guarda-perfil">Guardar perfil</button>
            {aviso ? <p className="text-sm" role="status">{aviso}</p> : null}
          </form>
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className={tarjeta} data-prueba="calibracion-antes">
                <p className="mb-2 text-sm font-semibold">Antes: lo guardado</p>
                {guardada ? <VistaMotorLocal auto zpl={etiquetaCalibracion(perfilParaVistaLocal(guardada), guardada)} perfil={guardada} etiqueta="Calibración con el perfil guardado" /> : <p className="text-sm text-neutral-500">Impresora nueva, sin perfil guardado.</p>}
              </div>
              <div className={tarjeta} data-prueba="calibracion-despues">
                <p className="mb-2 text-sm font-semibold">Después: lo que estás editando</p>
                <VistaMotorLocal auto zpl={etiquetaCalibracion(perfilParaVistaLocal(borrador), borrador)} perfil={borrador} etiqueta="Calibración con los desplazamientos editados" />
              </div>
            </div>
            <div className={tarjeta}><PanelImpresion e={e} zpl={etiquetaCalibracion(borrador)} bloquea={false} sitio={borrador.sitio} impresora={guardada ? borrador.id : ''} copias={1} /></div>
          </div>
        </div>
      ) : <p className="text-sm">No hay impresoras todavía.</p>}
    </div>
  );
}
