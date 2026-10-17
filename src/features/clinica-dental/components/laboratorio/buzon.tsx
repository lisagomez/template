/**
 * El BUZÓN DE SALIDA simulado (laboratorio): cada correo que el portal «mandó», renderizado desde su `.eml`
 * real — cabeceras (con la baja de un clic de RFC 8058 cuando es masivo), la parte HTML en un iframe sin
 * permisos (`sandbox`), el texto y el `.ics` adjunto. Nada de esto salió de la máquina.
 */
import Link from 'next/link';
import { cumpleRfc8058, leeEml, leeIcs, type Enviado } from '../../../../../tools/clinica-dental/dist/servidor.js';

const CABECERAS = ['From', 'To', 'Subject', 'Date', 'Message-ID', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'List-Id', 'Auto-Submitted'];

export function Buzon({ enviados, elegido }: { enviados: Enviado[]; elegido: string | null }) {
  const lista = [...enviados].reverse();
  const actual = lista.find((e) => e.idMensaje === elegido) ?? lista[0] ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <nav aria-label="Correos enviados" className="max-h-[80vh] overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200">
        <ul className="divide-y divide-slate-100">
          {lista.map((e) => (
            <li key={e.idMensaje}>
              <Link href={`?id=${encodeURIComponent(e.idMensaje)}`} className={`block px-3 py-2 text-sm hover:bg-slate-50 ${actual?.idMensaje === e.idMensaje ? 'bg-slate-100' : ''}`}>
                <span className="block truncate font-medium">{e.asunto}</span>
                <span className="block truncate text-xs text-slate-600">{e.para} · {e.masivo ? 'masivo' : 'transaccional'} · <span className={e.estado === 'rebotado' ? 'text-red-700' : 'text-emerald-700'}>{e.estado}</span></span>
              </Link>
            </li>
          ))}
        </ul>
        {lista.length === 0 ? <p className="p-4 text-sm text-slate-600">Aún no se ha enviado nada.</p> : null}
      </nav>
      {actual ? <Correo e={actual} /> : null}
    </div>
  );
}

function Correo({ e }: { e: Enviado }) {
  const eml = leeEml(e.eml);
  const html = eml.partes.find((p) => p.tipo === 'text/html')?.contenido ?? '';
  const texto = eml.partes.find((p) => p.tipo === 'text/plain')?.contenido ?? '';
  const ics = eml.partes.find((p) => p.nombre?.endsWith('.ics'));
  const props = ics ? leeIcs(ics.contenido) : null;
  const token = /baja\/(tok_[0-9a-f]{20})/.exec(eml.cabeceras['List-Unsubscribe'] ?? '')?.[1];
  return (
    <article className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200" data-correo={e.idMensaje}>
      <header>
        <h2 className="text-lg font-semibold">{eml.cabeceras['Subject']}</h2>
        {e.masivo ? <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cumpleRfc8058(eml.cabeceras) ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{cumpleRfc8058(eml.cabeceras) ? 'Baja de un clic (RFC 8058): cumple' : 'Sin baja de un clic'}</p> : null}
      </header>
      <table className="w-full text-left text-xs"><tbody>
        {CABECERAS.filter((k) => eml.cabeceras[k]).map((k) => <tr key={k} className="align-top"><th className="w-40 py-0.5 pr-2 font-medium text-slate-600">{k}</th><td className="break-all font-mono">{eml.cabeceras[k]}</td></tr>)}
      </tbody></table>
      {token ? <p className="text-xs text-slate-700">En el laboratorio, la URL pública de la baja apunta aquí mismo: <a className="underline" href={`/api/clinica-dental/baja/${token}`}>/api/clinica-dental/baja/{token}</a> (GET pide confirmar; el POST de un clic da de baja).</p> : null}
      <iframe title="Correo renderizado" sandbox="" srcDoc={html} className="h-[34rem] w-full rounded-lg ring-1 ring-slate-200" />
      {props ? (
        <section>
          <h3 className="text-sm font-semibold">Adjunto {ics?.nombre} (RFC 5545)</h3>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-2 font-mono text-xs">{['METHOD', 'UID', 'DTSTART', 'DTEND', 'SUMMARY', 'LOCATION', 'STATUS', 'SEQUENCE'].map((k) => <div key={k} className="contents"><dt className="text-slate-600">{k}</dt><dd className="break-all">{props[k]}</dd></div>)}</dl>
        </section>
      ) : null}
      <details><summary className="cursor-pointer text-sm">Parte de texto</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{texto}</pre></details>
    </article>
  );
}
