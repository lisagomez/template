/**
 * El calendario del laboratorio para el vigía: `tools/calendario` (su pluma idempotente por clave) sobre su simulador
 * de Google, en memoria. Nada sale de la máquina y no se avisa a nadie (el simulador no tiene invitados reales).
 * Solo el laboratorio lo importa: el núcleo de Ágora recibe el calendario inyectado.
 */
import { Lector, Pluma, sincroniza, type RefCalendario } from '../../../calendario/dist/index.js'
import { SimuladorGoogle } from '../../../calendario/dist/simulador/index.js'
import { AlmacenEnMemoria } from '../../../calendario/dist/almacenes/memoria.js'
import type { PuertoCalendario } from '../vigia.js'
import { sumaDias } from '../fechas.js'

const ZONA = 'America/Mexico_City'
const REF: RefCalendario = { cuenta: 'vigia@agora-laboratorio.example', calendario: 'fechas' }

export function calendarioDeLaboratorio(): { puerto: PuertoCalendario; eventos(): Promise<number>; creaciones: () => number } {
  const reloj = { ahora: () => Date.now(), espera: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }
  const sim = new SimuladorGoogle({ reloj })
  const almacen = new AlmacenEnMemoria()
  const pluma = new Pluma({ proveedor: sim, almacen, reloj })
  const lector = new Lector({ almacen, reloj })
  sim.agregaCalendario({ cuenta: REF.cuenta, id: REF.calendario, nombre: 'Fechas de Ágora', color: '#2a5db0', zona: ZONA, rol: 'propietario', principal: true, visible: true })
  const listo = sincroniza({ proveedor: sim, almacen, reloj }, REF)
  let creaciones = 0
  return {
    puerto: {
      async crea({ clave, titulo, dia }) {
        await listo
        creaciones++
        const r = await pluma.crea(REF, { titulo, inicio: dia, fin: sumaDias(dia, 1), zona: ZONA, todoElDia: true }, { clave })
        return { ref: r.eventos[0]?.id ?? clave }
      },
    },
    async eventos() {
      await listo
      return (await lector.consulta({ calendarios: [REF], desde: Date.now() - 400 * 864e5, hasta: Date.now() + 400 * 864e5, zona: ZONA })).instancias.length
    },
    creaciones: () => creaciones,
  }
}
