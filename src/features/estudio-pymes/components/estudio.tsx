'use client';

/**
 * El estudio de marketing del cliente pyme. Usa SOLO las herramientas que el laboratorio aprobó
 * (la página lo calcula corriendo los casos). Todo corre en el navegador del cliente y nada se
 * publica ni se envía: lo aprobado queda listo para que él lo suba.
 */
import Link from 'next/link';
import { Aviso, Boton } from '@/features/laboratorio-voz/components/ui';
import type { IdHerramienta } from '../../laboratorio-pymes/services/tipos.ts';
import { useEstudio } from '../store/estudio.ts';
import { SeccionAnuncios, SeccionLunes } from './seccion-anuncios-lunes.tsx';
import { SeccionCalendario } from './seccion-calendario.tsx';
import { SeccionCarruseles, SeccionVideo } from './seccion-carruseles-video.tsx';
import { SeccionMarca } from './seccion-marca.tsx';
import { SeccionResenas } from './seccion-resenas.tsx';
import { SeccionVentas } from './seccion-ventas.tsx';
import { SeccionVisibilidad } from './seccion-visibilidad.tsx';
import { Seccion } from './ui-estudio.tsx';

export function Estudio({ aprobadas }: { aprobadas: readonly IdHerramienta[] }) {
  const { cargaEjemplo, ejemplo, ocupado } = useEstudio();
  const ok = (id: IdHerramienta) => aprobadas.includes(id);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6">
      <header className="pr-32">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Estudio de marketing</p>
        <h1 className="text-3xl font-bold">Tu marketing del mes, listo para revisar</h1>
        <p className="mt-2 max-w-3xl text-neutral-700 dark:text-neutral-300">Sube tus facturas y lo que ya tienes. Tus archivos se leen en esta computadora y no salen de aquí. Nada se publica ni se envía: tú apruebas y tú subes.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Boton variante="primario" onClick={() => void cargaEjemplo()} disabled={ocupado} data-prueba="carga-ejemplo">{ocupado ? 'Cargando…' : 'Ver con un negocio de ejemplo'}</Boton>
          <span className="text-neutral-500">Herramientas aprobadas por el <Link className="underline" href="/laboratorio-pymes">laboratorio</Link>: {aprobadas.length} · redactor: plantillas (sin costo, nada sale){aprobadas.includes('redactor-llm') ? '' : ' — el redactor con LLM sigue en laboratorio'}</span>
        </div>
        {ejemplo ? <div className="mt-3"><Aviso tipo="honesto">Estás viendo datos de EJEMPLO: la «Panadería La Espiga» de Puebla no existe; sus facturas, reseñas y anuncios son sintéticos.</Aviso></div> : null}
      </header>
      <Seccion id="marca" titulo="1. Tu marca y tu voz" subtitulo="Con una liga o una frase; tú dices «sí» antes de que se use." aprobada={ok('marca')}><SeccionMarca /></Seccion>
      <Seccion id="ventas" titulo="2. Qué vendes y el brief de 30 días" subtitulo="Tus facturas (XML) o el CSV de tu caja; confirmas precios; sale qué empujar este mes." aprobada={ok('ventas') && ok('contenido')}><SeccionVentas /></Seccion>
      <Seccion id="calendario" titulo="3. Calendario y piezas" subtitulo="Un mes de publicaciones con imagen en tus colores y texto en tu voz." aprobada={ok('contenido')}><SeccionCalendario /></Seccion>
      <Seccion id="carruseles" titulo="3b. Carruseles" subtitulo="Historias de 3 a 6 láminas con tus datos; la primera se entiende sola." aprobada={ok('piezas')}><SeccionCarruseles /></Seccion>
      <Seccion id="video" titulo="3c. Promo en video" subtitulo="Video vertical de 6 s hecho por código, sin grabar a nadie, con tu marca." aprobada={ok('video')}><SeccionVideo /></Seccion>
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950" data-prueba="ir-a-aprobar">
        {ok('aprobacion') ? <Link href="/estudio/aprobar" className="font-semibold underline">Aprobar el mes desde tu celular →</Link> : <span>La aprobación con huella sigue en el laboratorio.</span>}
        <span className="ml-2 text-neutral-600 dark:text-neutral-400">Aprobar no publica: te deja la lista para que tú subas.</span>
      </div>
      <Seccion id="resenas" titulo="4. Lo que dicen tus clientes" subtitulo="Temas con sus palabras y respuestas para aprobar una por una." aprobada={ok('resenas')}><SeccionResenas /></Seccion>
      <Seccion id="visibilidad" titulo="5. Si te encuentran" subtitulo="Buscadores y asistentes de IA: qué arreglar primero y los archivos listos." aprobada={ok('visibilidad')}><SeccionVisibilidad /></Seccion>
      <Seccion id="anuncios" titulo="6. Tus anuncios" subtitulo="Qué funciona y qué quema dinero, con el clic que tú das." aprobada={ok('pulso')}><SeccionAnuncios /></Seccion>
      <Seccion id="lunes" titulo="7. El brief del lunes" subtitulo="Todo junto en una página, con tres acciones y lo que faltó." aprobada={ok('pulso')}><SeccionLunes /></Seccion>
    </main>
  );
}
