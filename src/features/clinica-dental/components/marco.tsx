/**
 * El marco del portal de UNA clinica: su marca (colores como variables CSS), la navegacion, el pie con el aviso
 * de privacidad y la marca de «clinica sintetica». Componente de servidor.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { Clinica } from '../../../../tools/clinica-dental/dist/index.js';
import { horarioEnPalabras } from '../../../../tools/clinica-dental/dist/index.js';
import { salir } from '../services/servidor/acciones';
import { Asistentes } from './asistente/asistentes';
import { Cookies } from './cookies';

export function estiloDeMarca(c: Clinica): CSSProperties {
  return { ['--c1' as string]: c.marca.primario, ['--c2' as string]: c.marca.acento, ['--c0' as string]: c.marca.fondo };
}

export function Marco({ clinica: c, conSesion, children }: { clinica: Clinica; conSesion: boolean; children: ReactNode }) {
  const base = `/clinica/${c.id}`;
  return (
    <div lang="es-MX" style={estiloDeMarca(c)} className="flex min-h-screen flex-col bg-[color:var(--c0)] text-slate-900">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Saltar al contenido
      </a>
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={base} className="flex items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c1)]">
            <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--c1)] text-lg font-bold text-white">{c.marca.inicial}</span>
            <span className="leading-tight">
              <span className="block font-semibold">{c.nombre}</span>
              <span className="block text-xs text-slate-600">{c.lema}</span>
            </span>
          </Link>
          <nav aria-label="Principal" className="flex flex-wrap items-center gap-1 text-sm">
            <Link className="rounded-md px-3 py-2 hover:bg-slate-100" href={`${base}/agenda`}>Agendar cita</Link>
            {conSesion ? (
              <>
                <Link className="rounded-md px-3 py-2 hover:bg-slate-100" href={`${base}/mis-citas`}>Mis citas</Link>
                <form action={salir.bind(null, c.id)}>
                  <button type="submit" className="rounded-md px-3 py-2 hover:bg-slate-100">Salir</button>
                </form>
              </>
            ) : (
              <Link className="rounded-md bg-[color:var(--c1)] px-3 py-2 font-medium text-white hover:opacity-90" href={`${base}/entrar`}>Entrar</Link>
            )}
          </nav>
        </div>
      </header>
      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6">{children}</main>
      <footer className="border-t border-slate-200 bg-white text-sm text-slate-700">
        <div className="mx-auto grid max-w-5xl gap-2 px-4 py-5 sm:grid-cols-2">
          <p>
            {c.direccion}
            <br />
            Teléfono: <a className="underline" href={`tel:${c.telefono.replace(/\s/g, '')}`}>{c.telefono}</a>
          </p>
          <p>
            Horario: {horarioEnPalabras(c)}.
            <br />
            <Link className="underline" href={`${base}/privacidad`}>Aviso de privacidad (borrador)</Link> · Clínica sintética del laboratorio: no atiende pacientes reales.
          </p>
        </div>
      </footer>
      {/* Dentro del contenedor de la marca: los interruptores y el chat usan sus colores (--c1, --c2, --c0). */}
      <Cookies clinica={c.id} />
      <Asistentes clinica={c.id} conSesion={conSesion} />
    </div>
  );
}
