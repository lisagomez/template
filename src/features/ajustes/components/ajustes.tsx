'use client';

/**
 * /ajustes: lo que la persona decide una vez y la maquina recuerda. Emparejamiento como
 * /dictar; los grupos del esquema con cada ajuste y su origen; el catalogo de motores medido
 * aqui dentro del grupo Motor; «sin proveedor» en gris; y abajo, donde vive el archivo y el
 * boton de restablecer con doble confirmacion.
 */
import { useMemo, useState } from 'react';
import { Emparejar } from '@/features/laboratorio-voz/components/emparejar';
import { useAjustes } from '../hooks/use-ajustes.ts';
import { agrupaCampos, cuentaCambiados } from '../services/presenta.ts';
import { CampoAjuste } from './campo-ajuste.tsx';
import { Catalogo } from './catalogo.tsx';

const boton = 'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800';

export function Ajustes() {
  const a = useAjustes();
  const [pasoRestablecer, setPasoRestablecer] = useState<0 | 1>(0);
  const grupos = useMemo(() => (a.estado ? agrupaCampos(a.estado.esquema, a.estado.grupos) : []), [a.estado]);
  const token = a.token;
  const estado = a.estado;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-6">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Dictado</p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Ajustes</h1>
          <nav className="flex gap-3 text-sm">
            <a href="/historial" className="underline">Historial</a>
            <a href="/dictar" className="underline">Dictar desde el celular</a>
            <a href="/laboratorio-voz" className="underline">Laboratorio de voz</a>
          </nav>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Lo que decides aquí se guarda en esta computadora y el dictado lo recuerda. Cada valor dice de dónde sale: una bandera de esta sesión, el entorno, lo guardado o el defecto. Nada sale de aquí.</p>
      </header>

      {!token ? (
        <Emparejar empareja={a.movil.empareja} error={a.movil.error} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {estado ? <span className="text-neutral-500" data-prueba="cuenta">{cuentaCambiados(estado.ajustes)} ajuste{cuentaCambiados(estado.ajustes) === 1 ? '' : 's'} fuera del defecto</span> : null}
            {a.aviso ? <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-white dark:bg-white dark:text-neutral-900" data-prueba="aviso" role="status">{a.aviso}</span> : null}
          </div>
          {a.error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="alert">{a.error}</p> : null}
          {estado?.avisos.map((v) => <p key={v} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" data-prueba="aviso-archivo">{v}</p>)}
          {a.cargando && !estado ? <p className="text-sm text-neutral-500">Leyendo los ajustes…</p> : null}

          {estado
            ? grupos.map(({ grupo, campos }) => (
                <section key={grupo.id} data-prueba="grupo" data-grupo={grupo.id}>
                  <h2 className="text-base font-semibold">{grupo.titulo}</h2>
                  {grupo.nota ? <p className="text-xs text-neutral-500">{grupo.nota}</p> : null}
                  {grupo.id === 'motor' ? <Catalogo catalogo={estado.catalogo} medicion={estado.medicion} motorActual={String(estado.ajustes['motor']?.valor ?? '')} /> : null}
                  <ul className="mt-3 space-y-2">
                    {campos.map((c) => {
                      const v = estado.ajustes[c.clave];
                      if (!v) return null;
                      return (
                        <CampoAjuste
                          key={c.clave}
                          campo={c}
                          valor={v}
                          motoresInstalados={estado.motoresInstalados}
                          error={a.erroresCampo[c.clave]}
                          guardando={a.guardando === c.clave}
                          alGuardar={(valor) => a.pon(c.clave, valor)}
                          alQuitar={() => a.quita(c.clave)}
                        />
                      );
                    })}
                  </ul>
                </section>
              ))
            : null}

          {estado ? (
            <footer className="rounded-xl border border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-800" data-prueba="pie">
              <p>Archivo: <code>{estado.ruta}</code>{estado.existe ? ` · versión ${estado.version}` : ' · todavía no existe (todo por defecto)'}. Lo mismo desde la terminal: <code>dictado ajustes</code>. El token de emparejamiento no vive ahí.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {pasoRestablecer === 0 ? (
                  <button type="button" onClick={() => setPasoRestablecer(1)} className={boton} data-prueba="restablecer">Restablecer todo…</button>
                ) : (
                  <>
                    <span className="text-red-600 dark:text-red-400">¿Volver todos los ajustes a su defecto?</span>
                    <button type="button" onClick={() => { setPasoRestablecer(0); void a.restablece(); }} className={`${boton} border-red-300 text-red-700 dark:border-red-800 dark:text-red-300`} data-prueba="restablecer-si">Sí, restablecer</button>
                    <button type="button" onClick={() => setPasoRestablecer(0)} className={boton}>Cancelar</button>
                  </>
                )}
              </div>
            </footer>
          ) : null}
        </div>
      )}
    </main>
  );
}
