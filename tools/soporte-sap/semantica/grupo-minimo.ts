/**
 * D14: qué agregados ve el laboratorio. Se decide al GENERAR el corte, no en las superficies, que solo leen la marca
 * (`visibleAlLaboratorio`). En la base, la misma regla la aplica `ss_priv.grupo_visible_al_laboratorio`.
 *
 * Un grupo (el total, una consultora o un tamaño, en un periodo) se ve si tiene GRUPO_MINIMO clientes o más
 * (`clientes_en_cartera`, sumado por etapa), y si lo suprimido de su partición (las consultoras, o los tamaños, de ese
 * periodo) suma 0 o GRUPO_MINIMO o más. Si sumara 1 o 2, se despejaría restando del total, y la partición entera se
 * suprime. Sin el conteo del grupo, no se ve.
 */
import { GRUPO_MINIMO, type FilaDelCorte } from '../src/corte.ts'

const clave = (f: Pick<FilaDelCorte, 'periodo' | 'alcance' | 'tamano' | 'consultora'>) => `${f.periodo}|${f.alcance}|${f.tamano}|${f.consultora}`

export function marcaLoQueVeElLaboratorio(filas: readonly FilaDelCorte[]): FilaDelCorte[] {
  const clientes = new Map<string, number>()
  for (const f of filas) {
    if (f.metrica !== 'clientes_en_cartera' || f.alcance === 'cliente' || f.etapa === null) continue
    clientes.set(clave(f), (clientes.get(clave(f)) ?? 0) + (f.valor ?? 0))
  }
  const chicos = new Map<string, number>()
  for (const [k, n] of clientes) {
    if (n >= GRUPO_MINIMO) continue
    const particion = k.split('|').slice(0, 2).join('|')
    chicos.set(particion, (chicos.get(particion) ?? 0) + n)
  }
  return filas.map((f) => {
    if (f.alcance === 'cliente') return f
    const suprimidos = chicos.get(`${f.periodo}|${f.alcance}`) ?? 0
    return { ...f, visibleAlLaboratorio: (clientes.get(clave(f)) ?? 0) >= GRUPO_MINIMO && !(suprimidos >= 1 && suprimidos < GRUPO_MINIMO) }
  })
}
