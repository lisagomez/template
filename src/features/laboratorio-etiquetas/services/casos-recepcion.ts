/**
 * Casos de «Recepción» (directa, regla de 2/3, tarima, la foto del inventario y la recepción con foto
 * que confirma quien registró) y de «Fecha por foto» (el analizador de fechas impresas y el motor LOCAL
 * sobre una imagen sintética y sobre el corpus REAL del laboratorio, si esta máquina lo tiene).
 */
import sharp from 'sharp';
import {
  aAammdd, abreRevision, altaDeLote, completaClave, confirmaRevision, integridadLocal, leeYPropone, mueveConExpediente, proponCaducidad, recibeConExpediente, registra,
  type LecturaDelMotor, type Propuesta,
} from '../../../../tools/etiquetas-gs1/dist/index.js';
import { preparaImagenes, type FabricaImagen } from '../../../../tools/etiquetas-gs1/dist/imagenes.js';
import { base, CENTRO, conLotes, G, HOY, lee, mas, ok, OP, OTRO, T, caja } from './datos.ts';
import type { Caso, ContextoDeLaboratorio } from './tipos.ts';
import { noMedido, verifica } from './verifica.ts';

const H = (c: string) => `sha256:${c.repeat(64).slice(0, 64)}`;

export const CASOS_RECEPCION: readonly Caso[] = [
  {
    id: 'rec-directa', herramienta: 'recepcion', titulo: 'Caja con (17)(10): se recibe directo con la foto del inventario antes → después', trampa: null, esperado: 'pasa',
    entrada: 'Yogurt ficticio: ya hay 30 cajas del artículo en Centro; llega 1 caja del lote L0901.',
    async corre() {
      const e = conLotes([['YOG-001', 'A100', 30, 30, 'almacen']]);
      const r = ok(recibeConExpediente(e, lee(e, caja(G.YOG, 34, 'L0901')), CENTRO, T(9), 'r1', OP, 'caja'));
      const inv = r.valor.inventario;
      return verifica([[r.eventos[0]?.tipo === 'RECIBIDO', 'RECIBIDO en la cadena'], [inv?.antes.articulo === 30 && inv.despues.articulo === 31 && inv.despues.lote === 1, 'antes 30 → después 31 (lote 0 → 1)'], [integridadLocal(r.estado, CENTRO).ok, 'la cadena comprueba la foto']],
        [`inventario: ${JSON.stringify(inv)}`], 'Queda cuánto había y cuánto hay en el momento de recibir.');
    },
  },
  {
    id: 'rec-dos-tercios', herramienta: 'recepcion', titulo: 'Regla de 2/3: con 90 días de vida útil, 59 se rechaza con devolución; 60 entra', trampa: 'lote con poca vida', esperado: 'pasa',
    entrada: 'Gomitas ficticias (vida útil 90 días) a 59 y a 60 días de caducar.',
    async corre() {
      const e = base();
      const rech = ok(recibeConExpediente(e, lee(e, caja(G.DUL, 59, 'D059')), CENTRO, T(9), 'r1', OP, 'caja'));
      const entra = ok(recibeConExpediente(e, lee(e, caja(G.DUL, 60, 'D060')), CENTRO, T(9), 'r2', OP, 'caja'));
      return verifica([[Boolean(rech.valor.rechazada), '59 días: rechazado'], [rech.eventos[0]?.tipo === 'RECHAZADO', 'RECHAZADO en la cadena'], [Boolean(entra.valor.existencia), '60 días: entra']],
        [rech.valor.rechazada ? `${rech.valor.rechazada.regla} · devolución ${rech.valor.rechazada.folio}` : 'no lo rechazó'], 'Lo que no se venderá a tiempo no entra, y la devolución lleva la evidencia.');
    },
  },
  {
    id: 'rec-vencido', herramienta: 'recepcion', titulo: 'Un lote vencido no se recibe', trampa: 'mercancía vencida', esperado: 'pasa',
    entrada: 'Yogurt ficticio vencido ayer.',
    async corre() {
      const e = base();
      const r = ok(recibeConExpediente(e, lee(e, caja(G.YOG, -1, 'V001')), CENTRO, T(9), 'r1', OP, 'caja'));
      return verifica([[Boolean(r.valor.rechazada) && !r.valor.inventario, 'rechazado y sin foto de inventario (no entra)']], [r.valor.rechazada?.regla ?? 'entró'], 'Lo vencido se devuelve; no toca el inventario.');
    },
  },
  {
    id: 'rec-tarima', herramienta: 'recepcion', titulo: 'Tarima con SSCC: suma sus cajas y no se recibe dos veces', trampa: 'la misma tarima dos veces', esperado: 'pasa',
    entrada: 'Tarima ficticia de 24 cajas de yogurt con SSCC 952…, leída dos veces.',
    async corre() {
      const e = base();
      const texto = `(00)${completaClave('39521234000000009')}(02)${G.YOG}(37)24(17)${aAammdd(mas(34))}(10)T024`;
      const r1 = ok(recibeConExpediente(e, lee(e, texto), CENTRO, T(9), 'r1', OP, 'tarima'));
      const r2 = recibeConExpediente(r1.estado, lee(r1.estado, texto), CENTRO, T(10), 'r2', OP, 'tarima');
      return verifica([[r1.valor.inventario?.despues.lote === 24, 'entran 24 cajas'], [!r2.resultado.ok, 'la segunda lectura se rechaza']], [r2.resultado.ok ? 'la aceptó dos veces' : r2.resultado.motivo], 'Una tarima se cuenta una vez.');
    },
  },
  {
    id: 'rec-foto-falsa', herramienta: 'recepcion', titulo: 'Una foto del inventario que no cuadra con la cadena se delata', trampa: 'foto del inventario inventada', esperado: 'pasa',
    entrada: 'Un RECIBIDO bien encadenado que dice «había 0» cuando había 30.',
    async corre() {
      const e = conLotes([['YOG-001', 'A100', 30, 30, 'almacen']]);
      const clave = { gtin: G.YOG, lote: 'L0999', caducidad: mas(34) };
      const a = altaDeLote(e, { sitio: CENTRO, sku: 'YOG-001', ...clave, cantidad: 12, zona: 'recibo' }, 'recepcion', T(9), 'mentira');
      const falso = registra(a.estado, CENTRO, { tipo: 'RECIBIDO', lote: clave, operador: OP, fecha: T(9), datos: { cajas: 12, zona: 'recibo', sku: 'YOG-001', origen: 'recepcion', existencia: { antes: { lote: 0, articulo: 0 }, despues: { lote: 12, articulo: 12 } }, cambios: [{ zona: 'recibo', cajas: 12 }] } });
      const i = integridadLocal(falso.estado, CENTRO);
      return verifica([[!i.ok && /foto del inventario/.test(i.motivo ?? ''), 'la integridad lo delata']], [i.motivo ?? 'íntegro'], 'La foto no se puede inventar: la cadena la recalcula.');
    },
  },
  {
    id: 'rec-con-foto', herramienta: 'recepcion', titulo: 'Recepción con foto: pendiente no se mueve; otra persona no confirma; quien registró sí', trampa: 'confirmar por otro', esperado: 'pasa',
    entrada: '12 cajas de yogurt con el EAN del proveedor; la foto propone «CAD 30/05/27».',
    async corre() {
      const e = base();
      const propuesta = proponCaducidad([{ motor: 'laboratorio', ms: 0, lineas: [{ texto: 'CAD 30/05/27 L4471' }] }], { hoy: HOY });
      const a = ok(abreRevision(e, { sitio: CENTRO, sku: 'YOG-001', cajas: 12, codigo: { gtin: G.YOG, nivel: 'caja' }, fotos: { completa: H('a'), recortes: [H('b')] }, propuesta }, T(9), 'REV-1', OP));
      const mover = mueveConExpediente(a.estado, { sitio: CENTRO, destino: 'piso', lectura: lee(a.estado, `(01)${G.YOG}`), veces: 1, operador: OP }, T(10), 'm1', HOY);
      const c = { sitio: CENTRO, revision: a.eventos[0]!.hash, caducidad: '2027-05-30', lote: 'L4471' };
      const otro = confirmaRevision(a.estado, c, HOY, T(11), 'c1', OTRO);
      const mio = ok(confirmaRevision(a.estado, c, HOY, T(11), 'c2', OP));
      return verifica([[!mover.resultado.ok, 'pendiente: no se mueve'], [!otro.resultado.ok, 'otra persona no confirma'], [mio.eventos[0]?.tipo === 'RECIBIDO' && Boolean(mio.valor.inventario), 'quien registró confirma y entra con su foto del inventario']],
        [mover.resultado.ok ? 'se movió' : mover.resultado.motivo, otro.resultado.ok ? 'confirmó otro' : otro.resultado.motivo], 'Ninguna caducidad leída de una foto cuenta sin la persona que la registró.');
    },
  },
];

// --- Fecha por foto --------------------------------------------------------------------------
const toma = (...lineas: string[]): LecturaDelMotor => ({ motor: 'laboratorio', ms: 0, lineas: lineas.map((texto) => ({ texto })) });
const propon = (t: LecturaDelMotor, vidaUtilDias?: number): Propuesta => proponCaducidad([t], { hoy: HOY, ...(vidaUtilDias ? { vidaUtilDias } : {}) });
const resumen = (p: Propuesta) => `${p.estado}${p.fecha ? ` · ${p.fecha}` : ''}${p.opciones.length ? ` · opciones ${p.opciones.map((o) => `${o.iso}${o.sugerida ? ' (sugerida)' : ''}`).join(', ')}` : ''}`;

/** Una cara de caja SINTÉTICA con la fecha impresa en letra sólida (lo que el motor tiene que leer). */
async function caraSintetica(lineas: readonly string[]): Promise<Uint8Array> {
  const texto = lineas.map((l, i) => `<text x="320" y="${150 + i * 64}" text-anchor="middle" font-family="DejaVu Sans Mono" font-weight="bold" font-size="56" fill="#1a1a1a">${l}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="100%" height="100%" fill="#e8dcc4"/>${texto}</svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

type EsperadoReal = { caducidad?: string | null; sin_fecha_visible?: boolean; por_confirmar?: readonly string[]; ambigua?: readonly string[]; recorte?: readonly [number, number, number, number] };

/** La misma regla que `banco/mide-caducidades.mjs#clasifica`: «equivocada» es la única peligrosa. */
function clasifica(p: Propuesta, e: EsperadoReal): string {
  const opciones = p.opciones.map((o) => o.iso);
  if (e.sin_fecha_visible) return p.estado === 'propuesta' || opciones.length > 0 ? 'inventada' : 'sin-fecha-correcta';
  if (e.ambigua) return p.estado === 'propuesta' ? 'equivocada' : e.ambigua.every((x) => opciones.includes(x.slice(0, 10))) ? 'ambigua-marcada' : 'no-leyo';
  if (!e.caducidad) return 'por-confirmar';
  if (p.estado === 'propuesta') return p.fecha === e.caducidad ? 'exacta' : 'equivocada';
  return opciones.includes(e.caducidad) ? 'con-opcion' : 'no-leyo';
}

async function corpusReal(ctx: ContextoDeLaboratorio) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = ctx.corpusReal!;
  const { fotos } = JSON.parse(await readFile(join(/*turbopackIgnore: true*/ dir, 'esperado.json'), 'utf8')) as { fotos: Record<string, EsperadoReal> };
  const img = preparaImagenes(sharp as unknown as FabricaImagen);
  const clases: Record<string, number> = {};
  const filas: string[] = [];
  for (const [archivo, f] of Object.entries(fotos)) {
    if (!f.recorte) continue;
    const n = await img.normaliza(new Uint8Array(await readFile(join(/*turbopackIgnore: true*/ dir, 'fotos', archivo))));
    const [x, y, w, h] = f.recorte;
    const rec = await img.recorta(n.jpeg, { x: x / n.ancho, y: y / n.alto, ancho: w / n.ancho, alto: h / n.alto }, n);
    const p = await leeYPropone(ctx.motor!, [rec], { hoy: HOY }, n.jpeg);
    const c = clasifica(p, f);
    clases[c] = (clases[c] ?? 0) + 1;
    filas.push(`${archivo}: ${c} · ${resumen(p)}`);
  }
  return { clases, filas };
}

export const CASOS_FECHA: readonly Caso[] = [
  {
    id: 'fec-dicha', herramienta: 'fecha-foto', titulo: '«CAD 30/05/27 L4471»: fecha y lote propuestos', trampa: null, esperado: 'pasa',
    entrada: 'Texto leído de una caja ficticia.',
    async corre() {
      const p = propon(toma('CAD 30/05/27 L4471'));
      return verifica([[p.estado === 'propuesta' && p.fecha === '2027-05-30', 'propone 2027-05-30'], [p.lote === 'L4471', 'y el lote L4471']], [resumen(p), p.mensaje], 'Lo inequívoco se propone; aun así lo confirma una persona.');
    },
  },
  {
    id: 'fec-ambigua', herramienta: 'fecha-foto', titulo: '«CAD 03/04/27»: DD/MM contra MM/DD se enseña, no se elige', trampa: 'fecha ambigua', esperado: 'pasa',
    entrada: 'Texto leído de una caja ficticia.',
    async corre() {
      const p = propon(toma('CAD 03/04/27'));
      return verifica([[p.estado === 'ambigua' && p.fecha === undefined, 'ambigua, sin elegir'], [p.opciones.length === 2, 'las dos opciones a la vista']], [resumen(p)], 'Nunca se resuelve una ambigüedad en silencio.');
    },
  },
  {
    id: 'fec-cero-diagonal', herramienta: 'fecha-foto', titulo: '«CAD 38/10/26»: el cero con diagonal leído como 8 se rechaza y se sugiere 30/10/26', trampa: 'cero con diagonal', esperado: 'pasa',
    entrada: 'Lo que leyó el motor real de una tinta de puntos (medido en el banco).',
    async corre() {
      const p = propon(toma('CAD 38/10/26 L4471'));
      return verifica([[p.estado === 'invalida' && p.fecha === undefined, 'no propone una fecha imposible'], [p.opciones.length === 1 && p.opciones[0]!.iso === '2026-10-30' && Boolean(p.opciones[0]!.sugerida), 'sugiere 2026-10-30']], [resumen(p), p.mensaje], 'Una sugerencia no es una propuesta: la elige la persona.');
    },
  },
  {
    id: 'fec-elaboracion', herramienta: 'fecha-foto', titulo: '«ELAB 22/09/26» no es caducidad (sin vida útil no se deriva)', trampa: 'fecha de elaboración', esperado: 'pasa',
    entrada: 'Texto leído de una bolsa ficticia.',
    async corre() {
      const p = propon(toma('ELAB 22/09/26'));
      const con = propon(toma('ELAB 22/09/26 L5521'), 180);
      return verifica([[p.estado === 'solo-fabricacion' && p.fecha === undefined, 'sin vida útil: no hay caducidad'], [con.fecha === '2027-03-21', 'con 180 días: se deriva y se dice']], [resumen(p), resumen(con)], 'No se confunde la fecha de elaboración con la de caducidad.');
    },
  },
  {
    id: 'fec-sin-rotulo', herramienta: 'fecha-foto', titulo: 'Cifras sin rótulo (claves, números) no son fecha', trampa: 'número que parece fecha', esperado: 'pasa',
    entrada: '«12076239», «20240202», «NUEVA RECETA 13 CAJAS POR CAMA 12076239 CLAVE».',
    async corre() {
      const r = ['12076239', '20240202', 'NUEVA RECETA 13 CAJAS POR CAMA 12076239 CLAVE'].map((t) => propon(toma(t)));
      return verifica([[r.every((p) => p.estado === 'sin-fecha' && p.opciones.length === 0), 'ninguna fecha inventada']], r.map(resumen), 'Sin rótulo no se inventa una caducidad.');
    },
  },
  {
    id: 'fec-motor-sintetico', herramienta: 'fecha-foto', titulo: 'El motor LOCAL lee una cara sintética y propone la fecha', trampa: null, esperado: 'pasa', requiere: 'motor',
    entrada: 'PNG sintético con «CAD 30/05/27» y «L4471» en letra sólida.',
    async corre(ctx) {
      if (!ctx.motor) return noMedido('Sin motor local (ETIQUETAS_MOTOR_PYTHON): instálalo con tools/etiquetas-gs1/motores/instala-rapidocr.sh.');
      const p = await leeYPropone(ctx.motor, [await caraSintetica(['CAD 30/05/27', 'L4471'])], { hoy: HOY });
      return verifica([[p.fecha === '2027-05-30' || p.opciones.some((o) => o.iso === '2027-05-30'), 'la fecha correcta propuesta o entre las opciones'], [!(p.estado === 'propuesta' && p.fecha !== '2027-05-30'), 'nunca una fecha equivocada']], [`${ctx.motor.modelo} · ${resumen(p)}`], 'El motor corre en la máquina: la foto no sale de la red.');
    },
  },
  {
    id: 'fec-motor-real', herramienta: 'fecha-foto', titulo: 'El motor sobre el corpus REAL del laboratorio: ninguna fecha EQUIVOCADA', trampa: 'fotos reales de andén y anaquel', esperado: 'pasa', requiere: 'corpus-real',
    entrada: 'Las fotos reales del laboratorio con su verdad transcrita (fuera de git, en .datos/corpus-caducidades).',
    async corre(ctx) {
      if (!ctx.motor || !ctx.corpusReal) return noMedido(!ctx.corpusReal ? 'Sin el corpus real en esta máquina (.datos/corpus-caducidades, fuera de git).' : 'Sin motor local.');
      const { clases, filas } = await corpusReal(ctx);
      return verifica([[(clases['equivocada'] ?? 0) === 0, 'cero equivocadas'], [(clases['inventada'] ?? 0) === 0, 'cero inventadas']], [JSON.stringify(clases), ...filas], 'Lo peligroso es proponer UNA fecha falsa; lo demás lo resuelve la persona. Los umbrales se fijan con más fotos, no con estas.');
    },
  },
];
