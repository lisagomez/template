/**
 * La GUARDIA DE RED del servidor del laboratorio: cada `fetch` que hace el proceso anota su host (solo el host:
 * ni ruta, ni cuerpo, ni cabeceras) en `red-servidor.json`. Sirve de evidencia de que el canal de WhatsApp no salio
 * a Meta: lo unico que el servidor debe tocar fuera de la maquina es OpenRouter (el cerebro del asistente).
 * Se instala una vez por proceso y solo en el laboratorio.
 */
import { writeFile } from 'node:fs/promises';
import { RUTAS } from './datos';

const g = globalThis as unknown as { __clinicaRed?: Map<string, number> };

export function vigilaRed(): void {
  if (g.__clinicaRed) return;
  const hosts = new Map<string, number>();
  g.__clinicaRed = hosts;
  const original = globalThis.fetch.bind(globalThis);
  let guardado: Promise<void> = Promise.resolve();
  globalThis.fetch = (async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const host = (() => { try { return new URL(url).host; } catch { return 'relativa'; } })();
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
    guardado = guardado.then(() => writeFile(/*turbopackIgnore: true*/ RUTAS.red, JSON.stringify(Object.fromEntries(hosts), null, 1))).catch(() => undefined);
    return original(entrada, init);
  }) as typeof fetch;
}
