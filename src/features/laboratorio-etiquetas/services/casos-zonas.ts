/**
 * Casos de «Escanear por zona» (cada escaneo hace lo de su zona para su rol; el almacenista a ciegas;
 * deshacer como corrección) y de «Ronda del día» (determinista, se cierra por escaneo, conteo cíclico
 * por riesgo con sus razones).
 */
import {
  deshazMovimiento, ejecutaEscaneo, eligeConteoCiclico, estadoDeTareas, generaRonda, salida, vistaSinCantidades, type EstadoAlmacen, type PedidoEscaneo, type RolZona, type Zona,
} from '../../../../tools/etiquetas-gs1/dist/index.js';
import { caja, CENTRO, conLotes, G, HOY, mas, OP, OTRO, sitioSurtido, T, ubicacion } from './datos.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

let n = 0;
const pedido = (zona: Zona, texto: string, extra: Partial<PedidoEscaneo> = {}, rol: RolZona = 'almacenista'): PedidoEscaneo =>
  ({ sitio: CENTRO, zona, texto, rol, operador: OP, hoy: HOY, cuando: T(9), id: `lab-${++n}`, hora: '09:00', ...extra });
const escanea = (e: EstadoAlmacen, zona: Zona, texto: string, extra: Partial<PedidoEscaneo> = {}, rol: RolZona = 'almacenista') => ejecutaEscaneo(e, pedido(zona, texto, extra, rol));

export const CASOS_ZONAS: readonly Caso[] = [
  {
    id: 'zon-recibo', herramienta: 'zonas', titulo: 'Zona de recibo: una caja con (17)(10) se recibe con UN escaneo', trampa: null, esperado: 'pasa',
    entrada: 'Recibo escanea 6 cajas de yogurt ficticio del lote Z034.',
    async corre() {
      const r = escanea(sitioSurtido(), 'recibo', caja(G.YOG, 34, 'Z034'), { veces: 6 }, 'recibo');
      return verifica([[r.vista.tipo === 'recibido', 'recibido'], [r.vista.inventario?.despues.lote === 6, 'con su foto del inventario (lote 0 → 6)']], [r.vista.titulo, ...r.vista.detalle], 'En recibo, escanear ES recibir: sin menús.');
    },
  },
  {
    id: 'zon-fefo', herramienta: 'zonas', titulo: 'Almacén: el lote que vence antes se baja primero («baja primero ése»)', trampa: null, esperado: 'pasa',
    entrada: 'Dos lotes de refresco en almacén (vencen en 40 y 80 días); se escanea el de 80.',
    async corre() {
      const e = conLotes([['REF-007', 'E040', 40, 6, 'almacen'], ['REF-007', 'E080', 80, 6, 'almacen']]);
      const r = escanea(e, 'almacen', caja(G.REF, 80, 'E080'));
      return verifica([[r.vista.fefo?.lote === 'E040', 'dice «baja primero E040»']], [r.vista.titulo, r.vista.fefo ? `baja primero ${r.vista.fefo.lote} de ${r.vista.fefo.ubicacion}` : 'sin aviso FEFO'], 'El FEFO se hace solo, dentro del trabajo.');
    },
  },
  {
    id: 'zon-retira', herramienta: 'zonas', titulo: 'Piso: retirar ES el escaneo (rojo a almacén, vencido a merma)', trampa: null, esperado: 'pasa',
    entrada: 'En piso: yogurt R003 (rojo, 3 días) y X000 (vencido ayer).',
    async corre() {
      const e0 = sitioSurtido();
      const rojo = escanea(e0, 'piso', caja(G.YOG, 3, 'R003'));
      const vencido = escanea(rojo.estado, 'piso', caja(G.YOG, -1, 'X000'));
      const donde = (e: EstadoAlmacen, lote: string) => e.existencias.filter((x) => x.lote === lote && x.cantidad > 0).map((x) => x.zona).join(',');
      return verifica([[rojo.vista.tipo === 'retirado' && donde(rojo.estado, 'R003') === 'almacen', 'el rojo pasa a almacén'], [vencido.vista.tipo === 'retirado' && donde(vencido.estado, 'X000') === 'merma', 'el vencido a merma']],
        [rojo.vista.titulo, vencido.vista.titulo], 'Todas las cajas del lote salen del anaquel con un gesto.');
    },
  },
  {
    id: 'zon-rol', herramienta: 'zonas', titulo: 'El rol que no opera en una zona se rechaza (el servidor es la frontera)', trampa: 'zona ajena al rol', esperado: 'pasa',
    entrada: 'El almacenista escanea en recibo; recibo escanea en piso y la etiqueta de piso.',
    async corre() {
      const e = sitioSurtido();
      const r = [escanea(e, 'recibo', caja(G.YOG, 34, 'Z034')), escanea(e, 'piso', caja(G.YOG, 20, 'B050'), {}, 'recibo'), escanea(e, 'recibo', ubicacion('PISO'), {}, 'recibo')];
      return verifica([[r.every((x) => x.vista.tipo === 'error' && x.eventos.length === 0), 'los tres rechazados y sin eventos']], r.map((x) => x.vista.titulo), 'La pantalla ayuda; la frontera la pone el servidor.');
    },
  },
  {
    id: 'zon-ciego', herramienta: 'zonas', titulo: 'El almacenista no ve NINGUNA cantidad del sistema (el testigo de 137 cajas)', trampa: 'cantidad que se cuela', esperado: 'pasa',
    entrada: 'El lote A100 tiene 137 cajas en almacén; el almacenista lo escanea, lo sube todo a piso y pide más de las que hay.',
    async corre() {
      const e = sitioSurtido();
      const vistas = [escanea(e, 'almacen', caja(G.YOG, 30, 'A100')), escanea(e, 'piso', caja(G.YOG, 30, 'A100'), { todas: true }), escanea(e, 'piso', caja(G.YOG, 30, 'A100'), { veces: 500 })].map((r) => vistaSinCantidades(r.vista));
      const texto = JSON.stringify(vistas);
      return verifica([[!/\b137\b/.test(texto), 'el 137 no aparece'], [vistas[1]!.tipo === 'movido', '«todas» sube sin decir cuántas'], [vistas[2]!.tipo === 'error', 'pedir de más es un error que no dice cuántas hay']], vistas.map((v) => `${v.tipo}: ${v.titulo} · ${v.detalle.join(' ')}`), 'El conteo es ciego porque ninguna respuesta lleva lo que dice el sistema.');
    },
  },
  {
    id: 'zon-deshacer', herramienta: 'zonas', titulo: 'Deshacer es una CORRECCIÓN, y solo del propio movimiento', trampa: 'deshacer lo de otro', esperado: 'pasa',
    entrada: 'El almacenista sube una caja de B050 a piso y la deshace; otra persona intenta deshacerla.',
    async corre() {
      const e = conLotes([['YOG-001', 'B050', 20, 5, 'almacen']]);
      const r = escanea(e, 'piso', caja(G.YOG, 20, 'B050'));
      const hash = r.vista.deshacer!;
      const ajeno = deshazMovimiento(r.estado, CENTRO, hash, OTRO, T(9, 5), 'd1');
      const propio = deshazMovimiento(r.estado, CENTRO, hash, OP, T(9, 5), 'd2');
      const tarde = deshazMovimiento(r.estado, CENTRO, hash, OP, T(9, 30), 'd3');
      return verifica([[!ajeno.resultado.ok, 'otra persona no'], [propio.resultado.ok && propio.resultado.eventos[0]?.tipo === 'CORRECCION', 'el propio, a los 5 min: CORRECCION en la cadena'], [!tarde.resultado.ok, 'a los 30 min ya no (se corrige desde el expediente)']],
        [ajeno.resultado.ok ? 'lo deshizo otro' : ajeno.resultado.motivo, propio.resultado.ok ? 'propio: ok' : propio.resultado.motivo, tarde.resultado.ok ? 'tarde: lo deshizo' : tarde.resultado.motivo], 'Nada se borra: se corrige, y queda quién.');
    },
  },
];

const tareas = (e: EstadoAlmacen, hora = '09:00') => estadoDeTareas(e, generaRonda(e, CENTRO, HOY, { ahora: T(6) }), hora);

export const CASOS_RONDA: readonly Caso[] = [
  {
    id: 'ron-genera', herramienta: 'ronda', titulo: 'La ronda sale del estado: determinista, en orden de recorrido y sin cantidades', trampa: null, esperado: 'pasa',
    entrada: 'Sucursal Centro ficticia con un lote de cada color y el testigo de 137 cajas.',
    async corre() {
      const e = sitioSurtido();
      const [a, b] = [generaRonda(e, CENTRO, HOY, { ahora: T(6) }), generaRonda(e, CENTRO, HOY, { ahora: T(6) })];
      const zonas = a.tareas.map((t) => (t.tipo === 'resurtir' ? 'almacen' : t.zona));
      const orden = ['recibo', 'almacen', 'piso', 'merma'];
      const enOrden = zonas.every((z, i) => i === 0 || orden.indexOf(z) >= orden.indexOf(zonas[i - 1]!));
      const texto = a.tareas.map((t) => t.instruccion).join(' ');
      return verifica([[JSON.stringify(a) === JSON.stringify(b), 'dos veces la misma'], [enOrden, 'recibo → almacén → piso → merma'], [!/\b137\b|\d+ cajas?/.test(texto), 'ninguna instrucción dice cuántas cajas']],
        a.tareas.map((t) => `${t.orden}. ${t.tipo} ${t.ubicacion}${t.lote ? ` ${t.lote.lote}` : ''} (hasta ${t.hasta})`), 'Cada mañana, lo que hay que hacer hoy, en el orden en que se camina.');
    },
  },
  {
    id: 'ron-cierra', herramienta: 'ronda', titulo: 'Una tarea se cierra SOLO con el escaneo correcto, con su evento en la cadena', trampa: 'escanear otro lote', esperado: 'pasa',
    entrada: 'La tarea «retirar R003» de la ronda; se escanea primero B050 y después R003.',
    async corre() {
      const e = sitioSurtido();
      const ronda = generaRonda(e, CENTRO, HOY, { ahora: T(6) });
      const t = ronda.tareas.find((x) => x.tipo === 'retirar' && x.lote?.lote === 'R003')!;
      const otro = ejecutaEscaneo(e, pedido('piso', caja(G.YOG, 20, 'B050')), ronda);
      const bien = ejecutaEscaneo(e, pedido('piso', caja(G.YOG, 3, 'R003')), ronda);
      const cierre = bien.eventos.find((x) => x.tipo === 'TAREA_CERRADA');
      return verifica([[estadoDeTareas(otro.estado, ronda, '09:00').find((x) => x.id === t.id)?.estado === 'pendiente', 'otro lote no la cierra'], [cierre?.datos['tarea'] === t.id && cierre.operador === OP, 'TAREA_CERRADA con su seudónimo'], [estadoDeTareas(bien.estado, ronda, '09:00').find((x) => x.id === t.id)?.estado === 'hecha', 'queda hecha']],
        [t.instruccion], 'No hay botón «hecho»: lo prueba el escaneo.');
    },
  },
  {
    id: 'ron-ya-no-aplica', herramienta: 'ronda', titulo: 'Si el lote ya no está (se tiró o se vendió), la tarea se cierra sola con su motivo', trampa: null, esperado: 'pasa',
    entrada: 'La tarea «retirar X000»; alguien registra la merma por otro lado.',
    async corre() {
      const e = sitioSurtido();
      const ronda = generaRonda(e, CENTRO, HOY, { ahora: T(6) });
      const t = ronda.tareas.find((x) => x.tipo === 'retirar' && x.lote?.lote === 'X000')!;
      const m = salida(e, { sitio: CENTRO, tipo: 'MERMA', lote: { gtin: G.YOG, lote: 'X000', caducidad: mas(-1) }, cajas: 3, motivo: 'se tiró' }, HOY, T(8), OP);
      const x = m.resultado.ok ? estadoDeTareas(m.estado, ronda, '09:00').find((y) => y.id === t.id) : undefined;
      return verifica([[x?.estado === 'ya-no-aplica' && Boolean(x.motivo), 'ya no aplica, con motivo']], [x?.motivo ?? (m.resultado.ok ? '—' : m.resultado.motivo)], 'Nadie persigue una tarea que ya no existe.');
    },
  },
  {
    id: 'ron-atrasada', herramienta: 'ronda', titulo: 'Lo pendiente pasada su hora se marca atrasado (el aviso del supervisor)', trampa: null, esperado: 'pasa',
    entrada: 'La misma ronda consultada a las 09:00 y a las 23:00.',
    async corre() {
      const e = sitioSurtido();
      const [temprano, tarde] = [tareas(e, '09:00'), tareas(e, '23:00')];
      return verifica([[temprano.every((t) => t.estado !== 'atrasada'), 'a las 9 nada atrasado'], [tarde.filter((t) => t.estado === 'atrasada').length === tarde.filter((t) => t.estado === 'pendiente' || t.estado === 'atrasada').length, 'a las 23 todo lo pendiente está atrasado']],
        [`atrasadas a las 23: ${tarde.filter((t) => t.estado === 'atrasada').length}`], 'Lo que se atrasa escala solo.');
    },
  },
  {
    id: 'ron-ciclico', herramienta: 'ronda', titulo: 'Conteo cíclico: pocas ubicaciones por riesgo, con sus razones y sin cantidades', trampa: null, esperado: 'pasa',
    entrada: 'La sucursal ficticia; se eligen hasta 3 ubicaciones.',
    async corre() {
      const e = sitioSurtido();
      const [a, b] = [eligeConteoCiclico(e, CENTRO, HOY), eligeConteoCiclico(e, CENTRO, HOY)];
      const razones = a.flatMap((u) => u.razones).join(' ');
      return verifica([[a.length > 0 && a.length <= 3, '1 a 3 ubicaciones'], [a.every((u) => u.razones.length > 0), 'cada una con su razón'], [JSON.stringify(a) === JSON.stringify(b), 'determinista'], [!/\b137\b|\d+ cajas?/.test(razones), 'razones sin cantidades']],
        a.map((u) => `${u.ubicacion} (${u.puntaje}): ${u.razones.join('; ')}`), 'Se cuenta lo que más riesgo tiene, y se dice por qué.');
    },
  },
  {
    id: 'ron-resurtir', herramienta: 'ronda', titulo: 'Resurtir: con cajas del lote ya en piso, escanearlo baja otra mientras la tarea siga', trampa: 'lote ya en piso', esperado: 'pasa',
    entrada: 'Refresco: en piso uno que vence en 80 días; en almacén P040 (vence en 40).',
    async corre() {
      const e = conLotes([['REF-007', 'P080', 80, 4, 'piso'], ['REF-007', 'P040', 40, 6, 'almacen']]);
      const ronda = generaRonda(e, CENTRO, HOY, { ahora: T(6) });
      const t = ronda.tareas.find((x) => x.tipo === 'resurtir' && x.lote?.lote === 'P040');
      const uno = ejecutaEscaneo(e, pedido('piso', caja(G.REF, 40, 'P040'), { veces: 1 }));
      const otraVez = ejecutaEscaneo(uno.estado, pedido('piso', caja(G.REF, 40, 'P040')), ronda);
      const despues = ejecutaEscaneo(otraVez.estado, pedido('piso', caja(G.REF, 40, 'P040')), ronda);
      return verifica([[Boolean(t), 'hay tarea de resurtir P040'], [otraVez.vista.tipo === 'movido' && otraVez.vista.tarea?.id === t?.id, 'baja otra caja y cierra la tarea'], [despues.vista.tipo === 'info', 'ya cerrada, es una consulta']], [t?.instruccion ?? '—', otraVez.vista.titulo, despues.vista.titulo], 'El escaneo hace la tarea que la persona está haciendo.');
    },
  },
];
