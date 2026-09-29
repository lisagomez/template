/**
 * Casos de «Lectura» (lo que manda una pistola o la cámara: GS1-128, el código del proveedor, Digital
 * Link y el semáforo) y de «Catálogo» (importar, asignar por regla, reimportar sin duplicar y los
 * códigos anteriores que se siguen leyendo).
 */
import {
  aplicaImportacion, aRegistros, CATEGORIAS_EJEMPLO, completaClave, categoriaPorId, codigosAnteriores, esErrorLectura, estadoSemaforo, GS, identificaGtin, leeFilas, parseaCsv, parseaLectura,
  planificaImportacion, vinculaGtin, type EstadoAlmacen, type PlanImportacion,
} from '../../../../tools/etiquetas-gs1/dist/index.js';
import { base, lee, T } from './datos.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

const ais = (texto: string) => { const r = parseaLectura(texto); return esErrorLectura(r) ? `error ${r.error}` : r.elementos.map((e) => `(${e.ai})${e.valor}`).join(''); };

export const CASOS_LECTURA: readonly Caso[] = [
  {
    id: 'lec-pistola', herramienta: 'lectura', titulo: 'Pistola con ]C1 y separador GS real', trampa: null, esperado: 'pasa',
    entrada: '`]C1` + (02)(37) de una tarima ficticia, GS tras la cantidad, caducidad y lote.',
    async corre() {
      const leido = ais(`]C10209521234000020375${GS}17261030` + '10L4471');
      return verifica([[leido === '(02)09521234000020(37)5(17)261030(10)L4471', 'los cuatro AIs, en orden']], [leido], 'Lo que manda la pistola se entiende tal cual, sin adivinar.');
    },
  },
  {
    id: 'lec-sustituto', herramienta: 'lectura', titulo: 'GS sustituido (| ~ <GS>) y texto con paréntesis', trampa: null, esperado: 'pasa',
    entrada: 'La misma tarima con «|», con «<GS>» y como texto con paréntesis (HRI).',
    async corre() {
      const formas = ['0209521234000020375|17261030' + '10L4471', '0209521234000020375<GS>17261030' + '10L4471', '(02)09521234000020(37)5(17)261030(10)L4471'].map(ais);
      return verifica([[formas.every((f) => f === formas[2]), 'las tres dan lo mismo']], formas, 'Pistolas mal configuradas y texto tecleado dan el mismo resultado.');
    },
  },
  {
    id: 'lec-proveedor', herramienta: 'lectura', titulo: 'Código del proveedor: EAN-13 de la pieza e ITF-14 de la caja', trampa: null, esperado: 'pasa',
    entrada: '`]E0` + EAN-13 ficticio 9521111000013 y `]I1` + ITF-14 19521111000010.',
    async corre() {
      const ean = ais(']E09521111000013');
      const itf = lee(base(), ']I119521111000010');
      return verifica([[ean === '(01)09521111000013', 'EAN-13 a GTIN-14'], [itf.articulo?.sku === 'YOG-001' && itf.nivel === 'caja', 'el ITF-14 es la CAJA del yogurt']], [ean, `ITF-14 → ${itf.articulo?.sku ?? '—'} (${itf.nivel ?? '—'})`], 'Lo que trae la caja del proveedor se lee aunque no sea GS1-128.');
    },
  },
  {
    id: 'lec-digital-link', herramienta: 'lectura', titulo: 'GS1 Digital Link con lote en la ruta y caducidad en la consulta', trampa: null, esperado: 'pasa',
    entrada: 'https://ejemplo.mx/01/09521234000020/10/L4471?17=261030 (cualquier dominio).',
    async corre() {
      const leido = ais('https://ejemplo.mx/01/09521234000020/10/L4471?17=261030');
      return verifica([[/\(01\)09521234000020/.test(leido) && /\(10\)L4471/.test(leido) && /\(17\)261030/.test(leido), 'clave, lote y caducidad']], [leido], 'Un QR de producto con lote y fecha se recibe sin foto.');
    },
  },
  {
    id: 'lec-publicidad', herramienta: 'lectura', titulo: 'Un QR de publicidad o un Code 128 sin GS1 NO se toman por producto', trampa: 'código que no es GS1', esperado: 'pasa',
    entrada: 'https://uqr.to/18u0o, `]Q1` + la misma URL, `]C0ABC123`, `]d1HOLA`.',
    async corre() {
      const r = ['https://uqr.to/18u0o', ']Q1https://uqr.to/18u0o', ']C0ABC123', ']d1HOLA'].map(ais);
      return verifica([[r.every((x) => x === 'error no-gs1'), 'los cuatro se rechazan como «no es GS1»']], r, 'No se inventa un producto a partir de publicidad.');
    },
  },
  {
    id: 'lec-sin-separador', herramienta: 'lectura', titulo: 'Sin el separador tras un campo variable: no adivina, avisa', trampa: 'separador GS que falta', esperado: 'pasa',
    entrada: '`]C1` + (02)(37)50 pegado a (17) sin GS.',
    async corre() {
      const r = ais(']C102095212340000203750172610301' + '0L4471');
      return verifica([[r === 'error falta-separador', 'error «falta separador»']], [r], 'Una lectura ambigua no se interpreta por su cuenta.');
    },
  },
  {
    id: 'lec-semaforo', herramienta: 'lectura', titulo: 'Semáforo de cinco estados (lácteos: alerta ≤10, promoción ≤6, retiro ≤3)', trampa: null, esperado: 'pasa',
    entrada: 'Días para caducar: 40, 8, 5, 2 y −1.',
    async corre() {
      const lac = categoriaPorId(CATEGORIAS_EJEMPLO, 'lacteos');
      const e = [40, 8, 5, 2, -1].map((d) => estadoSemaforo(d, lac));
      return verifica([[e.join(',') === 'vigente,alerta,promocion,retiro,vencido', 'los cinco en orden']], [e.join(' · ')], 'El color dice la acción: vender, priorizar, promover, retirar o merma.');
    },
  },
];

const CAB = 'sku,descripcion,categoria,sitios,marca_propia,gtin,gtin_caja,unidades_por_caja,cajas_por_tarima,vida_util_dias';
const V1 = `${CAB}\nYOG-001,Yogurt natural 1 kg,lacteos,SUC-CENTRO,NO,9521111000013,19521111000010,12,50,35\nPAN-004,Pan de caja 680 g,panaderia,SUC-CENTRO,SI,,,10,,6\nLEC-002,Leche entera 1 L,lacteos,SUC-CENTRO,NO,,,12,60,20`;
const planDe = (csv: string, e: EstadoAlmacen): PlanImportacion => { const f = leeFilas(aRegistros(parseaCsv(csv)), CATEGORIAS_EJEMPLO.map((c) => c.id)); return planificaImportacion(f.filas, f.errores, e); };
const aplica = (csv: string, e: EstadoAlmacen, id: string) => aplicaImportacion(e, planDe(csv, e), { id, archivo: `${id}.csv`, huella: 'sha256:laboratorio', operador: 'laboratorio', fecha: T(8) });
const vacio = (): EstadoAlmacen => ({ ...base(), articulos: {} });
const fila = (p: PlanImportacion, sku: string) => p.filas.find((f) => f.sku === sku);

export const CASOS_CATALOGO: readonly Caso[] = [
  {
    id: 'cat-asigna', herramienta: 'catalogo', titulo: 'Asignación por regla: del fabricante, propio de la casa e interno', trampa: null, esperado: 'pasa',
    entrada: 'CSV ficticio: yogurt con sus GTIN, pan de marca propia sin código y leche sin código de caja.',
    async corre() {
      const p = planDe(V1, vacio());
      const pan = fila(p, 'PAN-004')?.articulo;
      const leche = fila(p, 'LEC-002')?.articulo;
      return verifica([[p.filas.every((f) => f.estado === 'nuevo'), 'los tres nuevos'], [pan?.reglaUnidad === 'propio' && pan.gtinUnidad?.startsWith('09521234') === true, 'el pan con el prefijo de la casa'], [leche?.reglaCaja === 'interno' && leche.gtinCaja?.startsWith('004') === true, 'la caja de leche con un interno 04']],
        [JSON.stringify(p.resumen)], 'Cada código dice de dónde salió; ninguno se inventa con un prefijo ajeno.');
    },
  },
  {
    id: 'cat-idempotente', herramienta: 'catalogo', titulo: 'Reimportar el mismo archivo: todo «sin cambio» y cero números nuevos', trampa: null, esperado: 'pasa',
    entrada: 'El CSV anterior, dos veces.',
    async corre() {
      const e1 = aplica(V1, vacio(), 'v1');
      const p2 = planDe(V1, e1);
      return verifica([[p2.filas.every((f) => f.estado === 'sin-cambio'), 'todo sin cambio'], [p2.filas.every((f) => f.nuevas.length === 0), 'cero asignaciones nuevas']], [JSON.stringify(p2.resumen)], 'Subir dos veces el mismo Excel no duplica nada.');
    },
  },
  {
    id: 'cat-duplicado', herramienta: 'catalogo', titulo: 'El mismo GTIN en dos artículos: conflicto, no se resuelve solo', trampa: 'GTIN repetido', esperado: 'pasa',
    entrada: 'Un segundo artículo con la caja 19521111000010 del yogurt.',
    async corre() {
      const p = planDe(`${V1}\nYOG-002,Yogurt fresa 1 kg,lacteos,SUC-CENTRO,NO,,19521111000010,12,50,35`, vacio());
      const f = fila(p, 'YOG-002');
      return verifica([[f?.estado === 'conflicto', 'conflicto']], f?.motivos ?? [], 'Un GTIN es de un solo artículo; la decisión es humana.');
    },
  },
  {
    id: 'cat-prefijo-ajeno', herramienta: 'catalogo', titulo: 'Marca propia con un GTIN de otro prefijo: conflicto', trampa: 'prefijo ajeno en marca propia', esperado: 'pasa',
    entrada: 'Pan de marca propia con el GTIN 7501031302741 (no es de la casa).',
    async corre() {
      const f = fila(planDe(`${CAB}\nPAN-004,Pan de caja 680 g,panaderia,SUC-CENTRO,SI,7501031302741,,10,,6`, vacio()), 'PAN-004');
      return verifica([[f?.estado === 'conflicto', 'conflicto'], [(f?.motivos ?? []).some((m) => /prefijo/.test(m)), 'dice que es un prefijo ajeno']], f?.motivos ?? [], 'Nunca se etiqueta una marca propia con el prefijo de otro.');
    },
  },
  {
    id: 'cat-excel', herramienta: 'catalogo', titulo: 'Excel convirtió el GTIN a notación científica: inválido, con la explicación', trampa: 'cifras perdidas por Excel', esperado: 'pasa',
    entrada: 'GTIN «9.52111E+12».',
    async corre() {
      const f = fila(planDe(`${CAB}\nYOG-001,Yogurt natural 1 kg,lacteos,SUC-CENTRO,NO,9.52111E+12,,12,50,35`, vacio()), 'YOG-001');
      return verifica([[f?.estado === 'invalido', 'inválido'], [(f?.motivos ?? []).some((m) => /notación científica/.test(m)), 'explica qué pasó']], f?.motivos ?? [], 'Un número que perdió cifras no se toma por un GTIN.');
    },
  },
  {
    id: 'cat-anterior', herramienta: 'catalogo', titulo: 'El GTIN anterior se sigue leyendo y no se le da a otro artículo', trampa: 'código retirado reasignado', esperado: 'pasa',
    entrada: 'La leche recibe el ITF-14 del proveedor en lugar de su interno; luego se intenta dar el interno al yogurt.',
    async corre() {
      const e1 = aplica(V1, vacio(), 'v1');
      const interno = e1.articulos['LEC-002']!.gtinCaja!;
      const itf = completaClave('1750103130274');
      const v = vinculaGtin(e1, { sku: 'LEC-002', gtin: itf, nivel: 'caja' }, 'op-9c8d7e6f', T(9), 'v1');
      if (!v.resultado.ok) throw new Error(v.resultado.motivo);
      const otro = vinculaGtin(v.estado, { sku: 'YOG-001', gtin: interno, nivel: 'caja' }, 'op-9c8d7e6f', T(10), 'v2');
      return verifica([[identificaGtin(v.estado, interno)?.articulo.sku === 'LEC-002', 'el interno viejo sigue siendo de la leche'], [!otro.resultado.ok, 'no se le da al yogurt'], [codigosAnteriores(v.estado).length === 1, 'un código anterior en el libro']],
        [`anterior ${interno} → vigente ${itf}`, otro.resultado.ok ? '' : otro.resultado.motivo], 'Las cajas con la etiqueta vieja no se vuelven invisibles.');
    },
  },
];

