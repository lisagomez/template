/**
 * Casos de «Etiqueta GS1-128» (diseño, revisión, SVG y ZPL contra su referencia) y de «Impresión»
 * (el agente del sitio: credencial por trabajo y ZPL de una lista cerrada de comandos).
 */
import {
  aplicaArreglo, caracteresDeDatos, CATEGORIAS_EJEMPLO, categoriaPorId, disenaDesdeDatos, leeUbicacion, parseaLectura, PERFIL_EJEMPLO, revisa, revisaZpl, simbolosDe,
  validaEtiqueta, aZpl, esErrorLectura, type DatosEtiqueta, type Simbolo,
} from '../../../../tools/etiquetas-gs1/dist/index.js';
import { emiteTicket, huellaDe, verificaTicket } from '../../../../tools/etiquetas-gs1/dist/agente/index.js';
import referencias from '../datos/referencias.json' with { type: 'json' };
import { SITIOS } from './datos.ts';
import { CAJA, piezasDeReferencia, rutaReferencia, sha256, TARIMA } from './referencias.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

const HUELLAS = referencias.huellas as Readonly<Record<string, string>>;
const sin = (h: string | undefined) => (h ?? '').replace(/^sha256:/, '');
const lacteos = categoriaPorId(CATEGORIAS_EJEMPLO, 'lacteos');
const HOY = '2026-10-15';
const errores = (s: readonly Simbolo[]) => validaEtiqueta(s, { anioActual: 2026 }).filter((h) => h.severidad === 'error').map((h) => h.codigo);
const revisaDatos = (d: DatosEtiqueta, simbolos = simbolosDe(d)) => revisa({ simbolos, diseno: disenaDesdeDatos(d, PERFIL_EJEMPLO, 2026), perfil: PERFIL_EJEMPLO, categoria: lacteos, hoy: HOY });
const punto = (r: ReturnType<typeof revisa>, id: string) => r.puntos.find((p) => p.id === id);

async function contraReferencia(id: string) {
  const p = piezasDeReferencia().find((x) => x.id === id)!;
  const [svg, zpl] = [await sha256(p.svg), await sha256(p.zpl)];
  return { p, svg: svg === sin(HUELLAS[`${id}-svg`]), zpl: zpl === sin(HUELLAS[`${id}-zpl`]), huellas: [svg, zpl] };
}

export const CASOS_ETIQUETA: readonly Caso[] = [
  {
    id: 'etq-caja', herramienta: 'etiqueta', titulo: 'Caja (01)(17)(10): pasa la revisión y es igual a su referencia', trampa: null, esperado: 'pasa',
    entrada: 'Yogurt ficticio GTIN 09521234000020, caduca 30/11/2026, lote L4471, 4×2 in a 203 dpi.',
    async corre() {
      const r = revisaDatos(CAJA);
      const c = await contraReferencia('caja');
      return verifica([[!r.bloquea, 'la revisión no bloquea'], [c.svg, 'el SVG es igual a su referencia'], [c.zpl, 'el ZPL es igual a su referencia']],
        [`puntos: ${r.puntos.map((p) => `${p.id}=${p.estado}`).join(', ')}`, `huella SVG ${c.huellas[0]!.slice(0, 16)}… · ZPL ${c.huellas[1]!.slice(0, 16)}…`],
        'La etiqueta de caja no cambia sin que alguien lo vea y lo apruebe.', { pieza: c.p.svg, referencia: rutaReferencia('caja') });
    },
  },
  {
    id: 'etq-tarima', herramienta: 'etiqueta', titulo: 'Tarima (02)(37)(17)(10) + SSCC en su propio código, igual a su referencia', trampa: null, esperado: 'pasa',
    entrada: 'Tarima ficticia de 60 cajas de gomitas, SSCC con prefijo 952, 4×6 in.',
    async corre() {
      const c = await contraReferencia('tarima');
      const s = simbolosDe(TARIMA);
      return verifica([[c.svg && c.zpl, 'SVG y ZPL iguales a su referencia'], [s.length === 2 && s[1]![0]!.ai === '00', 'el SSCC va en su propio código (guía logística)'], [/>8/.test(c.p.zpl), 'modo D con >8 tras (37)']],
        [`códigos: ${s.map((x) => x.map((e) => `(${e.ai})`).join('')).join(' + ')}`], 'La tarima lleva su contenido y su SSCC como pide la guía logística.', { pieza: c.p.svg, referencia: rutaReferencia('tarima') });
    },
  },
  {
    id: 'etq-ubicacion', herramienta: 'etiqueta', titulo: 'Ubicación (414)+(254): igual a su referencia y se lee de vuelta', trampa: null, esperado: 'pasa',
    entrada: 'Rack B-04-2 del almacén de la Sucursal Centro (GLN ficticio 952…).',
    async corre() {
      const c = await contraReferencia('ubicacion');
      const l = parseaLectura(`(414)${SITIOS[1]!.gln}(254)ALMACEN-B-04-2`);
      const u = esErrorLectura(l) ? undefined : leeUbicacion(l.elementos, SITIOS);
      const ok = u !== undefined && !('error' in u) && u.sitio.clave === 'SUC-CENTRO' && u.zona === 'almacen' && u.posicion === 'B-04-2';
      return verifica([[c.svg && c.zpl, 'igual a su referencia'], [ok, 'se lee como Sucursal Centro · almacén · B-04-2']], ['la zona la dice la etiqueta, no la persona'], 'Escanear el rack pone la zona sin tocar la pantalla.', { pieza: c.p.svg, referencia: rutaReferencia('ubicacion') });
    },
  },
  {
    id: 'etq-digito', herramienta: 'etiqueta', titulo: 'GTIN con el dígito verificador malo: bloquea y «corregir» lo arregla', trampa: 'dígito verificador malo', esperado: 'pasa',
    entrada: 'La caja de referencia con GTIN 09521234000021 (el correcto termina en 0).',
    async corre() {
      const malo = { ...CAJA, gtin: '09521234000021' } as DatosEtiqueta;
      const r = revisaDatos(malo);
      const d = punto(r, 'digitos');
      const r2 = d?.arreglo ? revisaDatos(CAJA, aplicaArreglo(simbolosDe(malo), d.arreglo)) : r;
      return verifica([[r.bloquea, 'bloquea la impresión'], [d?.estado === 'error', 'el punto «dígitos» en error'], [punto(r2, 'digitos')?.estado === 'ok', 'con el arreglo queda bien']], [`arreglo: ${JSON.stringify(d?.arreglo ?? null)}`], 'Una Zebra no «corrige» en silencio: el error se ve antes de imprimir.');
    },
  },
  {
    id: 'etq-cset82', herramienta: 'etiqueta', titulo: 'Lote con espacio, Ñ y #: error de CSET 82 con arreglo', trampa: 'caracteres fuera de CSET 82', esperado: 'pasa',
    entrada: 'Lote «LOTE Ñ#1».',
    async corre() {
      const s: Simbolo[] = [[{ ai: '01', valor: '09521234000020' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'LOTE Ñ#1' }]];
      const h = validaEtiqueta(s, { anioActual: 2026 }).find((x) => x.codigo === 'caracter-prohibido');
      return verifica([[Boolean(h), 'se detecta'], [Boolean(h?.arreglo) && errores(aplicaArreglo(s, h!.arreglo!)).length === 0, 'el arreglo lo deja sin errores']], [`propone: ${JSON.stringify(h?.arreglo ?? null)}`], 'GS1 solo admite CSET 82 en el lote; se dice y se propone el arreglo.');
    },
  },
  {
    id: 'etq-48', herramienta: 'etiqueta', titulo: 'Tarima en un solo código (56 caracteres): error y el arreglo separa el SSCC', trampa: 'más de 48 caracteres', esperado: 'pasa',
    entrada: 'SSCC + contenido + cantidad + caducidad + lote en un solo GS1-128.',
    async corre() {
      const uno: Simbolo[] = [[{ ai: '00', valor: '095212340005678903' }, { ai: '02', valor: '09521234000020' }, { ai: '37', valor: '50' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }]];
      const h = validaEtiqueta(uno, { anioActual: 2026 }).find((x) => x.codigo === 'mas-de-48');
      const partido = h?.arreglo ? aplicaArreglo(uno, h.arreglo) : uno;
      return verifica([[caracteresDeDatos(uno[0]!) === 56, '56 caracteres de datos'], [Boolean(h), 'error «más de 48»'], [partido.length === 2 && errores(partido).length === 0, 'partido en dos códigos, sin errores']], [partido.map((s) => s.map((e) => `(${e.ai})`).join('')).join(' + ')], 'El límite de 48 de la norma se aplica contando los FNC1.');
    },
  },
  {
    id: 'etq-parentesis', herramienta: 'etiqueta', titulo: 'Lote con paréntesis: válido en GS1 pero la Zebra en modo D lo alteraría', trampa: 'lote que rompe el modo D', esperado: 'pasa',
    entrada: 'Lote «A(1)».',
    async corre() {
      const r = revisaDatos({ ...CAJA, lote: 'A(1)' } as DatosEtiqueta);
      return verifica([[r.bloquea, 'bloquea'], [punto(r, 'lote')?.estado === 'error', 'el punto «lote» en error']], [`arreglo: ${JSON.stringify(punto(r, 'lote')?.arreglo ?? null)}`], 'Se bloquea lo que la impresora imprimiría distinto de lo que se ve.');
    },
  },
];

const SECRETO = 'secreto-de-laboratorio-de-32-caracteres-o-mas';
const zplCaja = () => aZpl(disenaDesdeDatos(CAJA, PERFIL_EJEMPLO, 2026), PERFIL_EJEMPLO, { copias: 2 });
const ticket = (zpl: string, ahora: number, vidaS = 120) => emiteTicket({ impresora: 'zebra-cedis-cajas', sitio: 'CEDIS-NTE', zpl, copias: 2, operador: 'op-0a1b2c3d', vidaS, ahora }, SECRETO);

export const CASOS_IMPRESION: readonly Caso[] = [
  {
    id: 'imp-zpl-propio', herramienta: 'impresion', titulo: 'El ZPL que genera la casa pasa la lista cerrada del agente', trampa: null, esperado: 'pasa',
    entrada: 'La caja de referencia, 2 copias.',
    async corre() {
      const r = revisaZpl(zplCaja());
      return verifica([[r.ok, 'aceptado']], [JSON.stringify(r)], 'Lo que la app manda es lo único que el agente imprime.');
    },
  },
  {
    id: 'imp-ticket', herramienta: 'impresion', titulo: 'Credencial por trabajo: firmada, con la huella del ZPL y vida corta', trampa: null, esperado: 'pasa',
    entrada: 'Un trabajo de 2 copias para la Zebra de cajas del CEDIS.',
    async corre() {
      const ahora = 1_800_000_000;
      const v = verificaTicket(ticket(zplCaja(), ahora), SECRETO, ahora + 5);
      return verifica([[v.ok, 'la credencial verifica'], [v.ok && v.datos.huellaZpl === huellaDe(zplCaja()), 'lleva la huella exacta del ZPL']], [v.ok ? `impresora ${v.datos.impresora} · copias ${v.datos.copias}` : v.motivo], 'El agente solo imprime lo que la app autorizó, una vez.');
    },
  },
  {
    id: 'imp-vencido', herramienta: 'impresion', titulo: 'Credencial vencida: rechazada', trampa: 'credencial vieja', esperado: 'pasa',
    entrada: 'La credencial del trabajo, usada 10 minutos después (vida de 120 s).',
    async corre() {
      const ahora = 1_800_000_000;
      const v = verificaTicket(ticket(zplCaja(), ahora), SECRETO, ahora + 600);
      return verifica([[!v.ok, 'rechazada']], [v.ok ? 'la aceptó' : v.motivo], 'Una credencial robada caduca antes de servir.');
    },
  },
  {
    id: 'imp-ajena', herramienta: 'impresion', titulo: 'Credencial firmada con otro secreto: rechazada', trampa: 'credencial falsa', esperado: 'pasa',
    entrada: 'Una credencial emitida con un secreto que no es el del agente.',
    async corre() {
      const ahora = 1_800_000_000;
      const falsa = emiteTicket({ impresora: 'zebra-cedis-cajas', sitio: 'CEDIS-NTE', zpl: zplCaja(), operador: 'op-0a1b2c3d', ahora }, 'otro-secreto-que-no-es-el-del-agente-000');
      const v = verificaTicket(falsa, SECRETO, ahora + 5);
      return verifica([[!v.ok, 'rechazada']], [v.ok ? 'la aceptó' : v.motivo], 'Nadie fuera de la app firma trabajos.');
    },
  },
  {
    id: 'imp-zpl-cambiado', herramienta: 'impresion', titulo: 'ZPL cambiado después de firmar: la huella no coincide', trampa: 'ZPL alterado en el camino', esperado: 'pasa',
    entrada: 'La credencial de la caja, con el ZPL cambiado a 500 copias.',
    async corre() {
      const ahora = 1_800_000_000;
      const v = verificaTicket(ticket(zplCaja(), ahora), SECRETO, ahora + 5);
      const otro = zplCaja().replace(/\^PQ2/, '^PQ500');
      return verifica([[v.ok && v.datos.huellaZpl !== huellaDe(otro), 'la huella del ZPL recibido no es la firmada']], ['el agente compara huellaDe(zpl) con la firmada'], 'No se puede firmar una etiqueta y mandar otra.');
    },
  },
  {
    id: 'imp-comandos', herramienta: 'impresion', titulo: 'Guardar configuración, reiniciar, red, prefijos y comandos «~»: rechazados', trampa: 'la impresora como relé abierto', esperado: 'pasa',
    entrada: '^JUS, ~JR, ^NS, ^CC, ^KP, sin ^XZ, texto, 5000 copias, ^CI13.',
    async corre() {
      const malos = ['^XA^JUS^XZ', '^XA~JR^XZ', '^XA^NSs,10.0.0.9^XZ', '^XA^CC%%XA%JUS%XZ^XZ', '^XA^KP1234^XZ', '^XA^FO1,1^FDx^FS', 'hola', '^XA^PQ5000^XZ', '^XA^CI13^XZ'];
      const pasan = malos.filter((m) => revisaZpl(m).ok);
      return verifica([[pasan.length === 0, 'ninguno pasa']], [`${malos.length} rechazados${pasan.length ? ` · pasaron: ${pasan.join(', ')}` : ''}`], 'El agente no deja que nadie reconfigure la impresora.');
    },
  },
];
