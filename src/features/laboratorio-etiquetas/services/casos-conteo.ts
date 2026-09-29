/**
 * Casos de «Conteo ciego» (cuenta a ciegas, recuenta OTRA persona, autoriza quien no contó), de
 * «Expediente» (cadena de hashes, proyección y anclaje firmado) y del «Agente de riesgo» (recomienda;
 * decide una persona; con la cadena rota no actúa).
 */
import {
  abreConteo, aplicaConteo, cadenaDe, centralVacio, cierraRonda, conteoDe, corridaAgente, decide, evaluaRiesgo, integridadLocal, leeEnConteo, leeFilasVentas, nuevoEvento,
  preparaAncla, recibeAncla, recomendaciones, registraLlave, transfiere, ventasFicticias, verificaCadena, verificaSitio, verificaTransferencias, vistaConteoSinCantidades,
  type EstadoAlmacen, type Evento, type Zona,
} from '../../../../tools/etiquetas-gs1/dist/index.js';
import { firmaAncla, generaLlaves, idLlave, verificador } from '../../../../tools/etiquetas-gs1/dist/firma.js';
import { caja, CENTRO, conLotes, G, HOY, lee, mas, ok, OP, OTRO, PONIENTE, SUPER, T } from './datos.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

// --- Conteo ciego -----------------------------------------------------------------------------
const FOLIO = 'CNT-LAB-1';
const conConteo = (ubicaciones?: readonly string[]) => {
  const e = conLotes([['YOG-001', 'A100', 30, 137, 'almacen'], ['YOG-001', 'B050', 20, 5, 'piso']]);
  return ok(abreConteo(e, { sitio: CENTRO, zonas: ['almacen', 'piso'], tolerancia: 0, ...(ubicaciones ? { ubicaciones } : {}) }, FOLIO, T(10), SUPER, integridadLocal(e, CENTRO))).estado;
};
const cuenta = (e: EstadoAlmacen, zona: Zona, lote: string, dias: number, veces: number, quien = OP) => leeEnConteo(e, FOLIO, { zona, lectura: lee(e, caja(G.YOG, dias, lote)), veces }, T(11), quien);
const exacto = (e: EstadoAlmacen) => ok(cuenta(ok(cuenta(e, 'almacen', 'A100', 30, 137)).estado, 'piso', 'B050', 20, 5)).estado;
const conFaltante = (e: EstadoAlmacen) => ok(cuenta(ok(cuenta(e, 'almacen', 'A100', 30, 136)).estado, 'piso', 'B050', 20, 5)).estado;

export const CASOS_CONTEO: readonly Caso[] = [
  {
    id: 'con-cuadra', herramienta: 'conteo', titulo: 'Un conteo que cuadra se cierra sin reconteo y se aplica como CONTEO con acta', trampa: null, esperado: 'pasa',
    entrada: 'Conteo de almacén y piso de la sucursal ficticia; se cuentan exactas 137 y 5 cajas.',
    async corre() {
      const e = ok(cierraRonda(exacto(conConteo()), FOLIO)).estado;
      const a = ok(aplicaConteo(e, FOLIO, undefined, T(12), SUPER, integridadLocal(e, CENTRO)));
      return verifica([[conteoDe(e, FOLIO)?.estado === 'por-aplicar', 'sin reconteo'], [a.eventos.length > 0 && a.eventos.every((x) => x.tipo === 'CONTEO'), 'eventos CONTEO'], [Boolean(a.valor.acta), 'con acta']], [`${a.eventos.length} evento(s) · acta ${String(a.valor.acta).slice(0, 18)}…`], 'Lo contado queda en la cadena de cada lote.');
    },
  },
  {
    id: 'con-ciego', herramienta: 'conteo', titulo: 'La vista de quien cuenta no lleva lo esperado ni la conciliación', trampa: 'cantidad del sistema en la vista', esperado: 'pasa',
    entrada: 'El almacén tiene 137 cajas del lote A100; el contador ve el conteo mientras cuenta y al cerrar.',
    async corre() {
      const e = cuenta(conConteo(), 'almacen', 'A100', 30, 10).estado;
      const [contando, cerrado] = [vistaConteoSinCantidades(conteoDe(e, FOLIO)!, OP), vistaConteoSinCantidades(conteoDe(ok(cierraRonda(e, FOLIO)).estado, FOLIO)!, OP)];
      const texto = JSON.stringify([contando, cerrado]);
      return verifica([[!/\b137\b/.test(texto), 'el 137 no aparece'], [!/esperado|conciliacion/.test(texto), 'ni «esperado» ni conciliación']], [`${contando.lecturas.length} lectura(s) propias a la vista`], 'Se cuenta sin saber cuánto debería haber.');
    },
  },
  {
    id: 'con-reconteo', herramienta: 'conteo', titulo: 'Lo que sale de la tolerancia lo recuenta OTRA persona', trampa: 'recontar lo propio', esperado: 'pasa',
    entrada: 'Se cuentan 136 de 137 cajas (faltante de 1, tolerancia 0); recuenta el mismo y después otro.',
    async corre() {
      const e = ok(cierraRonda(conFaltante(conConteo()), FOLIO)).estado;
      const mismo = cuenta(e, 'almacen', 'A100', 30, 136, OP);
      const otro = cuenta(e, 'almacen', 'A100', 30, 137, OTRO);
      return verifica([[conteoDe(e, FOLIO)?.estado === 'reconteo', 'pasa a reconteo'], [!mismo.resultado.ok, 'el mismo no recuenta'], [otro.resultado.ok, 'otra persona sí']], [mismo.resultado.ok ? 'lo dejó recontar' : mismo.resultado.motivo], 'Un segundo par de ojos, no el mismo.');
    },
  },
  {
    id: 'con-autoriza', herramienta: 'conteo', titulo: 'Nadie autoriza lo que contó', trampa: 'autorizar lo propio', esperado: 'pasa',
    entrada: 'El faltante se confirma en el reconteo; autoriza primero quien contó y después el supervisor.',
    async corre() {
      const r1 = ok(cierraRonda(conFaltante(conConteo()), FOLIO)).estado;
      const r2 = ok(cierraRonda(ok(cuenta(ok(cuenta(r1, 'almacen', 'A100', 30, 136, OTRO)).estado, 'piso', 'B050', 20, 5, OTRO)).estado, FOLIO)).estado;
      const suyo = aplicaConteo(r2, FOLIO, OP, T(13), SUPER, integridadLocal(r2, CENTRO));
      const ajeno = aplicaConteo(r2, FOLIO, 'op-1a2b3c4d', T(13), SUPER, integridadLocal(r2, CENTRO));
      return verifica([[!suyo.resultado.ok, 'quien contó no autoriza'], [ajeno.resultado.ok, 'alguien que no contó sí']], [suyo.resultado.ok ? 'autorizó quien contó' : suyo.resultado.motivo], 'Separar contar de autorizar, como en un WMS serio.');
    },
  },
  {
    id: 'con-cadena-rota', herramienta: 'conteo', titulo: 'Con la cadena rota NO se abre el conteo (contar legalizaría la manipulación)', trampa: 'contar sobre datos tocados', esperado: 'pasa',
    entrada: 'La integridad del sitio falla.',
    async corre() {
      const e = conLotes([['YOG-001', 'A100', 30, 137, 'almacen']]);
      const r = abreConteo(e, { sitio: CENTRO, zonas: ['almacen'], tolerancia: 0 }, FOLIO, T(10), SUPER, { ok: false, motivo: 'cadena rota en el evento #1' });
      return verifica([[!r.resultado.ok, 'no se abre']], [r.resultado.ok ? 'se abrió' : r.resultado.motivo], 'Primero se investiga; después se cuenta.');
    },
  },
  {
    id: 'con-ciclico', herramienta: 'conteo', titulo: 'Un conteo cíclico solo acepta sus ubicaciones', trampa: 'contar fuera de lo elegido', esperado: 'pasa',
    entrada: 'Conteo cíclico solo de PISO; se intenta leer en el almacén.',
    async corre() {
      const e = conConteo(['PISO']);
      const fuera = cuenta(e, 'almacen', 'A100', 30, 137);
      const dentro = cuenta(e, 'piso', 'B050', 20, 5);
      return verifica([[!fuera.resultado.ok, 'fuera de sus ubicaciones: no'], [dentro.resultado.ok, 'en PISO: sí']], [fuera.resultado.ok ? 'contó fuera' : fuera.resultado.motivo], 'Pocas ubicaciones al día, y solo esas.');
    },
  },
];

// --- Expediente: cadena, proyección y anclaje --------------------------------------------------
const cadena = () => {
  const e = conLotes([['YOG-001', 'A100', 30, 30, 'almacen'], ['YOG-001', 'B050', 20, 5, 'piso'], ['DUL-001', 'N010', 10, 6, 'piso']]);
  return { e, c: cadenaDe(e, CENTRO) };
};

function anclada(c: readonly Evento[]) {
  const llaves = generaLlaves();
  const id = idLlave(llaves.publica);
  const verif = verificador({ [id]: llaves.publica });
  const central = registraLlave(centralVacio(), CENTRO, { id, publica: llaves.publica, registrada: T(0) }, T(0));
  const a = preparaAncla(CENTRO, c, [], HOY, T(23))!;
  return { anclas: recibeAncla(central, firmaAncla(a, llaves.privada), verif, T(23)).central.anclas[CENTRO]!, id, verif };
}

export const CASOS_EXPEDIENTE: readonly Caso[] = [
  {
    id: 'exp-cadena', herramienta: 'expediente', titulo: 'La cadena del sitio verifica y el ancla firmada la cubre entera', trampa: null, esperado: 'pasa',
    entrada: 'Tres recepciones ficticias en la Sucursal Centro, ancladas con una llave Ed25519 del día.',
    async corre() {
      const { c } = cadena();
      const { anclas, id, verif } = anclada(c);
      const i = verificaSitio(CENTRO, c, anclas, id, verif);
      return verifica([[verificaCadena(CENTRO, c).ok, 'la cadena verifica'], [i.ok && i.sinAnclar === 0, 'todo anclado y verificado']], [`${c.length} eventos · raíz ${anclas[0]?.ancla.raiz.slice(0, 20)}…`], 'Cada evento prueba su inclusión en la raíz firmada del día.');
    },
  },
  {
    id: 'exp-alterado', herramienta: 'expediente', titulo: 'Cambiar la caducidad de un evento viejo rompe la cadena EN ESA secuencia', trampa: 'editar la historia', esperado: 'pasa',
    entrada: 'El evento #2 cambia su caducidad.',
    async corre() {
      const { c } = cadena();
      const v = verificaCadena(CENTRO, c.map((x) => (x.seq === 2 ? { ...x, lote: { ...x.lote, caducidad: mas(200) } } : x)));
      return verifica([[!v.ok && v.rotura.seq === 2, 'rotura en #2']], [v.ok ? 'no lo vio' : `${v.rotura.motivo}: ${v.rotura.detalle}`], 'Nadie cambia una caducidad a escondidas.');
    },
  },
  {
    id: 'exp-reescrita', herramienta: 'expediente', titulo: 'Recalcular la cadena ENTERA la deja válida localmente, pero el ancla la delata', trampa: 'reescribir todos los hashes', esperado: 'pasa',
    entrada: 'Quien tiene escritura cambia el evento #2 y recalcula todos los hashes.',
    async corre() {
      const { c } = cadena();
      const { anclas, id, verif } = anclada(c);
      const reescrita: Evento[] = [];
      for (const x of c) {
        const { hash: _h, anterior: _a, anteriorLote: _l, ...b } = x;
        void _h; void _a; void _l;
        reescrita.push(nuevoEvento(CENTRO, reescrita, x.seq === 2 ? { ...b, lote: { ...b.lote, caducidad: mas(200) } } : b));
      }
      const i = verificaSitio(CENTRO, reescrita, anclas, id, verif);
      return verifica([[verificaCadena(CENTRO, reescrita).ok, 'localmente parece válida'], [!i.ok, 'el ancla la delata']], [i.primerFallo ?? 'íntegra'], 'Para eso existe el ancla fuera del sitio.');
    },
  },
  {
    id: 'exp-estado-tocado', herramienta: 'expediente', titulo: 'Tocar el inventario por fuera de la cadena se delata', trampa: 'editar el archivo de estado', esperado: 'pasa',
    entrada: 'Alguien sube de 30 a 40 las cajas de A100 directamente en el estado.',
    async corre() {
      const { e } = cadena();
      const tocado = { ...e, existencias: e.existencias.map((x) => (x.lote === 'A100' ? { ...x, cantidad: 40 } : x)) };
      const i = integridadLocal(tocado, CENTRO);
      return verifica([[!i.ok, 'la integridad falla'], [/proyección/.test(i.motivo ?? ''), 'dice que el estado no es la proyección de la cadena']], [i.motivo ?? 'íntegro'], 'Lo que se ve es lo que dicen los eventos, o se dice que no.');
    },
  },
  {
    id: 'exp-transferencia', herramienta: 'expediente', titulo: 'Una transferencia enlaza las dos cadenas; un RECIBIDO que no cuadra se delata', trampa: 'recibir de más en destino', esperado: 'pasa',
    entrada: '10 cajas de A100 pasan de Centro a Poniente; Poniente «recibe» 15.',
    async corre() {
      const { e } = cadena();
      const tr = ok(transfiere(e, { origen: CENTRO, destino: PONIENTE, lote: { gtin: G.YOG, lote: 'A100', caducidad: mas(30) }, cajas: 10 }, HOY, T(11), 't1', OP));
      const r = cadenaDe(tr.estado, PONIENTE)[0]!;
      const falsa = nuevoEvento(PONIENTE, [], { tipo: r.tipo, lote: r.lote, datos: { ...r.datos, cajas: 15 }, operador: r.operador, fecha: r.fecha }, r.anteriorLote!);
      const fallos = verificaTransferencias({ ...tr.estado.eventos!, [PONIENTE]: [falsa] });
      return verifica([[verificaTransferencias(tr.estado.eventos!).length === 0, 'la real cuadra'], [fallos.length > 0, 'la falsa se delata']], [fallos[0]?.detalle ?? '—'], 'Ninguna de las dos sucursales puede negar la otra mitad.');
    },
  },
];

// --- Agente de riesgo ---------------------------------------------------------------------------
const VENTAS = ventasFicticias({ [`${PONIENTE}|${G.DUL}`]: 1.5, [`${CENTRO}|${G.DUL}`]: 4, [`${PONIENTE}|${G.YOG}`]: 3 });
const conRiesgo = () => conLotes([['DUL-001', 'L8800', 50, 120, 'almacen', PONIENTE], ['YOG-001', 'Y0101', 5, 30, 'piso', PONIENTE]]);
const integra = (e: EstadoAlmacen) => integridadLocal(e, PONIENTE);

export const CASOS_AGENTE: readonly Caso[] = [
  {
    id: 'age-detecta', herramienta: 'agente', titulo: 'Un lote VERDE que no se venderá a tiempo se detecta con semanas de anticipación', trampa: null, esperado: 'pasa',
    entrada: '120 cajas de gomitas ficticias en Poniente (vende 1.5/día) que vencen en 50 días; Centro vende 4/día.',
    async corre() {
      const r = evaluaRiesgo(conRiesgo(), PONIENTE, HOY, VENTAS).find((x) => x.lote.lote === 'L8800');
      return verifica([[r?.semaforo === 'vigente', 'todavía en verde'], [r?.recomendacion.accion === 'transferir' && r.recomendacion.destino === CENTRO, 'recomienda transferir a Centro']], [r ? `${r.cajas} cajas · vende ${r.venta}/día · ${r.diasInventario} días de inventario contra ${r.diasVendibles} vendibles · ${r.cajasEnRiesgo} en riesgo` : 'no lo vio'], 'Se actúa antes del rojo, no en el rojo.');
    },
  },
  {
    id: 'age-decide', herramienta: 'agente', titulo: 'El agente recomienda; ejecuta una PERSONA y las dos cosas quedan en la cadena', trampa: null, esperado: 'pasa',
    entrada: 'La recomendación de transferir L8800, ejecutada por una persona.',
    async corre() {
      const c1 = corridaAgente(conRiesgo(), PONIENTE, HOY, VENTAS, T(6), integra(conRiesgo()));
      const rec = recomendaciones(c1.estado, PONIENTE).find((r) => r.evento.lote.lote === 'L8800')!;
      const ej = ok(decide(c1.estado, { sitio: PONIENTE, recomendacion: rec.evento.hash, decision: 'ejecutar', persona: OTRO }, HOY, T(9), 'd1', integra(c1.estado)));
      return verifica([[c1.emitidas.every((x) => x.operador === 'agente-riesgo'), 'la recomendación la firma el agente'], [ej.valor.operador === OTRO, 'la ejecución la firma una persona'], [ej.eventos.map((x) => x.tipo).join(',') === 'TRANSFERIDO,RECIBIDO,RECOMENDACION_EJECUTADA', 'transferencia en las dos cadenas']], ej.eventos.map((x) => `${x.sitio}:${x.tipo}`), 'La máquina sugiere; decide alguien con nombre (seudónimo) en la cadena.');
    },
  },
  {
    id: 'age-no-repite', herramienta: 'agente', titulo: 'No repite lo que ya recomendó y sigue pendiente', trampa: null, esperado: 'pasa',
    entrada: 'Dos corridas seguidas del agente.',
    async corre() {
      const c1 = corridaAgente(conRiesgo(), PONIENTE, HOY, VENTAS, T(6), integra(conRiesgo()));
      const c2 = corridaAgente(c1.estado, PONIENTE, HOY, VENTAS, T(7), integra(c1.estado));
      return verifica([[c1.emitidas.length > 0 && c2.emitidas.length === 0, 'la segunda no emite nada']], [`primera: ${c1.emitidas.length} · segunda: ${c2.emitidas.length}`], 'Sin ruido: una recomendación por lote hasta que alguien decida.');
    },
  },
  {
    id: 'age-descartar', herramienta: 'agente', titulo: 'Descartar sin motivo no se puede; con motivo queda quién y por qué', trampa: 'descartar sin explicar', esperado: 'pasa',
    entrada: 'La recomendación de exhibir el yogurt Y0101, descartada.',
    async corre() {
      const c1 = corridaAgente(conRiesgo(), PONIENTE, HOY, VENTAS, T(6), integra(conRiesgo()));
      const rec = recomendaciones(c1.estado, PONIENTE).find((r) => r.evento.lote.lote === 'Y0101')!;
      const sin = decide(c1.estado, { sitio: PONIENTE, recomendacion: rec.evento.hash, decision: 'descartar', persona: OTRO }, HOY, T(9), 'd1', integra(c1.estado));
      const con = decide(c1.estado, { sitio: PONIENTE, recomendacion: rec.evento.hash, decision: 'descartar', persona: OTRO, motivo: 'ya está en cabecera' }, HOY, T(9), 'd2', integra(c1.estado));
      return verifica([[!sin.resultado.ok, 'sin motivo: no'], [con.resultado.ok, 'con motivo: sí']], [sin.resultado.ok ? 'descartó sin motivo' : sin.resultado.motivo], 'Una recomendación ignorada deja su razón.');
    },
  },
  {
    id: 'age-cadena-rota', herramienta: 'agente', titulo: 'Con la cadena rota el agente NO actúa y devuelve el motivo', trampa: 'recomendar sobre datos tocados', esperado: 'pasa',
    entrada: 'El evento #1 de Poniente con la caducidad cambiada.',
    async corre() {
      const e = conRiesgo();
      const rota = { ...e, eventos: { ...e.eventos, [PONIENTE]: cadenaDe(e, PONIENTE).map((x) => (x.seq === 1 ? { ...x, lote: { ...x.lote, caducidad: mas(200) } } : x)) } };
      const c = corridaAgente(rota, PONIENTE, HOY, VENTAS, T(6), integra(rota));
      return verifica([[c.emitidas.length === 0 && Boolean(c.bloqueo), 'no emite y dice por qué']], [c.bloqueo ?? '—'], 'Primero el incidente; después las recomendaciones.');
    },
  },
  {
    id: 'age-ventas-erp', herramienta: 'agente', titulo: 'Las ventas del ERP no se confían: una fila mal formada se descarta', trampa: 'datos del ERP rotos', esperado: 'pasa',
    entrada: 'Filas de venta ficticias: una buena, una sin sku, una con cantidad negativa y una que no es objeto.',
    async corre() {
      const r = leeFilasVentas([{ sku: 'DUL-001', clave_unidad: 'XBX', cantidad: 28 }, { sku: '', cantidad: 3 }, { sku: 'YOG-001', cantidad: -2 }, 'hola']);
      return verifica([[r.filas.length === 1 && r.descartadas === 3, '1 buena y 3 descartadas']], [JSON.stringify(r)], 'Lo que llega de afuera se valida antes de recomendar nada.');
    },
  },
];

