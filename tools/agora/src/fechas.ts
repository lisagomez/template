/** Fechas de calendario (AAAA-MM-DD) sin zona: se anclan al mediodía UTC para que el horario de verano no las mueva. */
const partes = (d: string) => d.split('-').map(Number) as [number, number, number]
export const mediodia = (d: string): number => { const [a, m, dia] = partes(d); return Date.UTC(a, m - 1, dia, 12) }
export const esFecha = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(mediodia(x))
export const sumaDias = (d: string, n: number): string => new Date(mediodia(d) + n * 864e5).toISOString().slice(0, 10)
export const diaSemana = (d: string): number => new Date(mediodia(d)).getUTCDay()
export const esHabil = (d: string): boolean => ![0, 6].includes(diaSemana(d))
export const diasEntre = (a: string, b: string): number => Math.round((mediodia(b) - mediodia(a)) / 864e5)
export const siguienteHabil = (d: string): string => { let x = d; while (!esHabil(x)) x = sumaDias(x, 1); return x }
