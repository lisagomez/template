/**
 * Casos del REEL DEL CELULAR (PRP-007): el reel, sus controles de privacidad, las tarjetas animadas y la
 * sala de aprobación. Los casos con motores (transcripción, caras, pantalla, voces) leen la medición real
 * de `npm run reel:laboratorio` sobre clips SINTÉTICOS; los de lógica corren en vivo.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aplicaCortes, aplicaTextos, archivoAss, edlDesde, porBorrar, propone, revisaPrivacidad, rotulos, rotulosFueraDeZona, validaAprobacion, REGLAS_DE_CORTE, type Observacion } from '../../../../tools/reel/dist/index.js';
import { cuadroSvg, revisaEscena, tarjetaDeTemporada, TEMPORADAS_FIRMADAS } from '../../../../tools/pymes-marketing/dist/video/index.js';
import { marcaDeReferencia } from './referencias-visuales.ts';
import type { Caso, ResultadoDeCaso } from './tipos.ts';
import { verifica } from './verifica.ts';

interface CasoMedido { estado: string; bruto: { ubicacion: string[] }; ubicacionTrasIngesta: string[]; hablantes: number | null; pistas: Array<{ id: number; esSujeto: boolean }>; hallazgos: Array<{ muestra: string }>; observaciones: Observacion[]; master: { huella: string; medidas: { ancho: number; alto: number; fps: number; duracion: number; audioHz?: number; codecVideo?: string; codecAudio?: string }; lufs: number | null; qa: Observacion[] } | null }
interface Medicion { deterministico: boolean | null; casos: Record<string, CasoMedido> }
const DIR = join(process.cwd(), 'public', 'laboratorio-pymes', 'reel');
const leeJson = async <T>(n: string): Promise<T | null> => readFile(join(DIR, n), 'utf8').then((t) => JSON.parse(t) as T, () => null);
const NO_MEDIDO: ResultadoDeCaso = { estado: 'no-medido', evidencia: ['falta correr npm run reel:laboratorio (motores locales)'], veredicto: 'Sin la medición real no se afirma nada.' };
const bloquea = (c: CasoMedido | undefined, regla: string) => (c?.observaciones ?? []).filter((o) => o.nivel === 'bloquea' && o.regla === regla);
const medido = async (caso: string, f: (c: CasoMedido, m: Medicion) => ResultadoDeCaso): Promise<ResultadoDeCaso> => {
  const m = await leeJson<Medicion>('medicion.json');
  const c = m?.casos[caso];
  return m && c ? f(c, m) : NO_MEDIDO;
};
const P = (texto: string, inicio: number, fin: number) => ({ texto, inicio, fin });
const HUELLA = `sha256:${'ab'.repeat(32)}`;

export const CASOS_REEL: readonly Caso[] = [
  { id: 'reel-1', herramienta: 'reel', titulo: 'Reel del clip limpio: formato, volumen y QA', trampa: null, esperado: 'pasa',
    entrada: 'Clip sintético de 25 s: retrato al óleo de dominio público a cámara y voz local Piper es_MX.',
    corre: () => medido('limpio', (c) => { const m = c.master; return verifica([
      [c.estado === 'borrador', 'queda como borrador sin bloqueos'], [m?.medidas.ancho === 1080 && m.medidas.alto === 1920 && m.medidas.fps === 30, '1080×1920 a 30 fps'],
      [m?.medidas.codecVideo === 'h264' && m.medidas.codecAudio === 'aac' && m.medidas.audioHz === 48000, 'H.264 + AAC 48 kHz'], [m?.lufs !== null && Math.abs((m?.lufs ?? 0) + 14) <= 1, '−14 LUFS ± 1'],
      [(m?.medidas.duracion ?? 0) >= 15 && (m?.medidas.duracion ?? 0) <= 60, 'de 15 a 60 s'], [(m?.qa.length ?? 1) === 0, 'QA sin observaciones']],
      [`${m?.medidas.ancho}×${m?.medidas.alto} · ${m?.medidas.fps} fps · ${m?.medidas.duracion} s · ${m?.lufs} LUFS`, `huella ${m?.huella.slice(0, 23)}…`], 'El clip del dueño sale como reel con su formato, su volumen y su QA en verde.', undefined, { video: { mp4: '/laboratorio-pymes/reel/limpio.mp4', hoja: '/laboratorio-pymes/reel/limpio.hoja.png' } }); }) },
  { id: 'reel-2', herramienta: 'reel', titulo: 'Mismo máster dos veces: misma huella', trampa: null, esperado: 'pasa',
    entrada: 'El clip limpio procesado dos veces desde cero.',
    corre: () => medido('limpio-2', (c, m) => verifica([[m.deterministico === true, 'las dos huellas son iguales'], [c.master?.huella === m.casos['limpio']?.master?.huella, 'limpio y limpio-2 coinciden']],
      [`${c.master?.huella.slice(0, 23)}… ×2`], 'Determinista: se puede aprobar por huella porque el mismo borrador se reproduce idéntico.')) },
  { id: 'reel-3', herramienta: 'reel', titulo: 'La ubicación GPS se borra al entrar', trampa: null, esperado: 'pasa',
    entrada: 'El bruto trae etiquetas de ubicación como las de un celular.',
    corre: () => medido('limpio', (c) => verifica([[c.bruto.ubicacion.length > 0, 'el bruto sí traía ubicación'], [c.ubicacionTrasIngesta.length === 0, 'tras la ingesta no queda ninguna']],
      [`antes: ${c.bruto.ubicacion.join(', ')}`, `después: ${c.ubicacionTrasIngesta.join(', ') || 'ninguna'}`], 'Dónde está el negocio no viaja en el archivo.')) },
  { id: 'reel-4', herramienta: 'reel', titulo: 'Una frase que se repite en otra no es retoma', trampa: 'retoma falsa', esperado: 'pasa',
    entrada: '«Hoy sacamos el pan de muerto. Hoy sacamos el pan de muerto recién horneado. El pan de muerto cuesta…»',
    async corre() {
      const f = 'hoy sacamos el pan de muerto hoy sacamos el pan de muerto recién horneado el pan de muerto cuesta 45 pesos'.split(' ');
      const edl = propone(f.map((w, i) => P(w, i * 0.4, i * 0.4 + 0.3)), f.length * 0.4);
      const r = edl.descartes.filter((d) => d.motivo === 'retoma');
      return verifica([[r.length === 1, 'una sola retoma'], [r[0]?.inicio === 0 && r[0]?.fin === 2.4, 'se tira la primera toma y nada más']], [`retomas: ${JSON.stringify(r)}`], 'Se queda la última toma; «el pan de» en la frase siguiente se conserva (antes se cortaba: medido).');
    } },
  { id: 'reel-5', herramienta: 'reel', titulo: 'Subtítulo con código y en la zona segura', trampa: 'texto malicioso', esperado: 'pasa',
    entrada: 'Lo dicho incluye «{\\pos(0,0)}Gratis{\\c&H0000FF&}», que en ASS serían etiquetas de estilo.',
    async corre() {
      const ps = [P('{\\pos(0,0)}Gratis{\\c&H0000FF&}', 0, 0.6), P('pan', 0.7, 1), P('de', 1.05, 1.2), P('muerto.', 1.25, 1.6)];
      const rs = rotulos(ps, edlDesde([], 2)), ass = archivoAss(rs, { nombre: 'x', colores: { primario: '#7a4a1e', texto: '#ffffff' }, tipografia: 'sans' });
      const eventos = ass.split('\n').filter((l) => l.startsWith('Dialogue:')).join('\n');
      return verifica([[!/\{\\/.test(eventos), 'ninguna etiqueta llega al subtítulo'], [rotulosFueraDeZona(rs).length === 0, 'todos los rótulos en la zona segura']], [eventos.slice(0, 160)], 'Lo dicho es dato, nunca estilo; y el rótulo no choca con los botones de la red.');
    } },
  { id: 'reel-6', herramienta: 'reel', titulo: 'Clip horizontal', trampa: 'clip horizontal', esperado: 'pasa',
    entrada: 'El mismo clip grabado en 1920×1080.',
    corre: () => medido('horizontal', (c) => verifica([[c.estado === 'bloqueado', 'bloqueado'], [bloquea(c, 'clip-horizontal').length === 1, 'por ser horizontal'], [c.master === null, 'sin gastar CPU en un máster']],
      [bloquea(c, 'clip-horizontal')[0]?.mensaje ?? '—'], 'Se detiene antes de procesar y le dice al dueño cómo grabarlo.')) },
  { id: 'reel-7', herramienta: 'reel', titulo: 'Marcas por palabra medidas', trampa: null, esperado: 'pasa',
    entrada: '19 palabras sintetizadas por separado, con el inicio real de cada una sabido al milisegundo.',
    async corre() {
      const m = await leeJson<{ emparejadas: number; sesgoMs: number; medianaAbsMs: number; p90AbsMs: number; maxAbsMs: number }>('marcas.json');
      if (!m) return NO_MEDIDO;
      return verifica([[m.emparejadas >= 10, 'al menos 10 palabras emparejadas'], [m.p90AbsMs <= REGLAS_DE_CORTE.respiroAntes * 1000, `el respiro (${REGLAS_DE_CORTE.respiroAntes * 1000} ms) cubre el p90`]],
        [`sesgo ${m.sesgoMs} ms · mediana ${m.medianaAbsMs} ms · p90 ${m.p90AbsMs} ms · máx ${m.maxAbsMs} ms`], 'La propuesta decía «no medidas»: ahora sí, y el respiro se fijó con ese dato.');
    } },
];

export const CASOS_PRIVACIDAD: readonly Caso[] = [
  { id: 'priv-1', herramienta: 'privacidad', titulo: 'Cliente al fondo sin consentimiento', trampa: 'cara sin consentimiento', esperado: 'pasa',
    entrada: 'Un segundo retrato chico al fondo, en todo el clip.',
    corre: () => medido('cliente-al-fondo', (c) => verifica([[c.pistas.length === 2 && c.pistas.filter((p) => p.esSujeto).length === 1, 'dos caras: el sujeto y una más'],
      [!(c.master?.qa ?? []).some((o) => o.regla === 'cara-sin-cubrir'), 'al revisar el máster no queda ninguna cara al aire'], [c.observaciones.some((o) => o.regla === 'caras-desenfocadas'), 'se le avisa al dueño']],
      [`pistas: ${JSON.stringify(c.pistas)}`], 'Se desenfoca por defecto y se comprueba en el máster; detección, nunca reconocimiento.', undefined, { video: { mp4: '', hoja: '/laboratorio-pymes/reel/cliente-al-fondo.hoja.png' } })) },
  { id: 'priv-2', herramienta: 'privacidad', titulo: 'Ticket con teléfono en pantalla', trampa: 'dato personal en cuadro', esperado: 'pasa',
    entrada: 'Un ticket con «Tel. 55 0000 1234» visible todo el clip.',
    corre: () => medido('ticket-telefono', (c) => { const b = bloquea(c, 'dato-en-pantalla'); return verifica([[c.estado === 'bloqueado', 'bloqueado'], [b.length === 1, 'un solo aviso agrupado, no uno por cuadro'],
      [!/0000 1234/.test(JSON.stringify(c)), 'el número completo no aparece en ningún lado'], [c.hallazgos.every((h) => h.muestra.length <= 5), 'reporte enmascarado a 4 caracteres']],
      [b[0]?.mensaje ?? '—'], 'Bloquea hasta cubrirlo; nunca repite el dato.', undefined, { video: { mp4: '', hoja: '/laboratorio-pymes/reel/ticket-telefono.hoja.png' } }); }) },
  { id: 'priv-3', herramienta: 'privacidad', titulo: 'Dos hablantes', trampa: 'segunda voz sin consentimiento', esperado: 'pasa',
    entrada: 'Una segunda voz local (Piper «ald») entra entre dos frases.',
    corre: () => medido('dos-hablantes', (c) => verifica([[c.hablantes === 2, 'cuenta dos voces'], [bloquea(c, 'otra-voz').length === 1, 'bloquea hasta registrar su consentimiento']],
      [bloquea(c, 'otra-voz')[0]?.mensaje ?? '—'], 'Una voz no se desenfoca: o consiente o se corta.')) },
  { id: 'priv-4', herramienta: 'privacidad', titulo: 'Audio con música ajena', trampa: 'música de fondo', esperado: 'pasa',
    entrada: 'Un acorde sintetizado de fondo durante todo el clip.',
    corre: () => medido('musica-ajena', (c) => verifica([[bloquea(c, 'musica-de-fondo').length === 1, 'bloquea']], [bloquea(c, 'musica-de-fondo')[0]?.mensaje ?? '—'], 'El reel no lleva música incrustada (respuesta 12); se agrega al publicar.')) },
  { id: 'priv-5', herramienta: 'privacidad', titulo: 'Precio que no coincide con el catálogo', trampa: 'precio equivocado', esperado: 'pasa',
    entrada: 'Dice «cincuenta pesos»; el catálogo dice $45.',
    corre: () => medido('precio-no-coincide', (c) => { const b = bloquea(c, 'precio-no-coincide')[0]; return verifica([[!!b && /\$50\.00/.test(b.mensaje) && /\$45\.00/.test(b.mensaje), 'bloquea diciendo los dos precios']], [b?.mensaje ?? '—'], 'Lo que se dice se coteja contra el catálogo antes de salir.'); }) },
  { id: 'priv-6', herramienta: 'privacidad', titulo: 'Consentimiento vencido o revocado no cuenta', trampa: 'consentimiento vencido', esperado: 'pasa',
    entrada: 'Dos voces; el consentimiento de la segunda venció ayer, o fue revocado.',
    async corre() {
      const base = { medidas: { ancho: 1080, alto: 1920, fps: 30, duracion: 20 }, pistas: [], sujetoId: null, hablantes: 2, hoy: '2026-09-27', hallazgos: [], musica: { fraccion: 0, segundos: 0 } };
      const vencido = revisaPrivacidad({ ...base, consentimientos: [{ alias: 'Empleada 1', rol: 'empleado', vigenteHasta: '2026-09-26' }] });
      const revocado = revisaPrivacidad({ ...base, consentimientos: [{ alias: 'Empleada 1', rol: 'empleado', vigenteHasta: '2027-01-01', revocado: true }] });
      const vigente = revisaPrivacidad({ ...base, consentimientos: [{ alias: 'Empleada 1', rol: 'empleado', vigenteHasta: '2027-01-01' }] });
      return verifica([[vencido.some((o) => o.regla === 'otra-voz'), 'vencido: bloquea'], [revocado.some((o) => o.regla === 'otra-voz'), 'revocado: bloquea'], [!vigente.some((o) => o.regla === 'otra-voz'), 'vigente: pasa']], ['vencido ⛔ · revocado ⛔ · vigente ✓'], 'Retirar el consentimiento vuelve a bloquear.');
    } },
  { id: 'priv-7', herramienta: 'privacidad', titulo: 'Retención de 30 días con reloj inyectado', trampa: null, esperado: 'pasa',
    entrada: 'Tres proyectos aprobados el 2026-08-28: uno ya borrado, dos no; el reloj marca el día 29 y el 30.',
    async corre() {
      const ps = [{ id: 'a', aprobadoEn: '2026-08-28T12:00:00Z', brutoBorradoEn: null }, { id: 'b', aprobadoEn: '2026-08-28T12:00:00Z', brutoBorradoEn: '2026-09-27T12:00:00Z' }, { id: 'c', aprobadoEn: null, brutoBorradoEn: null }];
      const d29 = porBorrar(ps, new Date('2026-09-26T12:00:00Z')), d30 = porBorrar(ps, new Date('2026-09-27T12:00:00Z'));
      return verifica([[d29.length === 0, 'el día 29 no se borra nada'], [d30.join() === 'a', 'el día 30 solo el aprobado y no borrado']], [`día 29: [${d29}] · día 30: [${d30}]`], 'El bruto y la transcripción no se quedan más de lo firmado.');
    } },
  { id: 'priv-8', herramienta: 'privacidad', titulo: 'Ninguna superficie usa service_role', trampa: 'llave que anula RLS', esperado: 'pasa',
    entrada: 'Todo `src/` del proyecto.',
    async corre() {
      const archivos = (await readdir(join(process.cwd(), 'src'), { recursive: true })).map(String).filter((f) => /\.(ts|tsx)$/.test(f));
      // Se busca el USO de la llave, no la palabra (los comentarios que citan C7 no la usan).
      const USO = /process\.env(\.|\[['"])SUPABASE_SERVICE_ROLE_KEY/;
      const usan: string[] = [];
      for (const f of archivos) if (USO.test(await readFile(join(process.cwd(), 'src', f), 'utf8'))) usan.push(f);
      // Armado por partes para que el propio caso no sea un «uso» que el escáner encuentre.
      const sembrado = USO.test(['const k = process.env[', "'SUPABASE_SERVICE", "_ROLE_KEY'];"].join(''));
      return verifica([[usan.length === 0, 'ningún archivo de src/ la usa'], [sembrado, 'control negativo: un uso sembrado sí se detecta']], [`${archivos.length} archivos revisados`, ...usan], 'La app entra con la sesión del dueño; RLS decide (C7).');
    } },
];

const MARCA = marcaDeReferencia();
export const CASOS_TARJETAS: readonly Caso[] = [
  { id: 'tarj-1', herramienta: 'tarjetas', titulo: 'Las 7 temporadas firmadas', trampa: null, esperado: 'pasa', entrada: 'La respuesta 13 firmada.',
    async corre() { const ids = TEMPORADAS_FIRMADAS.map((t) => t.id); return verifica([[ids.length === 7, 'son 7'], [['dia-de-las-madres', 'regreso-a-clases', 'dia-de-muertos', 'buen-fin', 'quincena', 'navidad', 'reyes'].every((x) => ids.includes(x as (typeof ids)[number])), 'las de la firma']], [ids.join(', ')], 'Solo lo firmado.'); } },
  { id: 'tarj-2', herramienta: 'tarjetas', titulo: 'Tarjeta de Día de Muertos, 9:16 y sin personas', trampa: null, esperado: 'pasa', entrada: 'Titular y precio confirmado.',
    async corre() { const r = tarjetaDeTemporada(MARCA, { temporada: 'dia-de-muertos', titular: 'Pan de muerto recién horneado', precio: { texto: '$45.00', confirmado: true } }); if ('falta' in r) return verifica([[false, r.falta]], [], ''); const obs = revisaEscena(r.escena); return verifica([[r.escena.ancho === 1080 && r.escena.alto === 1920, '1080×1920'], [obs.length === 0, 'la revisión del video no objeta nada (ni personas)']], [`${r.escena.capas.length} capas: ${r.escena.capas.map((c) => c.tipo).join(', ')}`], 'Versión video de la pieza, con la marca del cliente.'); } },
  { id: 'tarj-3', herramienta: 'tarjetas', titulo: 'Temporada no firmada', trampa: 'temporada fuera de la firma', esperado: 'pasa', entrada: '«san-valentin».',
    async corre() { const r = tarjetaDeTemporada(MARCA, { temporada: 'san-valentin', titular: 'Amor y amistad' }); return verifica([['falta' in r, 'no se hace']], ['falta' in r ? r.falta.slice(0, 120) : 'se hizo'], 'Lo que no se firmó no se construye.'); } },
  { id: 'tarj-4', herramienta: 'tarjetas', titulo: 'Precio sin confirmar', trampa: 'dato sin confirmar', esperado: 'pasa', entrada: 'Precio $45.00 sin confirmar.',
    async corre() { const r = tarjetaDeTemporada(MARCA, { temporada: 'quincena', titular: 'Conchas de quincena', precio: { texto: '$45.00', confirmado: false } }); return verifica([['escena' in r && !r.escena.capas.some((c) => c.tipo === 'precio'), 'la tarjeta sale sin precio']], [], 'Un precio que el dueño no confirmó no sale en video.'); } },
  { id: 'tarj-5', herramienta: 'tarjetas', titulo: 'La misma tarjeta, el mismo cuadro', trampa: null, esperado: 'pasa', entrada: 'Dos veces la tarjeta de Reyes, cuadro del segundo 2.',
    async corre() { const a = tarjetaDeTemporada(MARCA, { temporada: 'reyes', titular: 'Rosca de Reyes' }), b = tarjetaDeTemporada(MARCA, { temporada: 'reyes', titular: 'Rosca de Reyes' }); const ok = 'escena' in a && 'escena' in b && cuadroSvg(a.escena, 2) === cuadroSvg(b.escena, 2); return verifica([[ok, 'cuadros idénticos']], [], 'Determinista, sin reloj ni azar.'); } },
];

export const CASOS_SALA: readonly Caso[] = [
  { id: 'sala-1', herramienta: 'sala', titulo: 'Aprobar el archivo exacto', trampa: null, esperado: 'pasa', entrada: 'Versión 2 vigente; el dueño aprueba la 2 con su huella.',
    async corre() { const m = validaAprobacion({ numero: 2, huella: HUELLA, bloqueos: [] }, { version: 2, huella: HUELLA, decision: 'aprobada' }); return verifica([[m === null, 'se registra']], [], 'Aprobar = esta versión, estos bytes.'); } },
  { id: 'sala-2', herramienta: 'sala', titulo: 'Aprobar a ciegas un archivo que cambió', trampa: 'aprobar a ciegas', esperado: 'pasa', entrada: 'La huella que manda el celular no es la guardada.',
    async corre() { const m = validaAprobacion({ numero: 2, huella: HUELLA, bloqueos: [] }, { version: 2, huella: `sha256:${'cd'.repeat(32)}`, decision: 'aprobada' }); return verifica([[m !== null, 'se rechaza']], [m ?? ''], 'Nadie aprueba lo que no vio.'); } },
  { id: 'sala-3', herramienta: 'sala', titulo: 'Decidir sobre una versión vieja', trampa: 'versión vieja', esperado: 'pasa', entrada: 'El celular muestra la 1; la vigente es la 2.',
    async corre() { const m = validaAprobacion({ numero: 2, huella: HUELLA, bloqueos: [] }, { version: 1, huella: HUELLA, decision: 'aprobada' }); return verifica([[m !== null, 'se rechaza']], [m ?? ''], 'Recarga antes de decidir.'); } },
  { id: 'sala-4', herramienta: 'sala', titulo: 'Pedir cambio sin decir qué', trampa: 'nota vacía', esperado: 'pasa', entrada: 'Cambio pedido con nota en blanco.',
    async corre() { const m = validaAprobacion({ numero: 1, huella: HUELLA, bloqueos: [] }, { version: 1, huella: HUELLA, decision: 'cambio-pedido', nota: '  ' }); return verifica([[m !== null, 'se rechaza']], [m ?? ''], 'Un cambio sin nota no sirve a nadie.'); } },
  { id: 'sala-5', herramienta: 'sala', titulo: 'Aprobar con bloqueos sin resolver', trampa: 'aprobar lo bloqueado', esperado: 'pasa', entrada: 'La versión tiene un dato en pantalla sin cubrir.',
    async corre() { const m = validaAprobacion({ numero: 1, huella: HUELLA, bloqueos: [{ regla: 'dato-en-pantalla', nivel: 'bloquea', mensaje: 'teléfono' }] }, { version: 1, huella: HUELLA, decision: 'aprobada' }); return verifica([[m !== null, 'se rechaza']], [m ?? ''], 'La sala no deja aprobar mientras haya algo al aire.'); } },
  { id: 'sala-6', herramienta: 'sala', titulo: 'Marca en el segundo exacto del reel editado', trampa: null, esperado: 'pasa', entrada: 'Reel con un tramo cortado (2–4 s del original); el dueño quita 1–2 s del editado y cambia el texto del segundo 0.5.',
    async corre() {
      const edl = edlDesde([{ inicio: 2, fin: 4, motivo: 'silencio' }], 10);
      const nuevo = aplicaCortes(edl, [{ tipo: 'corte', segundo: 1, hasta: 2 }]);
      const t = aplicaTextos([{ inicio: 0, fin: 1, texto: 'Pan de muer' }], [{ tipo: 'texto', segundo: 0.5, nota: 'Pan de muerto' }]);
      const conserva = JSON.stringify(nuevo.conservar);
      return verifica([[conserva === JSON.stringify([{ inicio: 0, fin: 1 }, { inicio: 4, fin: 10 }]), 'se conserva 0–1 y 4–10 del original (el corte 1–2 se une al silencio 2–4)'], [t[0]?.texto === 'Pan de muerto', 'el texto se corrige']], [`conserva ${conserva}`], 'Lo que el dueño marca en su celular se aplica donde lo marcó.');
    } },
  { id: 'sala-7', herramienta: 'sala', titulo: 'RLS con dos cuentas reales', trampa: 'leer lo ajeno', esperado: 'pasa', entrada: 'Dos cuentas sintéticas @example.com contra la base de Supabase (npm run reel:rls).',
    async corre() { const r = await leeJson<{ filas: Array<[string, string, boolean]> }>('rls.json'); if (!r) return { estado: 'no-medido', evidencia: ['falta correr npm run reel:rls contra la base (necesita las migraciones aplicadas)'], veredicto: 'Sin la base real no se afirma el aislamiento.' }; return verifica(r.filas.map(([q, e, ok]) => [ok, `${q}: ${e}`] as const), [`${r.filas.filter((f) => f[2]).length}/${r.filas.length} en verde`], 'La cuenta B no ve, no cambia, no borra ni suplanta nada de la A.'); } },
];
