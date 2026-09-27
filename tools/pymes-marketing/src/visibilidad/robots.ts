/**
 * robots.txt: quién tiene paso. Los 7 rastreadores que nombra la fuente
 * (`seo-ai-visibility/reference/ai_visibility.md`) más los que el triaje marcó «a verificar».
 * Bloquear o desbloquear es DECISIÓN DEL DUEÑO: aquí se dice qué pasa hoy, no se cambia.
 * robots.txt es una petición, no un muro.
 */
export const RASTREADORES_IA: readonly { readonly agente: string; readonly de: string; readonly verificado: boolean }[] = [
  { agente: 'ClaudeBot', de: 'Anthropic', verificado: true },
  { agente: 'GPTBot', de: 'OpenAI', verificado: true },
  { agente: 'OAI-SearchBot', de: 'búsqueda de OpenAI', verificado: true },
  { agente: 'PerplexityBot', de: 'Perplexity', verificado: true },
  { agente: 'Google-Extended', de: 'productos de IA de Google (token de control, no lee la página)', verificado: true },
  { agente: 'Applebot-Extended', de: 'Apple (token de control)', verificado: true },
  { agente: 'Bingbot', de: 'búsqueda de Bing y Copilot', verificado: true },
  { agente: 'Claude-SearchBot', de: 'Anthropic (a verificar con su documentación)', verificado: false },
  { agente: 'ChatGPT-User', de: 'OpenAI (a verificar)', verificado: false },
  { agente: 'CCBot', de: 'Common Crawl (a verificar)', verificado: false },
];

interface Grupo { readonly agentes: readonly string[]; readonly disallow: readonly string[]; readonly allow: readonly string[] }

export function gruposDeRobots(texto: string): { grupos: Grupo[]; sitemaps: string[] } {
  const grupos: { agentes: string[]; disallow: string[]; allow: string[] }[] = [];
  const sitemaps: string[] = [];
  let actual: { agentes: string[]; disallow: string[]; allow: string[] } | null = null, enReglas = false;
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(linea);
    if (!m) continue;
    const [clave, valor] = [m[1]!.toLowerCase(), m[2]!.trim()];
    if (clave === 'sitemap') { sitemaps.push(valor); continue; }
    if (clave === 'user-agent') {
      if (!actual || enReglas) { actual = { agentes: [], disallow: [], allow: [] }; grupos.push(actual); enReglas = false; }
      actual.agentes.push(valor.toLowerCase());
    } else if (actual && (clave === 'disallow' || clave === 'allow')) {
      enReglas = true;
      if (valor) actual[clave].push(valor);
    }
  }
  return { grupos, sitemaps };
}

/** ¿Este agente tiene prohibida la raíz? Gana el grupo que lo nombra; si no hay, el de `*`. */
export function bloqueaRaiz(texto: string, agente: string): boolean {
  const { grupos } = gruposDeRobots(texto);
  const suyo = grupos.find((g) => g.agentes.includes(agente.toLowerCase())) ?? grupos.find((g) => g.agentes.includes('*'));
  return Boolean(suyo && suyo.disallow.includes('/') && !suyo.allow.includes('/'));
}
