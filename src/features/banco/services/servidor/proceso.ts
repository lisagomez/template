/**
 * Ejecutor de `motorPorProceso` que obedece a cancelar. El del extractor no recibe señal
 * (`OpcionesDeEjecucion` no la tiene), y cancelar en el banco dejaba a Tesseract corriendo hasta su tope de
 * 120 s. Este lanza el proceso en su PROPIO grupo y, al cancelar o al topar, mata el grupo entero: el script
 * de Python lanza a su vez el binario de Tesseract (pytesseract), y matar solo al padre deja vivo al nieto.
 *
 * Entra por el punto de inyección que el extractor documenta (`ejecuta`), así que el resto del adaptador
 * —temporal 0700 borrado siempre, errores sin stdout, validación de páginas— sigue siendo el suyo. Llevar la
 * señal al propio extractor es el arreglo de fondo; toca una herramienta empaquetada y va aparte.
 */
import { spawn } from 'node:child_process';
import type { Ejecutor } from '../../../../../tools/extractor-documental/dist/motores/proceso-local.js';

export function ejecutorConSenal(signal: AbortSignal): Ejecutor {
  return (comando, argumentos, { entorno, milisegundosDeEspera }) =>
    new Promise((resuelve, rechaza) => {
      if (signal.aborted) return rechaza(new Error('cancelada'));
      const hijo = spawn(comando, [...argumentos], { env: { ...process.env, ...entorno }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      let stdout = '';
      let stderr = '';
      let cortado = false;
      const mataGrupo = () => {
        try {
          if (hijo.pid) process.kill(-hijo.pid, 'SIGKILL');
        } catch {
          // El grupo ya terminó.
        }
      };
      const temporizador = setTimeout(() => {
        cortado = true;
        mataGrupo();
      }, milisegundosDeEspera);
      signal.addEventListener('abort', mataGrupo, { once: true });
      const limpia = () => {
        clearTimeout(temporizador);
        signal.removeEventListener('abort', mataGrupo);
      };
      hijo.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
      hijo.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
      hijo.on('error', (error) => { limpia(); rechaza(error); });
      hijo.on('close', (codigo) => {
        limpia();
        if (signal.aborted) rechaza(new Error('cancelada'));
        else resuelve({ codigo, stdout, stderr, cortado });
      });
    });
}
