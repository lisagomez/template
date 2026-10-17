/**
 * Deja en `public/centro-de-mando/silero/` lo que el HUD necesita para usar Silero en el navegador:
 *
 *  - el WebAssembly de `onnxruntime-web` (copiado del `node_modules`, así sigue a la versión FIJADA en
 *    `package.json`), y
 *  - los pesos de Silero VAD v6.2, de la referencia inmutable y con la huella de `tools/voz/src/node/pesos.ts`.
 *
 *   npm run prepara:silero        (también lo corren `predev` y `prebuild`)
 *
 * La carpeta no se versiona: los pesos son de terceros (MIT) y el WebAssembly sale del paquete instalado.
 * Sin red y sin los pesos, AVISA y sale con 0: el HUD cae a la energía calibrada y lo dice en pantalla, que
 * es mejor que tumbar un `npm run dev` por un detector opcional.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SILERO, verificaHuella } from '../../tools/voz/src/node/pesos.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const destino = join(raiz, 'public', 'centro-de-mando', 'silero');
const RUNTIME = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
const amarillo = (s: string) => `\x1b[33m${s}\x1b[0m`;

function copiaSiCambia(de: string, a: string): void {
  if (existsSync(a) && statSync(a).size === statSync(de).size && statSync(a).mtimeMs >= statSync(de).mtimeMs) return;
  copyFileSync(de, a);
}

function preparaRuntime(): void {
  const dist = join(raiz, 'node_modules', 'onnxruntime-web', 'dist');
  for (const archivo of RUNTIME) copiaSiCambia(join(dist, archivo), join(destino, archivo));
}

/** Los pesos: el de aquí si su huella vale; si no, el del banco de ruido; si no, de la referencia fijada. */
function preparaPesos(): boolean {
  const ruta = join(destino, SILERO.archivo);
  const cache = join(process.env['BANCO_RUIDO'] ?? join(homedir(), '.cache', 'banco-ruido'), 'modelos', SILERO.archivo);
  try {
    if (existsSync(ruta)) {
      verificaHuella(ruta, SILERO.sha256);
      return true;
    }
  } catch {
    // la huella no valía y verificaHuella ya lo borró: se vuelve a traer
  }
  try {
    if (existsSync(cache)) copyFileSync(cache, ruta);
    else execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '60', '-o', ruta, SILERO.url], { stdio: 'ignore' });
    verificaHuella(ruta, SILERO.sha256);
    return true;
  } catch (e) {
    console.log(amarillo(`  ! Silero no quedó preparado (${e instanceof Error ? e.message : 'sin red'}): el HUD usará la energía calibrada y lo dirá`));
    return false;
  }
}

mkdirSync(destino, { recursive: true });
preparaRuntime();
if (preparaPesos()) console.log(`  ✓ Silero listo para el HUD (${SILERO.que}, onnxruntime-web del package.json)`);
