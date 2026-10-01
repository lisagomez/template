/**
 * Los dos roadmaps en Markdown, GENERADOS desde el código: el papel y el código no divergen (una
 * prueba compara `piloto/ROADMAP-*.md` con esta salida). Se regeneran con
 * `node tools/ventas-whatsapp/e2e/genera-roadmaps.mjs`.
 */
import { formatoUsd } from '../comun/base.js';
import { GUIONES, PLANTILLAS_META, costosDeGuion } from './conversaciones-plantilla.js';
import { presupuestoLaboratorio, roadmapDeCostos, SUPUESTOS_LABORATORIO, type Supuestos } from './presupuesto.js';

const mxn = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function roadmapCostosMarkdown(s: Supuestos = SUPUESTOS_LABORATORIO): string {
  const meses = roadmapDeCostos(s);
  const partidas = presupuestoLaboratorio(s);
  const l: string[] = [];
  l.push('# Roadmap de costos y presupuesto del laboratorio — FICTICIO');
  l.push('');
  l.push('> Generado por `roadmapCostosMarkdown()` (`src/laboratorio/documentos.ts`); no se edita a mano. **Todo es ficticio');
  l.push('> salvo lo marcado «medido»**: sirve para ver la forma de los costos por fase, no para fijar precios. El costo de Meta');
  l.push('> usa las reglas del simulador (entrada gratis por anuncio, cupo de 1,000 NO verificado, utilidad y marketing) y la');
  l.push('> tarjeta de tarifas NO verificada.');
  l.push('');
  l.push('## Supuestos');
  l.push('');
  l.push('| Supuesto | Valor | Naturaleza | Nota |');
  l.push('|---|---|---|---|');
  for (const [k, v] of Object.entries(s)) l.push(`| ${k} | ${JSON.stringify(v.valor).replace(/\|/g, '/')} | ${v.naturaleza} | ${v.nota} |`);
  l.push('');
  l.push('## Presupuesto del laboratorio y del piloto (una vez)');
  l.push('');
  l.push('| Concepto | MXN | Nota |');
  l.push('|---|---:|---|');
  for (const p of partidas) l.push(`| ${p.concepto} | ${mxn(p.montoMxn)} | ${p.nota} |`);
  l.push(`| **Total** | **${mxn(partidas.reduce((a, p) => a + p.montoMxn, 0))}** | |`);
  l.push('');
  l.push('## Roadmap mensual (12 meses)');
  l.push('');
  l.push('| Mes | Fase | Pymes | Conversaciones | Meta | Meta sin cupo | IA | Infra | Soporte (MXN) | Total (MXN) | Por pyme | Por conversación | Ingreso (MXN) | Margen | BSP Kapso (sensibilidad) |');
  l.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const m of meses) {
    l.push(`| ${m.mes} | ${m.fase} | ${m.pymes} | ${m.conversaciones.toLocaleString('en-US')} | ${usd(m.metaUsd)} | ${usd(m.metaSinCupoUsd)} | ${usd(m.iaUsd)} | ${usd(m.infraUsd)} | ${mxn(m.soporteMxn)} | ${mxn(m.totalMxn)} | ${mxn(m.porPymeMxn)} | ${mxn(m.porConversacionMxn)} | ${mxn(m.ingresoMxn)} | ${m.margenPct} % | ${usd(m.bspKapsoUsd)} |`);
  }
  const ultimo = meses[meses.length - 1]!;
  const piloto = meses[0]!;
  l.push('');
  l.push('## Líneas de negocio: números (N-01) y BSP propio (N-02)');
  l.push('');
  l.push('| Mes | Pymes con número nuestro | Números: ingreso (MXN) | Números: costo (MXN) | BSP | Margen BSP (MXN) | Margen SaaS | Margen con las tres líneas |');
  l.push('|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const m of meses) {
    l.push(`| ${m.mes} | ${m.pymesConNumero} | ${mxn(m.numerosIngresoMxn)} | ${mxn(m.numerosCostoMxn)} | ${m.bspModalidad === 'solution_partner' ? 'Solution Partner' : 'Tech Provider'} | ${mxn(m.bspMargenMxn)} | ${m.margenPct} % | ${m.margenTotalPct} % |`);
  }
  const numerosAnio = meses.reduce((a, m) => a + m.numerosIngresoMxn - m.numerosCostoMxn, 0);
  const bspAnio = meses.reduce((a, m) => a + m.bspMargenMxn, 0);
  const kapsoAnio = meses.reduce((a, m) => a + m.bspKapsoUsd, 0) * s.tipoDeCambio.valor;
  const desarrollo = s.bsp.valor.desarrolloHoras * s.bsp.valor.costoHoraDesarrolloMxn;
  l.push('');
  l.push('## Lo que dice (con estos supuestos)');
  l.push('');
  l.push(`- **El costo lo domina la operación humana, no Meta ni la IA**: en el mes 1, soporte ${mxn(piloto.soporteMxn)} de ${mxn(piloto.totalMxn)}. La palanca de margen es pasar de llave en mano a autoservicio (fase 4), no negociar tarifas.`);
  l.push(`- **Meta casi no cuesta mientras la pyme viva en el cupo y en anuncios**: ${usd(piloto.metaUsd)} por pyme al mes; **sin el cupo de 1,000** serían ${usd(piloto.metaSinCupoUsd)}. Confirmar el cupo (P-06) mueve el costo de Meta ~${Math.round(piloto.metaSinCupoUsd / Math.max(0.01, piloto.metaUsd))}×.`);
  l.push(`- **En la fase 5 el marketing pasa a ser el mayor costo de Meta**: ${usd(ultimo.metaUsd)} al mes con ${ultimo.pymes} pymes. Va con opt-in, precio máximo y, si se cobra, trasladado a la pyme.`);
  l.push(`- **La IA con el enrutador determinista es marginal**: ${usd(ultimo.iaUsd)} al mes con ${ultimo.pymes} pymes (tokens ESTIMADOS; el real se mide con el arnés tras el CDC). Sin el enrutador serían ~${(2.12 / 0.3).toFixed(1)}× más llamadas.`);
  l.push(`- **Números (N-01)**: ${mxn(numerosAnio)} de margen en el año; en el piloto casi nada (${piloto.pymesConNumero} pymes con número nuestro). Es una línea de acompañamiento, no de sustento: su valor es que la pyme sin número pueda arrancar el mismo día. La renta paga el pool entero (colchón y cuarentena incluidos), y por eso su margen por número es menor que el precio sugiere.`);
  l.push(`- **BSP propio (N-02)**: construirlo cuesta ${mxn(desarrollo)} una vez, sin contar su mantenimiento; comprarlo (Kapso) costaría ${mxn(kapsoAnio)} en el año. Como Tech Provider no hay ingreso por mensajes (Meta le cobra a la pyme); como Solution Partner, desde el mes ${s.bsp.valor.solutionPartnerDesdeMes}, el margen sobre Meta suma ${mxn(bspAnio)} en el año y trae dos riesgos que Kapso no trae: el crédito de las pymes y el tipo de cambio (la línea de crédito no admite MXN).`);
  l.push('');
  return `${l.join('\n')}`;
}

export function roadmapConversacionesMarkdown(): string {
  const l: string[] = [];
  l.push('# Roadmap de conversaciones-plantilla');
  l.push('');
  l.push('> Generado por `roadmapConversacionesMarkdown()` (`src/laboratorio/documentos.ts`); no se edita a mano. Cada guion');
  l.push('> dice su fase, sus piezas, cuántos mensajes del negocio cuesta y cuánto sale en Meta en tres escenarios (reglas del');
  l.push('> 1/oct/2026, tarjeta NO verificada). «Probada» apunta a un caso del laboratorio o a una prueba que existe.');
  l.push('');
  for (const fase of [1, 2, 3, 4, 5] as const) {
    const suyos = GUIONES.filter((g) => g.fase === fase);
    if (!suyos.length) continue;
    l.push(`## Fase ${fase}`);
    l.push('');
    l.push('| Guion | Vertical | Quién empieza | Pasos | Mensajes del negocio | Por anuncio | Orgánico en cupo | Orgánico fuera de cupo | Estado | Evidencia o lo que falta |');
    l.push('|---|---|---|---|---:|---:|---:|---:|---|---|');
    for (const g of suyos) {
      const c = costosDeGuion(g);
      const n = g.mensajesLibres + g.plantillas.length;
      l.push(`| ${g.nombre} | ${g.vertical} | ${g.disparador} | ${g.pasos}${g.requisito ? ` (requisito: ${g.requisito})` : ''} | ${n} | ${formatoUsd(c.desdeAnuncioUsd * 1e6)} | ${formatoUsd(c.organicoEnCupoUsd * 1e6)} | ${formatoUsd(c.organicoFueraDeCupoUsd * 1e6)} | ${g.estado} | ${g.evidencia} |`);
    }
    l.push('');
  }
  l.push('## Plantillas de Meta que piden estos guiones');
  l.push('');
  l.push('| Plantilla | Categoría | Para qué | Fase | Registrada | Riesgo |');
  l.push('|---|---|---|---:|---|---|');
  for (const p of PLANTILLAS_META) l.push(`| \`${p.nombre}\` | ${p.categoria} | ${p.proposito} | ${p.fase} | ${p.registrada ? 'sí (simulador)' : 'no'} | ${p.riesgo ?? '—'} |`);
  const probadas = GUIONES.filter((g) => g.estado === 'probada').length;
  l.push('');
  l.push(`**Estado**: ${probadas} de ${GUIONES.length} guiones probados en el laboratorio (fases 1-3); lo pendiente es de las fases 4-5.`);
  l.push('');
  return l.join('\n');
}
