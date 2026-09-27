'use client';

/** Marca y voz: una liga o una frase, la vista previa sobre componentes reales, y el «sí». */
import { useState } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import type { PerfilDeMarca } from '../../../../tools/pymes-marketing/dist/marca/index.js';
import { useEstudio } from '../store/estudio.ts';
import { AreaDeTexto, Lista, Pastilla } from './ui-estudio.tsx';

function VistaPrevia({ m }: { m: PerfilDeMarca }) {
  const c = m.colores;
  return (
    <div data-prueba="vista-previa-marca" className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800" style={{ background: c.fondo, color: c.texto, fontFamily: m.tipografia.cuerpo }}>
      <div className="p-4" style={{ borderTop: `6px solid ${c.primario}` }}>
        <p className="text-xs uppercase tracking-widest opacity-70">Vista previa</p>
        <h3 className="text-2xl font-bold" style={{ color: c.primario, fontFamily: m.tipografia.titulos }}>{m.nombre}</h3>
        {m.lema ? <p className="text-sm opacity-80">{m.lema}</p> : null}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-4">
          <div className="rounded-lg px-3 py-2 text-white" style={{ background: c.primario }}><p className="text-[10px] uppercase opacity-80">Cifra de ejemplo</p><p className="text-xl font-bold tabular-nums">$12,400</p></div>
          <table className="text-sm"><tbody>
            <tr><td className="pr-3">Tu producto estrella</td><td className="tabular-nums">$4,800</td><td><span className="rounded-full px-2 text-xs" style={{ background: c.secundario, color: c.texto }}>sube</span></td></tr>
            <tr><td className="pr-3">Tu producto de temporada</td><td className="tabular-nums">$2,150</td><td><span className="rounded-full px-2 text-xs" style={{ background: c.secundario, color: c.texto }}>temporada</span></td></tr>
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

function Captura() {
  const { marcaDeFrase, marcaDeSitio } = useEstudio();
  const [frase, setFrase] = useState(''), [nombre, setNombre] = useState(''), [html, setHtml] = useState(''), [url, setUrl] = useState('');
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2"><p className="text-sm font-semibold">Con una frase</p>
        <input className="w-full rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" placeholder="Nombre del negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="w-full rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" placeholder="«verde bosque y crema, algo rústico»" value={frase} onChange={(e) => setFrase(e.target.value)} />
        <Boton onClick={() => marcaDeFrase(frase, nombre)} disabled={!frase.trim()}>Ver cómo queda</Boton></div>
      <div className="space-y-2"><p className="text-sm font-semibold">Con tu página (pega su HTML)</p>
        <input className="w-full rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" placeholder="https://tu-negocio.mx" value={url} onChange={(e) => setUrl(e.target.value)} />
        <AreaDeTexto valor={html} cambia={setHtml} filas={3} marcador="Ctrl+U en tu página, copia y pega aquí" />
        <Boton onClick={() => marcaDeSitio(html, url)} disabled={!html.trim()}>Leer mi página</Boton></div>
    </div>
  );
}

function Voz() {
  const { voz, muestras, contacto, fijaVoz } = useEstudio();
  const [texto, setTexto] = useState(muestras), [tel, setTel] = useState(contacto);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Tu voz: pega 3 a 10 mensajes que tú escribiste, separados por una línea en blanco</p>
      <AreaDeTexto valor={texto} cambia={setTexto} filas={4} />
      <input className="w-full rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" placeholder="Tu WhatsApp o teléfono del negocio (para «escríbenos»)" value={tel} onChange={(e) => setTel(e.target.value)} />
      <Boton onClick={() => fijaVoz(texto, tel)} disabled={!texto.trim()}>Aprender mi voz</Boton>
      {voz.muestras > 0 ? <p className="text-sm" data-prueba="voz">Trato de <b>{voz.trato === 'usted' ? 'usted' : 'tú'}</b> · saludo «{voz.saludo ?? '—'}» · despedida «{voz.despedida ?? '—'}» · emojis {voz.emojis} · ~{voz.palabrasPorFrase} palabras por frase · nunca usas: {voz.nuncaUsa.slice(0, 4).join(', ')}…</p> : null}
    </div>
  );
}

export function SeccionMarca() {
  const { marca, confirmaMarca, ajustaMarca, muestras } = useEstudio();
  return (
    <div className="space-y-5">
      <Captura />
      {marca ? (
        <div className="grid gap-3 md:grid-cols-2">
          <VistaPrevia m={marca} />
          <div className="space-y-2 text-sm">
            <p>¿Así? {marca.confirmado ? <Pastilla tono="bien">confirmada: todas tus piezas la usan</Pastilla> : <Pastilla tono="revisar">falta tu «sí»</Pastilla>}</p>
            <div className="flex flex-wrap gap-2"><Boton variante="primario" onClick={confirmaMarca} data-prueba="confirma-marca">Sí, así</Boton><Boton onClick={() => ajustaMarca('mas-oscuro')}>Más oscuro</Boton><Boton onClick={() => ajustaMarca('mas-claro')}>Más claro</Boton></div>
            <p className="text-xs text-neutral-500">Colores {marca.colores.primario} · {marca.colores.secundario} · fondo {marca.colores.fondo} · letra {marca.tipografia.titulos.split(',')[0]} · origen: {marca.origen}</p>
            <Lista titulo="Notas" elementos={marca.notas} />
          </div>
        </div>
      ) : null}
      <Voz key={muestras.length} />
    </div>
  );
}
