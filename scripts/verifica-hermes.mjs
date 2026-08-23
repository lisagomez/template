#!/usr/bin/env node
/**
 * Vigilante del pineo de la imagen de Hermes — capa A del SDD.
 *
 * Diseno completo: docs/SDD-hermes-verificacion.md. Los tres principios que atraviesan
 * este archivo, por si alguien lo edita sin leer el SDD:
 *
 *   1. NUNCA cambia nada. Detecta deriva y prepara la decision. Actualizar el tag es un
 *      CDC completo (C1): diff, regresion, aprobacion y firma. Un job que actualizara
 *      solo seria el anti-patron que C1 existe para impedir, automatizado y por tanto peor.
 *   2. Sin LLM y sin credenciales. Compara, no razona; consulta un registro publico, no
 *      toca `.env`. Lo que no lee, no lo puede filtrar.
 *   3. Falla ruidosa. Sin red, con la API cambiada o con el repositorio caido devuelve
 *      exit 2 — "no pude verificar" —, que NO es exit 0. El modo de falla que esta capa ha
 *      sufrido tres veces es un control que parece funcionar y no mide nada.
 *
 * Exit 0 = sin novedades (silencio) · 1 = deriva o rojo (informe) · 2 = no pude verificar.
 *
 * Control negativo (obligatorio, §7 del SDD):
 *   node scripts/verifica-hermes.mjs --tag=v0000.0.0    -> rojo (exit 1)
 *   node scripts/verifica-hermes.mjs --api=https://127.0.0.1:9  -> exit 2, nunca 0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);

const RUNBOOK = 'docs/FASE0-INFRAESTRUCTURA.md';
const BASELINE = '.hermes-baseline.json';
const ESTADO = '.hermes-estado.json'; // runtime, no versionado
const INFORME = 'hermes-informe.md'; // runtime, no versionado
const DIAS_ANTIGUEDAD = 90; // §5: aviso de antiguedad del pineo
const DIAS_HEARTBEAT = 10; // §7: un vigilante mudo es indistinguible de uno muerto

const arg = (nombre, pordefecto) => {
  const p = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return p ? p.slice(nombre.length + 3) : pordefecto;
};
const API = arg('api', 'https://hub.docker.com/v2');

/** Todo lo que no se pueda afirmar sale por aqui: exit 2, nunca verde. */
class NoVerificable extends Error {}

async function pide(url) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new NoVerificable(`sin respuesta de ${url}: ${e.message}`);
  }
  if (r.status === 404) return { status: 404, cuerpo: null };
  if (!r.ok) throw new NoVerificable(`HTTP ${r.status} en ${url}`);
  try {
    return { status: 200, cuerpo: await r.json() };
  } catch {
    throw new NoVerificable(`respuesta no-JSON en ${url}: la API pudo cambiar`);
  }
}

/** Texto plano de una pagina HTML. Solo para leer documentacion publica: nunca se
 *  ejecuta nada de la respuesta, solo se buscan cadenas dentro (§9 del SDD). */
async function texto(url) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  } catch (e) {
    throw new NoVerificable(`sin respuesta de ${url}: ${e.message}`);
  }
  if (!r.ok) throw new NoVerificable(`HTTP ${r.status} en ${url}`);
  const html = await r.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&quot;|&amp;|&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
}

// --- Entradas: el tag se lee del compose del runbook, NO se lleva escrito -----
// Un control anclado en una copia del dato se desincroniza del dato. Si el compose
// cambia, este script sigue al compose (§7 del SDD).
function imagenDelRunbook() {
  const texto = existsSync(ruta(RUNBOOK)) ? readFileSync(ruta(RUNBOOK), 'utf8') : null;
  if (texto === null) throw new NoVerificable(`no existe ${RUNBOOK}: no hay de donde leer el pineo`);
  const m = texto.match(/^\s*image:\s*([a-z0-9._\-/]+):([A-Za-z0-9._-]+)/m);
  if (!m) throw new NoVerificable(`no encuentro la linea "image:" en ${RUNBOOK}`);
  return { imagen: m[1], tag: m[2] };
}

const leeJson = (p) => (existsSync(ruta(p)) ? JSON.parse(readFileSync(ruta(p), 'utf8')) : null);
const dias = (desde, hasta = Date.now()) => Math.floor((hasta - new Date(desde).getTime()) / 86400000);

// ==========================================================================
// Capa B — las afirmaciones del runbook contra la imagen y la documentacion
// ==========================================================================
// No es semanal: se corre en cada CDC que proponga mover el pineo (§3 del SDD). Aqui NO
// se comprueba "que la imagen sea buena", sino **que lo que el runbook afirma sea cierto**:
// las afirmaciones se leen del propio runbook, asi que si alguien lo cambia, esto le sigue.
// Un B en rojo no es un aviso: es un cambio incompatible, y su sitio es el CDC — no el dia
// que alguien provisione un servidor.
//
// Evidencia, por orden de dureza:
//   1. El blob de configuracion de la imagen (entorno, entrypoint, puertos). Registro, sin
//      descargar las capas: no hacen falta 1,2 GB ni un demonio de Docker.
//   2. La documentacion oficial de la release, para lo que el config no puede probar
//      (subcomandos, nombres de variables del dashboard).
// Lo que no se pueda afirmar con una de las dos sale por NoVerificable: exit 2, nunca verde.

function afirmacionesDelRunbook() {
  const texto = readFileSync(ruta(RUNBOOK), 'utf8');
  const subcomandos = [
    ...[...texto.matchAll(/^\s*command:\s*(.+?)\s*$/gm)].map((m) => m[1]),
    // tambien los que el runbook invoca directamente sobre la imagen (`... :tag setup`)
    // `[^\S\n]` y no `\s`: con `\s` la captura salta de linea y se traga la siguiente
    // palabra del bloque de codigo, inventando un subcomando que nadie escribio.
    ...[...texto.matchAll(/hermes-agent:[^\s]+[^\S\n]+([a-z][a-z0-9-]*(?:[^\S\n]+[a-z][a-z0-9-]*)?)/g)].map((m) => m[1]),
  ];
  const puerto = (texto.match(/^\s*-\s*"127\.0\.0\.1:(\d+):\d+"/m) ?? [])[1];
  const hermesHome = (texto.match(/HERMES_HOME`?\s*\(`?([^`)\s]+)/) ?? [])[1];
  const variables = [...texto.matchAll(/^([A-Z][A-Z0-9_]{2,})=/gm)]
    .map((m) => m[1])
    .filter((v) => /DASH|AUTH/.test(v));
  return { subcomandos: [...new Set(subcomandos)], puerto, hermesHome, variables: [...new Set(variables)] };
}

async function configDeLaImagen(imagen, tag) {
  const reg = 'https://registry-1.docker.io/v2';
  const auth = await pide(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${imagen}:pull`);
  const token = auth.cuerpo?.token;
  if (!token) throw new NoVerificable('el registro no dio token anonimo: no puedo leer la imagen');
  const cabeceras = {
    Authorization: `Bearer ${token}`,
    Accept: [
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
    ].join(', '),
  };
  const trae = async (ref) => {
    let r;
    try {
      r = await fetch(`${reg}/${imagen}/manifests/${ref}`, { headers: cabeceras, signal: AbortSignal.timeout(25000) });
    } catch (e) {
      throw new NoVerificable(`sin respuesta del registro: ${e.message}`);
    }
    if (!r.ok) throw new NoVerificable(`HTTP ${r.status} pidiendo el manifiesto ${ref}`);
    return r.json();
  };
  let manifiesto = await trae(tag);
  if (Array.isArray(manifiesto.manifests)) {
    const amd64 = manifiesto.manifests.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
    if (!amd64) throw new NoVerificable('el indice no trae una imagen linux/amd64');
    manifiesto = await trae(amd64.digest);
  }
  const digestConfig = manifiesto.config?.digest;
  if (!digestConfig) throw new NoVerificable('el manifiesto no declara blob de configuracion');
  let r;
  try {
    r = await fetch(`${reg}/${imagen}/blobs/${digestConfig}`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'follow', signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    throw new NoVerificable(`sin respuesta al pedir la configuracion: ${e.message}`);
  }
  if (!r.ok) throw new NoVerificable(`HTTP ${r.status} pidiendo el blob de configuracion`);
  return (await r.json()).config ?? {};
}

async function capaB() {
  const compose = imagenDelRunbook();
  const imagen = arg('imagen', compose.imagen);
  const tag = arg('tag', compose.tag);
  const dice = afirmacionesDelRunbook();
  const DOC = arg('doc', 'https://hermes-agent.nousresearch.com/docs/user-guide/docker');

  const cfg = await configDeLaImagen(imagen, tag);
  const entorno = Object.fromEntries((cfg.Env ?? []).map((e) => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
  const doc = await texto(DOC);
  const enDoc = (s) => doc.toLowerCase().includes(s.toLowerCase());

  const filas = [];
  const rojo = (id, dice_, halla, nota) => filas.push({ id, ok: false, dice: dice_, halla, nota });
  const verde = (id, dice_, halla, nota) => filas.push({ id, ok: true, dice: dice_, halla, nota });

  // B1 · los subcomandos que el runbook usa existen COMO subcomandos
  // Buscar la palabra suelta en la documentacion es un falso verde: "dashboard" aparece en
  // prosa cien veces sin ser un subcomando. La evidencia valida es la CLI invocada: la
  // imagen seguida del subcomando, o `hermes <sub> --<flag>`.
  for (const sub of dice.subcomandos) {
    const invocado = enDoc(`hermes-agent ${sub}`) || enDoc(`hermes ${sub} --`) || enDoc(`$ hermes ${sub}`);
    if (invocado) verde('B1', `subcomando \`${sub}\``, 'la documentacion lo muestra invocado en la CLI');
    else {
      const env = `HERMES_${sub.toUpperCase().replace(/\W+/g, '_')}`;
      const alternativa = enDoc(`${env}=1`) ? `la doc lo enciende con \`${env}=1\`, no como subcomando` : null;
      rojo('B1', `subcomando \`${sub}\``,
        'la documentacion NO lo muestra invocado en la CLI (aparecer en prosa no cuenta)',
        alternativa ?? `revisar como se arranca "${sub}" en esta version`);
    }
  }

  // B2 · HERMES_HOME — la evidencia mas dura: el entorno de la propia imagen
  if (!dice.hermesHome) rojo('B2', 'HERMES_HOME (sin afirmacion legible en el runbook)', '—');
  else if (entorno.HERMES_HOME === dice.hermesHome) verde('B2', `HERMES_HOME = ${dice.hermesHome}`, `imagen: ${entorno.HERMES_HOME}`);
  else rojo('B2', `HERMES_HOME = ${dice.hermesHome}`, `imagen: ${entorno.HERMES_HOME ?? 'no declarado'}`);

  // B3 · los nombres de las variables del dashboard
  for (const v of dice.variables) {
    if (enDoc(v)) verde('B3', v, 'documentada');
    else rojo('B3', v, 'NO existe en la documentacion oficial',
      'la imagen ignora una variable que no conoce: el runbook cree configurar algo que no configura');
  }

  // B4 · el puerto del dashboard
  if (!dice.puerto) rojo('B4', 'puerto del dashboard (no legible en el compose del runbook)', '—');
  else if (enDoc(dice.puerto)) verde('B4', `puerto ${dice.puerto}`, 'documentado para el dashboard');
  else rojo('B4', `puerto ${dice.puerto}`, 'no aparece en la documentacion oficial');

  const rojos = filas.filter((f) => !f.ok);
  console.log(`# Capa B — ${imagen}:${tag} — ${new Date().toISOString().slice(0, 10)}\n`);
  console.log('Evidencia: blob de configuracion de la imagen (registro) + documentacion oficial.');
  console.log(`Documentacion: ${DOC}\n`);
  for (const f of filas) {
    console.log(`${f.ok ? '✓' : '✗'} ${f.id} · el runbook dice: ${f.dice}\n    ${f.halla}${f.nota ? `\n    → ${f.nota}` : ''}`);
  }
  console.log(`\nEntrypoint de la imagen: ${JSON.stringify(cfg.Entrypoint)}`);
  console.log(`Puertos declarados (EXPOSE): ${JSON.stringify(cfg.ExposedPorts ?? null)} — EXPOSE es metadato: su ausencia no prueba que no escuche.`);
  if (rojos.length === 0) {
    console.log('\nCapa B en verde: lo que el runbook afirma se sostiene contra la imagen y la doc.');
    return 0;
  }
  console.log(`\n${rojos.length} afirmacion(es) del runbook NO se sostienen. Cada una es un cambio ` +
    'incompatible: se corrige el runbook en un CDC, no el dia que alguien provisione.');
  return 1;
}

async function main() {
  if (process.argv.includes('--capa-b')) return capaB();
  const compose = imagenDelRunbook();
  const imagen = arg('imagen', compose.imagen);
  const tag = arg('tag', compose.tag);
  // Los overrides existen SOLO para el control negativo. Una corrida asi no puede tocar la
  // marca de exito ni la lista de releases avisadas: dejaria al vigilante creyendo que ya
  // aviso de cosas que nunca miro, y la siguiente corrida real se callaria.
  const esControlNegativo = imagen !== compose.imagen || tag !== compose.tag;
  const baseline = leeJson(BASELINE);
  if (!baseline) throw new NoVerificable(`falta ${BASELINE}: sin ancla no hay nada contra que comparar`);

  const estado = leeJson(ESTADO) ?? {};
  const hoy = new Date().toISOString().slice(0, 10);
  const rojos = [];
  const avisos = [];
  let incidente = null;

  // --- A1. El repositorio responde ------------------------------------------
  const repo = await pide(`${API}/repositories/${imagen}/`);
  if (repo.status === 404) {
    // Se corta aqui a proposito: "el repositorio no existe" es una DETERMINACION (rojo),
    // no un fallo al determinar (exit 2). Seguir preguntando por tags de un repositorio
    // inexistente solo produciria 404 en cadena y acabaria degradando el rojo a un
    // "no pude verificar" — que es exactamente el fallo que este script existe para no tener.
    rojos.push(`A1 · el repositorio \`${imagen}\` no existe en el registro. O lo retiraron, o ` +
      'el nombre del compose esta mal escrito (typosquatting, O5).');
    const informeA1 = [
      `# Vigilancia del pineo de Hermes — ${hoy}`,
      '',
      `Imagen: \`${imagen}:${tag}\` (leida de ${RUNBOOK})`,
      '',
      '## Rojo',
      '',
      ...rojos.map((r) => `- ${r}`),
      '',
      '> Este informe **propone**; no aplica nada.',
      '',
    ].join('\n');
    writeFileSync(ruta(INFORME), informeA1);
    console.log(informeA1);
    return 1;
  }

  // --- A2/A3. El tag pineado sigue publicado, y con el mismo digest ----------
  const t = await pide(`${API}/repositories/${imagen}/tags/${tag}`);
  if (t.status === 404) {
    rojos.push(`A2 · el tag pineado \`${tag}\` ya no esta publicado. Un servidor nuevo fallaria ` +
      'en el `docker compose up`. El digest anterior sigue siendo descargable: fijar por digest.');
  } else {
    const digest = t.cuerpo?.digest;
    if (typeof digest !== 'string') throw new NoVerificable('la respuesta del tag no trae digest: la API cambio');
    if (baseline.digest && digest !== baseline.digest) {
      incidente =
        `A3 · **el digest del tag pineado cambio**. Alguien re-publico sobre un nombre que este ` +
        `proyecto trata como fijo.\n` +
        `  esperado: ${baseline.digest}\n  actual:   ${digest}\n` +
        '  Esto NO es deriva: es cadena de suministro (O5). Procedimiento de incidente ' +
        '(`.claude/gobernanza/plantillas/incidente.md`) y entrada en INCIDENTES.md.\n' +
        '  NO se actualiza para "arreglarlo": se contiene fijando el compose al digest anterior.';
      rojos.push(incidente);
    }
  }

  // --- A4. Cuantas releases hay mas nuevas (informa, no falla) ---------------
  const listado = await pide(`${API}/repositories/${imagen}/tags?page_size=100&ordering=last_updated`);
  if (listado.status === 404 || !Array.isArray(listado.cuerpo?.results)) {
    throw new NoVerificable('no pude listar los tags: la API cambio o el repositorio desaparecio');
  }
  const MOVIL = /^(latest|main|edge|nightly)$/;
  const versiones = listado.cuerpo.results.filter((x) => !MOVIL.test(x.name) && x.tag_last_pushed);
  const pineado = versiones.find((x) => x.name === tag);
  const masNuevas = pineado
    ? versiones.filter((x) => new Date(x.tag_last_pushed) > new Date(pineado.tag_last_pushed))
    : [];
  const nombresNuevos = masNuevas.map((x) => x.name);

  // --- A5. `latest`/`main` siguen siendo moviles (control positivo) ----------
  const moviles = listado.cuerpo.results.filter((x) => MOVIL.test(x.name));
  const movilesQueSeMueven = moviles.filter((x) => x.digest && x.digest !== baseline.digest);
  const a5 = moviles.length === 0
    ? 'A5 · no hay tags moviles publicados ahora mismo.'
    : `A5 · ${movilesQueSeMueven.length}/${moviles.length} tags moviles apuntan a algo distinto del ` +
      'pineo: el anti-patron de `latest` sigue siendo real.';

  // --- §5. Se reporta el CAMBIO, no el estado -------------------------------
  // Un informe semanal que repite "13 releases por detras" deja de leerse a la tercera.
  // Eso es O3, y es el modo de falla mas probable de este mecanismo.
  const yaAvisadas = new Set(estado.releasesAvisadas ?? []);
  const sinAvisar = nombresNuevos.filter((n) => !yaAvisadas.has(n));
  if (sinAvisar.length > 0) {
    avisos.push(`Hay ${sinAvisar.length} release(s) nueva(s) sin avisar (${nombresNuevos.length} por ` +
      `delante del pineo en total): ${sinAvisar.join(', ')}.\n` +
      `  Notas: https://hub.docker.com/r/${imagen}/tags\n` +
      '  Estar al dia no es un objetivo: el rezago es deuda cuando nadie decide, no cuando el ' +
      'numero crece. Adoptar una release es un CDC (C1) y pide capa B antes de firmar.');
  }

  const edad = pineado ? dias(pineado.tag_last_pushed) : null;
  const avisadaAntiguedad = estado.antiguedadAvisadaPara === tag;
  if (edad !== null && edad >= DIAS_ANTIGUEDAD && !avisadaAntiguedad) {
    avisos.push(`El pineo \`${tag}\` cumple ${edad} dias. Aviso de antiguedad (una sola vez por tag).`);
  }

  // --- §7. Heartbeat: un vigilante mudo parece uno muerto --------------------
  if (estado.ultimoExito && dias(estado.ultimoExito) > DIAS_HEARTBEAT) {
    avisos.push(`El vigilante llevaba ${dias(estado.ultimoExito)} dias sin correr (marca de exito del ` +
      `${estado.ultimoExito}). El silencio solo significa "todo igual" si el job corre.`);
  }

  // --- Salida ---------------------------------------------------------------
  const hayNovedad = rojos.length > 0 || avisos.length > 0;
  const nuevoEstado = {
    ultimoExito: hoy,
    tagVigilado: tag,
    releasesAvisadas: nombresNuevos,
    antiguedadAvisadaPara: edad !== null && edad >= DIAS_ANTIGUEDAD ? tag : estado.antiguedadAvisadaPara ?? null,
    ultimoInforme: hayNovedad ? hoy : estado.ultimoInforme ?? null,
  };
  if (!esControlNegativo) writeFileSync(ruta(ESTADO), `${JSON.stringify(nuevoEstado, null, 2)}\n`);
  else console.log('(control negativo: no se toca la marca de exito ni las releases avisadas)');

  if (!hayNovedad) {
    console.log(`✓ sin novedades: \`${imagen}:${tag}\` intacto, ${nombresNuevos.length} release(s) por ` +
      'delante ya avisadas. El silencio es la senal.');
    console.log(`  ${a5}`);
    return 0;
  }

  const informe = [
    `# Vigilancia del pineo de Hermes — ${hoy}`,
    '',
    `Imagen: \`${imagen}:${tag}\` (leida de ${RUNBOOK})`,
    `Ancla: \`${baseline.digest ?? 'sin digest en el baseline'}\` (verificado ${baseline.verificado ?? '?'})`,
    '',
    ...(rojos.length ? ['## Rojo', '', ...rojos.map((r) => `- ${r}`), ''] : []),
    ...(avisos.length ? ['## Avisos', '', ...avisos.map((a) => `- ${a}`), ''] : []),
    `## Control positivo`,
    '',
    `- ${a5}`,
    '',
    '> Este informe **propone**; no aplica nada. Mover el pineo es un CDC (C1) con capa B,',
    '> aprobacion humana y entrada firmada en `.claude/gobernanza/BITACORA-CDC.md`.',
    '',
  ].join('\n');
  writeFileSync(ruta(INFORME), informe);
  console.log(informe);
  console.log(`(informe escrito en ${INFORME})`);
  return 1;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    if (e instanceof NoVerificable) {
      console.error(`✗ NO PUDE VERIFICAR: ${e.message}`);
      console.error('  Exit 2 a proposito: ausencia de respuesta NO es ausencia de deriva.');
      process.exit(2);
    }
    console.error(`✗ fallo inesperado del vigilante: ${e?.stack ?? e}`);
    process.exit(2);
  });
