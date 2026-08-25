/**
 * Nucleo de la auditoria de la imprenta de CLIs — la logica PURA, importable y probada.
 *
 * Vive aparte de `audita-imprenta.mjs` por la misma razon que `contabilidad.ts` vive aparte
 * de su prueba: lo que se prueba tiene que ser **el modulo real** que corre en el gate, no
 * una copia en la suite que se desincroniza al primer cambio.
 *
 * Cada funcion de aqui existe porque en el proyecto de origen fallo, con fecha. Los
 * comentarios nombran el fallo: son la unica forma de que el proximo que "simplifique" esto
 * sepa lo que esta desarmando. Lo prueba `scripts/prueba-imprenta.mjs`, dentro de
 * `npm run validate`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Subdominios que NO identifican a la API. Sin esto `docs.hetzner.cloud` -> `docs`, que no
 * casa con nada impreso: en el origen, hetzner salio como "FALTA" en cada corrida desde el
 * 2026-07-04 estando impreso.
 */
const SUBDOMINIOS_GENERICOS = new Set(['docs', 'doc', 'api', 'developer', 'developers', 'dev']);
const TLDS = new Set(['www', 'com', 'sh', 'io', 'org', 'dev', 'net', 'cloud', 'ai', 'co']);

/** Nombre -> slug. Un nombre literal se minuscula; una URL se reduce al host significativo. */
export function normalizaSlug(nombre) {
  const s = String(nombre ?? '');
  if (!s.includes('://')) return s.toLowerCase();
  let host = s.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]; // el puerto no identifica
  const partes = host.split('.').filter((p) => !TLDS.has(p));
  const significativas = partes.filter((p) => !SUBDOMINIOS_GENERICOS.has(p));
  const elegidas = significativas.length > 0 ? significativas : partes;
  return (elegidas[0] ?? host).toLowerCase();
}

/**
 * El grado, solo el grado. La imprenta 4.31.1 dejo de escribir `"A"` en `overall_grade` y
 * empezo a escribir `"A (1 of 25 dimensions unverified: live_api_verification)"`. La
 * comparacion contra `min_grade` es de CADENAS, asi que `"A (1 of..." > "A"` daba verdadero
 * y el CLI recien impreso salia como `REVISA: grado < minimo A` — un falso hallazgo con
 * pinta de hallazgo, que es peor que ninguno. Detectado el 2026-08-25 al imprimir `polar`.
 *
 * Se conserva el texto completo en ningun sitio a proposito: lo que el sufijo dice
 * (dimensiones sin verificar) ya viaja, medido, en `sinPuntuar`.
 */
export function normalizaGrado(valor) {
  if (valor === null || valor === undefined) return null;
  // El lookahead, no `\b`: entre la `+` de `A+` y el fin de cadena NO hay frontera de
  // palabra (ambos son no-palabra), asi que `\b` retrocedia y devolvia `A` por `A+`.
  const m = String(valor).trim().match(/^([A-F][+-]?)(?![A-Za-z])/);
  return m ? m[1] : null;
}

/**
 * Entrada impresa que corresponde a un slug, o `null`. Tolera el sufijo descriptivo que la
 * imprenta agrega desde el display name (`telegram` -> directorio `telegram-bot`).
 */
export function casa(slug, impresos) {
  if (slug in impresos) return impresos[slug];
  for (const [nombre, info] of Object.entries(impresos)) {
    if (nombre.startsWith(slug + '-') || slug.startsWith(nombre + '-')) return info;
  }
  return null;
}

/**
 * Completa con el indice el grado que la libreria no puede medir. Lo medido AHORA manda; lo
 * no medible se hereda MARCADO como tal y **nunca se degrada a null en silencio**: en el
 * origen una regeneracion ingenua borro grados ya medidos (A/87 -> null, 2026-07-26).
 */
export function heredaGrados(deLibreria, delIndice) {
  for (const [slug, datos] of Object.entries(deLibreria)) {
    if (datos.grade !== null && datos.grade !== undefined) continue;
    // Se elige el candidato que TENGA grado, no el primero que exista: un objeto con
    // `grade: null` es truthy, asi que un `or` encadenado nunca alcanzaria el alias.
    const candidatos = [delIndice[slug], delIndice[slug.replace(/-bot$/, '')]];
    const anterior = candidatos.find((c) => c && c.grade) ?? null;
    if (!anterior) continue;
    datos.grade = anterior.grade;
    datos.score = anterior.score;
    datos.medicion = 'heredado_del_indice';
  }
  return deLibreria;
}

/**
 * Lee la libreria de binarios. `medicion` dice DE DONDE sale el grado — es la pieza que
 * impide leer "sin grado" como "aprobado": publicar no deja `scorecard.json`, asi que el
 * grado sale null a menudo y sin este campo la comparacion contra `min_grade` no se
 * evaluaria nunca, reportando "0 desactualizados" cuando la verdad es "no se".
 */
export function escaneaLibreria(dir) {
  const encontrados = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    let grade = null;
    let medicion = 'no_disponible';
    let verdict = null;
    let sinPuntuar = [];
    for (const nombre of ['scorecard.json', 'scorecard.md']) {
      const p = join(dir, e.name, nombre);
      if (!existsSync(p)) continue;
      const crudo = readFileSync(p, 'utf8');
      // El `.json` se PARSEA. La regex sobre los primeros 2000 caracteres se guardo para el
      // `.md` y como red: acerto con el JSON de la press por casualidad (el primer
      // `\b[A-F]\b` del archivo resulto ser `overall_grade`), y una casualidad no es un
      // lector. Un scorecard con un campo nuevo antes del grado la habria roto en silencio.
      if (nombre.endsWith('.json')) {
        try {
          const sc = JSON.parse(crudo).scorecard ?? JSON.parse(crudo);
          grade = normalizaGrado(sc.overall_grade ?? sc.grade ?? null);
          // Las dimensiones sin puntuar viajan. Un grado calculado sobre lo que SI se pudo
          // medir no es el mismo hecho que un grado completo, y sin este campo los dos se
          // leen igual: "A". Es la doctrina de `sin_grado` aplicada un nivel mas abajo.
          sinPuntuar = Array.isArray(sc.unscored_dimensions) ? sc.unscored_dimensions : [];
          medicion = 'scorecard';
          break;
        } catch { /* ilegible como JSON: cae a la regex, que es peor pero no miente mas */ }
      }
      const m = crudo.slice(0, 2000).match(/\b([A-F][+-]?)\b/);
      grade = m ? m[1] : null;
      medicion = 'scorecard';
      break;
    }
    const df = join(dir, e.name, 'dogfood-results.json');
    if (existsSync(df)) {
      try {
        verdict = JSON.parse(readFileSync(df, 'utf8')).verdict ?? null;
        if (medicion === 'no_disponible' && verdict) medicion = 'dogfood';
      } catch { /* ilegible: se queda no_disponible, que es la verdad */ }
    }
    // La version de la press con la que se IMPRIMIO. Es el analogo exacto del pineo de
    // `.mcp.json` (SDD imprenta §5): superficie que cambia sin diff. Sin leerla, un CLI
    // impreso hace tres versiones se lee igual que uno recien salido.
    let pressVersion = null;
    const pp = join(dir, e.name, '.printing-press.json');
    if (existsSync(pp)) {
      try {
        pressVersion = JSON.parse(readFileSync(pp, 'utf8')).printing_press_version ?? null;
      } catch { /* ilegible: null, que es "no se", no "esta al dia" */ }
    }
    encontrados[e.name.toLowerCase()] = { grade, medicion, verdict, sinPuntuar, pressVersion };
  }
  return encontrados;
}

/**
 * Lo que hay IMPRESO en disco y el manifiesto no declara. Existe porque el auditor salia
 * "conforme" con cero `cli-impreso` declarados mientras la libreria de la maquina tenia
 * cuatro: un verde sobre el conjunto vacio (2026-08-25). No es fallo del gate — la libreria
 * de otra instancia no es asunto de este repo — pero callarlo es como nacio el hueco.
 */
export function sinDeclarar(servicios, impresos) {
  const declarados = new Set();
  for (const s of servicios) {
    if (!s || typeof s !== 'object' || !s.servicio) continue;
    const slug = normalizaSlug(s.slug || s.servicio);
    for (const nombre of Object.keys(impresos)) {
      if (casa(slug, { [nombre]: impresos[nombre] })) declarados.add(nombre);
    }
  }
  return Object.keys(impresos).filter((n) => !declarados.has(n)).sort();
}

/**
 * La libreria real, si esta maquina imprime. Fuente de MAXIMA fidelidad: lee el disco.
 *
 * `CLI_PRESS_LIBRARY` es el nombre propio de este repo y manda por compatibilidad; la
 * imprenta upstream usa `PRESS_LIBRARY` y `PRESS_HOME` (verificado el 2026-08-25 contra las
 * skills instaladas). Conocer solo el nombre propio significaba no encontrar la libreria de
 * una maquina configurada segun upstream, y caer al `~/printing-press/library` por defecto
 * SIN decir que se ignoro lo que el usuario habia declarado.
 */
export function localizaLibreria(env = process.env) {
  const candidatos = [
    env.CLI_PRESS_LIBRARY,
    env.PRESS_LIBRARY,
    env.PRESS_HOME ? join(env.PRESS_HOME, 'library') : null,
    join(env.HOME ?? '', 'printing-press', 'library'),
  ];
  for (const c of candidatos) {
    if (!c) continue;
    try {
      if (readdirSync(c, { withFileTypes: true }).some((e) => e.isDirectory())) return c;
    } catch { /* no existe o no se puede leer: siguiente candidato */ }
  }
  return null;
}

/**
 * Clasifica los servicios del manifiesto en buckets. NO imprime ni sale del proceso: eso es
 * del script. Devolver datos en vez de escribir es lo que hace esto probable.
 */
export function clasifica(servicios, impresos, minGrade = 'A') {
  const faltantes = [];
  const desactualizados = [];
  const sinGrado = [];
  const sinAsignar = [];
  const malformados = [];
  const parciales = [];
  const divergentes = [];
  const dogfoodEnRojo = [];

  for (const s of servicios) {
    // Degradar, no morir: en el origen una entrada rara lanzo ValueError y el auditor
    // nocturno murio EN SILENCIO 13 dias (2026-07-26 -> 08-08). Una entrada malformada es
    // un dato malo, no el fin de la auditoria.
    if (!s || typeof s !== 'object' || !s.servicio) {
      malformados.push(JSON.stringify(s ?? null).slice(0, 60));
      continue;
    }
    if (s.deprecated) continue; // superseded: no se audita ni cuenta
    if (s.estado === 'sin-asignar') {
      sinAsignar.push(s.servicio);
      continue;
    }
    // Solo se audita lo IMPRESO. Un `mcp` no es un CLI, y un `cli-oficial` (npx playwright,
    // gog) existe upstream: exigirle aparecer en la libreria seria pedirle estar donde nunca
    // va a estar, y el gate quedaria rojo para siempre por una verdad mal modelada.
    if (s.estado !== 'cli-impreso') continue;

    const slug = normalizaSlug(s.slug || s.servicio);
    const pr = casa(slug, impresos);
    if (pr === null) {
      faltantes.push({ servicio: s.servicio, slug, fuente: s.fuente_de_verdad ?? 'sin declarar' });
      continue;
    }
    const grade = pr.grade ?? null;
    if (!grade) {
      sinGrado.push({ servicio: s.servicio, medicion: pr.medicion ?? 'no_disponible' });
    } else if (grade.replace(/[+-]/g, '') > String(minGrade).replace(/[+-]/g, '')) {
      desactualizados.push({ servicio: s.servicio, grade, minGrade });
    } else if (Array.isArray(pr.sinPuntuar) && pr.sinPuntuar.length > 0) {
      // Grado suficiente, pero calculado sin todas las dimensiones. No es fallo del gate
      // (auth y verificacion viva exigen credenciales, que aqui no hay) y por eso mismo es
      // lo que se cuela: un "A" parcial y un "A" completo se leen igual si nadie lo dice.
      parciales.push({ servicio: s.servicio, grade, sinPuntuar: pr.sinPuntuar });
    }

    // Lo declarado contra lo que hay en disco. Una divergencia SI es fallo: una afirmacion
    // falsa en el manifiesto es peor que un hueco, porque el hueco no se lee como un hecho.
    const declarada = s.press_version ?? null;
    if (declarada && pr.pressVersion && declarada !== pr.pressVersion) {
      divergentes.push({ servicio: s.servicio, declarada, enDisco: pr.pressVersion });
    }

    // Dogfood en rojo. `verdict` se leia desde el primer dia y no se usaba para nada: un CLI
    // MEDIDO Y FALLANDO pasaba como conforme, que es peor que uno sin medir — el sin medir
    // al menos se declara. Se exige reconocerlo en el manifiesto (`dogfood_conocido`): si el
    // contrato lo nombra es un defecto conocido (ambar) y si no, es un defecto ESCONDIDO
    // (fallo). Asi el rojo no es perpetuo, pero tampoco se apaga solo: apagarlo obliga a
    // escribir en el contrato que existe.
    if (pr.verdict === 'FAIL') {
      const reconocido = String(s.dogfood_conocido ?? '').toUpperCase() === 'FAIL';
      dogfoodEnRojo.push({ servicio: s.servicio, reconocido });
    }
  }
  return {
    faltantes, desactualizados, sinGrado, sinAsignar, malformados, parciales, divergentes,
    dogfoodEnRojo,
  };
}
