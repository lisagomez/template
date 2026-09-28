/**
 * Los arreglos como ARCHIVOS listos para copiar (la fuente los escribía en Wix/Shopify; aquí nada
 * se escribe en el sitio del cliente). Solo datos confirmados por el dueño: lo que falte queda como
 * «POR CONFIRMAR» a la vista, nunca un dato plausible inventado. Solo lo visible y verdadero.
 */
import { RASTREADORES_IA } from './robots.js';

export interface DatosDelNegocio {
  readonly nombre: string;
  readonly giro?: string;
  readonly resumen?: string;
  readonly telefono?: string;
  readonly calle?: string;
  readonly ciudad?: string;
  readonly estado?: string;
  readonly cp?: string;
  readonly horario?: string;
  readonly zona?: string;
  readonly sitio: string;
}

const PC = 'POR CONFIRMAR';

/** robots.txt que abre la puerta a los asistentes, para que el dueño DECIDA si lo usa. */
export function robotsPropuesto(sitio: string): string {
  const base = sitio.replace(/\/$/, '');
  return ['# Propuesta: se aplica solo si decides abrir tu sitio a los asistentes de IA.', 'User-agent: *', 'Allow: /', '',
    ...RASTREADORES_IA.filter((r) => r.verificado).flatMap((r) => [`User-agent: ${r.agente}`, 'Allow: /', '']), `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
}

export function llmsTxt(d: DatosDelNegocio): string {
  return [
    `# ${d.nombre}`, '', `> ${d.resumen ?? `${d.giro ?? PC} en ${d.ciudad ?? PC}.`}`, '',
    '## Qué hacemos', `- ${d.giro ?? PC}`, '', '## Dónde trabajamos', `- ${d.zona ?? d.ciudad ?? PC}`, '',
    '## Horario', `- ${d.horario ?? PC}`, '', '## Contacto', `- Teléfono: ${d.telefono ?? PC}`, `- Dirección: ${[d.calle, d.ciudad, d.estado, d.cp].filter(Boolean).join(', ') || PC}`, '',
    '## Páginas clave', `- Inicio: ${d.sitio}`, '',
  ].join('\n');
}

/** JSON-LD LocalBusiness para pegar en el <head>. Los huecos se ven: nada se rellena con supuestos. */
export function jsonLdNegocio(d: DatosDelNegocio): string {
  const ficha = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: d.nombre, url: d.sitio,
    telephone: d.telefono ? `+52 ${d.telefono.replace(/\D/g, '').slice(-10)}` : PC,
    address: { '@type': 'PostalAddress', streetAddress: d.calle ?? PC, addressLocality: d.ciudad ?? PC, addressRegion: d.estado ?? PC, postalCode: d.cp ?? PC, addressCountry: 'MX' },
    openingHours: d.horario ?? PC, currenciesAccepted: 'MXN', areaServed: d.zona ?? PC,
  };
  return `<script type="application/ld+json">\n${JSON.stringify(ficha, null, 2)}\n</script>`;
}

export interface PruebaDelAsistente {
  readonly asistente: string;
  readonly pregunta: string;
  readonly respuesta: string;
  readonly apareceElNegocio: boolean;
}

/**
 * La prueba del asistente la hace el DUEÑO (pregunta a ChatGPT, Gemini, Copilot… y pega la
 * respuesta). Se anota textual, sin puntaje: varía entre corridas y se compara mes a mes.
 */
export function registraPrueba(nombreDelNegocio: string, asistente: string, pregunta: string, respuesta: string): PruebaDelAsistente {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return { asistente, pregunta, respuesta, apareceElNegocio: n(respuesta).includes(n(nombreDelNegocio)) };
}
