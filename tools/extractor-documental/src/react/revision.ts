/**
 * Las decisiones de la vista de revision, fuera de React para poder probarlas. TAR-11 y TAR-12.
 *
 * Que hay aqui y por que no esta en el componente: ordenar, decidir que se ve, comparar contra el
 * umbral y calcular que cambio son DECISIONES. En un `.tsx` solo se pueden ejercitar con un
 * navegador; aqui se prueban con `node --test`. En el componente queda el pegamento, que es lo que
 * no lleva decisiones dentro.
 *
 * LA REGLA QUE MANDA EN ESTE ARCHIVO, y viene de `tipos.ts`: la confianza «tiene que compararse
 * contra un umbral EXPLICITO, nunca contra un default». Por eso `umbral` es un parametro
 * obligatorio en todas las funciones que lo necesitan, y no hay ningun valor por defecto que se
 * pueda heredar por descuido. TAR-17 esta bloqueada a proposito —el umbral se mide, no se
 * inventa— y un default aqui seria justo la via por la que ese numero sin medir entraria igual.
 */
import type { CampoExtraido } from '../tipos.js'
import type { CampoDePlantilla, PlantillaDeRevision } from '../plantilla.js'

export interface FilaDeRevision {
  clave: string
  /** Lo que se enseña. Sale de la plantilla si la hay; si no, de la clave. */
  etiqueta: string
  valor: string
  confianza: number
  /** `true` cuando la confianza queda POR DEBAJO del umbral: va a revision humana. */
  bajoUmbral: boolean
  editable: boolean
  orden: number
  /** La region de origen. `undefined` en lo que viene de un escaner HID, que no produce imagen. */
  region?: CampoExtraido['region']
  procedencia: CampoExtraido['procedencia']
}

/**
 * Aplica la plantilla a los campos extraidos: orden, etiquetas y que se ve.
 *
 * Un campo que la plantilla no conoce **se muestra igualmente**, al final. Esconderlo seria peor
 * que el desorden: el motor encontro algo que la plantilla no preveia, y eso es justo lo que hay
 * que revisar. Se ocultan los que alguien deshabilito a proposito, no los que nadie ha visto aun.
 */
export function aplicaPlantilla(
  campos: readonly CampoExtraido[],
  plantilla: PlantillaDeRevision | null,
  umbral: number,
): FilaDeRevision[] {
  exigeUmbral(umbral)
  const porClave = new Map<string, CampoDePlantilla>()
  for (const c of plantilla?.campos ?? []) porClave.set(c.clave, c)

  const filas = campos.map((campo, posicion): FilaDeRevision => {
    const config = porClave.get(campo.clave)
    return {
      clave: campo.clave,
      etiqueta: config?.etiqueta ?? campo.clave,
      valor: campo.valor,
      confianza: campo.confianza,
      bajoUmbral: campo.confianza < umbral,
      editable: config?.editable ?? true,
      // Lo que la plantilla no conoce va al final, conservando el orden en que llego.
      orden: config?.orden ?? 1000 + posicion,
      region: campo.region,
      procedencia: campo.procedencia,
    }
  })

  const ocultas = new Set((plantilla?.campos ?? []).filter((c) => !c.visible).map((c) => c.clave))
  return filas.filter((f) => !ocultas.has(f.clave)).sort((a, b) => a.orden - b.orden)
}

function exigeUmbral(umbral: number): void {
  if (!Number.isFinite(umbral) || umbral < 0 || umbral > 1) {
    throw new RangeError(`el umbral tiene que estar entre 0 y 1, y llego ${umbral}`)
  }
}

/**
 * Cuantos campos caen por debajo del umbral.
 *
 * Se cuenta y se enseña porque `revision_humana` NO es un error: es la salida normal. Tratarla
 * como fallo es lo que empuja a subir el umbral hasta que la cola desaparece, y con ella el
 * control. Enseñar el numero sin adjetivos es lo que evita esa deriva.
 */
export function cuentaBajoUmbral(filas: readonly FilaDeRevision[]): number {
  return filas.filter((f) => f.bajoUmbral).length
}

/** Las fuentes que entregan el dato EXACTO o no lo entregan. No admiten media lectura. */
const DETERMINISTAS: ReadonlySet<FilaDeRevision['procedencia']> = new Set(['xml', 'codigo'])

/** Si el documento trae algun campo de una fuente determinista, que es la que exige cotejo. */
export function exigeCotejo(filas: readonly FilaDeRevision[]): boolean {
  return filas.some((f) => DETERMINISTAS.has(f.procedencia))
}

/**
 * Si el documento entero puede darse por validado sin que lo mire una persona.
 *
 * Tres barreras, y basta una para que no.
 *
 * 1. **Un campo bajo umbral.** La de siempre.
 * 2. **Un campo de OCR sin region.** Un dato de reconocimiento que no se puede citar no se puede
 *    auditar despues, y a los seis meses nadie sabra de donde salio.
 * 3. **Una fuente determinista sin cotejar.** La nueva, y la que mas conviene entender.
 *
 * DE DONDE SALE LA TERCERA. Un campo de `xml` o de `codigo` llega con confianza 1 y sin region —
 * porque no tiene coordenadas que citar— asi que pasaba las otras dos barreras sin tocarlas. El
 * resultado, medido con `node banco/cli.mjs xml`: **doce comprobantes de doce se promovian sin que
 * nadie los mirara**. Para el DATO eso es correcto: es una transcripcion, no hay lectura que
 * revisar. Para el DOCUMENTO no dice nada — el sello no se verifica, y un CFDI inventado analiza
 * igual de limpio, igual que una pegatina falsa decodifica igual de limpio que la legitima
 * (§2.11 del SDD).
 *
 * Lo que convierte una fuente determinista en fiable no es su confianza: es que **otra fuente
 * independiente diga lo mismo**. Por eso `cotejado` es OBLIGATORIO y no tiene valor por defecto,
 * exactamente por el mismo motivo que `umbral`: un default aqui seria la puerta por la que un
 * proyecto auto-validaria comprobantes sin cotejar nada, sin haberlo decidido nunca.
 *
 * Quien coteja es `corrobora()`; quien decide que hacer con la discrepancia, `exigeRevision()`.
 * Esta funcion solo se niega a dar por bueno lo que nadie comparo.
 */
export function puedeValidarseSinRevision(
  filas: readonly FilaDeRevision[],
  cotejado: boolean,
): boolean {
  if (filas.some((f) => f.bajoUmbral)) return false
  if (exigeCotejo(filas) && !cotejado) return false
  return filas.every((f) => f.procedencia !== 'ocr' || f.region !== undefined)
}

/**
 * La disposicion completa que TAR-12 persiste: todos los campos con su estado, no solo los
 * visibles. Guardar solo lo visible perderia que alguien deshabilito algo A PROPOSITO, y la
 * siguiente tanda lo traeria de vuelta — que es exactamente el trabajo que la plantilla evita
 * repetir.
 */
export function disposicionDe(
  tipoDocumento: string,
  filas: readonly FilaDeRevision[],
  ocultas: readonly string[] = [],
): PlantillaDeRevision {
  const visibles: CampoDePlantilla[] = filas.map((f, i) => ({
    clave: f.clave,
    etiqueta: f.etiqueta,
    visible: true,
    editable: f.editable,
    orden: i,
  }))
  const apagadas: CampoDePlantilla[] = ocultas.map((clave, i) => ({
    clave,
    etiqueta: clave,
    visible: false,
    editable: false,
    orden: filas.length + i,
  }))
  return { tipoDocumento, campos: [...visibles, ...apagadas] }
}
