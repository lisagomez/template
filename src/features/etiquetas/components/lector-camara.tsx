'use client';

/**
 * Camara del celular con @zxing/browser. Con ASSUME_GS1 el lector entrega `]C1` delante y el
 * separador GS (0x1D) donde el codigo lleva FNC1: exactamente lo que el nucleo sabe parsear.
 * Ademas lee lo que TRAE el proveedor: EAN-13, UPC-A, EAN-8 e ITF-14 (solo de 14: un ITF corto
 * suele ser una lectura parcial). A esos se les pone delante su identificador de simbologia
 * (`]E0`, `]E4`, `]I1`) para que el nucleo sepa que llego igual que de una pistola.
 * La camara pide contexto seguro: localhost o https (en el celular, `npm run dev:movil`).
 */
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

/** El identificador ISO/IEC 15424 que mandaria una pistola con ese codigo. UPC-A viaja como EAN-13 con un 0. */
export function conSimbologia(formato: BarcodeFormat, texto: string): string {
  if (formato === BarcodeFormat.EAN_13) return `]E0${texto}`;
  if (formato === BarcodeFormat.UPC_A) return `]E0${texto.padStart(13, '0')}`;
  if (formato === BarcodeFormat.EAN_8) return `]E4${texto}`;
  if (formato === BarcodeFormat.ITF) return `]I1${texto}`;
  return texto;
}

export function LectorCamara({ alLeer }: { alLeer: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const controles = useRef<IScannerControls | null>(null);
  // La camara llama a la version MAS RECIENTE de alLeer: la pantalla de mover cambia de destino
  // entre lecturas y un cierre viejo moveria al destino anterior.
  const alLeerActual = useRef(alLeer);
  useEffect(() => { alLeerActual.current = alLeer; });
  const ultimo = useRef<{ texto: string; t: number }>({ texto: '', t: 0 });
  const [encendida, setEncendida] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apaga = () => { controles.current?.stop(); controles.current = null; setEncendida(false); };

  const enciende = () => {
    setError(null);
    const pistas = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.ITF]],
      [DecodeHintType.ASSUME_GS1, true],
      [DecodeHintType.ALLOWED_LENGTHS, [14]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 150 });
    lector.decodeFromConstraints({ video: { facingMode: 'environment', width: { ideal: 1280 } } }, video.current ?? undefined, (resultado) => {
      if (!resultado) return;
      const texto = conSimbologia(resultado.getBarcodeFormat(), resultado.getText());
      const t = Date.now();
      if (texto === ultimo.current.texto && t - ultimo.current.t < 2500) return;
      ultimo.current = { texto, t };
      alLeerActual.current(texto);
    }).then((c) => { controles.current = c; setEncendida(true); }, (e: unknown) => setError(e instanceof Error ? `No se pudo abrir la cámara: ${e.message}` : 'No se pudo abrir la cámara'));
  };

  useEffect(() => () => controles.current?.stop(), []);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={video} className="aspect-video w-full object-cover" muted playsInline data-prueba="video" />
        {!encendida ? <div className="absolute inset-0 grid place-items-center text-sm text-neutral-300">Cámara apagada</div> : <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />}
      </div>
      <button type="button" className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white" onClick={encendida ? apaga : enciende} data-prueba="camara">{encendida ? 'Apagar cámara' : 'Encender cámara'}</button>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
