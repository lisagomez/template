/** Casos del laboratorio VISUAL: piezas y carruseles, video por código sin personas, y aprobación con huella. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { piezaSvg, revisaPieza, hayProblemas, carruselDeTemporada } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { cuadroSvg, revisaEscena, escenaDePromo, planDeRender } from '../../../../tools/pymes-marketing/dist/video/index.js';
import { aprueba, pideCambio, vigencia, csvDelMes, huellaSha256 } from '../../../../tools/pymes-marketing/dist/aprobacion/index.js';
import referencias from '../datos/referencias.json' with { type: 'json' };
import { NEGOCIO_DEMO } from '../datos/demo.ts';
import { briefDeReferencia, escenaDeReferencia, marcaDeReferencia, piezasDeReferencia, PIEZA, sha256, sonidoDeReferencia } from './referencias-visuales.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

/** Las huellas se guardan con prefijo `sha256:` (así no parecen credenciales); se comparan sin él. */
const sinPrefijo = (h: string) => h.replace(/^sha256:/, '');
const REF = Object.fromEntries(Object.entries(referencias.huellas as Record<string, string>).map(([id, h]) => [id, sinPrefijo(h)]));
const png = (id: string) => `/laboratorio-pymes/referencias/${id}.png`;
const pieza = (id: string) => piezasDeReferencia().find((p) => p.id === id)!.svg;
const contraReferencia = async (id: string) => (await sha256(pieza(id))) === REF[id];

export const CASOS_PIEZAS: readonly Caso[] = [
  {
    id: 'piezas-1', herramienta: 'piezas', titulo: 'Publicación 4:5 igual a su referencia', trampa: null, esperado: 'pasa',
    entrada: 'Pieza de temporada de la panadería de ejemplo (sintética), 1080×1350.',
    async corre() {
      const igual = await contraReferencia('pieza-vertical');
      return verifica([[igual, 'la huella coincide con la referencia aprobada'], [/viewBox="0 0 1080 1350"/.test(pieza('pieza-vertical')), 'medida de Instagram 4:5']], [`huella ${REF['pieza-vertical']!.slice(0, 16)}…`], 'Un cambio visual no pasa sin que alguien lo vea y lo apruebe.', pieza('pieza-vertical'), { referencia: png('pieza-vertical') });
    },
  },
  {
    id: 'piezas-2', herramienta: 'piezas', titulo: 'Historia 9:16: todo en la franja segura', trampa: null, esperado: 'pasa',
    entrada: 'La misma pieza en 1080×1920 para el estado de WhatsApp.',
    async corre() {
      const obs = revisaPieza(marcaDeReferencia(), { ...PIEZA, formato: 'historia', semilla: 'ref-historia' }, { canal: 'whatsapp', precioConfirmado: true });
      return verifica([[obs.length === 0, 'sin observaciones de la revisión visual'], [await contraReferencia('pieza-historia'), 'igual a su referencia']], ['franja segura: 14 % arriba, 35 % abajo, 6 % a los lados (a verificar en la guía oficial de Meta)'], 'Nada queda debajo de los botones de la red.', pieza('pieza-historia'), { referencia: png('pieza-historia') });
    },
  },
  {
    id: 'piezas-3', herramienta: 'piezas', titulo: 'Carrusel de temporada con datos reales', trampa: null, esperado: 'pasa',
    entrada: 'Brief de 91 CFDI sintéticos, precio del pan de muerto confirmado ($45) y el WhatsApp del negocio.',
    async corre() {
      const c = carruselDeTemporada(briefDeReferencia(), marcaDeReferencia(), { precios: { 'pan de muerto': 45 }, contacto: NEGOCIO_DEMO.contacto })!;
      const iguales = await Promise.all(c.laminas.map(async (l) => (await sha256(l.svg)) === REF[`carrusel-lamina-${l.indice}`]));
      return verifica([[c.laminas.length === 4, '4 láminas'], [c.laminas.every((l) => !hayProblemas(l.observaciones)), 'ninguna lámina con problemas'], [iguales.every(Boolean), 'las 4 iguales a su referencia'], [/\$45\.00/.test(c.laminas[1]!.svg), 'el precio confirmado en su lámina']], c.laminas.map((l) => `${l.indice}/4 «${l.datos.titular}»${l.datos.apoyo ? ` · ${l.datos.apoyo}` : ''}`), 'Una historia en 4 láminas; la primera se entiende sola.', c.laminas[1]!.svg, { referencia: png('carrusel-lamina-2') });
    },
  },
  {
    id: 'piezas-4', herramienta: 'piezas', titulo: 'Titular demasiado largo', trampa: 'texto que desborda', esperado: 'pasa',
    entrada: '«Pan de muerto relleno de nata con azúcar glass y ajonjolí tostado del día» en una historia.',
    async corre() {
      const d = { titular: 'Pan de muerto relleno de nata con azúcar glass y ajonjolí tostado del día', formato: 'historia' as const, semilla: 'larga' };
      const obs = revisaPieza(marcaDeReferencia(), d);
      return verifica([[obs.some((o) => o.regla === 'recortado'), 'se recorta y se avisa'], [!obs.some((o) => o.regla === 'desborda'), 'lo que queda no se sale del lienzo']], obs.map((o) => `${o.gravedad}: ${o.detalle}`), 'El texto largo no se sale: se recorta y se le pide al dueño acortarlo.', piezaSvg(marcaDeReferencia(), d));
    },
  },
  {
    id: 'piezas-5', herramienta: 'piezas', titulo: 'Texto de plantilla visible en la imagen', trampa: 'texto de relleno', esperado: 'pasa',
    entrada: 'Pieza cuyo titular quedó como «[POR COMPLETAR: tip]».',
    async corre() {
      const obs = revisaPieza(marcaDeReferencia(), { titular: '[POR COMPLETAR: tip]', semilla: 'x' });
      return verifica([[hayProblemas(obs) && obs.some((o) => o.regla === 'texto-de-plantilla'), 'se marca como problema']], obs.map((o) => o.detalle), '«Terminó» no es «se ve bien»: el relleno no llega a una aprobación.');
    },
  },
  {
    id: 'piezas-6', herramienta: 'piezas', titulo: 'Precio sin confirmar', trampa: 'dato sin confirmar', esperado: 'pasa',
    entrada: 'Pieza con «$12.00» que el dueño no confirmó.',
    async corre() {
      const obs = revisaPieza(marcaDeReferencia(), { titular: 'Concha', precio: '$12.00', semilla: 'y' }, { precioConfirmado: false });
      return verifica([[obs.some((o) => o.regla === 'precio-sin-confirmar'), 'se marca como problema']], obs.map((o) => o.detalle), 'Un precio público equivocado es un problema con PROFECO: solo el confirmado.');
    },
  },
  {
    id: 'piezas-7', herramienta: 'piezas', titulo: 'Contraste y formato equivocados', trampa: 'contraste bajo y formato de canal', esperado: 'pasa',
    entrada: 'Marca gris claro sobre blanco; una pieza horizontal pensada para Instagram.',
    async corre() {
      const gris = { ...marcaDeReferencia(), colores: { primario: '#dddddd', secundario: '#eeeeee', fondo: '#ffffff', texto: '#e0e0e0' } };
      const a = revisaPieza(gris, { titular: 'Concha', semilla: 'g' }), b = revisaPieza(marcaDeReferencia(), { titular: 'Concha', formato: 'horizontal', semilla: 'h' }, { canal: 'instagram' });
      return verifica([[a.some((o) => o.regla === 'contraste'), 'contraste bajo detectado'], [b.some((o) => o.regla === 'formato-de-canal'), 'formato de canal detectado']], [...a, ...b].map((o) => o.detalle), 'Ilegible o en la medida equivocada no pasa sin aviso.');
    },
  },
];

export const CASOS_VIDEO: readonly Caso[] = [
  {
    id: 'video-1', herramienta: 'video', titulo: 'Promo 9:16 sin personas y en zona segura', trampa: null, esperado: 'pasa',
    entrada: 'Escena de la promo de Día de Muertos (sintética).',
    async corre() {
      const e = escenaDeReferencia();
      return verifica([[revisaEscena(e).length === 0, 'la revisión no encuentra nada'], [e.ancho === 1080 && e.alto === 1920 && e.fps === 30, '1080×1920 a 30 fps'], [e.duracion >= 3 && e.duracion <= 8, `dura ${e.duracion} s`], [e.capas.every((c) => ['etiqueta', 'titular', 'apoyo', 'precio', 'marca'].includes(c.tipo)), 'solo texto, precio y marca: sin personas por construcción']], [`${planDeRender(e).cuadros} cuadros · capas: ${e.capas.map((c) => `${c.tipo}@${c.entra}s`).join(', ')}`], 'El video corto sin grabar a nadie.', cuadroSvg(e, e.duracion - 1 / e.fps), { referencia: png('video-cuadro-final') });
    },
  },
  {
    id: 'video-2', herramienta: 'video', titulo: 'Cuadros iguales a su referencia, y con movimiento', trampa: null, esperado: 'pasa',
    entrada: 'Cuadro del segundo 0.5 y último cuadro de la promo.',
    async corre() {
      const inicio = await contraReferencia('video-cuadro-inicio'), final = await contraReferencia('video-cuadro-final');
      return verifica([[inicio && final, 'mismas huellas que la referencia'], [pieza('video-cuadro-inicio') !== pieza('video-cuadro-final'), 'el inicio y el final son distintos: hay movimiento'], [!pieza('video-cuadro-inicio').includes('$45.00') && pieza('video-cuadro-final').includes('$45.00'), 'el precio entra después y se sostiene']], ['sin reloj ni azar: el mismo instante da el mismo cuadro'], 'Determinista: un borrador se reproduce idéntico para corregirlo.', pieza('video-cuadro-inicio'), { referencia: png('video-cuadro-inicio') });
    },
  },
  {
    id: 'video-3', herramienta: 'video', titulo: 'Sonido sintetizado igual a su referencia', trampa: null, esperado: 'pasa',
    entrada: 'Efectos de la promo (barrido, golpe del precio, golpe de marca), sin música.',
    async corre() {
      const wav = sonidoDeReferencia();
      return verifica([[(await sha256(wav)) === REF['video-sonido'], 'misma huella'], [new DataView(wav.buffer).getUint32(24, true) === 48000, '48 kHz']], [`${wav.length} bytes de WAV mono`], 'Sin música con derechos: la elige el dueño al publicar.');
    },
  },
  {
    id: 'video-4', herramienta: 'video', titulo: 'Una capa de foto o cámara', trampa: 'persona en pantalla', esperado: 'pasa',
    entrada: 'La escena con una capa extra de tipo «foto».',
    async corre() {
      const e = escenaDeReferencia();
      const obs = revisaEscena({ ...e, capas: [...e.capas, { ...e.capas[0]!, id: 'foto', tipo: 'foto' as never }] });
      return verifica([[obs.some((o) => o.regla === 'personas'), 'se rechaza']], obs.map((o) => o.detalle), 'Lo que puede traer personas queda bloqueado hasta su firma (PRP-006, fases 7 y 8).');
    },
  },
  {
    id: 'video-5', herramienta: 'video', titulo: 'Duración y formato fuera de lo permitido', trampa: 'formato equivocado', esperado: 'pasa',
    entrada: 'La escena a 20 s y en 1920×1080.',
    async corre() {
      const e = escenaDeReferencia();
      const obs = [...revisaEscena({ ...e, duracion: 20 }), ...revisaEscena({ ...e, ancho: 1920, alto: 1080 })];
      return verifica([[obs.some((o) => o.regla === 'duracion'), 'duración rechazada'], [obs.some((o) => o.regla === 'formato'), 'formato rechazado']], obs.map((o) => o.detalle), 'Una promo va de 3 a 8 s y en vertical.');
    },
  },
  {
    id: 'video-6', herramienta: 'video', titulo: 'Nombre con código en el video', trampa: 'texto malicioso', esperado: 'pasa',
    entrada: 'Producto «<script>alert(1)</script>» en la escena.',
    async corre() {
      const e = escenaDePromo(marcaDeReferencia(), { titular: '<script>alert(1)</script>', semilla: 'x' });
      const svg = cuadroSvg(e, e.duracion - 0.1);
      return verifica([[!svg.includes('<script>'), 'no llega como código'], [svg.includes('&lt;script&gt;'), 'se ve como texto']], ['escapado en cada cuadro'], 'Lo que se escribe nunca se ejecuta.', svg);
    },
  },
  {
    id: 'video-7', herramienta: 'video', titulo: 'MP4 renderizado dos veces: mismo archivo', trampa: null, esperado: 'pasa',
    entrada: 'public/laboratorio-pymes/video/medicion.json (npm run contenido:video).',
    async corre() {
      const texto = await readFile(join(process.cwd(), 'public/laboratorio-pymes/video/medicion.json'), 'utf8').catch(() => null);
      if (!texto) return { estado: 'no-medido', evidencia: ['falta correr npm run contenido:video'], veredicto: 'Sin render no se afirma nada.' };
      const m = JSON.parse(texto) as { iguales: boolean; huellas: string[]; cuadros: number; msRender: number[]; ffprobe: { streams: { codec_name: string; width?: number; height?: number; r_frame_rate: string; sample_rate?: string }[]; format: { duration: string } } };
      const v = m.ffprobe.streams.find((s) => s.codec_name === 'h264'), a = m.ffprobe.streams.find((s) => s.codec_name === 'aac');
      return verifica([[m.iguales, 'misma huella en dos renders'], [v?.width === 1080 && v.height === 1920 && v.r_frame_rate === '30/1', '1080×1920 a 30 fps'], [a?.sample_rate === '48000', 'AAC a 48 kHz']], [`huella ${m.huellas[0]!.slice(0, 16)}… (×2)`, `${m.cuadros} cuadros · ${m.ffprobe.format.duration} s · render ${m.msRender.map((x) => `${(x / 1000).toFixed(1)} s`).join(' y ')}`], 'Medido con ffprobe; el render real se ve y se repite idéntico.', undefined, { video: { mp4: '/laboratorio-pymes/video/promo-dia-de-muertos.mp4', hoja: '/laboratorio-pymes/video/promo-dia-de-muertos.hoja.png' } });
    },
  },
];

export const CASOS_APROBACION: readonly Caso[] = [
  {
    id: 'aprobacion-1', herramienta: 'aprobacion', titulo: 'Aprobar el archivo exacto', trampa: null, esperado: 'pasa',
    entrada: 'La publicación 4:5 de referencia.',
    async corre() {
      const svg = pieza('pieza-vertical'), a = await aprueba('2026-10-20-instagram', svg, 1, '2026-10-18T10:00');
      return verifica([[a.huella === REF['pieza-vertical'], 'la huella es la de la pieza'], [(await vigencia(a, svg)) === 'vigente', 'vigente']], [`aprobada · v${a.version} · ${a.huella.slice(0, 16)}…`], 'Se sabe exactamente qué se aprobó.', svg);
    },
  },
  {
    id: 'aprobacion-2', herramienta: 'aprobacion', titulo: 'Cambió el precio después de aprobar', trampa: 'aprobar a ciegas', esperado: 'pasa',
    entrada: 'La pieza aprobada con $45.00 y luego regenerada con $48.00.',
    async corre() {
      const m = marcaDeReferencia();
      const antes = piezaSvg(m, { ...PIEZA, formato: 'vertical', semilla: 'ref-vertical' }), despues = piezaSvg(m, { ...PIEZA, precio: '$48.00', formato: 'vertical', semilla: 'ref-vertical' });
      const a = await aprueba('p', antes, 1, '2026-10-18T10:00');
      return verifica([[(await vigencia(a, despues)) === 'revocada', 'la aprobación se revoca sola']], ['editar revoca: nadie aprueba algo que cambió'], 'La aprobación vieja no vale para el precio nuevo.', despues);
    },
  },
  {
    id: 'aprobacion-3', herramienta: 'aprobacion', titulo: 'Pedir cambio sin decir qué', trampa: 'nota vacía', esperado: 'pasa',
    entrada: 'Un «pedir cambio» con la nota en blanco, y otro con nota en el segundo 2.5 del video.',
    async corre() {
      const svg = pieza('video-cuadro-final');
      const vacio = await pideCambio('v', svg, 1, '   ', '2026-10-18').then(() => false, () => true);
      const c = await pideCambio('v', svg, 1, 'el precio entra muy rápido', '2026-10-18', 2.5);
      return verifica([[vacio, 'sin nota no se registra'], [c.estado === 'cambio-pedido' && c.segundo === 2.5, 'la nota queda en el segundo exacto']], [`«${c.nota}» @ ${c.segundo} s`], 'Un cambio dice qué y dónde.');
    },
  },
  {
    id: 'aprobacion-4', herramienta: 'aprobacion', titulo: 'CSV del mes: solo lo aprobado, vigente y futuro', trampa: 'filas que no deben salir', esperado: 'pasa',
    entrada: 'Cuatro filas: aprobada vigente futura, aprobada revocada, aprobada pasada y con cambio pedido.',
    async corre() {
      const svg = pieza('pieza-vertical'), a = await aprueba('a', svg, 1, '2026-10-18'), c = await pideCambio('c', svg, 1, 'otro color', '2026-10-18');
      const csv = csvDelMes([
        { dia: '2026-10-20', canal: 'instagram', texto: 'Día de Muertos ya viene', archivo: '2026-10-20-instagram.png', aprobacion: a, vigente: true },
        { dia: '2026-10-21', canal: 'facebook', texto: 'x', archivo: 'b.png', aprobacion: a, vigente: false },
        { dia: '2026-10-10', canal: 'facebook', texto: 'y', archivo: 'c.png', aprobacion: a, vigente: true },
        { dia: '2026-10-22', canal: 'whatsapp', texto: 'z', archivo: 'd.png', aprobacion: c, vigente: true },
      ], '2026-10-18');
      const lineas = csv.split('\n');
      return verifica([[lineas.length === 2, 'una sola fila además del encabezado'], [/aprobada: la subes tú$/.test(lineas[1]!), 'dice que la sube el dueño']], lineas, 'Aprobar no es publicar: el CSV es para que el dueño suba lo suyo.');
    },
  },
  {
    id: 'aprobacion-5', herramienta: 'aprobacion', titulo: 'Aprobar el MP4 real por su huella', trampa: null, esperado: 'pasa',
    entrada: 'El MP4 de la promo renderizado en public/laboratorio-pymes/video/.',
    async corre() {
      const ruta = join(process.cwd(), 'public/laboratorio-pymes/video');
      const [mp4, medicion] = await Promise.all([readFile(join(ruta, 'promo-dia-de-muertos.mp4')).catch(() => null), readFile(join(ruta, 'medicion.json'), 'utf8').catch(() => null)]);
      if (!mp4 || !medicion) return { estado: 'no-medido', evidencia: ['falta el render (npm run contenido:video)'], veredicto: 'Sin archivo no hay qué aprobar.' };
      const a = await aprueba('promo', new Uint8Array(mp4), 1, '2026-10-18');
      return verifica([[a.huella === sinPrefijo((JSON.parse(medicion) as { huellas: string[] }).huellas[0]), 'la huella del MP4 es la medida en el render'], [a.huella === (await huellaSha256(new Uint8Array(mp4))), 'misma función en el navegador y aquí']], [`MP4 ${mp4.length} bytes · ${a.huella.slice(0, 16)}…`], 'Se aprueba el archivo que se va a subir, no una vista previa.', undefined, { video: { mp4: '/laboratorio-pymes/video/promo-dia-de-muertos.mp4', hoja: '/laboratorio-pymes/video/promo-dia-de-muertos.hoja.png' } });
    },
  },
  {
    id: 'aprobacion-6', herramienta: 'aprobacion', titulo: 'Aprobar un carrusel es aprobar TODAS sus láminas', trampa: 'aprobación parcial', esperado: 'pasa',
    entrada: 'El carrusel de temporada aprobado entero; luego cambia la lámina 3.',
    async corre() {
      const c = carruselDeTemporada(briefDeReferencia(), marcaDeReferencia(), { precios: { 'pan de muerto': 45 }, contacto: NEGOCIO_DEMO.contacto })!;
      const junto = c.laminas.map((l) => l.svg).join('\n');
      const a = await aprueba(c.id, junto, 1, '2026-10-18');
      const cambiado = c.laminas.map((l) => (l.indice === 3 ? l.svg.replace('Apártalo hoy', 'Apártalo ya') : l.svg)).join('\n');
      return verifica([[(await vigencia(a, junto)) === 'vigente', 'vigente con las 4 láminas'], [(await vigencia(a, cambiado)) === 'revocada', 'una lámina cambiada revoca todo el carrusel']], [`${c.laminas.length} láminas bajo una sola huella`], 'No se aprueba media historia.');
    },
  },
];
