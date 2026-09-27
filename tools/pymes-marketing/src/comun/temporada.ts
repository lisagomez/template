/**
 * Calendario comercial de México. Sustituye al de EE. UU. de la fuente (Black Friday, Mother's
 * Day de mayo variable, 1099...). Las fechas con regla oficial se calculan; las que fija cada año
 * un organizador (Buen Fin, Hot Sale) se dan con su regla habitual y se marcan `aproximada`:
 * el dueño las confirma, no se inventan como hechos.
 */
import { diaDe, diaDeSemana, sumaDias, type Dia } from './fechas.js';

export interface FechaComercial {
  readonly desde: Dia;
  readonly hasta: Dia;
  readonly nombre: string;
  readonly precision: 'exacta' | 'aproximada';
  /** Qué suele mover en ventas, en una línea. */
  readonly nota: string;
  /** Palabras que ligan la fecha con productos o giros (para cruzar con el catálogo). */
  readonly afines: readonly string[];
}

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
export function pascua(anio: number): Dia {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return diaDe(anio, mes, dia);
}

/** n-ésimo `diaSemana` (0 = domingo) del mes; n = -1 es el último. */
export function enesimo(anio: number, mes: number, diaSemana: number, n: number): Dia {
  if (n < 0) {
    let d = sumaDias(diaDe(mes === 12 ? anio + 1 : anio, mes === 12 ? 1 : mes + 1, 1), -1);
    while (diaDeSemana(d) !== diaSemana) d = sumaDias(d, -1);
    return d;
  }
  let d = diaDe(anio, mes, 1);
  while (diaDeSemana(d) !== diaSemana) d = sumaDias(d, 1);
  return sumaDias(d, 7 * (n - 1));
}

function fija(anio: number, mes: number, dia: number, nombre: string, nota: string, afines: string[], dias = 1): FechaComercial {
  const desde = diaDe(anio, mes, dia);
  return { desde, hasta: sumaDias(desde, dias - 1), nombre, precision: 'exacta', nota, afines };
}

function tramo(desde: Dia, hasta: Dia, nombre: string, precision: FechaComercial['precision'], nota: string, afines: string[]): FechaComercial {
  return { desde, hasta, nombre, precision, nota, afines };
}

/** Fechas comerciales de un año, ordenadas. */
export function fechasComercialesMx(anio: number): FechaComercial[] {
  const p = pascua(anio);
  const revolucion = enesimo(anio, 11, 1, 3);
  const lista: FechaComercial[] = [
    tramo(diaDe(anio, 1, 2), diaDe(anio, 1, 31), 'Cuesta de enero', 'exacta', 'gasto contenido: funcionan paquetes de valor y meses sin intereses', ['basico', 'paquete', 'ahorro']),
    fija(anio, 1, 6, 'Día de Reyes', 'rosca, juguetes y regalos para niños', ['rosca', 'pan', 'juguete', 'regalo', 'nino']),
    fija(anio, 2, 14, 'Día del Amor y la Amistad', 'regalos, flores, chocolates, cenas en pareja', ['regalo', 'flor', 'chocolate', 'pastel', 'cena', 'postre']),
    tramo(sumaDias(p, -46), sumaDias(p, -1), 'Cuaresma', 'exacta', 'viernes sin carne: pescados, mariscos, capirotada', ['pescado', 'marisco', 'capirotada', 'vegetariano']),
    tramo(sumaDias(p, -7), p, 'Semana Santa', 'exacta', 'vacaciones: viajes, playa, menos gasto en ciudad', ['viaje', 'playa', 'vacaciones']),
    fija(anio, 4, 30, 'Día del Niño', 'juguetes, dulces, actividades para niños', ['juguete', 'dulce', 'nino', 'pastel']),
    fija(anio, 5, 10, 'Día de las Madres', 'la fecha más fuerte del primer semestre en regalos, comida y flores', ['regalo', 'flor', 'pastel', 'comida', 'mama', 'desayuno', 'postre']),
    tramo(enesimo(anio, 5, 1, -1), sumaDias(enesimo(anio, 5, 1, -1), 8), 'Hot Sale', 'aproximada', 'ventas en línea con descuento; la fecha la fija cada año la AMVO', ['en linea', 'envio', 'descuento']),
    tramo(enesimo(anio, 6, 0, 3), enesimo(anio, 6, 0, 3), 'Día del Padre', 'exacta', 'regalos, comida y bebidas para papá (tercer domingo de junio)', ['regalo', 'papa', 'carne', 'cerveza', 'comida']),
    tramo(sumaDias(enesimo(anio, 8, 1, -1), -21), enesimo(anio, 8, 1, -1), 'Regreso a clases', 'aproximada', 'útiles, uniformes, loncheras; el calendario lo fija la SEP', ['utiles', 'uniforme', 'lonche', 'mochila', 'escolar']),
    fija(anio, 9, 15, 'Fiestas Patrias', 'pozole, antojitos, decoración tricolor', ['pozole', 'antojito', 'tequila', 'fiesta', 'decoracion'], 2),
    fija(anio, 11, 1, 'Día de Muertos', 'pan de muerto, flor de cempasúchil, altares', ['pan', 'flor', 'dulce', 'calaverita', 'altar'], 2),
    tramo(sumaDias(revolucion, -3), revolucion, 'El Buen Fin', 'aproximada', 'el fin de semana de ofertas más grande del año; algunos años arranca el jueves', ['descuento', 'oferta', 'electronica', 'ropa', 'regalo']),
    fija(anio, 12, 12, 'Maratón Guadalupe-Reyes', 'posadas, reuniones y regalos hasta el 6 de enero', ['posada', 'regalo', 'pan', 'ponche', 'fiesta', 'comida'], 26),
    fija(anio, 12, 20, 'Pago de aguinaldo', 'fecha límite de ley: la gente trae dinero para compras navideñas', ['regalo', 'ropa', 'electronica']),
    fija(anio, 12, 24, 'Nochebuena y Navidad', 'cena, regalos y pedidos anticipados', ['cena', 'pavo', 'regalo', 'pastel', 'postre'], 2),
  ];
  return lista.sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Días de quincena (15 y último de mes) dentro del rango: cuando la gente cobra. */
export function quincenas(desde: Dia, dias: number): Dia[] {
  const fuera: Dia[] = [];
  for (let i = 0; i < dias; i++) {
    const d = sumaDias(desde, i);
    if (d.endsWith('-15') || sumaDias(d, 1).endsWith('-01')) fuera.push(d);
  }
  return fuera;
}

/** Fechas comerciales que tocan la ventana [desde, desde + dias). */
export function fechasEnVentana(desde: Dia, dias: number): FechaComercial[] {
  const hasta = sumaDias(desde, dias - 1);
  const anio = Number(desde.slice(0, 4));
  return [...fechasComercialesMx(anio), ...fechasComercialesMx(anio + 1)].filter((f) => f.hasta >= desde && f.desde <= hasta);
}
