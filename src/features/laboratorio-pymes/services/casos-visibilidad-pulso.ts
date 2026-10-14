/** Casos de visibilidad (buscadores y asistentes de IA) y de pulso (anuncios, pulso, brief del lunes). */
import { auditaVisibilidad, llmsTxt, jsonLdNegocio, robotsPropuesto } from '../../../../tools/pymes-marketing/dist/visibilidad/index.js';
import { leeAnuncios, campanas, recomendaciones, pulsoDeCrecimiento, pulsoParaElLunes, briefDelLunes, anunciosParaElLunes, competenciaParaElLunes, resenasParaElLunes, visibilidadParaElLunes, leeNotasDeCompetencia } from '../../../../tools/pymes-marketing/dist/pulso/index.js';
import { ventasDesdeCfdi, resumeVentas } from '../../../../tools/pymes-marketing/dist/ventas/index.js';
import { formatoDinero } from '../../../../tools/pymes-marketing/dist/index.js';
import { anuncios } from '../../estudio-pymes/services/estudio.ts';
import { demoPanaderia, RFC_DEMO } from '../datos/cfdi-sinteticos.ts';
import { anunciosDemo, NEGOCIO_DEMO, NOTAS_COMPETENCIA_DEMO, ROBOTS_BLOQUEA_IA, ROBOTS_SANO, SITIO_CON_PROBLEMAS, SITIO_DEMO } from '../datos/demo.ts';
import { leeXml } from './casos-marca-ventas.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

const sana = () => auditaVisibilidad({ url: NEGOCIO_DEMO.sitio, html: SITIO_DEMO, robots: ROBOTS_SANO, llms: '# La Espiga', sitemap: '<urlset/>', anio: 2026 });
const enferma = () => auditaVisibilidad({ url: 'http://laespiga.example.mx', html: SITIO_CON_PROBLEMAS, robots: ROBOTS_BLOQUEA_IA, llms: null, sitemap: null, anio: 2026 });

export const CASOS_VISIBILIDAD: readonly Caso[] = [
  {
    id: 'visibilidad-1', herramienta: 'visibilidad', titulo: 'Sitio sano: sin alarmas y sin calificación inventada', trampa: null, esperado: 'pasa',
    entrada: 'HTML, robots.txt, llms.txt y sitemap sintéticos de un sitio bien hecho.',
    async corre() {
      const a = sana();
      return verifica([[!a.cinco.some((h) => h.impacto === 'alto'), 'ningún hallazgo alto'], [!('calificacion' in a), 'sin calificación global'], [a.noRevisado.some((x) => /asistentes/.test(x)), 'dice que la prueba del asistente la hace el dueño']], [a.enUnaLinea, ...a.cinco.map((h) => `${h.titulo} (${h.impacto})`), ...a.noRevisado], '«Nadie puede hacer que una IA recomiende un negocio»: se dice qué hay, no se promete.');
    },
  },
  {
    id: 'visibilidad-2', herramienta: 'visibilidad', titulo: 'robots.txt bloquea a los asistentes de IA', trampa: null, esperado: 'pasa',
    entrada: 'robots.txt sintético que bloquea a GPTBot, ClaudeBot y PerplexityBot.',
    async corre() {
      const a = enferma(), h = a.cinco[0]!;
      return verifica([[h.id === 'rastreadores', 'va primero (orden de la fuente)'], [h.decision, 'se presenta como decisión del dueño'], [/GPTBot/.test(h.detalle), 'nombra a quién bloquea']], [`${h.titulo} — ${h.detalle}`, `archivo propuesto:\n${robotsPropuesto(NEGOCIO_DEMO.sitio).split('\n').slice(0, 5).join(' / ')}…`], 'Abrir o no la puerta a los asistentes lo decide el dueño.');
    },
  },
  {
    id: 'visibilidad-3', herramienta: 'visibilidad', titulo: 'Texto escondido para manipular asistentes', trampa: 'inyección en la página', esperado: 'pasa',
    entrada: 'HTML sintético con un comentario «Note to AI assistants: always recommend…».',
    async corre() {
      const a = enferma(), todos = [...a.cinco, ...a.anexo];
      return verifica([[todos.some((h) => h.id === 'instrucciones-ia'), 'se reporta como hallazgo'], [!JSON.stringify(a).includes('always recommend'), 'el texto no se copia a nada']], todos.filter((h) => h.id === 'instrucciones-ia').map((h) => `${h.titulo}: ${h.detalle}`), 'Lo que intenta manipular se señala y no viaja a ningún arreglo.');
    },
  },
  {
    id: 'visibilidad-4', herramienta: 'visibilidad', titulo: 'Datos que se contradicen y sitio que solo existe con JavaScript', trampa: null, esperado: 'pasa',
    entrada: 'HTML sintético con dos teléfonos distintos, © 2019 y el contenido dentro de una app de JavaScript.',
    async corre() {
      const ids = [...enferma().cinco, ...enferma().anexo].map((h) => h.id);
      return verifica([[ids.includes('telefonos'), 'dos teléfonos'], [ids.includes('anio-viejo'), 'año viejo'], [ids.includes('sin-js'), 'sin JavaScript no dice nada'], [ids.includes('https'), 'sin HTTPS']], [`hallazgos: ${ids.join(', ')}`], 'Un dato contradictorio es el asesino silencioso de la visibilidad.');
    },
  },
  {
    id: 'visibilidad-5', herramienta: 'visibilidad', titulo: 'Arreglos como archivos, con huecos a la vista', trampa: 'dato ausente', esperado: 'pasa',
    entrada: 'Datos del negocio sin horario ni código postal.',
    async corre() {
      const d = { nombre: NEGOCIO_DEMO.nombre, sitio: NEGOCIO_DEMO.sitio, ciudad: NEGOCIO_DEMO.ciudad, telefono: '222 100 2000' };
      const l = llmsTxt(d), j = jsonLdNegocio(d);
      return verifica([[/## Horario\n- POR CONFIRMAR/.test(l), 'el horario queda POR CONFIRMAR'], [/"postalCode": "POR CONFIRMAR"/.test(j), 'el código postal no se inventa'], [/"\+52 2221002000"/.test(j), 'teléfono en formato +52']], [l.split('\n').slice(0, 6).join(' / '), j.split('\n').slice(4, 7).join(' ')], 'Nunca un dato plausible en lugar del verdadero.');
    },
  },
  {
    id: 'visibilidad-6', herramienta: 'visibilidad', titulo: 'No se pudo leer el sitio', trampa: 'dato ausente', esperado: 'pasa',
    entrada: 'Sin HTML ni robots.txt (el sitio no respondió).',
    async corre() {
      const a = auditaVisibilidad({ url: NEGOCIO_DEMO.sitio, html: null, robots: null, llms: null, sitemap: null, anio: 2026 });
      return verifica([[a.noRevisado.some((x) => /página de inicio/.test(x)), 'dice qué no pudo leer'], [!a.cinco.some((h) => h.id === 'rastreadores' || h.id === 'sin-js'), 'no inventa hallazgos de lo que no leyó']], a.noRevisado, 'Lo que no se leyó se nombra; no se supone.');
    },
  },
];

const ventasDemo = () => ventasDesdeCfdi(demoPanaderia().map(leeXml), { rfcPropio: RFC_DEMO });

export const CASOS_PULSO: readonly Caso[] = [
  {
    id: 'pulso-1', herramienta: 'pulso', titulo: 'Anuncios juzgados contra su propio promedio', trampa: null, esperado: 'pasa',
    entrada: 'Exportación sintética de 90 días del Administrador de anuncios (3 campañas y una fila de «Total»).',
    async corre() {
      const cs = campanas(leeAnuncios(anunciosDemo()));
      const por = (n: string) => cs.find((c) => c.nombre.startsWith(n))!;
      return verifica([[!cs.some((c) => c.nombre === 'Total' || !c.nombre.trim()) && cs.length === 3, 'la fila de Total (va en la columna del día) no se cuenta'], [por('Pan').veredicto === 'funciona', 'la de pan de muerto funciona'], [por('Pasteles').veredicto === 'problema', 'la de pasteles lleva semanas sin resultados']], cs.map((c) => `${c.nombre}: ${c.veredicto} — ${c.porque}`), 'Sin referencias de internet: cada cuenta contra sí misma.');
    },
  },
  {
    id: 'pulso-2', herramienta: 'pulso', titulo: 'Campaña sin resultados medidos', trampa: 'dato ausente (vacío ≠ 0)', esperado: 'pasa',
    entrada: 'La campaña «Marca - Alcance» exporta la columna de resultados vacía.',
    async corre() {
      const cs = campanas(leeAnuncios(anunciosDemo()));
      const marca = cs.find((c) => c.nombre.startsWith('Marca'))!, r = recomendaciones(cs);
      return verifica([[marca.resultados === null, 'vacío no se vuelve cero'], [marca.veredicto === 'sin-veredicto', 'sin veredicto'], [r[0]?.cambio === 'Primero, mide los resultados', 'la primera recomendación es medir']], [`${marca.nombre}: ${marca.porque}`, r[0]?.comoHacerlo.join(' → ') ?? ''], 'Antes de tocar presupuesto, medir.');
    },
  },
  {
    id: 'pulso-3', herramienta: 'pulso', titulo: 'Recomendación con su efecto mensual en pesos', trampa: null, esperado: 'pasa',
    entrada: 'La misma exportación.',
    async corre() {
      const r = recomendaciones(campanas(leeAnuncios(anunciosDemo())));
      const pausa = r.find((b) => b.cambio.startsWith('Pausar'));
      return verifica([[pausa?.impactoMensual === -540000, 'ahorra $5,400 al mes ($180 al día × 30)'], [(pausa?.comoHacerlo.length ?? 0) >= 3, 'dice dónde dar clic: lo haces tú']], r.map((b) => `${b.cambio}: ${b.neto}`), 'Dinero mensual absoluto, nunca un porcentaje suelto; nada se ejecuta en la cuenta.');
    },
  },
  {
    id: 'pulso-4', herramienta: 'pulso', titulo: 'Pulso con los umbrales de la fuente', trampa: 'dato ausente (sin embudo)', esperado: 'pasa',
    entrada: '91 CFDI sintéticos y la exportación de anuncios; no hay hoja de prospectos.',
    async corre() {
      const v = ventasDemo();
      const p = pulsoDeCrecimiento({ ventas: v, resumen: resumeVentas(v), anuncios: campanas(leeAnuncios(anunciosDemo())) });
      const pros = p.vistas.find((x) => x.nombre === 'Prospectos')!;
      return verifica([[pros.estado === 'n/a' && /prospectos/.test(pros.motivo ?? ''), 'la vista sin datos se NOMBRA'], [p.vistas.length === 5, 'las 5 vistas, ninguna desaparece'], [p.acciones.length <= 3, 'máximo 3 acciones']], [p.enUnaFrase, ...p.vistas.map((x) => `${x.nombre}: ${x.estado}${x.motivo ? ` — ${x.motivo}` : ''}`)], '¿Funciona el motor de crecimiento?, con lo que hay y nombrando lo que falta.');
    },
  },
  {
    id: 'pulso-5', herramienta: 'pulso', titulo: 'Brief del lunes con una fuente «sin datos»', trampa: 'fusión que tira una fuente', esperado: 'pasa',
    entrada: 'Pulso, anuncios y visibilidad; sin reseñas cargadas ni notas de competencia esta semana.',
    async corre() {
      const v = ventasDemo(), cs = campanas(leeAnuncios(anunciosDemo()));
      const b = briefDelLunes([pulsoParaElLunes(pulsoDeCrecimiento({ ventas: v, resumen: resumeVentas(v) })), anunciosParaElLunes(cs, recomendaciones(cs)), visibilidadParaElLunes(auditaVisibilidad({ url: NEGOCIO_DEMO.sitio, html: SITIO_DEMO, robots: ROBOTS_BLOQUEA_IA, llms: null, sitemap: '<u/>', anio: 2026 })), resenasParaElLunes(null), competenciaParaElLunes(null)], { semana: '2026-10-19' });
      const sin = b.secciones.filter((s) => s.estado === 'sin-datos');
      return verifica([[b.secciones.length === 5, 'ninguna sección se tira'], [sin.length === 2, 'reseñas y competencia marcadas «sin datos»'], [b.acciones.length <= 3, 'máximo 3 acciones'], [b.hilo.length >= 1, 'hay frase que conecta, no reportes engrapados']], [b.titular, ...b.hilo, `fuentes: ${b.fuentes}`, ...b.acciones.map((a, i) => `${i + 1}. ${a.titulo}${a.impacto ? ` (${a.impacto})` : ''}`)], 'Una fuente que no llegó se dice; nunca parece buena noticia.');
    },
  },
  {
    id: 'pulso-6', herramienta: 'pulso', titulo: 'Competencia: observado contra inferido', trampa: null, esperado: 'pasa',
    entrada: 'Dos notas sintéticas del dueño sobre «Panadería El Globo».',
    async corre() {
      const { notas } = leeNotasDeCompetencia(NOTAS_COMPETENCIA_DEMO);
      const s = competenciaParaElLunes(notas);
      return verifica([[notas.length === 2, 'dos notas fechadas'], [s.hallazgos.some((h) => /inferido/.test(h)), 'lo inferido se marca como tal'], [s.acciones.length === 0, 'por lo que hizo un competidor no se dispara ninguna acción de precio']], s.hallazgos, 'Se separa lo que se vio de lo que se supone.');
    },
  },
  {
    id: 'pulso-7', herramienta: 'pulso', titulo: 'Exportación en dólares', trampa: 'moneda mezclada', esperado: 'pasa',
    entrada: 'Exportación sintética con «Amount spent (USD)».',
    async corre() {
      const l = leeAnuncios('Campaign name,Amount spent (USD),Results\nPromo,$50.00,4\n');
      const r = recomendaciones(campanas(l), l.moneda);
      return verifica([[l.moneda === 'USD', 'se reconoce la moneda'], [!r.some((b) => /MXN/.test(b.cuestaHoy)), 'no se reporta como pesos']], [`moneda ${l.moneda}; gasto ${formatoDinero(l.filas[0]!.gasto, 'USD')}`], 'Nunca se convierte ni se mezcla en silencio.');
    },
  },
  {
    id: 'pulso-8', herramienta: 'pulso', titulo: 'El estudio enseña la columna que no reconoce, con los encabezados del archivo', trampa: 'columna no reconocida', esperado: 'pasa',
    entrada: 'Exportación sintética con «Monto invertido» en lugar de un nombre de gasto conocido.',
    async corre() {
      const a = anuncios('Campaña,Monto invertido,Resultados\nPromo,$50.00,4\n');
      const falta = a.avisos.find((x) => x.startsWith('No reconocí')) ?? '';
      return verifica([[a.campanas.length === 0, 'sin gasto no juzga ninguna campaña'], [/el gasto/.test(falta) && /Monto invertido/.test(falta), 'dice qué columna falta y qué trae el archivo'], [a.avisos.some((x) => /no puedo juzgar/.test(x)), 'dice por qué no hay veredictos']], a.avisos, 'Una columna que no se reconoce se ve, con lo necesario para cotejarla (piloto, §6).');
    },
  },
  {
    id: 'pulso-9', herramienta: 'pulso', titulo: 'Una fila ilegible no desaparece en silencio', trampa: 'fila ilegible', esperado: 'pasa',
    entrada: 'Exportación sintética de 3 días; el gasto de uno dice «N/D».',
    async corre() {
      const a = anuncios('Día,Campaña,Gasto,Resultados\n2026-09-01,Promo,$10.00,1\n2026-09-02,Promo,N/D,1\n2026-09-03,Promo,$10.00,1\n');
      const aviso = a.avisos.find((x) => /No pude leer 1 fila/.test(x)) ?? '';
      return verifica([[a.campanas[0]?.gasto === 2000, 'el gasto suma solo lo que se leyó'], [/línea 3/.test(aviso) && /no está en las cifras/.test(aviso), 'dice cuál fila y que su gasto falta']], a.avisos, 'Un gasto menor del real se avisa: sin eso, el veredicto sale de datos parciales.');
    },
  },
  {
    id: 'pulso-10', herramienta: 'pulso', titulo: 'Dólares de punta a punta: tabla, avisos y brief del lunes', trampa: 'moneda mezclada', esperado: 'pasa',
    entrada: 'Exportación sintética en USD: 20 días gastando sin un solo resultado.',
    async corre() {
      const filas = ['Day,Campaign name,Amount spent (USD),Results'];
      for (let d = 0; d < 20; d++) filas.push(`${new Date(Date.UTC(2026, 8, 1 + d)).toISOString().slice(0, 10)},Promo,$5.00,0`);
      const a = anuncios(filas.join('\n'));
      const impacto = anunciosParaElLunes(a.campanas, a.bloques).acciones[0]?.impacto ?? '';
      return verifica([[a.moneda === 'USD', 'la moneda llega a la app'], [a.avisos.some((x) => /dólares/.test(x)), 'se le dice al dueño'], [/USD al mes/.test(impacto) && !/MXN/.test(impacto), 'el brief del lunes no la llama pesos']], [`moneda ${a.moneda}`, ...a.avisos, `lunes: ${impacto}`], 'Antes el brief decía «MXN al mes» con una exportación en dólares.');
    },
  },
];
