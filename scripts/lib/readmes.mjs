/**
 * Contrato «product first» de los README de herramientas y apps — el núcleo puro del auditor.
 *
 * Recibe textos y devuelve faltas; no lee disco ni git (eso es `revisa-readmes.mjs`). Así el
 * mismo código audita el árbol de trabajo, una ref de git (`--desde`) y las siembras de
 * `--prueba`, sin ramas distintas que puedan divergir.
 *
 * El contrato lo declara `.claude/skills/readme/contrato.json`; aquí solo se aplica.
 */

export const RUTA_CONTRATO = '.claude/skills/readme/contrato.json';

/** Minúsculas, sin acentos ni marcas de markdown, espacios plegados, sin puntuación final. */
export function normaliza(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '');
}

/** Glob mínimo: `*` es un segmento (también los que empiezan por punto), `**` cualquier profundidad. */
export function coincideGlob(patron, ruta) {
  const fuente = patron.split('/').map((s) => {
    if (s === '**') return '.*';
    return s.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  }).join('/');
  return new RegExp(`^${fuente}$`).test(ruta);
}

/** Un archivo es un README si su nombre contiene README y es markdown. */
export const esReadme = (ruta) => /README[^/]*\.md$/i.test(ruta.split('/').pop() ?? '');

/** Título, preámbulo y secciones H2 de un markdown. Lo que va dentro de ``` no cuenta. */
export function estructura(texto) {
  const salida = { h1: [], preambulo: [], secciones: [], primeraNoVacia: null };
  let enCodigo = false;
  let actual = null;
  texto.split('\n').forEach((linea, i) => {
    if (salida.primeraNoVacia === null && linea.trim() !== '') salida.primeraNoVacia = i;
    const valla = /^\s*(```|~~~)/.test(linea);
    if (!enCodigo && !valla && /^# (?!#)/.test(linea)) {
      salida.h1.push({ texto: linea.slice(2).trim(), linea: i });
      return;
    }
    if (!enCodigo && !valla && /^## (?!#)/.test(linea)) {
      actual = { titulo: linea.slice(3).trim(), linea: i + 1, cuerpo: [] };
      salida.secciones.push(actual);
      return;
    }
    if (valla) enCodigo = !enCodigo;
    (actual ? actual.cuerpo : salida.preambulo).push(linea);
  });
  return salida;
}

/** Índice de cada sección de producto entre las H2 (-1 si falta). */
function indicesDeProducto(secciones, contrato) {
  return contrato.secciones.map((s) => {
    const admitidos = s.admitidos.map(normaliza);
    return secciones.findIndex((h) => admitidos.includes(normaliza(h.titulo)));
  });
}

const esDeProducto = (titulo, contrato) =>
  contrato.secciones.some((s) => s.admitidos.map(normaliza).includes(normaliza(titulo)));

/** Faltas de título y preámbulo: un solo H1 arriba y, antes de la primera sección, solo la propuesta de valor. */
function faltasDeCabecera(e, contrato) {
  const faltas = [];
  if (e.h1.length !== 1) faltas.push(`debe tener exactamente un título «# …» (tiene ${e.h1.length})`);
  else if (e.h1[0].linea !== e.primeraNoVacia) faltas.push('el título «# …» debe ser la primera línea');
  const llenas = e.preambulo.filter((l) => l.trim() !== '');
  const max = contrato.preambulo.maxLineas;
  if (llenas.length > max) {
    faltas.push(`antes de «${contrato.secciones[0].titulo}» solo va la propuesta de valor: ${llenas.length} líneas (máximo ${max}); lo técnico va después de las tres de producto`);
  }
  if (llenas.some((l) => /^\s*(```|~~~|\|)/.test(l) || /^#{3,} /.test(l))) {
    faltas.push('el preámbulo lleva código, tabla o subsección: va después de las tres de producto');
  }
  return faltas;
}

/** Faltas de presencia y orden de las tres secciones de producto frente a «lo demás». */
function faltasDeOrden(e, contrato) {
  const faltas = [];
  const idx = indicesDeProducto(e.secciones, contrato);
  contrato.secciones.forEach((s, i) => { if (idx[i] === -1) faltas.push(`falta «${s.titulo}»`); });
  const presentes = idx.filter((i) => i !== -1);
  const ultima = presentes.length ? Math.max(...presentes) : -1;
  const otra = e.secciones.findIndex((h) => !esDeProducto(h.titulo, contrato));
  if (otra !== -1 && otra < ultima) {
    faltas.push(`«${e.secciones[otra].titulo}» (lo demás) va antes que las tres de producto`);
  }
  for (let a = 0; a < idx.length; a += 1) {
    for (let b = a + 1; b < idx.length; b += 1) {
      if (idx[a] !== -1 && idx[b] !== -1 && idx[b] < idx[a]) {
        faltas.push(`«${contrato.secciones[b].titulo}» antes que «${contrato.secciones[a].titulo}»`);
      }
    }
  }
  return faltas;
}

/** El texto de la viñeta de un rubro: su línea y las que siguen hasta la próxima viñeta o un hueco. */
function bloqueDeRubro(cuerpo, etiqueta) {
  const buscada = normaliza(etiqueta);
  const inicio = cuerpo.findIndex((l) => {
    const m = l.match(/^\s*[-*]\s+\*\*([^*]+)\*\*/);
    return m !== null && normaliza(m[1]) === buscada;
  });
  if (inicio === -1) return null;
  const fin = cuerpo.findIndex((l, i) => i > inicio && (l.trim() === '' || /^\s*[-*]\s+\*\*/.test(l)));
  return cuerpo.slice(inicio, fin === -1 ? undefined : fin).join(' ');
}

const SIN_CODIGO = (l) => l.replace(/`[^`]*`/g, '');

/** Faltas de contenido de cada sección de producto. */
function faltasDeContenido(e, contrato) {
  const faltas = [];
  const [qh, cu, inf] = indicesDeProducto(e.secciones, contrato).map((i) => (i === -1 ? null : e.secciones[i]));
  if (qh && !/\bno hace\b/.test(normaliza(qh.cuerpo.join(' ')))) {
    faltas.push(`«${qh.titulo}» no dice qué NO hace`);
  }
  if (cu && !cu.cuerpo.some((l) => /^\s*([-*]|\d+\.)\s+\S/.test(l) || /^\|/.test(l) || /^### /.test(l))) {
    faltas.push('«Casos de uso» sin escenarios (lista, tabla o subsección; «pendiente» si nada lo sostiene)');
  }
  if (!inf) return faltas;
  for (const r of contrato.rubros) {
    const bloque = bloqueDeRubro(inf.cuerpo, r.etiqueta);
    if (bloque === null) faltas.push(`infraestructura sin «${r.etiqueta}» (viñeta con la etiqueta en negrita)`);
    else if (r.cifraONoMedido && !/\d/.test(SIN_CODIGO(bloque)) && !/no medid/.test(normaliza(bloque))) {
      faltas.push(`«${r.etiqueta}» sin cifra medida ni «no medido»`);
    }
  }
  const asignaciones = inf.cuerpo.flatMap((l) => [...l.matchAll(/\b([A-Z][A-Z0-9]*_[A-Z0-9_]*)=(?=\S)/g)].map((m) => m[1]));
  for (const nombre of new Set(asignaciones)) {
    faltas.push(`infraestructura con «${nombre}=…»: las variables de entorno van solo por nombre`);
  }
  return faltas;
}

/* ------------------------------------------------------------ valores sensibles */

/** Nombres de variable que guardan un secreto (en inglés y en español). */
const NOMBRE_SENSIBLE = /(KEY|TOKEN|SECRET|SECRETO|PASSWORD|PASSWD|PASS|PWD|CLAVE|LLAVE|CONTRASENA|CREDENTIAL|PRIVATE|PRIVADA|DSN)/;
/** Lo que no es un valor sino su hueco: vacío, `<…>`, `…`, `$VAR`, `${…}`, xxx, ***, «tu-…». */
const HUECO = /^(|…|\.{3}|<[^>]*>?|\$\{?[A-Za-z_][^}]*\}?|x{3,}|\*{3,}|(tu|your)[-_].*|ejemplo.*|example.*|changeme|placeholder)$/i;
/** Formas de credencial que no necesitan nombre (las mismas familias que `audita-secretos.mjs`). */
const FORMAS = [
  ['clave con prefijo sk-', /\bsk-[A-Za-z0-9_-]{24,}/],
  ['JWT con sus tres partes', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['token de GitHub', /\bgh[pos]_[A-Za-z0-9]{36}/],
  ['token de Slack', /\bxox[baprs]-[A-Za-z0-9-]{12,}/],
  ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['URL con contraseña', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@<>]+:(?!<)[^\s@<>]{3,}@/i],
];

/**
 * Valores de variables de entorno sensibles escritos en el texto. Devuelve línea, nombre y
 * LARGO del valor — nunca el valor: el informe no puede ser la segunda fuga.
 */
export function valoresSensibles(texto) {
  const hallazgos = [];
  texto.split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(/\b([A-Z][A-Z0-9_]{2,})=("[^"]*"|'[^']*'|[^\s`'"|)]*)/g)) {
      const valor = m[2].replace(/^["']|["']$/g, '');
      if (NOMBRE_SENSIBLE.test(m[1]) && !HUECO.test(valor)) {
        hallazgos.push({ linea: i + 1, que: `${m[1]} con valor escrito (largo ${valor.length})` });
      }
    }
    for (const [nombre, re] of FORMAS) if (re.test(linea)) hallazgos.push({ linea: i + 1, que: nombre });
  });
  return hallazgos;
}

/** Todas las faltas de un README contra el contrato. Vacío = conforme. */
export function revisaReadme(texto, contrato) {
  const e = estructura(texto);
  return [
    ...faltasDeCabecera(e, contrato),
    ...faltasDeOrden(e, contrato),
    ...faltasDeContenido(e, contrato),
    ...valoresSensibles(texto).map((h) => `línea ${h.linea}: ${h.que} — solo el nombre, jamás el valor`),
  ];
}

/** Esqueleto de secciones (H1, H2 y H3) para las evidencias de antes/después. */
export function esqueleto(texto) {
  let enCodigo = false;
  return texto.split('\n').filter((l) => {
    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo;
    return !enCodigo && /^#{1,3} /.test(l);
  });
}

/** Carpetas de producto (según `carpetasDeProducto`) presentes en la lista de archivos. */
function carpetasDe(archivos, patrones) {
  const carpetas = new Set();
  for (const p of patrones) {
    const k = p.split('/').length;
    for (const a of archivos) {
      const partes = a.split('/');
      if (partes.length > k && coincideGlob(p, partes.slice(0, k).join('/'))) carpetas.add(partes.slice(0, k).join('/'));
    }
  }
  return [...carpetas].sort();
}

/**
 * Audita el conjunto: cada README cae en alcance, en exclusión con motivo o en «sin clasificar»
 * (que es rojo: un README nuevo fuera de los dos no puede quedar sin mirar en silencio).
 */
export function audita({ archivos, leer, contrato }) {
  const evaluados = [];
  const excluidos = [];
  const sinClasificar = [];
  for (const ruta of archivos.filter(esReadme).sort()) {
    const exclusion = contrato.exclusiones.find((x) => coincideGlob(x.patron, ruta));
    if (exclusion) excluidos.push({ ruta, motivo: exclusion.motivo });
    else if (contrato.alcance.some((p) => coincideGlob(p, ruta))) evaluados.push({ ruta, faltas: revisaReadme(leer(ruta), contrato) });
    else sinClasificar.push(ruta);
  }
  const conReadme = new Set(archivos.filter((a) => /(^|\/)README\.md$/.test(a)).map((a) => a.split('/').slice(0, -1).join('/')));
  const sinReadme = carpetasDe(archivos, contrato.carpetasDeProducto).filter((c) => !conReadme.has(c));
  return { evaluados, excluidos, sinClasificar, sinReadme };
}
