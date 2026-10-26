#!/usr/bin/env node
/**
 * Baja el programa ya compilado de una etiqueta de Arbrain y lo acepta SOLO si su sha256 y su tamaño son los que
 * trae el mensaje de la etiqueta firmada (el Dockerfile ya comprobó esa línea contra la etiqueta verificada).
 * Mismo criterio que `arbrain/scripts/servidor/programa.mjs`: sigue hasta 5 redirecciones (GitHub manda los releases a
 * su CDN), corta si llega más de lo firmado y, si algo no cuadra, borra lo bajado y sale con 1.
 *
 * Uso: baja-programa.mjs <url> <destino> <sha256> <bytes>
 */
import { createHash } from 'node:crypto';
import { createWriteStream, rmSync, statSync } from 'node:fs';
import { get } from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [url, destino, sha256, bytesTexto] = process.argv.slice(2);
const bytes = Number(bytesTexto);
if (!url?.startsWith('https://github.com/arbrain-ai/arbrain/releases/download/') || !/^[0-9a-f]{64}$/.test(sha256 ?? '') || !(bytes > 0)) {
  console.error('uso: baja-programa.mjs <url del release de arbrain-ai/arbrain> <destino> <sha256> <bytes>');
  process.exit(64);
}

function respuesta(direccion, saltos = 0) {
  return new Promise((ok, mal) => {
    const req = get(direccion, { headers: { 'User-Agent': 'cerebro-personal' }, timeout: 60_000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && saltos < 5) {
        res.resume();
        const siguiente = new URL(res.headers.location, direccion);
        if (siguiente.protocol !== 'https:') return mal(new Error('redirección fuera de https'));
        return respuesta(siguiente.toString(), saltos + 1).then(ok, mal);
      }
      if (res.statusCode !== 200) { res.resume(); return mal(new Error(`la descarga respondió ${res.statusCode}`)); }
      ok(res);
    });
    req.on('timeout', () => req.destroy(new Error('la descarga no respondió en 60 s')));
    req.on('error', mal);
  });
}

try {
  const hash = createHash('sha256');
  let llevo = 0;
  const cuenta = new Transform({
    transform(parte, _c, listo) {
      llevo += parte.length;
      if (llevo > bytes) return listo(new Error('llegó más de lo que dice la etiqueta firmada'));
      hash.update(parte);
      listo(null, parte);
    },
  });
  await pipeline(await respuesta(url), cuenta, createWriteStream(destino));
  const obtenido = hash.digest('hex');
  if (obtenido !== sha256 || statSync(destino).size !== bytes) throw new Error('lo que bajó no coincide con la huella firmada');
  console.log(`descarga verificada: ${bytes} bytes, sha256:${obtenido.slice(0, 16)}… = la de la etiqueta firmada`);
} catch (e) {
  rmSync(destino, { force: true });
  console.error(`PROGRAMA_FALLA ${e.message}`);
  process.exit(1);
}
