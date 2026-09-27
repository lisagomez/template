'use client';

/**
 * Tomar la foto de la caducidad: camara trasera con una GUIA de encuadre (lo que esta dentro del
 * recuadro es lo que se lee: medido, leer la foto entera hace que un modelo invente) y RAFAGA de
 * cinco cuadros mientras la persona gira la botella; se quedan los dos mas nitidos (varianza del
 * laplaciano dentro de la guia) para cotejarlos. Sin camara (http, permiso negado), se sube un
 * archivo y se lee entero.
 */
import { useEffect, useRef, useState } from 'react';
import type { Rectangulo } from '../../../../tools/etiquetas-gs1/dist/imagenes.js';
import { boton, botonPrimario } from './marco.tsx';

export const GUIA: Rectangulo = { x: 0.08, y: 0.36, ancho: 0.84, alto: 0.28 };
const RAFAGA = 5;

/** Nitidez: varianza del laplaciano en la zona de la guia, sobre una version chica en grises. */
export function nitidez(c: HTMLCanvasElement, g: Rectangulo): number {
  const w = 240;
  const h = Math.max(8, Math.round((w * c.height * g.alto) / (c.width * g.ancho)));
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  const ctx = t.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(c, g.x * c.width, g.y * c.height, g.ancho * c.width, g.alto * c.height, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gris = (x: number, y: number) => { const i = (y * w + x) * 4; return 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!; };
  let suma = 0; let suma2 = 0; let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const l = 4 * gris(x, y) - gris(x - 1, y) - gris(x + 1, y) - gris(x, y - 1) - gris(x, y + 1);
    suma += l; suma2 += l * l; n++;
  }
  return n ? suma2 / n - (suma / n) ** 2 : 0;
}

const cuadro = (v: HTMLVideoElement): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  return c;
};
const aJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('no se pudo codificar la foto'))), 'image/jpeg', 0.92));

export interface Captura { readonly fotos: readonly Blob[]; readonly zona: Rectangulo; readonly nitidez?: readonly number[] }

export function CamaraFoto({ alCapturar, texto = 'Tomar la foto (ráfaga)', guia = GUIA }: { alCapturar: (c: Captura) => void; texto?: string; guia?: Rectangulo }) {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tomando, setTomando] = useState(false);

  const apaga = () => { flujo.current?.getTracks().forEach((t) => t.stop()); flujo.current = null; setLista(false); };
  const enciende = () => {
    setError(null);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then((s) => {
      flujo.current = s;
      if (video.current) { video.current.srcObject = s; void video.current.play(); }
      setLista(true);
    }, (e: unknown) => setError(e instanceof Error ? `No se pudo abrir la cámara: ${e.message}. Puedes subir una foto.` : 'No se pudo abrir la cámara'));
  };
  useEffect(() => () => flujo.current?.getTracks().forEach((t) => t.stop()), []);

  const rafaga = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setTomando(true);
    try {
      const cuadros: { c: HTMLCanvasElement; n: number }[] = [];
      for (let i = 0; i < RAFAGA; i++) {
        const c = cuadro(v);
        cuadros.push({ c, n: nitidez(c, guia) });
        await new Promise((ok) => setTimeout(ok, 220));
      }
      const mejores = [...cuadros].sort((a, b) => b.n - a.n).slice(0, 2);
      alCapturar({ fotos: await Promise.all(mejores.map((m) => aJpeg(m.c))), zona: guia, nitidez: mejores.map((m) => Math.round(m.n)) });
      apaga();
    } finally { setTomando(false); }
  };

  return (
    <div className="space-y-2" data-prueba="camara-foto">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={video} className="aspect-video w-full object-cover" muted playsInline data-prueba="video-foto" />
        <div className="pointer-events-none absolute rounded-md border-4 border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ left: `${guia.x * 100}%`, top: `${guia.y * 100}%`, width: `${guia.ancho * 100}%`, height: `${guia.alto * 100}%` }} data-prueba="guia" />
        {!lista ? <div className="absolute inset-0 grid place-items-center text-sm text-neutral-300">Cámara apagada</div> : <p className="absolute inset-x-0 bottom-1 text-center text-xs font-semibold text-amber-200">Solo la fecha (y el lote) dentro del recuadro</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={boton} onClick={lista ? apaga : enciende} data-prueba="camara-foto-encender">{lista ? 'Apagar cámara' : 'Encender cámara'}</button>
        <button type="button" className={botonPrimario} onClick={() => void rafaga()} disabled={!lista || tomando} data-prueba="tomar-foto">{tomando ? 'Tomando…' : texto}</button>
        <label className={`${boton} cursor-pointer`}>Subir una foto
          <input type="file" accept="image/*" capture="environment" className="sr-only" data-prueba="subir-foto" onChange={(x) => { const f = x.target.files?.[0]; if (f) alCapturar({ fotos: [f], zona: { x: 0, y: 0, ancho: 1, alto: 1 } }); x.target.value = ''; }} />
        </label>
      </div>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
