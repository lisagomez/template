/**
 * Lo común a los CLIs del producto (`tools/soporte-sap/clis/`): argumentos, ayuda y el contrato
 * de la imprenta del repo — dry-run por defecto, lo que cambia estado se marca, y sin grado el CLI
 * es «no medido». Un CLI llama a la herramienta real o a su almacén local: jamás inventa una
 * respuesta.
 */

export interface DescripcionCli {
  readonly nombre: string
  readonly que: string
  readonly uso: string
  /** `true` si nunca cambia estado. */
  readonly readOnly: boolean
  /** Lo que cambia estado corre en simulación salvo `--ejecutar`. */
  readonly dryRunPorDefecto: boolean
}

export interface Argumentos {
  readonly posicionales: readonly string[]
  readonly banderas: ReadonlySet<string>
  readonly valores: Readonly<Record<string, string>>
}

/** `--clave valor`, `--bandera` y posicionales. Una bandera a secas es presencia, no valor. */
export function leeArgumentos(argv: readonly string[], conValor: readonly string[]): Argumentos {
  const posicionales: string[] = []
  const banderas = new Set<string>()
  const valores: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) { posicionales.push(a); continue }
    const nombre = a.slice(2)
    if (conValor.includes(nombre)) {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw new Error(`--${nombre} necesita un valor`)
      valores[nombre] = v
      i++
    } else banderas.add(nombre)
  }
  return { posicionales, banderas, valores }
}

export function ayuda(d: DescripcionCli): string {
  const modo = d.readOnly ? 'solo lectura' : d.dryRunPorDefecto ? 'cambia estado: simula por defecto, ejecuta con --ejecutar' : 'cambia estado'
  return `${d.nombre} — ${d.que}\n\nUso: ${d.uso}\nModo: ${modo} · grado: no medido · producto: soporte-sap`
}
