/**
 * El negocio ficticio: una distribuidora de abarrotes con proveedores, productos y facturas.
 *
 * QUE ES Y QUE NO ES. Estos datos son SINTETICOS de arriba abajo — ni una empresa real, ni un RFC
 * de nadie, ni un GTIN asignado de verdad. No es un formalismo: un corpus con documentos reales
 * dentro es una fuga con historial de git, y el historial no se borra, se reescribe mal y tarde
 * (por eso `demo/.gitignore` excluye `corpus/`). Aqui se puede versionar precisamente porque nada
 * de esto le pertenece a nadie.
 *
 * QUE FORMA TIENEN. La utilidad de un catalogo de pruebas esta en su forma, no en su tamaño:
 *
 *   - Los GTIN llevan **digito de control real** (modulo 10 de GS1) y se verifican al generarse
 *     contra `validaModulo10` del nucleo. Un catalogo con GTIN inventados a mano no ejercita la
 *     validacion determinista: la desactiva sin decirlo.
 *   - Los nombres de proveedor traen las **variantes ortograficas** con las que la gente escribe
 *     de verdad —"ACME S.A. de C.V." / "Acme SA de CV" / "ACME SA"—, que es lo unico que hace
 *     interesante la similitud de Dice. Un catalogo donde el documento dice exactamente lo que
 *     dice el catalogo no prueba la reconciliacion: la evita.
 *   - Hay dos proveedores **genuinamente parecidos entre si**, para que exista un caso `ambiguo`
 *     de verdad y no solo por construccion.
 *   - Hay identificadores **ausentes del catalogo** a proposito (§2.10): el escenario peligroso no
 *     es el empate —un empate levanta sospecha— sino que el correcto NO ESTE, porque entonces el
 *     segundo mejor gana solo.
 */
import { validaModulo10 } from '../dist/index.js'

// --- Identificadores con forma real -------------------------------------------------------------

/**
 * Completa un cuerpo de digitos con su digito de control modulo 10 (GTIN-8/12/13/14, SSCC).
 *
 * Se calcula aqui y se VERIFICA con el validador del nucleo antes de devolverlo: si alguna vez las
 * dos implementaciones divergen, revienta al sembrar en vez de producir un catalogo entero de
 * codigos que el validador rechaza sin que nadie entienda por que.
 */
export function conDigitoDeControl(cuerpo: string): string {
  if (!/^\d{7,17}$/.test(cuerpo)) {
    throw new RangeError(`cuerpo de codigo invalido: "${cuerpo}"`)
  }
  let suma = 0
  for (let i = cuerpo.length - 1, peso = 3; i >= 0; i -= 1, peso = peso === 3 ? 1 : 3) {
    suma += Number(cuerpo[i]) * peso
  }
  const completo = `${cuerpo}${(10 - (suma % 10)) % 10}`
  if (!validaModulo10(completo)) {
    throw new Error(
      `el digito de control calculado para "${cuerpo}" no pasa validaModulo10(): ` +
        'el generador del banco y el validador del nucleo han divergido',
    )
  }
  return completo
}

/**
 * Guia de FedEx Express (12 digitos) con su digito de control modulo 11, pesos 1-3-7.
 *
 * Se invierte la formula del nucleo en vez de copiarla: el cuerpo se elige y el ultimo digito se
 * deriva, que es la unica forma de que `analizaCarga()` la clasifique como `guia` y no como texto.
 */
export function conDigitoFedex(cuerpo11: string): string {
  if (!/^\d{11}$/.test(cuerpo11)) throw new RangeError(`cuerpo de guia invalido: "${cuerpo11}"`)
  const pesos = [1, 3, 7]
  let suma = 0
  for (let i = cuerpo11.length - 1, k = 0; i >= 0; i -= 1, k += 1) {
    suma += Number(cuerpo11[i]) * pesos[k % 3]
  }
  return `${cuerpo11}${(suma % 11) % 10}`
}

// --- Los catalogos del proyecto consumidor ------------------------------------------------------

export interface ProveedorSemilla {
  id: string
  /** La forma canonica, como esta en el catalogo del ERP. */
  razonSocial: string
  rfc: string
  /** Como aparece escrito en los documentos que entran. Es lo que la reconciliacion tiene que resolver. */
  variantes: readonly string[]
}

/**
 * Ocho proveedores. Los RFC siguen la forma mexicana de persona moral —tres letras, seis digitos
 * de fecha, tres de homoclave— sin pertenecer a ninguna empresa que exista.
 *
 * OJO a los dos ultimos: "Lacteos del Valle" y "Lacteos del Bajio" existen para producir un
 * `ambiguo` legitimo. Sin un par asi, el estado `ambiguo` solo se alcanzaria forzandolo, y una
 * rama que solo se recorre en un test artificial es una rama sin probar.
 */
export const PROVEEDORES: readonly ProveedorSemilla[] = [
  {
    id: 'prv-001',
    razonSocial: 'ACME Distribuciones S.A. de C.V.',
    rfc: 'ADI050214QX3',
    variantes: ['ACME Distribuciones SA de CV', 'Acme Distribuciones', 'ACME DISTRIBUCIONES S.A.'],
  },
  {
    id: 'prv-002',
    razonSocial: 'Molinos del Centro S.A.P.I. de C.V.',
    rfc: 'MCE110930HH8',
    variantes: ['Molinos del Centro SAPI de CV', 'MOLINOS DEL CENTRO', 'Molinos Del Centro S.A.P.I.'],
  },
  {
    id: 'prv-003',
    razonSocial: 'Empaques Muñoz S. de R.L.',
    rfc: 'EMU980612BC1',
    // "Munoz" sin tilde es la misma empresa escrita por otra persona: es el caso que `normaliza()`
    // resuelve quitando diacriticos, y sin el la prueba no lo demostraria.
    variantes: ['Empaques Munoz S de RL', 'EMPAQUES MUÑOZ', 'Empaques Munoz'],
  },
  {
    id: 'prv-004',
    razonSocial: 'Grupo Cerealero del Norte S.A.',
    rfc: 'GCN021118LM5',
    // El reordenamiento de palabras es justo lo que Dice tolera y la distancia de edicion no.
    variantes: ['Cerealero del Norte Grupo', 'GRUPO CEREALERO NORTE', 'Grupo Cerealero del Norte'],
  },
  {
    id: 'prv-005',
    razonSocial: 'Aceites y Grasas Peninsulares S.A. de C.V.',
    rfc: 'AGP070425TR9',
    variantes: ['Aceites y Grasas Peninsulares', 'ACEITES Y GRASAS PENINSULARES SA DE CV'],
  },
  {
    id: 'prv-006',
    razonSocial: 'Conservas La Huerta S.A. de C.V.',
    rfc: 'CLH960308ZK2',
    variantes: ['Conservas La Huerta', 'CONSERVAS LA HUERTA SA DE CV', 'Conservas la huerta'],
  },
  {
    id: 'prv-007',
    razonSocial: 'Lacteos del Valle S.A. de C.V.',
    rfc: 'LVA130722PN4',
    variantes: ['Lacteos del Valle', 'LACTEOS DEL VALLE SA DE CV'],
  },
  {
    id: 'prv-008',
    razonSocial: 'Lacteos del Bajio S.A. de C.V.',
    rfc: 'LBA150904WD7',
    variantes: ['Lacteos del Bajio', 'LACTEOS DEL BAJIO SA DE CV'],
  },
]

export interface ProductoSemilla {
  id: string
  descripcion: string
  gtin: string
  proveedorId: string
}

/** Cuerpos de GTIN-13 (12 digitos; el 13o lo pone `conDigitoDeControl`). */
const CUERPOS_GTIN: readonly (readonly [string, string, string])[] = [
  ['prd-001', 'Harina de trigo 1 kg', '750100100001'],
  ['prd-002', 'Harina integral 1 kg', '750100100002'],
  ['prd-003', 'Aceite de girasol 900 ml', '750100200015'],
  ['prd-004', 'Aceite de oliva 500 ml', '750100200022'],
  ['prd-005', 'Atun en aceite 140 g', '750100300031'],
  ['prd-006', 'Atun en agua 140 g', '750100300048'],
  ['prd-007', 'Leche entera 1 L', '750100400057'],
  ['prd-008', 'Leche deslactosada 1 L', '750100400064'],
  ['prd-009', 'Frijol negro 900 g', '750100500073'],
  ['prd-010', 'Arroz grano largo 1 kg', '750100500080'],
  ['prd-011', 'Azucar refinada 1 kg', '750100600099'],
  ['prd-012', 'Sal de mesa 1 kg', '750100600105'],
]

const PROVEEDOR_DE_PRODUCTO: Readonly<Record<string, string>> = {
  'prd-001': 'prv-002', 'prd-002': 'prv-002', 'prd-003': 'prv-005', 'prd-004': 'prv-005',
  'prd-005': 'prv-006', 'prd-006': 'prv-006', 'prd-007': 'prv-007', 'prd-008': 'prv-007',
  'prd-009': 'prv-004', 'prd-010': 'prv-004', 'prd-011': 'prv-001', 'prd-012': 'prv-001',
}

export const PRODUCTOS: readonly ProductoSemilla[] = CUERPOS_GTIN.map(([id, descripcion, cuerpo]) => ({
  id,
  descripcion,
  gtin: conDigitoDeControl(cuerpo),
  proveedorId: PROVEEDOR_DE_PRODUCTO[id],
}))

/**
 * Identificadores que NO estan en el catalogo, con su pariente cercano al lado.
 *
 * Esto es el escenario de §2.10 sembrado a proposito, y es la razon de ser mas importante de todo
 * este archivo. Cada entrada es un GTIN valido —pasa el digito de control— que no corresponde a
 * ningun producto del catalogo, y que se parece muchisimo a uno que si esta. Si alguien enrutara
 * identificadores por la via difusa, `resuelveValor` devolveria el pariente con estado `resuelto`
 * y meteria el stock en el SKU equivocado sin un solo error visible.
 *
 * `parecidoA` esta aqui para poder AFIRMAR en la prueba cuanto se parecen, en vez de suponerlo.
 */
export interface IdentificadorAusente {
  gtin: string
  /** El id del producto del catalogo al que se parece peligrosamente. */
  parecidoA: string
  motivo: string
}

export const GTIN_AUSENTES: readonly IdentificadorAusente[] = [
  {
    gtin: conDigitoDeControl('750100100003'),
    parecidoA: 'prd-001',
    motivo: 'difiere en un digito del cuerpo de "Harina de trigo 1 kg"',
  },
  {
    gtin: conDigitoDeControl('750100400058'),
    parecidoA: 'prd-007',
    motivo: 'difiere en un digito del cuerpo de "Leche entera 1 L"',
  },
]

// --- Trazabilidad: guias que se escanean mas de una vez ------------------------------------------

export interface GuiaSemilla {
  numero: string
  /** Los puestos por los que pasa. Cada paso es un EVENTO distinto, no una relectura. */
  recorrido: readonly string[]
}

export const GUIAS: readonly GuiaSemilla[] = [
  { numero: conDigitoFedex('79461203845'), recorrido: ['almacen-norte', 'reparto-01', 'cliente'] },
  { numero: conDigitoFedex('61208374591'), recorrido: ['almacen-norte', 'reparto-02'] },
]

export const ORGANIZACION = {
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Abarrotes del Bajio S.A. de C.V.',
} as const

export const USUARIOS = {
  operario: { id: '00000000-0000-4000-8000-0000000000a1', nombre: 'Capturista de turno', rol: 'operario' },
  revisor: { id: '00000000-0000-4000-8000-0000000000b2', nombre: 'Revisora de facturas', rol: 'revisor' },
} as const
