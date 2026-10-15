/**
 * La ejecucion REAL de `gog` (Node): `execFile`, sin shell, con tiempo limite. Vive aparte del nucleo
 * y del adaptador para que nada de `node:child_process` llegue al navegador.
 *
 * `gog` abre su llavero con GOG_KEYRING_PASSWORD. Aqui solo se comprueba que EXISTE: el valor no se
 * lee, no se imprime y no se registra.
 */
import { execFile } from 'node:child_process'
import { ErrorCalendario } from '../errores.js'
import type { EjecutaGog } from './index.js'

export interface OpcionesProceso {
  /** Ruta del binario; por defecto `GOG_BIN` o `gog` en el PATH (la fuente lo buscaba en /opt/homebrew). */
  binario?: string
  timeoutMs?: number
  env?: Record<string, string | undefined>
}

export function ejecutorGog(op: OpcionesProceso = {}): EjecutaGog {
  return (args) => new Promise((resolver, rechazar) => {
    const env = { ...process.env, ...op.env }
    if (!env.GOG_KEYRING_PASSWORD) {
      rechazar(new ErrorCalendario('credencial', 'gog necesita GOG_KEYRING_PASSWORD para abrir su llavero', {
        destraba: 'quien administra la maquina: definir GOG_KEYRING_PASSWORD en el entorno (sin imprimir su valor)',
      }))
      return
    }
    execFile(op.binario ?? env.GOG_BIN ?? 'gog', args, { env, timeout: op.timeoutMs ?? 30_000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) rechazar(new Error(`${error.message}\n${String(stderr).slice(0, 2_000)}`))
      else resolver(String(stdout))
    })
  })
}
