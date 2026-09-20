'use client';

/** El celular como microfono remoto: la app /dictar, ya construida. Aqui solo se explica y se enlaza. */
import { useSyncExternalStore } from 'react';
import { Aviso, Metrica } from '../ui.tsx';

const nada = () => () => {};
/** La direccion completa solo existe en el navegador: en el servidor se pinta la relativa y se hidrata sin desajuste (React #418). */
const direccionCompleta = () => `${window.location.origin}/dictar`;
const direccionServidor = () => '/dictar';

export function PanelCelular({ token }: { token: string | undefined }) {
  const direccion = useSyncExternalStore(nada, direccionCompleta, direccionServidor);
  return (
    <div className="space-y-3" data-prueba="panel-celular">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metrica nombre="Dirección en el teléfono" valor={direccion} pista="misma red o Tailscale" />
        <Metrica nombre="Este navegador" valor={token ? 'emparejado' : 'sin emparejar'} pista="el teléfono se empareja aparte, una vez" />
        <Metrica nombre="Destinos" valor="PC · pantalla · ambos" pista="a dónde va el texto" />
      </div>
      <ol className="list-inside list-decimal space-y-1 text-sm">
        <li>En el teléfono abre la dirección de arriba (con Tailscale en verde, o en la misma wifi).</li>
        <li>Empareja una vez: escanea el QR o teclea el token. Luego «Añadir a inicio» para instalarla.</li>
        <li>Elige destino y dicta. Con «A la PC» el texto aparece donde esté el cursor de Windows.</li>
      </ol>
      <a href="/dictar" className="inline-block text-sm underline">Abrir /dictar en este navegador</a>
      <Aviso tipo="honesto">Ni iPhone ni Android dejan que una app web flote encima de otras apps. El botón flota dentro de la app instalada, que a pantalla completa se siente como una app.</Aviso>
    </div>
  );
}
