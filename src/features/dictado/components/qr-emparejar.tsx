'use client';

/**
 * Emparejar otro dispositivo con un QR dibujado AQUI, en un navegador ya emparejado: el token
 * sale de localStorage al SVG y a ningun sitio mas (ni servidor, ni red). Quien escanee el
 * codigo queda emparejado, por eso se muestra solo al pedirlo y con el aviso a la vista.
 */
import { useState } from 'react';
import { renderSVG } from 'uqr';
import { enlaceDeEmparejar } from '../services/enlace-emparejar';

export function QrEmparejar({ token, ruta, className = '' }: { token: string | undefined; ruta: string; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!token) return null;
  const enlace = abierto && typeof window !== 'undefined' ? enlaceDeEmparejar(window.location.origin, ruta, token) : undefined;
  return (
    <div className={className} data-prueba="qr-emparejar">
      <button type="button" onClick={() => setAbierto((a) => !a)} className="text-xs text-neutral-500 underline">
        {abierto ? 'ocultar el QR' : 'emparejar otro dispositivo (QR)'}
      </button>
      {enlace ? (
        <div className="mt-2 inline-flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-neutral-950">
          <div
            className="h-48 w-48 [&>svg]:h-full [&>svg]:w-full"
            aria-label="Codigo QR para emparejar otro dispositivo"
            data-prueba="qr-svg"
            // El SVG lo genera uqr a partir del enlace: solo cuadrados, sin texto ni scripts.
            dangerouslySetInnerHTML={{ __html: renderSVG(enlace, { border: 2, pixelSize: 4 }) }}
          />
          <p className="text-center text-xs text-neutral-600 dark:text-neutral-300">
            Escanéalo con la cámara del teléfono: abre <strong>{ruta}</strong> ya emparejado.
          </p>
          <p className="text-center text-[11px] text-amber-700 dark:text-amber-300">
            Quien escanee este código queda emparejado. Muéstralo solo a tu propio teléfono y ciérralo después.
          </p>
        </div>
      ) : null}
    </div>
  );
}
