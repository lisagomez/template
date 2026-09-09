/**
 * Lectura de codigos con la camara. TAR-31, y cubre el puerto `LectorDeCodigos`.
 *
 * DOS MOTORES, Y LA REGLA QUE DECIDE CUAL:
 *
 *   - `BarcodeDetector` es nativo. Existe en Chrome y Android desde hace años; **no existe en
 *     Safari ni en Firefox**, que es una parte grande de los telefonos que van a usar esto.
 *   - `zxing-wasm` funciona en todos, y pesa varios cientos de kilobytes de WebAssembly.
 *
 * LO QUE ESTE ARCHIVO GARANTIZA, y es la mitad de TAR-31: **el wasm no se descarga a quien no abre
 * la camara.** La carga va por `import()` dinamico DENTRO de la funcion, no arriba del archivo. Un
 * import estatico lo mete en el bundle de todo el que importe este modulo — incluida la persona
 * que solo sube PDF desde un escritorio y no va a abrir una camara en su vida. Y no se notaria al
 * probar: el codigo funciona igual, solo que cada carga de pagina arrastra medio mega de mas.
 *
 * Hay una prueba que lo verifica contando cuantas veces se llama al cargador. Es la unica forma de
 * que esto siga siendo cierto dentro de seis meses.
 */
import type { LectorDeCodigos } from '../puertos.js'

/** La forma minima de `BarcodeDetector`, declarada para poder inyectar una de mentira. */
export interface DetectorNativo {
  detect(imagen: unknown): Promise<readonly { rawValue: string }[]>
}

export interface FabricaDeDetector {
  /** `undefined` si el navegador no lo trae. Es el caso de Safari y Firefox, no una excepcion rara. */
  nativo?(formatos: readonly string[]): DetectorNativo | undefined
  /**
   * Carga el respaldo wasm. Se llama SOLO cuando hace falta de verdad, y por eso es una funcion y
   * no un modulo importado arriba.
   */
  respaldo?(): Promise<DetectorNativo>
}

export interface OpcionesDeCamara {
  formatos?: readonly string[]
  fabrica?: FabricaDeDetector
}

const FORMATOS_POR_DEFECTO = ['qr_code', 'code_128', 'ean_13', 'pdf417', 'data_matrix'] as const

/**
 * La fabrica de produccion. Mira si el navegador trae el detector nativo y, si no, carga el wasm.
 *
 * El `import()` esta aqui dentro a proposito: ver la cabecera del archivo.
 */
export const fabricaDelNavegador: FabricaDeDetector = {
  nativo(formatos) {
    const global = globalThis as { BarcodeDetector?: new (opciones: { formats: readonly string[] }) => DetectorNativo }
    if (global.BarcodeDetector === undefined) return undefined
    return new global.BarcodeDetector({ formats: formatos })
  },
  async respaldo() {
    // `zxing-wasm` es peerDependency OPCIONAL: quien no abra la camara no lo instala siquiera.
    const modulo = (await import(/* @vite-ignore */ 'zxing-wasm')) as unknown as {
      readBarcodes(imagen: unknown, opciones?: unknown): Promise<readonly { text: string }[]>
    }
    return {
      async detect(imagen: unknown) {
        const leidos = await modulo.readBarcodes(imagen)
        return leidos.map((l) => ({ rawValue: l.text }))
      },
    }
  },
}

export type MotorDeCodigos = 'nativo' | 'wasm' | 'ninguno'

export interface LectorConMotor extends LectorDeCodigos {
  /** Que motor se acabo usando. `ninguno` hasta la primera lectura: no se resuelve por adelantado. */
  motorUsado(): MotorDeCodigos
}

/**
 * Construye el lector. **No carga nada al construirse**: la eleccion de motor ocurre en la primera
 * lectura, que es cuando ya se sabe que alguien abrio la camara de verdad.
 */
export function lectorDeCamara(opciones: OpcionesDeCamara = {}): LectorConMotor {
  const formatos = opciones.formatos ?? [...FORMATOS_POR_DEFECTO]
  const fabrica = opciones.fabrica ?? fabricaDelNavegador
  let detector: DetectorNativo | null = null
  let motor: MotorDeCodigos = 'ninguno'

  async function resuelveDetector(): Promise<DetectorNativo> {
    if (detector !== null) return detector
    const nativo = fabrica.nativo?.(formatos)
    if (nativo !== undefined) {
      detector = nativo
      motor = 'nativo'
      return detector
    }
    if (fabrica.respaldo === undefined) {
      throw new Error('este navegador no trae BarcodeDetector y no se configuro respaldo wasm')
    }
    detector = await fabrica.respaldo()
    motor = 'wasm'
    return detector
  }

  return {
    formatos,
    motorUsado: () => motor,
    async lee(imagen: Uint8Array): Promise<readonly string[]> {
      const activo = await resuelveDetector()
      const encontrados = await activo.detect(imagen)
      // Se devuelven las cargas CRUDAS. Interpretarlas es de `analizaCarga`, en el nucleo: un
      // decodificador devuelve lo que decodifico, y darle sentido es otra decision (§2.11).
      return encontrados.map((c) => c.rawValue).filter((v) => v.length > 0)
    },
  }
}
