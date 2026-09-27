/**
 * Brief de contenido a 30 días (adaptado de `content-strategy`). Solo estrategia, en la
 * estructura de la fuente: resumen · empujar fuerte · mantener · reposicionar o pausar ·
 * temporada · ofertas. Cada elección cita sus números. Lo que no se sabe se declara: sin
 * inventario no se verificó existencia; sin costos no hay margen; una temporada genérica se
 * marca «¿coincide con tu negocio?» porque no a todos los giros les toca igual.
 */
import { esOk, type Dato } from '../comun/dato.js';
import { formatoPesosRedondo } from '../comun/dinero.js';
import { fechaCorta, sumaDias, type Dia } from '../comun/fechas.js';
import { fechasEnVentana, quincenas, type FechaComercial } from '../comun/temporada.js';
import { normaliza } from '../comun/texto.js';
import type { ResumenDeProducto, ResumenDeVentas } from '../ventas/resumen.js';

export interface Empuje {
  readonly producto: string;
  readonly clave: string;
  readonly cifras: string;
  readonly angulo: string;
  readonly canal: string;
  readonly cuando: string;
  readonly fecha: FechaComercial | null;
}

export interface Reposicion {
  readonly producto: string;
  readonly clave: string;
  readonly cifras: string;
  readonly opcion: 'paquete' | 'pausa';
  readonly porque: string;
}

export interface Temporada {
  readonly fecha: FechaComercial;
  readonly accion: string;
  /** `true` si ningún producto vendido tiene que ver con la fecha: el dueño confirma si le toca. */
  readonly porConfirmar: boolean;
}

export interface Oferta {
  readonly tipo: 'paquete' | 'descuento' | 'prueba';
  readonly descripcion: string;
  readonly porque: string;
}

export interface EstrategiaDe30Dias {
  readonly desde: Dia;
  readonly hasta: Dia;
  readonly ventas: 'ok' | 'sin-datos';
  readonly motivoSinVentas: string | null;
  readonly metrica: string;
  readonly resumen: string;
  readonly empujar: readonly Empuje[];
  readonly mantener: readonly { readonly producto: string; readonly cifras: string }[];
  readonly reposicionar: readonly Reposicion[];
  readonly temporada: readonly Temporada[];
  readonly ofertas: readonly Oferta[];
  readonly quincenas: readonly Dia[];
  /** Lo que falta para que el brief sea mejor. Se muestra siempre. */
  readonly faltantes: readonly string[];
}

const pct = (x: number | null) => (x === null ? 'nuevo en el periodo' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}% en 30 días`);

function cifras(p: ResumenDeProducto): string {
  return `${formatoPesosRedondo(p.importe)} en el periodo, ${Math.round(p.participacion * 100)}% de la venta, ${pct(p.tendencia)}`;
}

function fechaDe(p: ResumenDeProducto, fechas: readonly FechaComercial[]): FechaComercial | null {
  const n = normaliza(p.producto);
  return fechas.find((f) => f.afines.some((a) => n.includes(a))) ?? null;
}

function empujes(r: ResumenDeVentas, fechas: readonly FechaComercial[], desde: Dia): Empuje[] {
  const candidatos: [ResumenDeProducto, FechaComercial | null, string][] = [];
  for (const p of r.productos) { const f = fechaDe(p, fechas); if (f) candidatos.push([p, f, `${f.nombre}: ${f.nota}`]); }
  for (const p of r.subiendo) candidatos.push([p, null, 'Ya se está moviendo: enséñalo en uso o saliendo del horno para acelerar lo que ya sube']);
  const bajan = new Set(r.bajando.map((p) => p.clave));
  for (const p of r.top) if (!bajan.has(p.clave)) candidatos.push([p, null, 'Es de lo que más vende: prueba social (quién lo pide, para qué)']);
  const vistos = new Set<string>();
  return candidatos.filter(([p]) => !vistos.has(p.clave) && vistos.add(p.clave)).slice(0, 3).map(([p, f, angulo]) => ({
    producto: p.producto, clave: p.clave, cifras: cifras(p), angulo, fecha: f,
    canal: f ? 'Instagram y Facebook, y estado de WhatsApp para apartados' : 'Instagram y estado de WhatsApp',
    cuando: f ? `desde el ${fechaCorta(sumaDias(f.desde, -14) < desde ? desde : sumaDias(f.desde, -14))}, dos semanas antes del pico` : 'desde esta semana',
  }));
}

function reposiciones(r: ResumenDeVentas, fuera: ReadonlySet<string>): Reposicion[] {
  const lista: Reposicion[] = [];
  const agrega = (p: ResumenDeProducto, opcion: Reposicion['opcion'], porque: string) => {
    if (!fuera.has(p.clave) && !lista.some((x) => x.clave === p.clave)) lista.push({ producto: p.producto, clave: p.clave, cifras: cifras(p), opcion, porque });
  };
  for (const p of r.bajando) agrega(p, 'paquete', `cayó ${Math.round(Math.abs(p.tendencia ?? 0) * 100)}% en 30 días: en paquete con un producto que sí se mueve, sin rebajarlo solo`);
  for (const p of r.lentos) {
    if (p.participacion < 0.03) agrega(p, 'pausa', 'pesa menos del 3% de la venta: no vale el esfuerzo de contenido este mes');
    else if ((p.tendencia ?? 0) < 0) agrega(p, 'paquete', 'vende poco y además va a la baja');
  }
  return lista.slice(0, 3);
}

function temporadas(fechas: readonly FechaComercial[], r: ResumenDeVentas | null, desde: Dia): Temporada[] {
  return fechas.map((f) => {
    const toca = r?.productos.some((p) => f.afines.some((a) => normaliza(p.producto).includes(a))) ?? false;
    const inicio = sumaDias(f.desde, -14) < desde ? desde : sumaDias(f.desde, -14);
    return { fecha: f, porConfirmar: !toca, accion: toca ? `prepara el contenido desde el ${fechaCorta(inicio)}` : '¿coincide con tu negocio? si sí, dime qué producto va con esta fecha' };
  });
}

export function estrategiaDe30Dias(resumen: Dato<ResumenDeVentas>, desde: Dia): EstrategiaDe30Dias {
  const fechas = fechasEnVentana(desde, 45);
  const base = { desde, hasta: sumaDias(desde, 29), quincenas: quincenas(desde, 30) };
  if (!esOk(resumen)) {
    return { ...base, ventas: 'sin-datos', motivoSinVentas: resumen.motivo, metrica: 'sin datos', resumen: 'Sin ventas cargadas: este brief solo trae la temporada que viene.', empujar: [], mantener: [], reposicionar: [], temporada: temporadas(fechas, null, desde), ofertas: [], faltantes: ['ventas: sube tus XML de facturas o un CSV de la caja para saber qué empujar'] };
  }
  const r = resumen.valor;
  const empujar = empujes(r, fechas, desde);
  const fuera = new Set(empujar.map((e) => e.clave));
  const reposicionar = reposiciones(r, fuera);
  reposicionar.forEach((x) => fuera.add(x.clave));
  const mantener = r.productos.filter((p) => !fuera.has(p.clave)).slice(0, 3).map((p) => ({ producto: p.producto, cifras: cifras(p) }));
  const fuerte = r.top[0];
  const bajan = new Set(r.bajando.map((p) => p.clave));
  const pareja = (clave: string) => [...empujar.map((e) => e.producto), ...r.top.filter((p) => !bajan.has(p.clave)).map((p) => p.producto)].find((p) => normaliza(p) !== clave && !r.productos.some((x) => x.clave === clave && x.producto === p));
  const ofertas: Oferta[] = reposicionar.filter((x) => x.opcion === 'paquete').map((x) => ({ tipo: 'paquete', descripcion: `${x.producto} + ${pareja(x.clave) ?? 'tu producto que más se mueve'}`, porque: x.porque }));
  if (base.quincenas.length) ofertas.push({ tipo: 'paquete', descripcion: `paquete de quincena (${base.quincenas.map(fechaCorta).join(' y ')})`, porque: 'la gente cobra esos días: una oferta fechada ahí rinde más' });
  const faltantes = ['inventario no verificado: confirma que tienes existencias de lo que vas a empujar', 'sin costos no hay margen: toda oferta la validas tú antes de publicarla'];
  if (!r.comparable) faltantes.push(`solo hay ${r.dias} días de ventas: con menos de 60 no se comparan 30 contra 30 días`);
  if (r.concentracionTop > 0.5 && fuerte) faltantes.push(`${fuerte.producto} es más de la mitad de la venta: el negocio depende de un solo producto`);
  const top = r.top.slice(0, 2).map((p) => p.producto).join(' y ');
  const proxima = fechas.find((f) => !temporadas([f], r, desde)[0]!.porConfirmar);
  return { ...base, ventas: 'ok', motivoSinVentas: null, metrica: r.metrica === 'ingreso' ? 'ingreso' : 'unidades', empujar, mantener, reposicionar, temporada: temporadas(fechas, r, desde), ofertas, faltantes,
    resumen: `Lo que más vende es ${top}.${proxima ? ` Viene ${proxima.nombre} (${fechaCorta(proxima.desde)}) y conviene prepararlo ya.` : ''}` };
}

/** El brief como texto para leer en 2 minutos (200–400 palabras en la fuente). */
export function briefEnTexto(e: EstrategiaDe30Dias): string {
  const l: string[] = [`# Brief de contenido · ${fechaCorta(e.desde)} al ${fechaCorta(e.hasta)}`, '', e.resumen, ''];
  if (e.empujar.length) l.push('## Empujar fuerte', ...e.empujar.map((x) => `- **${x.producto}** — ${x.cifras}. Ángulo: ${x.angulo}. Dónde: ${x.canal}. Cuándo: ${x.cuando}.`), '');
  if (e.mantener.length) l.push('## Mantener', ...e.mantener.map((x) => `- ${x.producto} — ${x.cifras}. Visible, sin gran esfuerzo.`), '');
  if (e.reposicionar.length) l.push('## Reposicionar o pausar', ...e.reposicionar.map((x) => `- ${x.producto} — ${x.cifras}. ${x.opcion === 'pausa' ? 'Pausa' : 'Paquete'}: ${x.porque}.`), '');
  if (e.temporada.length) l.push('## Temporada', ...e.temporada.map((t) => `- ${t.fecha.nombre} (${fechaCorta(t.fecha.desde)}${t.fecha.precision === 'aproximada' ? ', fecha aproximada' : ''}): ${t.accion}.`), '');
  if (e.ofertas.length) l.push('## Ofertas recomendadas', ...e.ofertas.map((o) => `- ${o.descripcion}: ${o.porque}.`), '');
  l.push('## Lo que falta', ...e.faltantes.map((f) => `- ${f}`));
  return l.join('\n');
}
