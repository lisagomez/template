/**
 * El modelo del coordinador se INYECTA. En el laboratorio es determinista: reglas sobre el texto (sin red, sin pago),
 * con un uso de tokens fijo y un precio declarado como ficticio, para que el gasto de los agentes se pueda medir de
 * punta a punta sin modelos de pago (una llamada real necesita el OK del laboratorio y su clase de routing, que es CDC).
 * El texto del hilo le llega DELIMITADO como dato: una instrucción dentro de un mensaje no es una orden.
 */
import type { Payload } from './propuesta.js'

export interface EntradaModelo {
  /** El mensaje que motivó la llamada, ya delimitado como dato. */
  dato: string
  categoria: { id: string; nombre: string }
  items: Array<{ id: string; nombre: string; inicio: string | null; fin: string | null; monto: number | null; progreso: number }>
  hoy: string
}

export interface SalidaModelo {
  texto: string
  plan: { resumen: string; payload: Payload } | null
  /** Tokens y costo de la llamada; null si el proveedor no informó uso (se guarda null, nunca cero). */
  uso: { entrada: number; salida: number; costoUsd: number } | null
}

export interface Modelo { proveedor: string; id: string; genera(e: EntradaModelo): Promise<SalidaModelo> }

/** Delimita el texto ajeno: lo que va dentro es DATO. Quita los delimitadores que el texto traiga para no cerrarlo antes. */
export const comoDato = (texto: string): string => `<<<DATO\n${texto.replace(/<<<DATO|DATO>>>/g, '«…»').slice(0, 4000)}\nDATO>>>`

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const palabras = (s: string) => sinAcentos(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4)

/** Precio ficticio del laboratorio, por millón de tokens (USD). No es el de ningún proveedor real. */
export const PRECIO_LABORATORIO = { entrada: 2, salida: 10 }

export function modeloDeterminista(o: { sinUso?: boolean } = {}): Modelo {
  return {
    proveedor: 'laboratorio (sin red)',
    id: 'agora-determinista-0.1',
    async genera(e) {
      const t = sinAcentos(e.dato.replace(/^<<<DATO\n|\nDATO>>>$/g, ''))
      const entrada = 1200 + e.dato.length * 2 + e.items.length * 60
      const salida = 380
      const uso = o.sinUso ? null : { entrada, salida, costoUsd: Math.round(((entrada * PRECIO_LABORATORIO.entrada + salida * PRECIO_LABORATORIO.salida) / 1e6) * 1e6) / 1e6 }
      // ¿De qué ítem habla? El que más palabras comparte con el mensaje.
      const elegido = e.items.map((i) => ({ i, n: palabras(i.nombre).filter((w) => t.includes(w)).length })).sort((a, b) => b.n - a.n)[0]
      const item = elegido && elegido.n > 0 ? elegido.i : null
      const dias = t.match(/\b(\d{1,2})\s*dias?\b/)
      if (item && /(mueve|recorre|retrasa|pasa|aplaza|corre)/.test(t) && item.fin) {
        const n = dias ? Number(dias[1]) : 7
        const fin = new Date(Date.UTC(Number(item.fin.slice(0, 4)), Number(item.fin.slice(5, 7)) - 1, Number(item.fin.slice(8, 10)) + n, 12))
        while ([0, 6].includes(fin.getUTCDay())) fin.setUTCDate(fin.getUTCDate() + 1)
        const nueva = fin.toISOString().slice(0, 10)
        return { uso, texto: `Propongo mover «${item.nombre}» al ${nueva}: queda como propuesta en el hilo.`,
          plan: { resumen: `Mover «${item.nombre}» del ${item.fin} al ${nueva}`, payload: { version: 1, clase: 'mover_fecha', categoria: e.categoria.id, cambios: [{ item: item.id, campo: 'fin', antes: item.fin, despues: nueva }] } } }
      }
      if (/(despliega|desglosa|arma|planea)/.test(t)) {
        const tema = t.match(/plan de ([a-z0-9ñ ]{3,40})/)?.[1]?.trim() ?? e.categoria.nombre.toLowerCase()
        const ini = e.hoy
        const mas = (d: number) => { const f = new Date(Date.UTC(Number(ini.slice(0, 4)), Number(ini.slice(5, 7)) - 1, Number(ini.slice(8, 10)) + d, 12)); while ([0, 6].includes(f.getUTCDay())) f.setUTCDate(f.getUTCDate() + 1); return f.toISOString().slice(0, 10) }
        return { uso, texto: `Desglosé el plan de ${tema} en tres pasos con dependencias; queda como propuesta.`,
          plan: { resumen: `Plan de ${tema}: preparar, ejecutar y revisar`, payload: { version: 1, clase: 'crear_item', categoria: e.categoria.id, nuevos: [
            { clave: 'preparar', nombre: `Preparar ${tema}`, inicio: mas(1), fin: mas(4), prioridad: 'media' },
            { clave: 'ejecutar', nombre: `Ejecutar ${tema}`, inicio: mas(5), fin: mas(12), prioridad: 'alta', depende_de: ['preparar'] },
            { clave: 'revisar', nombre: `Revisar resultados de ${tema}`, inicio: mas(13), fin: mas(15), prioridad: 'media', depende_de: ['ejecutar'] },
          ] } } }
      }
      return { uso, plan: null, texto: item ? `Leí lo de «${item.nombre}». No veo un cambio que proponer; si quieres uno, dímelo («mueve…», «despliega el plan de…»).` : 'Leído. No veo un cambio que proponer con eso.' }
    },
  }
}
