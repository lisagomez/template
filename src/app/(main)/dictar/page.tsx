'use client';

/**
 * /dictar — la superficie movil del dictado (y start_url de la PWA instalada).
 * Sin emparejar: pide el token UNA vez (jamas se muestra). Emparejado: el boton flotante
 * graba con el microfono del telefono, el pipeline propio transcribe, y el texto va al
 * cursor de la PC, a esta pantalla, o a ambos.
 */
import { useEffect, useState } from 'react';
import { BotonDictado } from '@/features/dictado/components/boton-dictado';
import { QrEmparejar } from '@/features/dictado/components/qr-emparejar';
import { BotonFlotanteMovil } from '@/features/dictado/components/boton-flotante-movil';
import { useGrabadora } from '@/features/dictado/hooks/use-grabadora';
import { useDictadoMovil, type Destino } from '@/features/dictado/store/movil';

const DESTINOS: Array<{ valor: Destino; nombre: string; pista: string }> = [
  { valor: 'pc', nombre: 'A la PC', pista: 'el texto aparece donde este el cursor de Windows' },
  { valor: 'pantalla', nombre: 'Aqui', pista: 'el texto aparece abajo, con copiar' },
  { valor: 'ambos', nombre: 'Ambos', pista: 'cursor de la PC y esta pantalla' },
];

export default function PaginaDictar() {
  const movil = useDictadoMovil();
  const grabadora = useGrabadora();
  const [tokenTecleado, setTokenTecleado] = useState('');
  const [copiado, setCopiado] = useState<string | undefined>(undefined);
  const [motorResidente, setMotorResidente] = useState<boolean | undefined>(undefined);
  const [micElegido, setMicElegido] = useState<string>(() => {
    try {
      return localStorage.getItem('dictado.mic') ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    // El motor residente responde en ~300 ms por frase; sin el, cada frase arranca el motor (~3 s).
    fetch('/api/laboratorio/estado', { cache: 'no-store' })
      .then((r) => r.json())
      .then((e: { demonio?: boolean }) => setMotorResidente(Boolean(e.demonio)))
      .catch(() => setMotorResidente(false));
    movil.carga();
    // Emparejamiento por QR: el token viaja en la URL. Se prefiere el FRAGMENTO (#t=), que
    // nunca se manda al servidor; se acepta tambien el query (?t=) porque algun escaner de
    // camara no propaga el fragmento. En ambos casos se empareja y se BORRA de la barra al
    // instante. Evita teclear 32 caracteres en el telefono, donde el campo se borra solo (iOS).
    const m = /[#?&]t=([^&]+)/.exec(window.location.hash + window.location.search);
    if (m?.[1]) {
      void movil.empareja(decodeURIComponent(m[1]));
      history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eligeMic = (id: string) => {
    setMicElegido(id);
    try {
      localStorage.setItem('dictado.mic', id);
    } catch {
      /* nada */
    }
  };

  const alTocarBoton = async () => {
    if (grabadora.grabando) {
      const audio = await grabadora.termina();
      if (audio) await movil.transcribe(audio);
      return;
    }
    await grabadora.empieza(micElegido || undefined);
  };

  const copia = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(undefined), 1_500);
    } catch {
      /* sin clipboard: el texto sigue visible */
    }
  };

  if (!movil.token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">Emparejar dictado</h1>
        <p className="text-sm text-neutral-500">
          Teclea el token de emparejamiento UNA vez (esta en el <code>.env.local</code> de tu PC como{' '}
          <code>DICTADO_MOVIL_TOKEN</code>). No se muestra ni viaja a ningun tercero.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={tokenTecleado}
            onChange={(e) => setTokenTecleado(e.target.value.trim())}
            placeholder="token"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-3 font-mono dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                setTokenTecleado((await navigator.clipboard.readText()).trim());
              } catch {
                /* sin permiso de portapapeles: se pega a mano */
              }
            }}
            className="rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700"
          >
            Pegar
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          {tokenTecleado.length} caracteres {tokenTecleado.length === 32 ? '✓ (completo)' : '(deben ser 32)'}
        </p>
        <button
          type="button"
          onClick={() => void movil.empareja(tokenTecleado.trim())}
          disabled={tokenTecleado.trim().length < 16}
          className="rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          Emparejar
        </button>
        {movil.error ? <p className="text-sm text-red-500">{movil.error}</p> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-4 pb-40">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Dictado</h1>
        <BotonDictado />
      </header>

      <div className="mb-2 grid grid-cols-3 gap-1 rounded-full border border-neutral-300 p-1 dark:border-neutral-700">
        {DESTINOS.map((d) => (
          <button
            key={d.valor}
            type="button"
            onClick={() => movil.eligeDestino(d.valor)}
            className={`rounded-full px-2 py-2 text-sm transition ${movil.destino === d.valor ? 'bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900' : 'text-neutral-600 dark:text-neutral-300'}`}
          >
            {d.nombre}
          </button>
        ))}
      </div>
      <p className="mb-2 text-center text-xs text-neutral-500">{DESTINOS.find((d) => d.valor === movil.destino)?.pista}</p>
      <p className="mb-4 flex items-center justify-center gap-1 text-xs text-neutral-500" data-prueba="motor" data-vivo={String(motorResidente ?? false)}>
        <span className={`h-2 w-2 rounded-full ${motorResidente ? 'bg-emerald-500' : motorResidente === false ? 'bg-neutral-400' : 'bg-amber-400 animate-pulse'}`} />
        {motorResidente === undefined ? 'comprobando el motor…' : motorResidente ? 'motor listo: cada frase tarda menos de un segundo' : 'motor arrancando por frase: unos 3 segundos cada una'}
      </p>

      <div className="mb-3 flex items-center gap-2">
        <select
          value={micElegido}
          onChange={(e) => eligeMic(e.target.value)}
          onFocus={() => void grabadora.listaMicrofonos()}
          className="min-w-0 flex-1 truncate rounded-lg border border-neutral-300 px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">Micrófono automático</option>
          {grabadora.microfonos.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void grabadora.listaMicrofonos()}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
        >
          Ver micrófonos
        </button>
      </div>
      {grabadora.micUsado ? <p className="mb-2 text-xs text-neutral-400">grabando de: {grabadora.micUsado}</p> : null}
      {grabadora.error ? <p className="mb-2 text-sm text-red-500">{grabadora.error}</p> : null}
      {movil.error ? <p className="mb-2 text-sm text-amber-600">{movil.error}</p> : null}

      <ul className="space-y-2">
        {movil.transcripciones.map((t) => (
          <li key={t.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-sm">{t.texto}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <span>{t.ms} ms</span>
              <button type="button" onClick={() => void copia(t.texto, t.id)} className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
                {copiado === t.id ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {movil.transcripciones.length === 0 ? (
        <p className="mt-10 text-center text-sm text-neutral-400">Toca el boton y dicta. {movil.destino === 'pc' ? 'El texto aparecera en el cursor de tu PC.' : ''}</p>
      ) : null}

      <BotonFlotanteMovil grabando={grabadora.grabando} transcribiendo={movil.transcribiendo} alTocar={() => void alTocarBoton()} />

      <footer className="mt-10 flex flex-col items-center gap-2 text-center">
        <QrEmparejar token={movil.token} ruta="/dictar" />
        <button type="button" onClick={() => movil.olvida()} className="text-xs text-neutral-400 underline">
          Olvidar emparejamiento
        </button>
      </footer>
    </main>
  );
}
