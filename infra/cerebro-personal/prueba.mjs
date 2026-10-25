#!/usr/bin/env node
/**
 * Prueba de las instancias del Arbrain personal (fase 2 «instancias» del goal capa Arbrain). Repetible.
 *
 *   node infra/cerebro-personal/prueba.mjs              construye, levanta, demuestra (a)-(f) y limpia
 *   node infra/cerebro-personal/prueba.mjs --conserva   deja los contenedores arriba al final (para mirar a mano)
 *
 * Demuestra, con salida legible:
 *   (a) un cambio de memoria hecho en local aparece en vps y uno hecho en vps aparece en local (y el calendario y
 *       los hábitos se unen por registro; lo que no viaja, no viaja; now.md se regenera en cada lado);
 *   (b) un choque provocado detiene el job con las dos versiones intactas (hashes antes y después, en los dos lados
 *       y en el centro);
 *   (c) con Arbrain en versiones distintas (una instancia en v0.2.9, también verificada) el job no sincroniza y no
 *       cambia nada; y el centro rechaza por su cuenta lo que no cumple la política;
 *   (d) la carpeta de datos de la app queda intacta (hash antes y después);
 *   (e) en las instancias solo se escucha en 127.0.0.1, docker ps no publica puertos y la red no tiene salida;
 *   (f) la configuración de cloudflared, validada sin conexión, y su sabotaje en rojo;
 *   (g) el código del job no contiene ninguna orden prohibida.
 * Al final baja contenedores y redes y borra el contexto temporal; las imágenes se quedan (caché).
 *
 * Necesita: Docker con compose, el espejo de Arbrain (~/.cache/capa-arbrain/fuente) y el ancla del lock. La primera
 * vez baja paquetes de Debian, la imagen pineada de cloudflared y el programa compilado de la etiqueta (350 MB,
 * aceptado solo con la huella de la etiqueta firmada). Exit: 0 todo bien · 1 algo falló · 2 no pudo empezar.
 */
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { estadoArbol, expande, verificaEtiqueta } from '../../scripts/capa/firma.mjs';
import { leeLock } from '../../scripts/capa/pinea.mjs';
import { AQUI, ENTORNO, bash, bloque, comprueba, corto, dc, dormir, en, json, linea, nodeEn, resumen, rojo, sh, titulo, verde } from './prueba-util.mjs';
import { pruebaVersiones, pruebaChoque, pruebaRed, pruebaPuerta, pruebaCodigo, pruebaResumen } from './prueba-casos.mjs';

const RAIZ = resolve(AQUI, '../..');
const DATOS = '/home/arbrain/.local/share/ai.arbrain.servidor';
const ETIQUETA_ANTIGUA = 'v0.2.9';
const CONSERVA = process.argv.includes('--conserva');

function fallaInicio(m) { console.error(rojo(`✗ ${m}`)); process.exit(2); }

/** 0 · El lock vigente, las pruebas unitarias y el contexto de construcción (fuera del repo). */
function prepara() {
  titulo('0 · Preparación: lock verificado y contexto de construcción fuera del repo');
  const p = sh('node', [join(RAIZ, 'scripts/capa/pinea.mjs'), '--comprueba'], { cwd: RAIZ });
  bloque(p.salida);
  if (!comprueba('0', p.status === 0, 'el lock de la fase 1 sigue vigente (firma, commit y ancla)')) fallaInicio('sin lock vigente no se sigue');
  const lock = leeLock(RAIZ);
  const espejo = expande(lock.espejo);
  const antigua = verificaEtiqueta({ repo: espejo, etiqueta: ETIQUETA_ANTIGUA, ancla: lock.ancla.ruta });
  comprueba('0', antigua.ok, `${antigua.ok ? 'FIRMA_OK' : 'FIRMA_FALLA'} ${ETIQUETA_ANTIGUA} ${antigua.commit?.slice(0, 7) ?? ''} (solo para la prueba de versiones distintas)`);
  const t = sh('node', ['--test', ...['fusiona-registros.test.mjs', 'resumenes.test.mjs'].map((f) => join(AQUI, 'job', f))]);
  const pasan = /# pass (\d+)/.exec(t.stdout)?.[1], fallan = /# fail (\d+)/.exec(t.stdout)?.[1];
  comprueba('0', t.status === 0, `pruebas del driver de merge, de la lista permitida y del resumen: ${pasan} pasan, ${fallan} fallan`);
  const mensaje = sh('git', ['-C', espejo, 'tag', '-l', '--format=%(contents)', lock.etiqueta]).stdout;
  const prog = /^programa linux-x64 ([0-9a-f]{64}) (\d+)$/m.exec(mensaje);
  if (!prog) fallaInicio(`la etiqueta ${lock.etiqueta} no trae programa linux-x64`);
  linea(`  · programa ya compilado de ${lock.etiqueta} según la etiqueta firmada: sha256:${prog[1].slice(0, 16)}… (${prog[2]} bytes)`);
  const tmp = mkdtempSync(join(tmpdir(), 'cerebro-personal-'));
  const ctx = join(tmp, 'contexto');
  cpSync(join(AQUI, 'Dockerfile'), join(ctx, 'Dockerfile'));
  cpSync(join(AQUI, 'job'), join(ctx, 'job'), { recursive: true, filter: (f) => !f.endsWith('.test.mjs') });
  cpSync(join(AQUI, 'imagen'), join(ctx, 'imagen'), { recursive: true });
  // El resumen (fase «resumen»): el VPS valida con la MISMA capa empaquetada que usan los productos (sin red: su dist y
  // el zod pineado del árbol), y lee de cada producto permitido lo que su composición declara.
  cpSync(join(RAIZ, 'tools/capa/package.json'), join(ctx, 'capa-paquete', 'package.json'));
  cpSync(join(RAIZ, 'tools/capa/dist'), join(ctx, 'capa-paquete', 'dist'), { recursive: true });
  cpSync(join(RAIZ, 'node_modules/zod'), join(ctx, 'zod'), { recursive: true });
  for (const slug of JSON.parse(readFileSync(join(AQUI, 'job', 'resumenes-permitidos.json'), 'utf8')).productos) {
    cpSync(join(RAIZ, 'productos/composiciones', `${slug}.json`), join(ctx, 'job', 'composiciones', `${slug}.json`));
  }
  const foto = () => `${estadoArbol(espejo)}\n${sh('git', ['-C', espejo, 'for-each-ref', '--format=%(objectname) %(refname)']).stdout}\n${sh('find', [join(espejo, '.git'), '-maxdepth', '1', '-type', 'f', '-printf', '%f %s %T@\n']).stdout}`;
  const antes = foto();
  mkdirSync(join(ctx, 'arbrain'), { recursive: true });
  for (const e of [lock.etiqueta, ETIQUETA_ANTIGUA]) {
    const b = sh('git', ['-C', espejo, 'bundle', 'create', '-q', join(ctx, 'arbrain', `arbrain-${e}.bundle`), `refs/tags/${e}`]);
    if (b.status !== 0) fallaInicio(`no pude sacar el bundle de ${e}: ${b.stderr.trim()}`);
  }
  comprueba('0', foto() === antes, 'bundles de las dos etiquetas sacados del espejo sin escribir en él (refs, estado y .git iguales)');
  cpSync(expande(lock.ancla.ruta), join(ctx, 'arbrain', 'firmas-permitidas'));
  const token = join(tmp, 'red_token');
  writeFileSync(token, randomBytes(32).toString('base64'), { mode: 0o600 });
  if (process.getuid?.() !== 1000) chmodSync(token, 0o644); // el usuario de los contenedores es el uid 1000; la carpeta es 0700
  Object.assign(ENTORNO, { ARBRAIN_ETIQUETA: lock.etiqueta, ARBRAIN_ETIQUETA_ANTIGUA: ETIQUETA_ANTIGUA, CEREBRO_RED_TOKEN_ARCHIVO: token });
  return { lock, antigua, prog: { sha256: prog[1], bytes: prog[2] }, tmp, ctx };
}

/** 1 · Imágenes (builder clásico). Con caché, las verificaciones de la construcción no se repiten: se vuelven a hacer vivas en 2. */
function construye({ lock, antigua, prog, ctx }) {
  titulo('1 · Construcción de las imágenes (las capas quedan en caché)');
  const conPrograma = { ETIQUETA: lock.etiqueta, COMMIT: lock.commit, ANCLA_SHA256: lock.ancla.sha256.replace(/^sha256:/, ''), PROGRAMA_SHA256: prog.sha256, PROGRAMA_BYTES: prog.bytes };
  const imagenes = [
    ['red', 'cerebro-personal-red:capa-1', {}],
    // La etapa que baja el programa (350 MB) lleva nombre: así un `docker image prune` no la tira y no se vuelve a bajar.
    ['programa', `cerebro-personal-programa:${lock.etiqueta}`, conPrograma],
    ['instancia', `cerebro-personal-instancia:${lock.etiqueta}`, conPrograma],
    ['fuente', `cerebro-personal-fuente:${ETIQUETA_ANTIGUA}`, { ETIQUETA: ETIQUETA_ANTIGUA, COMMIT: antigua.commit, ANCLA_SHA256: lock.ancla.sha256.replace(/^sha256:/, '') }],
  ];
  for (const [target, tag, args] of imagenes) {
    const r = sh('docker', ['build', '--target', target, ...Object.entries(args).flatMap(([k, v]) => ['--build-arg', `${k}=${v}`]), '-t', tag, ctx]);
    const clave = r.salida.split('\n').filter((l) => /^(FIRMA_OK|FIRMA_FALLA|PROGRAMA_OK|PROGRAMA_FALLA|descarga verificada)/.test(l));
    const cache = (r.salida.match(/Using cache/g) ?? []).length;
    const ok = comprueba('0', r.status === 0, `imagen ${tag} lista${clave.length ? ' (construida ahora):' : ` (${cache} pasos en caché)`}`);
    if (clave.length) bloque(clave.join('\n'));
    if (!ok) {
      bloque(r.salida.split('\n').filter((l) => !/^Step |^ ---> |DEPRECATED|buildx|^\s+Install|^The command/.test(l)).slice(-12).join('\n'));
      throw new Error('sin imágenes no se sigue');
    }
  }
  const tam = sh('docker', ['images', '--format', '{{.Repository}}:{{.Tag}} {{.Size}}']).stdout.split('\n').filter((l) => l.startsWith('cerebro-personal-'));
  linea(`  · tamaño: ${tam.join(' · ')}`);
}

/** 2 · Arranque: relevo, vps y local; Arbrain verificado dentro de cada una y su servidor en 127.0.0.1. */
async function arranca(lock) {
  titulo('2 · Arranque: red interna, relevo, vps y local');
  dc(['--profile', 'versiones', 'down', '--volumes', '--remove-orphans']);
  const up = dc(['up', '-d', 'red', 'vps', 'local']);
  if (!comprueba('0', up.status === 0, 'docker compose up (red, vps, local)')) { bloque(up.salida); throw new Error('no levantó'); }
  for (const lado of ['vps', 'local']) {
    const v = bash(lado, 'cd ~/Arbrain && echo "VERSION $(cat VERSION) HEAD-etiqueta $(git rev-parse v$(cat VERSION)^{commit})" && git -c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c gpg.ssh.allowedSignersFile=$HOME/.config/arbrain/firmas-permitidas verify-tag v$(cat VERSION) 2>&1 | head -1');
    bloque(v.salida);
    comprueba('0', v.stdout.includes(lock.commit) && /Good "git" signature for arbrain-/.test(v.salida), `${lado}: Arbrain ${lock.etiqueta} (${lock.commit.slice(0, 7)}) con su firma verificada dentro del contenedor`);
  }
  const servidor = {};
  for (let i = 0; i < 80 && Object.keys(servidor).length < 2; i++) {
    for (const lado of ['vps', 'local']) {
      if (servidor[lado]) continue;
      const r = nodeEn(lado, '-e', "fetch('http://127.0.0.1:4310/api/version').then(async(r)=>{console.log(r.status, (await r.text()).slice(0,120));process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))");
      if (r.status === 0) servidor[lado] = r.stdout.trim();
    }
    if (Object.keys(servidor).length < 2) await dormir(3000);
  }
  for (const lado of ['vps', 'local']) {
    const estado = bash(lado, 'cd ~/Arbrain/arbrain && node scripts/servidor.mjs estado 2>&1 | head -2');
    bloque(estado.salida);
    if (!comprueba('app', Boolean(servidor[lado]), `${lado}: el servidor real de Arbrain responde en 127.0.0.1:4310 (/api/version → ${servidor[lado] ?? 'sin respuesta'})`)) {
      bloque(bash(lado, 'tail -n 20 ~/.arbrain/arranque.log; tail -n 20 ~/.local/share/ai.arbrain.servidor/logs/*.log').salida);
    }
  }
}

const huellaDatos = (lado) => json(nodeEn(lado, '/opt/cerebro-sync/imagen/huella.mjs', 'carpeta', DATOS, '--excluye', 'logs,programa'));
const huellas = (lado, rutas) => json(nodeEn(lado, '/opt/cerebro-sync/imagen/huella.mjs', 'archivos', '/home/arbrain/Arbrain', ...rutas)) ?? {};
const escena = (lado, ...args) => nodeEn(lado, '/opt/cerebro-sync/imagen/escena.mjs', ...args);
export const job = (lado, args = [], mostrar = true) => {
  const r = en(lado, ['node', '/opt/cerebro-sync/sincroniza.mjs', ...args]);
  if (mostrar) bloque(`$ (${lado}) node sincroniza.mjs ${args.join(' ')}\n${r.salida}\n→ exit ${r.status}`);
  return r;
};
export const mainDe = (lado) => bash(lado, 'git --git-dir=$HOME/.cerebro-sync/cerebro.git rev-parse -q --verify main 2>/dev/null || echo "(sin repo)"').stdout.trim();
export const mainCentro = () => bash('vps', 'git --git-dir=/srv/cerebro/centro.git for-each-ref --format="%(objectname) %(refname)"').stdout.trim();
export const blobCentro = (ruta) => bash('vps', `git --git-dir=/srv/cerebro/centro.git show main:${ruta} 2>/dev/null | sha256sum | cut -c1-12`).stdout.trim();

/** (a) Ida y vuelta. */
function idaYVuelta() {
  titulo('(a) Un cambio de memoria de ida y vuelta (y el plan unido por registro)');
  linea('  Centro y primera pasada de cada lado:');
  job('vps', ['crea-centro']);
  comprueba('a', job('vps').status === 0, 'vps funda el cerebro del centro');
  comprueba('a', job('local').status === 0, 'local se une (las dos semillas de la misma versión coinciden)');
  const IDA = '.claude/memory/project/prueba-ida-desde-local.md', VUELTA = '.claude/memory/feedback/prueba-vuelta-desde-vps.md';
  const SKILL = '.claude/skills/rutina-sintetica/SKILL.md', CAL = '.claude/plan/calendario.json', HAB = '.claude/plan/habitos.json';
  const NO_VIAJAN = ['.claude/daily/prueba-sintetica.md', '.claude/settings.local.json', '.claude/memory/notas-sinteticas.env'];
  linea('\n  En local: una nota de memoria, un evento, una skill propia y tres cosas que NO viajan. En vps: otra nota, otro evento y una marca de hábito.');
  escena('local', 'escribe', IDA, '# Prueba sintética\nNota escrita en LOCAL (dato sintético de la prueba, sin nada real).');
  escena('local', 'evento-agrega', 'ev-local-1', 'Bloque sintético creado en local', 'hoy+1');
  escena('local', 'escribe', SKILL, '---\nname: rutina-sintetica\ndescription: skill propia sintética de la prueba\n---\nSolo existe para demostrar que una skill propia viaja.');
  for (const r of NO_VIAJAN) escena('local', 'escribe', r, 'sintético: esto no debe viajar');
  escena('vps', 'escribe', VUELTA, '# Prueba sintética\nNota escrita en el VPS (dato sintético de la prueba, sin nada real).');
  escena('vps', 'evento-agrega', 'ev-vps-1', 'Bloque sintético creado en el VPS', 'hoy+2');
  escena('vps', 'habito-marca', 'hoy', 'objetivo_dia', 'true');
  linea('\n  Pasadas: local (sube lo suyo) → vps (une por registro y baja lo de local) → local (avance rápido):');
  for (const lado of ['local', 'vps', 'local']) comprueba('a', job(lado).status === 0, `pasada en ${lado} sin choque`);
  const rutas = [IDA, VUELTA, SKILL, CAL, HAB, ...NO_VIAJAN];
  const [hl, hv] = [huellas('local', rutas), huellas('vps', rutas)];
  for (const r of [IDA, VUELTA, SKILL, CAL, HAB]) comprueba('a', hl[r] && hl[r] === hv[r], `${r}: local ${corto(hl[r])} = vps ${corto(hv[r])}`);
  const ids = json(nodeEn('vps', '-e', "console.log(JSON.stringify(require('/home/arbrain/Arbrain/.claude/plan/calendario.json').eventos.map(e=>e.id)))"));
  comprueba('a', ids?.includes('ev-local-1') && ids?.includes('ev-vps-1'), `calendario.json en vps tiene los eventos de los dos lados: ${JSON.stringify(ids)}`);
  for (const r of NO_VIAJAN) comprueba('a', hl[r] && hv[r] === null, `${r}: existe en local y NO viajó al vps`);
  const now = (lado) => bash(lado, "sed -n 3p ~/Arbrain/.claude/now.md; git --git-dir=$HOME/.cerebro-sync/cerebro.git ls-files -- .claude/now.md | wc -l").stdout.trim().split('\n');
  const [nl, nv] = [now('local'), now('vps')];
  bloque(`local now.md: ${nl[0]}\nvps   now.md: ${nv[0]}`);
  comprueba('a', /\*\*local\*\*/.test(nl[0]) && /\*\*vps\*\*/.test(nv[0]) && nl[1] === '0' && nv[1] === '0', 'now.md se regeneró en cada lado y no está en el repo del cerebro');
  const [ml, mv, mc] = [mainDe('local'), mainDe('vps'), mainCentro()];
  comprueba('a', ml === mv && mc.includes(ml), `local, vps y el centro en el mismo commit del cerebro (${ml.slice(0, 7)})`);
}

async function principal() {
  const prep = prepara();
  let fallo = null;
  try {
    construye(prep);
    await arranca(prep.lock);
    titulo('(d) Carpeta de datos de la app: huella ANTES de todo el trabajo del job');
    const antes = { vps: huellaDatos('vps'), local: huellaDatos('local') };
    for (const [lado, h] of Object.entries(antes)) linea(`  · ${lado}: ${h?.archivos} archivos (${JSON.stringify(h?.porCarpeta)}), ${corto(h?.sha256)} — fuera del hash: ${h?.excluidas?.join(', ')}`);
    idaYVuelta();
    await pruebaVersiones({ job, mainDe, mainCentro, escena, huellas });
    pruebaChoque({ job, mainDe, mainCentro, blobCentro, escena, huellas });
    await pruebaResumen({ job });
    titulo('(d) Carpeta de datos de la app: huella DESPUÉS');
    for (const lado of ['vps', 'local']) {
      const h = huellaDatos(lado);
      comprueba('d', h?.sha256 && h.sha256 === antes[lado]?.sha256 && h.archivos === antes[lado].archivos, `${lado}: ${h?.archivos} archivos, ${corto(antes[lado]?.sha256)} antes = ${corto(h?.sha256)} después`);
    }
    comprueba('d', bash('local', 'git --git-dir=$HOME/.cerebro-sync/cerebro.git ls-files | grep -c -E "ai.arbrain|base/|\\.sqlite|\\.db$|llaves|acceso" || true').stdout.trim() === '0', 'el repo del cerebro no rastrea nada de la carpeta de datos, llaves ni bases');
    pruebaRed();
    pruebaPuerta(prep.tmp);
    pruebaCodigo();
  } catch (e) {
    fallo = e;
    console.error(rojo(`✗ la prueba se interrumpió: ${e.stack ?? e}`));
  } finally {
    titulo('Resumen');
    const r = resumen();
    for (const x of r) linea(`  ${x.ok ? verde('✓') : rojo('✗')} (${x.punto}) ${x.bien}/${x.n} comprobaciones`);
    if (CONSERVA) linea(`  · --conserva: los contenedores siguen arriba. Para bajarlos: ARBRAIN_ETIQUETA=${ENTORNO.ARBRAIN_ETIQUETA} ARBRAIN_ETIQUETA_ANTIGUA=${ETIQUETA_ANTIGUA} CEREBRO_RED_TOKEN_ARCHIVO=${ENTORNO.CEREBRO_RED_TOKEN_ARCHIVO} docker compose -f ${join(AQUI, 'compose.yml')} --profile versiones down --volumes`);
    else {
      const d = dc(['--profile', 'versiones', 'down', '--volumes', '--remove-orphans']);
      linea(`  · contenedores y red bajados (${d.status === 0 ? 'ok' : 'falló'}); las imágenes quedan en caché`);
      rmSync(prep.tmp, { recursive: true, force: true });
    }
    const todo = !fallo && r.every((x) => x.ok);
    linea(todo ? verde('\nPRUEBA_OK: (a)-(h) en verde') : rojo('\nPRUEBA_FALLA'));
    process.exitCode = todo ? 0 : 1;
  }
}

principal();
