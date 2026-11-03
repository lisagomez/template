/**
 * La ruta API que sale del mismo esquema que la pantalla (el `api_name` y la página «Use via API» de
 * Gradio). Web estándar: recibe un `Request` y devuelve un `Response`, así que corre en un route handler
 * de Next, en un Worker o en una prueba, sin importar Node.
 *
 * FAIL-CLOSED: si `habilitado(peticion)` dice que no, todo responde 404, como si no existiera. El banco es de
 * laboratorio; en un despliegue no se sirve (mismo criterio que el puente A2A del #210). Recibe la petición
 * para que quien lo monta decida también por sus cabeceras (de qué máquina viene).
 *
 *   GET            → la lista de funciones con su descriptor: bloques, ejemplos y JSON Schema
 *   POST  /<id>    → { entrada } → 200 { ok, salida, ms } · 422 entrada inválida · 502 motor ·
 *                    500 salida fuera de esquema · 499 cancelada · 404 · 413 · 400
 */
import { describeEsquema, esquemaJson } from './esquema.js';
import { ejecuta } from './ejecuta.js';
import type { Descriptor, EtapaDeFallo, FuncionDeBanco } from './tipos.js';

export interface OpcionesDeApi {
  readonly habilitado: (peticion: Request) => boolean;
  /** Tope del cuerpo en bytes (una imagen en data URL pesa ~1,37 veces el archivo). Por defecto 8 MB. */
  readonly maxBytes?: number;
}

const ESTADO_POR_ETAPA: Record<EtapaDeFallo, number> = { entrada: 422, motor: 502, salida: 500, cancelada: 499 };

export function describeFuncion(f: FuncionDeBanco): Descriptor {
  return {
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    motor: f.motor,
    entrada: describeEsquema(f.entrada, 'input'),
    salida: describeEsquema(f.salida, 'output'),
    ejemplos: f.ejemplos,
    esquemas: { entrada: esquemaJson(f.entrada, 'input'), salida: esquemaJson(f.salida, 'output') },
  };
}

const json = (estado: number, cuerpo: unknown) => Response.json(cuerpo, { status: estado, headers: { 'cache-control': 'no-store' } });
const noExiste = () => json(404, { ok: false, mensaje: 'No existe.' });

async function leeCuerpo(req: Request, maxBytes: number): Promise<{ entrada: unknown } | Response> {
  const declarado = Number(req.headers.get('content-length') ?? '0');
  if (declarado > maxBytes) return json(413, { ok: false, mensaje: `El cuerpo pasa de ${maxBytes} bytes.` });
  const texto = await req.text();
  if (texto.length > maxBytes) return json(413, { ok: false, mensaje: `El cuerpo pasa de ${maxBytes} bytes.` });
  try {
    const cuerpo: unknown = JSON.parse(texto);
    if (!cuerpo || typeof cuerpo !== 'object' || !('entrada' in cuerpo)) return json(400, { ok: false, mensaje: 'Se espera { "entrada": { … } }.' });
    return { entrada: (cuerpo as { entrada: unknown }).entrada };
  } catch {
    return json(400, { ok: false, mensaje: 'El cuerpo no es JSON.' });
  }
}

export function creaApi(funciones: readonly FuncionDeBanco[], o: OpcionesDeApi) {
  const porId = new Map(funciones.map((f) => [f.id, f]));
  if (porId.size !== funciones.length) throw new Error('dos funciones del banco comparten id');
  const maxBytes = o.maxBytes ?? 8 * 1024 * 1024;
  return {
    lista(req: Request): Response {
      if (!o.habilitado(req)) return noExiste();
      return json(200, { funciones: funciones.map(describeFuncion) });
    },
    async ejecuta(req: Request, id: string): Promise<Response> {
      if (!o.habilitado(req)) return noExiste();
      const f = porId.get(id);
      if (!f) return noExiste();
      const cuerpo = await leeCuerpo(req, maxBytes);
      if (cuerpo instanceof Response) return cuerpo;
      const r = await ejecuta(f, cuerpo.entrada, { signal: req.signal });
      return json(r.ok ? 200 : ESTADO_POR_ETAPA[r.etapa], r);
    },
  };
}
