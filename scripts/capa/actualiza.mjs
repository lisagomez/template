#!/usr/bin/env node
/**
 * La capa sigue a Arbrain: trae cada versión FIRMADA, enseña qué cambió EN LO ADOPTADO (no todo el CHANGELOG), lo
 * clasifica por nivel (global, producto, herramienta) y por pieza, propone el realineamiento con el diff delante y
 * SE DETIENE EN EL CDC. Es el script de la skill `actualizar-capa` (propuesta en
 * `docs/goals/capa-arbrain-propuestas/skill-actualiza-capa/`); el precedente es `update-sf`.
 *
 * Lo que no hace nunca: mover el lock, aplicar un cambio, escribir en el template o en `~/.claude`, editar el ancla,
 * leer de `dani/main` o de `latest`. Las dos instancias personales de Arbrain se actualizan con el procedimiento
 * OFICIAL del autor, no con esto.
 *
 * Si la firma FALLA (sin firma, llave ajena, ancla cambiada, etiqueta movida o renombrada, regreso de versión) sale
 * con 1 y no escribe NADA: las etiquetas nuevas se verifican en una cuarentena y el espejo solo recibe las que
 * verifican; `--salida` no se crea. La corrida lo comprueba: foto de `git status` y refs del espejo y del template
 * antes y después.
 *
 * Uso: node scripts/capa/actualiza.mjs [--salida <carpeta>] [--etiqueta vX.Y.Z] [--sin-red] [--json]
 *        [--fuente <espejo>] [--lock <archivo>] [--mapa <archivo>] [--remoto <url|ruta>] [--proyecto <dir>] [--global <dir>]
 * Exit: 0 al día · 1 FALLA (BLOQUEADO: no se sigue por otro camino) · 2 uso o entorno · 3 parado en el CDC.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUENTE_OFICIAL, URL_FUENTE, expande, versionGit } from './firma.mjs';
import { compruebaLock, LOCK } from './pinea.mjs';
import { archivosQueCitan, cambiosAdoptados, citas, clasifica, hostsNuevos, origenesPerdidos, piezasAdoptadas, simbolosPerdidos, versionesCitadas, NIVELES } from './lib/adoptado.mjs';
import { archivos, cambios, diff, foto, git, muestra } from './lib/git.mjs';
import { huellaDirectorio } from './lib/huella.mjs';
import { enUnaLinea, escribeInforme } from './lib/informe.mjs';
import { comparaGlobal, SKILLS_GLOBALES } from './lib/skills.mjs';
import { comparaEtiquetas, comparaVersion, cuarentena, eligeDestino, etiquetasLocales, etiquetasRemotas, posterioresAlLock, promueve, verificaEstricta } from './lib/trae.mjs';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CODIGO = { AL_DIA: 0, FALLA: 1, ENTORNO: 2, CDC: 3 };
const corto = (sha) => (sha ?? '').slice(0, 7);
const sinGit = (url) => (url ?? '').trim().replace(/\.git$/, '');
const leeJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

const sale = (codigo, estado, lineas, extra = {}) => ({ codigo, estado, lineas: [...lineas, `ESTADO=${estado}`], ...extra });

/** Lo que la corrida necesita, resuelto una vez. Todo se puede inyectar (las pruebas lo hacen). */
function contexto(o) {
  const raiz = o.raiz ?? RAIZ;
  const lock = o.lock ?? leeJson(o.rutaLock ?? join(raiz, LOCK));
  const mapa = o.mapa ?? leeJson(o.rutaMapa ?? join(raiz, 'tools/capa/mapa.json'));
  return {
    raiz, lock, mapa,
    espejo: expande(o.fuente ?? lock.espejo ?? FUENTE_OFICIAL),
    remoto: o.remoto ?? URL_FUENTE,
    oficial: !o.remoto,
    sinRed: Boolean(o.sinRed),
    pedida: o.etiqueta ?? null,
    salida: o.salida ? resolve(o.salida) : null,
    proyecto: o.proyecto ?? join(raiz, '.claude/skills'),
    global: o.global ?? SKILLS_GLOBALES,
    hoy: (o.ahora ?? new Date()).toISOString().slice(0, 10),
  };
}

/** Lo que tiene que haber antes de mirar nada (código 2 si falta) y lo que no se negocia (código 1). */
function compruebaEntorno(c) {
  const m = versionGit().match(/^(\d+)\.(\d+)/);
  if (!m || Number(m[1]) * 100 + Number(m[2]) < 234) return sale(CODIGO.ENTORNO, 'ENTORNO', ['git anterior a 2.34 no verifica firmas SSH']);
  if (spawnSync('ssh-keygen', ['-?'], { encoding: 'utf8' }).error) return sale(CODIGO.ENTORNO, 'ENTORNO', ['no encuentro ssh-keygen: sin él no se verifica ninguna firma']);
  if (!existsSync(join(c.espejo, '.git'))) return sale(CODIGO.ENTORNO, 'ENTORNO', [`no hay espejo en ${c.espejo}: git clone -q --origin dani ${URL_FUENTE} ${c.espejo}`]);
  const dentro = c.salida && !relative(resolve(c.espejo), c.salida).startsWith('..') && !isAbsolute(relative(resolve(c.espejo), c.salida));
  if (dentro) return sale(CODIGO.ENTORNO, 'ENTORNO', [`la carpeta del informe (${c.salida}) cae dentro del espejo: el espejo solo se lee`]);
  return null;
}

/** El remoto «dani» del espejo es el oficial: si apunta a otro lado, alguien quiere que bajes código de otro lado. */
function compruebaRemoto(c) {
  const dani = git(c.espejo, ['remote', 'get-url', 'dani']).stdout.trim();
  if (sinGit(dani) === sinGit(URL_FUENTE)) return null;
  return sale(CODIGO.FALLA, 'FALLA', [`FIRMA_FALLA: el remoto «dani» del espejo apunta a «${dani || '(nada)'}», no a ${URL_FUENTE}. Así es como alguien haría bajar código de otro lado: DETENTE.`]);
}

/** Trae (o no, con --sin-red) y deja dónde se verifica. Las nuevas quedan en cuarentena hasta verificar. */
function trae(c, guarda) {
  const locales = etiquetasLocales(c.espejo);
  if (c.sinRed) return { repo: c.espejo, disponibles: [...locales.keys()], nuevas: [] };
  const remotas = etiquetasRemotas(c.remoto);
  if (!remotas.ok) return { error: sale(CODIGO.ENTORNO, 'ENTORNO', [`no pude leer las etiquetas de ${c.remoto}: ${remotas.motivo}`, 'Sin red, corre con --sin-red (solo lo que ya tiene el espejo).']) };
  const { movidas, nuevas } = comparaEtiquetas(locales, remotas.etiquetas);
  if (movidas.length) return { error: sale(CODIGO.FALLA, 'FALLA', [`FIRMA_FALLA: el remoto movió etiqueta(s) que el espejo ya tenía: ${movidas.join(', ')}. Una etiqueta firmada no se mueve; nadie la reescribe aquí.`]) };
  if (!nuevas.length) return { repo: c.espejo, disponibles: [...locales.keys()], nuevas };
  const q = cuarentena({ espejo: c.espejo, remoto: c.remoto, nuevas });
  if (!q.ok) return { error: sale(CODIGO.ENTORNO, 'ENTORNO', [q.motivo]) };
  guarda(q);
  return { repo: q.repo, disponibles: [...locales.keys(), ...nuevas], nuevas, cuarentena: q.repo };
}

/** Verifica TODAS las etiquetas posteriores al lock: una nueva sin firma válida bloquea aunque no sea la elegida. */
function verificaTramo(c, t) {
  const destino = eligeDestino({ pedida: c.pedida, disponibles: t.disponibles });
  if (!destino.ok) return { error: sale(CODIGO.ENTORNO, 'ENTORNO', [destino.motivo]) };
  if (comparaVersion(destino.etiqueta, c.lock.etiqueta) < 0) return { error: sale(CODIGO.FALLA, 'FALLA', [`FIRMA_FALLA ${destino.etiqueta}: es anterior al lock (${c.lock.etiqueta}); no se regresa de versión`]) };
  const verificadas = [];
  const fallas = [];
  for (const etiqueta of posterioresAlLock(t.disponibles, c.lock.etiqueta)) {
    const v = verificaEstricta({ repo: t.repo, etiqueta, ancla: c.lock.ancla.ruta, principales: c.lock.ancla.principales, base: c.lock.commit });
    (v.ok ? verificadas : fallas).push(v);
  }
  if (fallas.length) {
    const lineas = fallas.flatMap((f) => [`FIRMA_FALLA ${f.etiqueta}: ${f.motivo}`, ...(f.salida ? f.salida.split('\n').map((l) => `    ${l}`) : [])]);
    return { error: sale(CODIGO.FALLA, 'FALLA', lineas) };
  }
  return { destino: destino.etiqueta, verificadas };
}

/** Lo que cambió en lo adoptado entre el lock y la destino, por nivel y por pieza, con dónde se adoptó. */
function adoptado(c, hasta) {
  const piezas = piezasAdoptadas(c.mapa);
  const lista = cambiosAdoptados(c.espejo, c.lock.commit, hasta.commit, piezas);
  const clas = clasifica(lista, piezas);
  const rutasAutor = [...new Set([...archivos(c.espejo, c.lock.commit), ...archivos(c.espejo, hasta.commit)].map((a) => a.ruta))];
  const citado = citas(c.raiz, c.mapa, rutasAutor);
  const cambiadas = new Set(lista.map((x) => x.ruta));
  const perdidos = [];
  for (const n of NIVELES) {
    clas.porNivel[n] = clas.porNivel[n].map(({ pieza, cambios: suyos }) => {
      const adoptadoEn = [...new Set(suyos.flatMap((x) => [...(citado.get(x.ruta) ?? []), ...(citado.get(x.antes) ?? [])]))].sort();
      const destinoExiste = Boolean(pieza.destino && !pieza.destino.startsWith('~') && existsSync(join(c.raiz, pieza.destino)));
      perdidos.push(...simbolosPerdidos(c.espejo, hasta.commit, pieza, cambiadas));
      return { id: pieza.id, decision: pieza.decision, categoria: pieza.categoria, ranura: pieza.ranura ?? null, origen: pieza.origen, destino: pieza.destino ?? null, destinoExiste, cambios: suyos, adoptadoEn };
    });
  }
  const archivosAdoptados = new Set(archivos(c.espejo, hasta.commit).map((a) => a.ruta).filter((r) => piezas.some((p) => (p.origen ?? []).some((o) => r === o || r.startsWith(`${o}/`))))).size;
  return { ...clas, archivosAdoptados, archivosCambiados: lista.length, simbolos: perdidos, origenes: origenesPerdidos(c.espejo, hasta.commit, piezas), lista };
}

/** Alertas que piden ojo humano antes del CDC (ninguna decide sola). */
function alertas(c, hasta, a, g) {
  const lista = [];
  const pon = (tipo, texto) => lista.push({ tipo, texto });
  if (!c.oficial) pon('remoto de simulacro', `las etiquetas se trajeron de \`${c.remoto}\`, no de ${URL_FUENTE}`);
  if (cambios(c.espejo, c.lock.commit, hasta.commit, ['.github/firmas-permitidas']).length) pon('rotación de llaves', 'la versión nueva trae otro `.github/firmas-permitidas`. El ancla NO se toca aquí (allá su actualizador la reescribe): cambiarla es una decisión del laboratorio, con su CDC.');
  const capas = (rev) => {
    try { return JSON.parse(muestra(c.espejo, rev, 'CAPAS.json') ?? '{}') ?? {}; } catch { return {}; }
  };
  const [ca, cb] = [capas(c.lock.commit), capas(hasta.commit)];
  for (const k of ['alumno', 'skills_del_autor']) if (JSON.stringify(ca[k]) !== JSON.stringify(cb[k])) pon('contrato de capas', `\`CAPAS.json › ${k}\` cambia: revisa la lista permitida del job del cerebro y el mapa`);
  for (const s of g.homonimas) pon('skill homónima', `el autor estrena \`${s}\` y aquí ya hay una con ese nombre: no se mezclan; la nuestra se conserva`);
  for (const s of g.quitadas) pon('skill quitada', `el autor quitó \`${s}\` de sus skills`);
  for (const s of g.skills) for (const r of s.ejecutable) pon('código ejecutable', `\`${r}\` (skill \`${s.nombre}\`) cambia: se revisa como código antes de traerlo`);
  for (const x of a.simbolos) pon('símbolo desaparecido', `\`${x.simbolo}\` ya no está en \`${x.archivo}\` (pieza \`${x.pieza}\`): el mapa hay que regenerarlo`);
  for (const x of a.origenes) pon('origen desaparecido', `\`${x.origen}\` no existe en ${hasta.etiqueta} (pieza \`${x.pieza}\`): el mapa hay que regenerarlo`);
  for (const x of hostsNuevos(c.espejo, c.lock.commit, hasta.commit, a.lista)) pon('salida nueva (C4)', `\`${x.host}\` aparece en \`${x.archivo}\`: si se adopta, algo sale de la máquina y lleva su C4`);
  return lista;
}

/** Títulos del CHANGELOG de las versiones del tramo: una línea cada una, nada más (es dato, no órdenes). */
function titulos(c, hasta) {
  const texto = muestra(c.espejo, hasta.commit, 'CHANGELOG.md') ?? '';
  return texto.split('\n').filter((l) => {
    const v = l.match(/^## (v\d+\.\d+\.\d+)\b/)?.[1];
    return v && comparaVersion(v, c.lock.etiqueta) > 0 && comparaVersion(v, hasta.etiqueta) <= 0;
  }).map((l) => l.replace(/^## /, '').slice(0, 160));
}

/** El lock que escribiría el CDC. El ancla va tal cual: `compruebaLock` acaba de probar que no cambió. */
function lockPropuesto(c, hasta) {
  return { ...c.lock, _propuesta: `NO aplicado. Lo escribe el CDC firmado: el espejo en ${hasta.etiqueta} y \`node scripts/capa/pinea.mjs --etiqueta ${hasta.etiqueta} --escribe\`.`, etiqueta: hasta.etiqueta, commit: hasta.commit, objetoEtiqueta: hasta.objeto, firma: { formato: 'ssh', principal: hasta.principal, llave: hasta.llave }, ancla: c.lock.ancla, verificado: c.hoy, git: versionGit() };
}

const productos = (raiz) => {
  const dir = join(raiz, 'productos/composiciones');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `productos/composiciones/${f}`) : [];
};

/** Los diffs que van al lado del informe: uno por pieza tocada y los del nivel global. */
function diffs(c, hasta, r) {
  const salida = [];
  for (const n of NIVELES) for (const x of r.adoptado.porNivel[n]) salida.push([`diff/${n}/${x.id}.diff`, diff(c.espejo, c.lock.commit, hasta.commit, x.origen)]);
  for (const s of r.global.skills) {
    if (s.tramo) salida.push([`global/${s.nombre}/tramo-${c.lock.etiqueta}-a-${hasta.etiqueta}.diff`, s.tramo]);
    for (const [lado, copia] of Object.entries(s.copias)) {
      if (!copia) continue;
      salida.push([`global/${s.nombre}/${lado}-contra-${hasta.etiqueta}.diff`, copia.diff || '(idéntica)\n']);
      for (const p of copia.propuesta) if (p.texto !== undefined) salida.push([`global/${s.nombre}/propuesta-${lado}/${p.rel}`, p.texto]);
    }
  }
  return salida;
}

/** Arma el resultado de una versión nueva verificada: todo lo que el CDC necesita ver. */
function analiza(c, hasta, t) {
  const a = adoptado(c, hasta);
  const enAdoptado = new Set(a.lista.map((x) => x.ruta));
  const fuera = cambios(c.espejo, c.lock.commit, hasta.commit).filter((x) => !enAdoptado.has(x.ruta)).length;
  const g = comparaGlobal({ repo: c.espejo, desde: c.lock.etiqueta, hasta: hasta.etiqueta, revDesde: c.lock.commit, revHasta: hasta.commit, proyecto: c.proyecto, global: c.global });
  const adoptadoSinLista = { ...a };
  delete adoptadoSinLista.lista;
  const procedencia = Object.fromEntries([...versionesCitadas(c.raiz, c.mapa)].map(([v, s]) => [v, [...s].sort()]));
  return {
    estado: 'PARADO_EN_CDC', generado: c.hoy,
    desde: { etiqueta: c.lock.etiqueta, commit: c.lock.commit },
    hasta: { etiqueta: hasta.etiqueta, commit: hasta.commit, objeto: hasta.objeto, principal: hasta.principal, llave: hasta.llave },
    ancla: { ruta: c.lock.ancla.ruta, sha256: c.lock.ancla.sha256 },
    remoto: { url: c.remoto, oficial: c.oficial, usado: !c.sinRed, traidas: t.promovidas, fuera: t.nuevas.filter((e) => !t.promovidas.includes(e)) },
    verificadas: t.verificadas.map((v) => ({ etiqueta: v.etiqueta, commit: v.commit, principal: v.principal })),
    changelog: titulos(c, hasta), adoptado: adoptadoSinLista, fuera, global: g,
    alertas: alertas(c, hasta, a, g), procedencia, productos: productos(c.raiz),
    citan: archivosQueCitan(c.raiz, c.mapa).length, lockPropuesto: lockPropuesto(c, hasta),
  };
}

function lineasCdc(c, r, escritos) {
  const v = r.hasta;
  const skills = r.global.skills.filter((s) => s.cambiosTramo.length).map((s) => s.nombre);
  return [
    `FIRMA_OK ${v.etiqueta} ${corto(v.commit)} (${v.principal}, ${v.llave}) · ancla intacta · continúa ${r.desde.etiqueta} ${corto(r.desde.commit)}`,
    ...(r.remoto.traidas.length ? [`TRAÍDA ${r.remoto.traidas.join(', ')} de ${r.remoto.url}${r.remoto.oficial ? '' : ' (simulacro)'} → cuarentena → verificada → espejo`] : []),
    ...(r.remoto.fuera.length ? [`  sin verificar y fuera del espejo (anteriores al lock: no se leen): ${r.remoto.fuera.join(', ')}`] : []),
    enUnaLinea(r),
    `  ${NIVELES.map((n) => `${n}: ${r.adoptado.porNivel[n].map((x) => x.id).join(', ') || '—'}`).join('\n  ')}`,
    `  skills del autor con copia aquí que cambiaron: ${skills.join(', ') || 'ninguna'} · alertas: ${r.alertas.length}${r.alertas.length ? ` (${[...new Set(r.alertas.map((a) => a.tipo))].join(', ')})` : ''}`,
    c.salida ? `PARADO EN EL CDC: nada se aplicó. Informe: ${join(c.salida, 'informe.md')} (${escritos.length} archivos, diffs al lado) · propuesta de CDC: ${join(c.salida, 'cdc-propuesta.md')}` : 'PARADO EN EL CDC: nada se aplicó. Corre con --salida <carpeta> para el informe con los diffs.',
    `DESDE=${r.desde.etiqueta}`, `ETIQUETA=${v.etiqueta}`, `COMMIT=${v.commit}`,
  ];
}

/** La foto de antes: `git status` y refs del espejo y del template, y el contenido entero del `.git` del espejo. */
const fotoAntes = (c) => ({
  espejo: foto(c.espejo),
  espejoGit: huellaDirectorio(join(c.espejo, '.git')),
  ...(existsSync(join(c.raiz, '.git')) ? { template: foto(c.raiz) } : {}),
});

/** Compara las fotos de antes y después: la prueba de que una FALLA no escribió nada. */
function sinEscribir(antes, c) {
  const lineas = [];
  for (const [nombre, repo] of [['espejo', c.espejo], ['template', c.raiz]]) {
    if (!antes[nombre]) continue;
    const despues = foto(repo);
    const igual = despues.huella === antes[nombre].huella;
    lineas.push(igual ? `  ${nombre}: git status y refs IGUALES antes y después (huella ${despues.huella.slice(0, 12)}…)` : `  ${nombre}: CAMBIÓ durante la corrida (antes ${antes[nombre].huella.slice(0, 12)}…, después ${despues.huella.slice(0, 12)}…): esta corrida no escribe ahí; mira quién más escribe en ese árbol`);
  }
  const git = huellaDirectorio(join(c.espejo, '.git'));
  lineas.push(git.sha256 === antes.espejoGit.sha256
    ? `  .git del espejo: los ${git.archivos} archivos IGUALES por contenido (huella ${git.sha256.slice(0, 12)}…): en esta corrida no entró ni un objeto ni una ref`
    : `  .git del espejo: CAMBIÓ (antes ${antes.espejoGit.sha256.slice(0, 12)}…, después ${git.sha256.slice(0, 12)}…)`);
  return ['No se escribió nada: ni el template, ni el espejo, ni la carpeta de salida.', ...lineas];
}

/** La corrida entera. Devuelve { codigo, estado, lineas, informe?, escritos? }; no llama a process.exit. */
export function actualiza(o = {}) {
  let c;
  try {
    c = contexto(o);
  } catch (e) {
    return sale(CODIGO.ENTORNO, 'ENTORNO', [`no pude leer el lock o el mapa: ${e.message}`]);
  }
  const malo = compruebaEntorno(c);
  if (malo) return malo;
  const antes = fotoAntes(c);
  const bloqueo = (r) => ({ ...r, lineas: [...r.lineas.slice(0, -1), 'BLOQUEADO: no se sigue por otro camino (ni dani/main, ni otra etiqueta, ni tocar el ancla). Lo destraba el autor con una etiqueta firmada o el laboratorio.', ...sinEscribir(antes, c), r.lineas.at(-1)] });
  const remoto = compruebaRemoto(c);
  if (remoto) return bloqueo(remoto);
  const lock = compruebaLock(c.lock, { fuente: c.espejo });
  if (!lock.ok) return bloqueo(sale(CODIGO.FALLA, 'FALLA', [`FIRMA_FALLA ${c.lock.etiqueta} (el lock vigente)`, ...lock.fallos.map((f) => `  · ${f}`)]));
  let q = null;
  try {
    const t = trae(c, (x) => { q = x; });
    if (t.error) return t.error.codigo === CODIGO.FALLA ? bloqueo(t.error) : t.error;
    const v = verificaTramo(c, t);
    if (v.error) return v.error.codigo === CODIGO.FALLA ? bloqueo(v.error) : v.error;
    if (v.destino === c.lock.etiqueta) return sale(CODIGO.AL_DIA, 'AL_DIA', [`AL DÍA: ${c.lock.etiqueta} (${corto(c.lock.commit)}) es la versión firmada más nueva; nada que revisar.`]);
    const verificadas = v.verificadas.map((x) => x.etiqueta);
    const promovidas = t.nuevas.filter((e) => verificadas.includes(e));
    const p = q ? promueve({ espejo: c.espejo, cuarentena: q.repo, etiquetas: promovidas }) : { ok: true };
    if (!p.ok) return sale(CODIGO.ENTORNO, 'ENTORNO', [`verificada, pero no pude pasarla al espejo: ${p.motivo}`]);
    const hasta = v.verificadas.find((x) => x.etiqueta === v.destino);
    const r = analiza(c, hasta, { ...t, verificadas: v.verificadas, promovidas });
    const escritos = c.salida ? escribeInforme(c.salida, r, diffs(c, hasta, r)) : [];
    return sale(CODIGO.CDC, 'PARADO_EN_CDC', lineasCdc(c, r, escritos), { informe: r, escritos });
  } finally {
    q?.limpia();
  }
}

// --- CLI -----------------------------------------------------------------------------------------------------------

const CON_VALOR = { '--salida': 'salida', '--etiqueta': 'etiqueta', '--fuente': 'fuente', '--lock': 'rutaLock', '--mapa': 'rutaMapa', '--remoto': 'remoto', '--proyecto': 'proyecto', '--global': 'global' };
const BANDERAS = { '--sin-red': 'sinRed', '--json': 'json' };

export function leeArgumentos(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a in BANDERAS) o[BANDERAS[a]] = true;
    else if (a in CON_VALOR && argv[i + 1] && !argv[i + 1].startsWith('--')) o[CON_VALOR[a]] = argv[++i];
    else return { error: `argumento desconocido o sin valor: ${a}` };
  }
  return { o };
}

function cli() {
  const { o, error } = leeArgumentos(process.argv.slice(2));
  if (error) {
    console.error(`${error}\nUso: node scripts/capa/actualiza.mjs [--salida <carpeta>] [--etiqueta vX.Y.Z] [--sin-red] [--json] [--fuente <espejo>] [--lock <archivo>] [--mapa <archivo>] [--remoto <url|ruta>] [--proyecto <dir>] [--global <dir>]`);
    process.exit(CODIGO.ENTORNO);
  }
  let r;
  try {
    r = actualiza(o);
  } catch (e) {
    console.error(`actualiza: error inesperado, no se aplicó nada: ${e.message}`);
    process.exit(CODIGO.ENTORNO);
  }
  if (o.json) console.log(JSON.stringify({ codigo: r.codigo, estado: r.estado, lineas: r.lineas, escritos: r.escritos ?? [] }, null, 2));
  else console.log(r.lineas.join('\n'));
  process.exit(r.codigo);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) cli();
