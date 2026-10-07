/**
 * La firma de los registros de gobernanza: la comprobacion 6b de `verify:gobernanza`.
 *
 * Una firma es un NOMBRE: la linea «Aprobado por» o «Firmado por» empieza por el usuario que
 * decide. Antes se miraba al reves —una lista de huecos (`pendiente`, `[`, `☐`)— y siempre se
 * quedaba corta: `<firma>`, `— **sin firma**` y `**PENDIENTE**` pasaban como firmas. Medido el
 * 2026-10-06: diez entradas de la bitacora sin firmar pasaban el gate desde agosto.
 *
 * Una entrada sin firma solo se da por cerrada si una entrada POSTERIOR y firmada la nombra en
 * una linea `**Cierra** (<decision>): <titulo>`. El registro es append-only: lo viejo no se
 * edita en su sitio, se cierra despues y con dueno.
 */

/** Desde esta fecha, una entrada firmada no puede llevar «aprobacion humana ☐». */
export const FECHA_CASILLA = '2026-10-06';

const LINEA_FIRMA = /^[-*]\s+\*\*(?:Firmado|Aprobado) por\*\*(?:\s*\([^)]*\))?:\s*(.*)$/m;
const NOMBRE = /^\*{0,2}([a-z][\w.-]*)\*{0,2}(?=[\s(—,;.]|$)/i;
const NO_ES_NOMBRE = /^(pendiente|todo|tbd|sin|nadie|firma|xxx)$/i;
// La decision es la del laboratorio y va escrita: un «Cierra» sin ella no cierra nada.
const CIERRA = /^\s*[-*]\s+\*\*Cierra\*\*\s*\(\s*(?:no\s+)?ratificada\b[^)]*\):\s*(.+?)\s*$/gim;
// Un prefijo corto («2026-08-30») cerraria de golpe todas las entradas de ese dia.
const PREFIJO_MINIMO = 30;
// Solo cuenta la linea «Gate aplicado» (con sus continuaciones): citar la regla en prosa no es marcarla.
const LINEA_GATE = /^[-*]\s+\*\*Gate aplicado\*\*:([^\n]*(?:\n[ \t]+[^\n]*)*)/m;
const CASILLA_VACIA = /aprobaci[oó]n humana\s*☐/i;
const casillaVacia = (texto) => CASILLA_VACIA.test(texto.match(LINEA_GATE)?.[1] ?? '');

export function esFirma(valor) {
  const nombre = valor.trim().match(NOMBRE);
  return Boolean(nombre) && !NO_ES_NOMBRE.test(nombre[1]);
}

const cierres = (texto) =>
  [...texto.matchAll(CIERRA)].map((m) => m[1]).filter((p) => p.length >= PREFIJO_MINIMO);

/**
 * Revisa un registro (`BITACORA-CDC.md` o `REGISTRO-RIESGO.md`). Solo mira las entradas reales,
 * tras `## Entradas`: la plantilla del bloque `## Formato` nace vacia a proposito.
 * Devuelve `null` si el registro perdio esa seccion.
 */
export function revisaFirmas(contenido, { desde = FECHA_CASILLA } = {}) {
  const cuerpo = contenido.split(/^##\s+Entradas\s*$/m)[1];
  if (cuerpo === undefined) return null;
  const entradas = cuerpo.split(/^### /m).slice(1).map((texto) => {
    const firma = texto.match(LINEA_FIRMA);
    return { titulo: texto.split('\n')[0].trim(), texto, firmada: Boolean(firma) && esFirma(firma[1]) };
  });
  const cerradaDespues = (i) =>
    entradas.slice(i + 1).some((p) => p.firmada && cierres(p.texto).some((c) => entradas[i].titulo.startsWith(c)));
  return {
    sinFirma: entradas.filter((e, i) => !e.firmada && !cerradaDespues(i)).map((e) => e.titulo),
    casillaVacia: entradas
      .filter((e) => e.firmada && e.titulo.slice(0, 10) >= desde && casillaVacia(e.texto))
      .map((e) => e.titulo),
  };
}

// --- La prueba de la prueba ------------------------------------------------------------------
// Cada siembra es un registro minimo y lo que 6b tiene que ver en el. Las corre el verificador
// en cada pasada: un patron de firma que deja de cazar un hueco se pone rojo solo.

const TITULO = '2026-08-30 — una entrada de prueba con titulo largo — radio: menor';
const FIRMADA = '- **Aprobado por**: **lisagomez** (el laboratorio) — «sí», con el diff delante.';
const entrada = (titulo, firma, extra = '') => `### ${titulo}\n- **Cambio**: x\n${extra}${firma}\n`;
const registro = (...entradas) => `# R\n## Formato\n- **Aprobado por**:\n## Entradas\n\n${entradas.join('\n')}`;
const cierra = (decision, titulo = TITULO) => `- **Cierra** (${decision}): ${titulo}\n`;
const posterior = (extra, firma = FIRMADA) => entrada('2026-10-06 — el acta que cierra — radio: menor', firma, extra);

export const SIEMBRAS = [
  ['`<firma>` sin rellenar', registro(entrada(TITULO, '- **Aprobado por**: <firma>')), 1, 0],
  ['`— **sin firma**`', registro(entrada(TITULO, '- **Aprobado por**: — **sin firma**.')), 1, 0],
  ['`**PENDIENTE**`', registro(entrada(TITULO, '- **Aprobado por**: **PENDIENTE** — redactado.')), 1, 0],
  ['`_pendiente de firma_`', registro(entrada(TITULO, '- **Aprobado por**: _pendiente de firma_')), 1, 0],
  ['`☐` como firma', registro(entrada(TITULO, '- **Aprobado por**: ☐')), 1, 0],
  ['`[nombre]` como firma', registro(entrada(TITULO, '- **Aprobado por**: [nombre]')), 1, 0],
  ['sin linea de firma', registro(entrada(TITULO, '')), 1, 0],
  ['control: una firma real pasa', registro(entrada(TITULO, FIRMADA)), 0, 0],
  ['control: la cierra una posterior firmada', registro(entrada(TITULO, '- **Aprobado por**: — **sin firma**.'), posterior(cierra('ratificada'))), 0, 0],
  ['el cierre sin firmar no cierra', registro(entrada(TITULO, '- **Aprobado por**: — **sin firma**.'), posterior(cierra('ratificada'), '- **Aprobado por**: pendiente')), 2, 0],
  ['el cierre ANTERIOR no cierra', registro(posterior(cierra('ratificada')), entrada(TITULO, '- **Aprobado por**: — **sin firma**.')), 1, 0],
  ['un cierre sin decision no cierra', registro(entrada(TITULO, '- **Aprobado por**: — **sin firma**.'), posterior(cierra('decide: ratificada | no ratificada'))), 1, 0],
  ['un prefijo corto no cierra', registro(entrada(TITULO, '- **Aprobado por**: — **sin firma**.'), posterior(cierra('ratificada', '2026-08-30'))), 1, 0],
  ['firmada con ☐ desde la fecha', registro(posterior('- **Gate aplicado**: diff ☑ · aprobación humana ☐\n')), 0, 1],
  ['firmada con ☐ en la continuacion de la linea', registro(posterior('- **Gate aplicado**: diff ☑ ·\n  aprobación humana ☐ · pineo ☑\n')), 0, 1],
  ['control: citar la regla en prosa no cuenta', registro(posterior('- **Motivo**: ninguna lleva «aprobación humana ☐».\n- **Gate aplicado**: aprobación humana ☑\n')), 0, 0],
  ['control: firmada con ☐ antes de la fecha', registro(entrada(TITULO, FIRMADA, '- **Gate aplicado**: aprobación humana ☐\n')), 0, 0],
];

/** Corre las siembras; devuelve las que 6b no ve como debe. */
export function pruebaFirmas() {
  return SIEMBRAS.filter(([, contenido, sinFirma, casilla]) => {
    const r = revisaFirmas(contenido);
    return !r || r.sinFirma.length !== sinFirma || r.casillaVacia.length !== casilla;
  }).map(([nombre]) => nombre);
}
