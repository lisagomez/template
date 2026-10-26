/**
 * Casos de prueba.mjs: (c) versiones distintas y defensa del centro, (b) choque, (e) red, (f) puerta de Cloudflare
 * y (g) órdenes prohibidas en el código. Las funciones del job y de huellas llegan por parámetro.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AQUI, bash, bloque, comprueba, corto, dc, dormir, en, json, linea, nodeEn, sh, titulo } from './prueba-util.mjs';

const HUELLA = '/opt/cerebro-sync/imagen/huella.mjs';
const CF = 'cloudflare/cloudflared:2026.10.0@sha256:9b49eed8f62806d5d45ddf59ecefb5710429598ea6d3fcccd2af938f621b2b07';
const ANCLA = '$HOME/.config/arbrain/firmas-permitidas';
const cerebro = (lado) => json(nodeEn(lado, HUELLA, 'carpeta', '/home/arbrain/Arbrain/.claude', '--excluye', 'now.md'))?.sha256;

/** (c) Una instancia en v0.2.9 (verificada) no sincroniza ni cambia nada; el centro rechaza por su cuenta. */
export async function pruebaVersiones({ job, mainCentro, escena }) {
  titulo('(c) Versiones distintas: una instancia con Arbrain v0.2.9, también verificada');
  const up = dc(['--profile', 'versiones', 'up', '-d', 'antigua']);
  comprueba('c', up.status === 0, 'instancia «antigua» levantada en la misma red privada');
  for (let i = 0; i < 60 && !bash('antigua', 'test -f ~/Arbrain/.arbrain-sembrado.json && echo si').stdout.includes('si'); i++) await dormir(1000);
  bloque(bash('antigua', `cd ~/Arbrain && echo "VERSION $(cat VERSION)" && git -c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c gpg.ssh.allowedSignersFile=${ANCLA} verify-tag v$(cat VERSION) 2>&1 | head -1`).salida);
  escena('antigua', 'escribe', '.claude/memory/project/desde-la-version-vieja.md', 'sintético: escrito con Arbrain v0.2.9');
  const foto = () => ({
    centro: mainCentro(), vps: cerebro('vps'), antigua: cerebro('antigua'),
    repo: bash('antigua', 'test -d ~/.cerebro-sync/cerebro.git && echo existe || echo "no existe"').stdout.trim(),
  });
  const antes = foto();
  const r = job('antigua');
  const despues = foto();
  comprueba('c', r.status === 3, 'el job de antigua se detiene con exit 3: versiones distintas, no sincroniza');
  comprueba('c', antes.centro === despues.centro, `el centro: refs iguales antes y después (${despues.centro.split('\n').map((l) => l.slice(0, 7) + l.slice(40)).join(' · ')})`);
  comprueba('c', antes.vps === despues.vps, `el cerebro de vps: ${corto(antes.vps)} antes = ${corto(despues.vps)} después`);
  comprueba('c', antes.antigua === despues.antigua, `el cerebro de antigua: ${corto(antes.antigua)} antes = ${corto(despues.antigua)} después`);
  comprueba('c', despues.repo === 'no existe', 'antigua ni siquiera creó su repo del cerebro: la versión se comprueba antes de tocar nada');
  const aviso = bash('antigua', 'cat ~/.cerebro-sync/AVISO.md');
  bloque(aviso.stdout);
  comprueba('c', /versiones de Arbrain de los dos lados difieren/.test(aviso.stdout), 'dejó el archivo de aviso (AVISO.md y AVISO.json)');

  linea('\n  Y el centro se defiende solo: empujes hechos A MANO desde antigua por el túnel, sin el job:');
  const clona = 'cd /tmp && rm -rf c && git -c protocol.ext.allow=always clone -q "$CEREBRO_CENTRO_URL" c 2>/dev/null && cd c && git config user.name prueba && git config user.email prueba@antigua.invalid';
  const empuja = (ref) => `git -c protocol.ext.allow=always push origin ${ref} 2>&1 | grep -E "CENTRO_RECHAZA|·|rejected|declined|error: " | head -4`;
  const intentos = [
    ['un commit hecho con v0.2.9', `echo sintetico > .claude/memory/project/a-mano.md && git add -A && git commit -qm "a mano" -m "Arbrain-Version: 0.2.9 642e7e3b531a7256f39fb4e45d2c20cd67a5e47e" && ${empuja('HEAD:main')}`],
    ['código de la app y now.md con la versión correcta', `mkdir -p arbrain/server/src && echo sintetico > arbrain/server/src/inyectado.ts && echo sintetico > .claude/now.md && git add -A -f && git commit -qm "a mano" -m "Arbrain-Version: $(git log -1 --format=%\\(trailers:key=Arbrain-Version,valueonly\\) origin/main)" && ${empuja('HEAD:main')}`],
    ['borrar main', empuja(':main')],
    ['declarar otra versión con una ref nueva (refs/meta/version-v029)', `B=$(echo "0.2.9 642e7e3b531a7256f39fb4e45d2c20cd67a5e47e" | git hash-object -w --stdin) && ${empuja('$B:refs/meta/version-v029')}`],
  ];
  const centroAntes = mainCentro();
  for (const [nombre, guion] of intentos) {
    const s = bash('antigua', `${clona} && ${guion}`);
    bloque(`${nombre}:\n${s.stdout}`, '    │ ');
    comprueba('c', /CENTRO_RECHAZA|declined|rejected/.test(s.stdout), `el centro rechaza: ${nombre}`);
  }
  comprueba('c', mainCentro() === centroAntes, 'tras los cuatro intentos, las refs del centro siguen iguales');
  linea('    · cambiar la ref que declara la versión (refs/meta/version-arbrain) ni se intenta: el cliente se niega sin --force, y');
  linea('      con --force el hook la rechazaría igual (solo acepta refs/heads/main). La versión la declara el VPS en local: declara-version.');
}

/** (b) Choque: el mismo evento y la misma nota cambiados distinto en los dos lados. */
export function pruebaChoque({ job, mainDe, mainCentro, blobCentro, escena, huellas }) {
  titulo('(b) Choque provocado: el mismo evento y la misma nota, cambiados distinto en cada lado');
  const NOTA = '.claude/memory/project/prueba-ida-desde-local.md', CAL = '.claude/plan/calendario.json';
  escena('vps', 'evento-titulo', 'ev-local-1', 'Título cambiado en el VPS');
  escena('vps', 'escribe', NOTA, '# Prueba sintética\nVersión escrita en el VPS (sintética).');
  escena('local', 'evento-titulo', 'ev-local-1', 'Título cambiado en local');
  escena('local', 'escribe', NOTA, '# Prueba sintética\nVersión escrita en local (sintética).');
  comprueba('b', job('vps').status === 0, 'vps sube primero su versión al centro');
  const foto = () => ({ l: huellas('local', [NOTA, CAL]), v: huellas('vps', [NOTA, CAL]), c: { [NOTA]: blobCentro(NOTA), [CAL]: blobCentro(CAL) }, refs: mainCentro(), main: mainDe('local') });
  const tabla = (f, cuando) => linea(`  ${cuando}:\n${[NOTA, CAL].map((r) => `    ${r}\n      local ${corto(f.l[r])} · vps ${corto(f.v[r])} · centro ${f.c[r]}`).join('\n')}\n    centro main ${f.refs.split(' ')[0].slice(0, 7)} · local main ${f.main.slice(0, 7)}`);
  const antes = foto();
  tabla(antes, 'ANTES');
  const r = job('local');
  const despues = foto();
  tabla(despues, 'DESPUÉS');
  comprueba('b', r.status === 2, 'el job de local se detiene con exit 2 (choque) y no empuja');
  comprueba('b', /registro en choque: \.claude\/plan\/calendario\.json eventos\[ev-local-1\]/.test(r.stdout), 'nombra el registro en choque: calendario.json eventos[ev-local-1]');
  comprueba('b', r.stdout.includes(`archivo en choque: ${NOTA}`), 'nombra la nota en choque');
  for (const x of [NOTA, CAL]) {
    comprueba('b', antes.l[x] === despues.l[x] && antes.v[x] === despues.v[x] && antes.c[x] === despues.c[x], `${x}: local, vps y centro iguales antes y después`);
    comprueba('b', despues.l[x] !== despues.v[x], `${x}: las dos versiones siguen distintas (nadie eligió un lado)`);
  }
  comprueba('b', antes.refs === despues.refs, 'el centro no se movió');
  const pendiente = bash('local', 'git --git-dir=$HOME/.cerebro-sync/cerebro.git rev-list --count refs/remotes/centro/main..main').stdout.trim();
  comprueba('b', Number(pendiente) >= 1, `la versión local quedó en su rama del cerebro, sin empujar (${pendiente} commit pendiente)`);
  const av = bash('local', 'cat ~/.cerebro-sync/AVISO.md; echo; cd ~/.cerebro-sync/choques && find . -type f | sort');
  bloque(av.stdout);
  const copias = bash('local', `cd ~/.cerebro-sync/choques/*/ && for f in ${NOTA}.local ${NOTA}.centro ${CAL}.local ${CAL}.centro; do sha256sum < $f | cut -c1-12; done`).stdout.trim().split('\n');
  comprueba('b', copias[0] === corto(despues.l[NOTA]) && copias[1] === corto(despues.v[NOTA]) && copias[2] === corto(despues.l[CAL]) && copias[3] === corto(despues.v[CAL]), 'las copias de choques/ son exactamente las dos versiones (local y centro)');
  linea('\n  Otra pasada en local (el choque sigue) y una en vps (el centro sigue sirviendo al otro lado):');
  const otra = job('local');
  const carpetas = bash('local', 'ls ~/.cerebro-sync/choques | wc -l').stdout.trim();
  comprueba('b', otra.status === 2 && mainCentro() === antes.refs && huellas('local', [NOTA])[NOTA] === antes.l[NOTA] && carpetas === '1', `local: exit 2 otra vez, sin cambiar nada (las copias siguen en ${carpetas} carpeta: el mismo choque no se duplica)`);
  comprueba('b', job('vps').status === 0, 'vps: exit 0');

  linea('\n  Y cuando una persona decide (simulada aquí: un título nuevo para el evento y su propio texto para la nota),');
  linea('  la unión la hace ELLA a mano en el repo del cerebro, con los comandos de docs/CEREBRO-PERSONAL.md; luego el job vuelve a sincronizar:');
  const G = 'git --git-dir=$HOME/.cerebro-sync/cerebro.git --work-tree=$HOME/Arbrain';
  const inicio = bash('local', `cd ~/Arbrain && ${G} merge --no-ff --no-commit refs/remotes/centro/main 2>&1 | tail -3; echo "(la unión a mano se detiene en el choque, como debe)"`);
  bloque(inicio.stdout);
  escena('local', 'evento-titulo', 'ev-local-1', 'Título que decidió la persona');
  escena('local', 'escribe', NOTA, '# Prueba sintética\nTexto que decidió la persona tras ver las dos versiones (sintético).');
  const cierra = bash('local', `cd ~/Arbrain && ${G} add -- ${NOTA} ${CAL} && ${G} commit -q -m "cerebro (local): choque resuelto a mano" -m "Arbrain-Version: $(cat VERSION) $(git rev-parse v$(cat VERSION)^{commit})
Lado: local" && echo "commit de la persona: $(${G} rev-parse --short HEAD)"`);
  bloque(cierra.salida);
  comprueba('b', job('local').status === 0 && job('vps').status === 0, 'tras la decisión de la persona, local y vps sincronizan (exit 0)');
  const fin = { l: huellas('local', [NOTA, CAL]), v: huellas('vps', [NOTA, CAL]) };
  comprueba('b', fin.l[NOTA] === fin.v[NOTA] && fin.l[CAL] === fin.v[CAL] && fin.l[NOTA] !== antes.l[NOTA] && fin.l[NOTA] !== antes.v[NOTA], 'los dos lados tienen lo que decidió la persona (ni la versión de local ni la del VPS)');
  comprueba('b', bash('local', 'test -f ~/.cerebro-sync/AVISO.md && echo sigue || ls ~/.cerebro-sync/avisos | wc -l').stdout.trim() !== 'sigue', 'el aviso del choque quedó archivado en avisos/');
}

const soloLoopback = (salida) => salida.trim().split('\n').filter((l) => /LISTEN/.test(l)).map((l) => l.trim().split(/\s+/)[3]);

/** (e) Solo 127.0.0.1 en las instancias, sin puertos publicados, red interna sin salida, relevo con token. */
export function pruebaRed() {
  titulo('(e) Red privada simulada: qué escucha, qué se publica y si hay salida');
  for (const lado of ['local', 'vps', 'red']) {
    const s = en(lado, ['ss', '-ltn']);
    bloque(`$ (${lado}) ss -ltn\n${s.stdout}`);
    const dirs = soloLoopback(s.stdout);
    const docker = dirs.filter((d) => d.startsWith('127.0.0.11:'));
    const propias = dirs.filter((d) => !d.startsWith('127.0.0.11:'));
    if (lado === 'red') { comprueba('e', propias.every((d) => d.endsWith(':7443')), 'red (el relevo, no es una instancia): su único oyente es el 7443 de la red interna'); continue; }
    comprueba('e', propias.length > 0 && propias.every((d) => d.startsWith('127.0.0.1:')), `${lado}: ${propias.length} oyentes propios, todos en 127.0.0.1 (${propias.join(', ')})`);
    if (docker.length) linea(`    · ${docker.join(', ')}: el DNS interno de Docker (127.0.0.11, lo pone dockerd en cada red de usuario; en la realidad no existe)`);
  }
  const ps = sh('docker', ['ps', '--filter', 'label=com.docker.compose.project=cerebro-personal', '--format', '{{.Names}}\t{{.Ports}}']);
  bloque(`$ docker ps --filter label=com.docker.compose.project=cerebro-personal --format '{{.Names}} {{.Ports}}'\n${ps.stdout.split('\n').map((l) => (l.trim() ? `${l.split('\t')[0]}  puertos: «${l.split('\t')[1] ?? ''}»` : '')).join('\n')}`);
  const filas = ps.stdout.trim().split('\n').filter(Boolean);
  comprueba('e', filas.length >= 4 && filas.every((l) => !(l.split('\t')[1] ?? '').trim()), `docker ps: ${filas.length} contenedores y ninguno publica puertos`);
  const ins = sh('docker', ['inspect', '--format', '{{.Name}} {{json .HostConfig.PortBindings}}', ...filas.map((l) => l.split('\t')[0])]);
  comprueba('e', ins.stdout.trim().split('\n').every((l) => / (\{\}|null)$/.test(l)), 'docker inspect: PortBindings vacío en todos');
  const uso = sh('docker', ['stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}} CPU {{.CPUPerc}}', ...filas.map((l) => l.split('\t')[0])]).stdout.trim();
  bloque(`$ docker stats --no-stream (memoria y CPU en este momento, informativo)\n${uso}`);
  const red = sh('docker', ['network', 'inspect', 'cerebro-personal_privada', '--format', '{{.Internal}}']).stdout.trim();
  comprueba('e', red === 'true', 'la red «privada» es interna (Internal=true: sin salida a internet)');
  const salida = "const n=require('net');require('dns').lookup('github.com',(e)=>{const d=e?'sin DNS externo ('+e.code+')':'RESOLVIÓ github.com';const s=n.connect({host:'9.9.9.9',port:443,timeout:3000});const fin=(t,ok)=>{console.log(d+'; '+t);process.exit(ok&&e?0:1)};s.on('connect',()=>fin('CONECTÓ a 9.9.9.9:443',false));s.on('timeout',()=>fin('9.9.9.9:443 sin salida (timeout)',true));s.on('error',(x)=>fin('9.9.9.9:443 sin salida ('+x.code+')',true))})";
  for (const lado of ['local', 'vps']) { const t = nodeEn(lado, '-e', salida); comprueba('e', t.status === 0, `${lado}: ${t.stdout.trim()}`); }
  const intruso = "const s=require('net').connect(7443,'red',()=>s.write(JSON.stringify({v:1,rol:'conecta',de:'intruso',a:'vps',servicio:'git-upload-pack',token:'x'.repeat(44)})+'\\n'));s.on('data',d=>{console.log(String(d).trim());process.exit(0)});setTimeout(()=>process.exit(1),5000)";
  const t = nodeEn('local', '-e', intruso);
  comprueba('e', /token de la red no válido/.test(t.stdout), `el relevo rechaza un flujo sin el token de la red: ${t.stdout.trim()}`);
}

/** (f) cloudflared pineado valida sin red; el validador propio exige Access y se pone rojo con el sabotaje. */
export function pruebaPuerta(tmp) {
  titulo('(f) Puerta de Cloudflare (solo configuración): Access obligatorio, validada sin conexión');
  const cfg = join(AQUI, 'cloudflared', 'config.yml');
  const sab = join(tmp, 'config-saboteada.yml');
  const texto = readFileSync(cfg, 'utf8');
  const saboteado = texto.replace(/\n {4}originRequest:\n(?: {6,}.*\n)+/, '\n');
  writeFileSync(sab, saboteado);
  linea(`  · copia saboteada: la misma configuración sin el bloque originRequest.access de la regla 1 (${texto.split('\n').length - saboteado.split('\n').length} líneas menos)`);
  const cf = (archivo, ...args) => sh('docker', ['run', '--rm', '--network', 'none', '-v', `${archivo}:/etc/cloudflared/config.yml:ro`, CF, ...args]);
  bloque(`$ docker run --rm --network none ${CF.split('@')[0]}@sha256:… --version\n${sh('docker', ['run', '--rm', '--network', 'none', CF, '--version']).salida}`);
  const v = cf(cfg, 'tunnel', '--config', '/etc/cloudflared/config.yml', 'ingress', 'validate');
  bloque(`$ … tunnel --config config.yml ingress validate   (sin red)\n${v.salida}`);
  comprueba('f', v.status === 0 && /\bOK\b/.test(v.salida), 'cloudflared pineado (versión y digest) valida las reglas sin conexión: OK');
  const regla = cf(cfg, 'tunnel', '--config', '/etc/cloudflared/config.yml', 'ingress', 'rule', 'https://cerebro.example.com/');
  bloque(`$ … ingress rule https://cerebro.example.com/\n${regla.salida}`);
  const a = sh('node', [join(AQUI, 'cloudflared', 'valida-access.mjs'), 'config.yml'], { cwd: join(AQUI, 'cloudflared') });
  bloque(`$ node cloudflared/valida-access.mjs config.yml\n${a.salida}`);
  comprueba('f', a.status === 0, 'validador propio: ACCESS_OK, Access obligatorio en cada regla de servicio');
  const s = sh('node', [join(AQUI, 'cloudflared', 'valida-access.mjs'), 'config-saboteada.yml'], { cwd: tmp });
  bloque(`$ node cloudflared/valida-access.mjs config-saboteada.yml\n${s.salida}\n→ exit ${s.status}`);
  comprueba('f', s.status === 1 && /ACCESS_FALLA/.test(s.stdout), 'con la copia saboteada (una regla sin Access) el validador sale en ROJO');
  const vs = cf(sab, 'tunnel', '--config', '/etc/cloudflared/config.yml', 'ingress', 'validate');
  linea(`  · cloudflared solo, con la saboteada: «${vs.salida.trim().split('\n').pop()}» (exit ${vs.status}). No revisa Access: por eso el validador propio.`);
}

/** (g) Ninguna orden prohibida en el código del job (sin contar los comentarios que las nombran para prohibirlas). */
export function pruebaCodigo() {
  titulo('(g) El código del job no contiene órdenes prohibidas');
  const dir = join(AQUI, 'job');
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const prohibido = /(['"`])(reset|clean|checkout|stash|--hard|--force|--force-with-lease|-f|--ours|--theirs|-X|ours|theirs)\1|['"`]\+refs\//g;
  const hallazgos = [];
  for (const f of archivos) {
    const codigo = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of codigo.matchAll(prohibido)) hallazgos.push(`${f}: ${m[0]}`);
  }
  bloque(hallazgos.length ? hallazgos.join('\n') : `${archivos.join(', ')}: 0 apariciones`);
  comprueba('g', hallazgos.length === 0, `ni reset --hard, ni push --force, ni clean, ni checkout --ours/--theirs, ni -X ours/theirs, ni stash, ni refspecs con «+» (${archivos.length} archivos)`);
}

/**
 * (h) El resumen de un producto (fase «resumen»): la lectura de SOLO conteos del producto nuevo llega a la agenda del
 * cerebro del VPS y viaja a local; uno con un campo de texto libre se rechaza entero y el cerebro no cambia. El
 * transporte es simulado: la prueba trae la lectura del servidor del producto y la deja en la entrada del VPS (en la
 * realidad la trae el job con un token de solo lectura: FUERA DEL HECHO §2).
 */
export async function pruebaResumen({ job }) {
  titulo('(h) Resumen de producto: del producto a la agenda del cerebro, solo conteos y enlaces');
  const url = process.env.CAPA_RESUMEN_URL;
  if (!comprueba('h', Boolean(url), `CAPA_RESUMEN_URL apunta a la lectura de conteos del producto (${url ?? 'sin definir'})`)) return;
  const r = await fetch(url).then(async (x) => ({ status: x.status, cuerpo: await x.text() })).catch((e) => ({ status: 0, cuerpo: String(e) }));
  comprueba('h', r.status === 200, `GET ${url} → ${r.status}`);
  bloque(r.cuerpo);
  const deja = (nombre, texto) => en('vps', ['bash', '-c', `cat > /srv/cerebro/entrada-resumenes/${nombre}`], { input: texto });
  const tareas = (lado) => json(nodeEn(lado, '-e', "const c=JSON.parse(require('fs').readFileSync('/home/arbrain/Arbrain/.claude/plan/calendario.json','utf8')); console.log(JSON.stringify((c.tareas||[]).filter(t=>(t.etiquetas||[]).includes('resumen-de-producto'))))")) ?? [];
  const lectura = JSON.parse(r.cuerpo);
  const saboteada = { ...lectura, nota: 'texto libre que no debe llegar nunca al cerebro personal' };
  deja('sabotaje.json', JSON.stringify(saboteada));
  const antes = cerebro('vps');
  const s = job('vps');
  comprueba('h', /RESUMEN_RECHAZADO sabotaje\.json/.test(s.stdout), 'un resumen con un campo de texto libre: RESUMEN_RECHAZADO');
  comprueba('h', cerebro('vps') === antes, `el cerebro de vps, igual antes y después del rechazo (${corto(antes)})`);
  const cuarentena = bash('vps', 'ls /srv/cerebro/entrada-resumenes/rechazados/ && cat /srv/cerebro/entrada-resumenes/rechazados/sabotaje.json.motivo.json');
  bloque(cuarentena.stdout);
  comprueba('h', /sabotaje\.json/.test(cuarentena.stdout), 'el archivo rechazado se queda en la cuarentena del VPS, fuera del cerebro, con su motivo');
  deja('producto.json', r.cuerpo);
  const b = job('vps');
  comprueba('h', /RESUMEN_ACEPTADO producto\.json/.test(b.stdout), 'la lectura del producto: RESUMEN_ACEPTADO');
  const enVps = tareas('vps');
  bloque(JSON.stringify(enVps, null, 2));
  const id = `resumen-${lectura.producto}-`;
  comprueba('h', enVps.some((t) => t.id.startsWith(id) && Object.values(lectura.conteos).every((n) => t.titulo.includes(String(n)))), 'en la agenda del cerebro del VPS: una tarea con los conteos y el enlace del producto');
  comprueba('h', enVps.every((t) => !/texto libre/.test(JSON.stringify(t))), 'ninguna tarea lleva el texto libre del sabotaje');
  job('local');
  const enLocal = tareas('local');
  comprueba('h', enLocal.some((t) => t.id.startsWith(id)), 'la tarea del resumen viajó a local con el cerebro (unión por registro)');
}
