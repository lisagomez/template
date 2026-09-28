/** El catálogo completo del laboratorio de etiquetas y cómo se corre. Una sola fuente para la página, la app y la suite. */
import { CASOS_AGENTE, CASOS_CONTEO, CASOS_EXPEDIENTE } from './casos-conteo.ts';
import { CASOS_ETIQUETA, CASOS_IMPRESION } from './casos-etiqueta.ts';
import { CASOS_CATALOGO, CASOS_LECTURA } from './casos-lectura.ts';
import { CASOS_FECHA, CASOS_RECEPCION } from './casos-recepcion.ts';
import { CASOS_RONDA, CASOS_ZONAS } from './casos-zonas.ts';
import { NOMBRE_HERRAMIENTA, PANTALLAS } from './pantallas.ts';
import type { Caso, CasoCorrido, ContextoDeLaboratorio, Herramienta, IdHerramienta, ResultadoDeCaso } from './tipos.ts';

export { herramientaDePantalla } from './pantallas.ts';

const P = '@tu-scope/etiquetas-gs1';
export const HERRAMIENTAS: readonly Herramienta[] = [
  { id: 'etiqueta', nombre: NOMBRE_HERRAMIENTA['etiqueta'], subpath: `${P} + ${P}/svg`, pantallas: PANTALLAS['etiqueta'], queHace: 'Diseña la etiqueta de caja, tarima y ubicación, la revisa contra la norma y genera SVG y ZPL.' },
  { id: 'impresion', nombre: NOMBRE_HERRAMIENTA['impresion'], subpath: `${P}/agente`, pantallas: PANTALLAS['impresion'], queHace: 'El agente del sitio imprime solo trabajos firmados y solo con una lista cerrada de comandos.' },
  { id: 'lectura', nombre: NOMBRE_HERRAMIENTA['lectura'], subpath: P, pantallas: PANTALLAS['lectura'], queHace: 'Entiende lo que manda la pistola o la cámara y dice el color con su acción.' },
  { id: 'catalogo', nombre: NOMBRE_HERRAMIENTA['catalogo'], subpath: P, pantallas: PANTALLAS['catalogo'], queHace: 'Importa el Excel, asigna códigos por regla sin duplicar y recuerda los códigos anteriores.' },
  { id: 'recepcion', nombre: NOMBRE_HERRAMIENTA['recepcion'], subpath: P, pantallas: PANTALLAS['recepcion'], queHace: 'Recibe con la regla de 2/3, guarda la foto del inventario y la recepción con foto que confirma quien registró.' },
  { id: 'fecha-foto', nombre: NOMBRE_HERRAMIENTA['fecha-foto'], subpath: `${P}/motores/proceso`, pantallas: PANTALLAS['fecha-foto'], queHace: 'Propone la caducidad leída de una foto con el motor LOCAL; sin aprobar, la fecha se teclea.' },
  { id: 'zonas', nombre: NOMBRE_HERRAMIENTA['zonas'], subpath: P, pantallas: PANTALLAS['zonas'], queHace: 'Cada escaneo hace lo de su zona para su rol; el almacenista a ciegas; deshacer como corrección.' },
  { id: 'ronda', nombre: NOMBRE_HERRAMIENTA['ronda'], subpath: P, pantallas: PANTALLAS['ronda'], queHace: 'Lo que hay que hacer hoy en orden de recorrido, cerrado por escaneos, y el conteo cíclico por riesgo.' },
  { id: 'conteo', nombre: NOMBRE_HERRAMIENTA['conteo'], subpath: P, pantallas: PANTALLAS['conteo'], queHace: 'Cuenta a ciegas, recuenta otra persona y autoriza quien no contó.' },
  { id: 'expediente', nombre: NOMBRE_HERRAMIENTA['expediente'], subpath: `${P} + ${P}/firma`, pantallas: PANTALLAS['expediente'], queHace: 'Cadena de hashes por sitio, proyección del inventario y ancla firmada del día.' },
  { id: 'agente', nombre: NOMBRE_HERRAMIENTA['agente'], subpath: P, pantallas: PANTALLAS['agente'], queHace: 'Detecta lo que no se venderá a tiempo y recomienda; decide una persona.' },
];

export const CASOS: readonly Caso[] = [
  ...CASOS_ETIQUETA, ...CASOS_IMPRESION, ...CASOS_LECTURA, ...CASOS_CATALOGO, ...CASOS_RECEPCION, ...CASOS_FECHA, ...CASOS_ZONAS, ...CASOS_RONDA, ...CASOS_CONTEO, ...CASOS_EXPEDIENTE, ...CASOS_AGENTE,
];

/** Falta en esta máquina lo que el caso necesita (y por eso «no medido» es lo que corresponde). */
export const faltaRequisito = (c: Pick<Caso, 'requiere'>, ctx: ContextoDeLaboratorio): boolean =>
  c.requiere === 'motor' ? !ctx.motor : c.requiere === 'corpus-real' ? !ctx.motor || !ctx.corpusReal : false;

export async function correCaso(caso: Caso, ctx: ContextoDeLaboratorio): Promise<CasoCorrido> {
  const t0 = performance.now();
  let resultado: ResultadoDeCaso;
  try {
    resultado = await caso.corre(ctx);
  } catch (e) {
    resultado = { estado: 'falla', evidencia: [`error: ${e instanceof Error ? e.message : String(e)}`], veredicto: 'El caso reventó: eso es una falla.' };
  }
  const { corre: _corre, ...datos } = caso;
  void _corre;
  const coincide = resultado.estado === caso.esperado || (resultado.estado === 'no-medido' && faltaRequisito(caso, ctx));
  return { caso: datos, resultado, coincide, ms: Math.round(performance.now() - t0) };
}

export async function correLaboratorio(ctx: ContextoDeLaboratorio): Promise<CasoCorrido[]> {
  const salida: CasoCorrido[] = [];
  for (const c of CASOS) salida.push(await correCaso(c, ctx));
  return salida;
}

/** Una herramienta está APROBADA solo si todos sus casos pasan (un «no medido» no aprueba). */
export function aprobadas(corridos: readonly CasoCorrido[]): IdHerramienta[] {
  return HERRAMIENTAS.map((h) => h.id).filter((id) => {
    const suyos = corridos.filter((c) => c.caso.herramienta === id);
    return suyos.length > 0 && suyos.every((c) => c.resultado.estado === 'pasa');
  });
}
