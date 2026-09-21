#!/usr/bin/env node
/**
 * Mide la pildora flotante de Windows de punta a punta, sin persona: un WAV hace de microfono
 * (`dictar --entrada`), el icono se lanza con `-Medir` (anota cuadros, CPU y bytes por segundo,
 * y se fotografia a si misma en cada visual) y aqui se juntan las cifras:
 *   - fps reales mientras escucha, CPU del PowerShell en reposo y escuchando, bytes/s del socket;
 *   - latencia estado → pintado (reloj del dictado al publicar vs. reloj del icono al anotar;
 *     mismo reloj de sistema en WSL2 y Windows);
 *   - capturas: idle, escuchando (dos cuadros), procesando, hecho, error, menu.
 *
 *   node medicion/mide-pildora.mjs [--wav medicion/corpus-propio/pildora-sesion.wav]
 *
 * Exige Windows al alcance (powershell.exe) y el demonio vivo (motor remoto). Sin otra carga.
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banco = join(raiz, 'medicion', 'banco');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const wav = resolve(arg('wav', join(raiz, 'medicion', 'corpus-propio', 'pildora-sesion.wav')));
const salida = join(raiz, 'medicion', 'corpus-propio', 'pildora');
mkdirSync(salida, { recursive: true });
const { carpetaWindows } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'cli-icono.js')).href);
const local = join(carpetaWindows('LOCALAPPDATA').wsl, 'dictado');
const registro = join(local, 'pildora-medicion.txt');
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync(resolve(raiz, '..', '..', '.env.local'), 'utf8'))?.[1]?.trim() ?? '';
const DEMONIO = `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`;
console.log(`token: ${token ? `presente (largo ${token.length})` : 'ausente'}`);
if (!(await fetch(`${DEMONIO}/health`).then((r) => r.ok).catch(() => false))) throw new Error('el demonio no responde: npm run demonio');
// -EncodedCommand: con -Command, Windows se come las comillas al partir la linea de ordenes.
const ps = (orden) => execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(orden, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20_000 }).replace(/\r/g, '');

// 1) La sesion: tres frases con 1,2 s de silencio entre ellas, y 2 s al final. El error se simula con --prueba-error.
if (!existsSync(wav)) {
  const frases = ['Recuérdame mandar la cotización a Luis el jueves por la mañana.', 'El pedido de tornillos de la planta de Monterrey va con urgencia.', 'Agenda una reunión con Ana Martínez el martes a las diez y media.'];
  const partes = [];
  for (const [i, f] of frases.entries()) {
    const r = await fetch(`${DEMONIO}/sintetizar`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ texto: f }) });
    const pcm = Buffer.from(await r.arrayBuffer());
    const ruta = join(salida, `frase-${i + 1}.wav`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', r.headers.get('x-frecuencia-hz'), '-ac', '1', '-i', 'pipe:0', '-ar', '16000', ruta], { input: pcm });
    partes.push(ruta);
  }
  const fc = partes.map((_, i) => `[${i + 1}:a]aformat=sample_rates=16000:channel_layouts=mono[a${i + 1}];`).join('') + partes.map((_, i) => `[0:a][a${i + 1}]`).join('') + `[0:a][0:a]concat=n=${2 * partes.length + 2}:v=0:a=1[out]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0:d=1.2:s=16000', ...partes.flatMap((p) => ['-i', p]), '-filter_complex', fc, '-map', '[out]', wav]);
  for (const p of partes) unlinkSync(p);
  console.log(`sesion fabricada: ${wav}`);
}

// 2) Limpieza: ningun icono viejo, ningun registro viejo.
ps(`Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*icono-barra.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`);
if (existsSync(registro)) unlinkSync(registro);
for (const f of readdirSync(local).filter((n) => /^captura-.*\.png$/.test(n))) unlinkSync(join(local, f));

// 3) La sesion, con el icono midiendo.
const env = { ...process.env, DICTADO_MODELOS: join(banco, 'modelos'), DICTADO_RUNTIME: banco, DICTADO_DATOS: join(banco, 'datos'), DICTADO_REMOTO_URL: DEMONIO, DICTADO_REMOTO_TOKEN: token, DICTADO_ICONO_MEDIR: '1', DICTADO_ICONO_TRAZA: '1', NO_COLOR: '1' };
const t0 = Date.now();
const hijo = spawn(process.execPath, [join(raiz, 'dist', 'node', 'cli.js'), 'dictar', '--entrada', wav, '--icono', '--pegar', 'ninguno', '--modo', 'manos-libres', '--sin-trayectoria', '--silencio-ms', '700', '--motor', 'remoto', '--prueba-error', '11500'], { cwd: raiz, env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
hijo.stdout.setEncoding('utf8'); hijo.stdout.on('data', (d) => (stdout += d));
hijo.stderr.setEncoding('utf8'); hijo.stderr.on('data', (d) => (stdout += d));
const codigo = await new Promise((r) => { hijo.on('close', r); setTimeout(() => { hijo.kill('SIGINT'); }, 60_000).unref(); });
// Un momento para que el icono anote el apagado y fotografie el menu.
await new Promise((r) => setTimeout(r, 7_000));
const limpio = stdout.replace(/\x1b\[[0-9;]*m/g, '');
console.log(`dictar termino con codigo ${codigo} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(limpio.split('\n').filter((l) => /icono|pildora|escuchando|en espera|transcribiendo|pegar=ninguno|sin voz|prueba|✗/.test(l)).map((l) => '  ' + l.trim()).join('\n'));

// 4) Las cifras.
const lineas = existsSync(registro) ? readFileSync(registro, 'utf8').replace(/\r/g, '').split('\n').filter(Boolean).map((l) => { const [ms, ...resto] = l.split(' '); return { ms: Number(ms), texto: resto.join(' ') }; }) : [];
const medidas = lineas.filter((l) => l.texto.startsWith('medida ')).map((l) => Object.fromEntries(l.texto.slice(7).split(' ').map((kv) => kv.split('='))));
const porVisual = (v) => medidas.filter((m) => m.visual === v);
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const fpsEscuchando = media(porVisual('escuchando').map((m) => Number(m.cuadros)));
const cpuEscuchando = media(porVisual('escuchando').map((m) => Number(m.cpuMs) / 10));
// Reposo: los segundos en «apagado» tras la sesion, saltando los dos primeros (la foto del menu y el cierre del socket).
const cpuReposo = media(porVisual('apagado').slice(2).map((m) => Number(m.cpuMs) / 10));
const bytesEscuchando = media(porVisual('escuchando').map((m) => Number(m.bytes)));
const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const trazas = limpio.split('\n').map((l) => /traza icono (\d+) estado (\w+)/.exec(l)).filter(Boolean).map((m) => ({ ms: Number(m[1]), estado: m[2] }));
const anotados = lineas.filter((l) => /^estado \w+$/.test(l.texto)).map((l) => ({ ms: l.ms, estado: l.texto.slice(7) }));
const latencias = [];
// Cada traza del dictado se empareja con la PRIMERA anotacion del icono del mismo estado no usada
// aun (mismo orden). Los dos relojes son el del sistema; una diferencia negativa delata desfase.
// Solo cuentan los estados publicados DESPUES de que el icono conectara (el primero anotado es su saludo).
const conexionMs = anotados[0]?.ms ?? 0;
for (const t of trazas.filter((x) => x.ms >= conexionMs)) { const a = anotados.find((x) => x.estado === t.estado && !x.usado && Math.abs(x.ms - t.ms) < 3000); if (a) { a.usado = true; latencias.push(a.ms - t.ms); } }
// Un estado publicado ANTES de que el icono conectara le llega como saludo al conectar: eso no es latencia de pintado.
const saludos = latencias.filter((l) => l > 1000).length;
const latenciasReales = latencias.filter((l) => l <= 1000);
const mediana = (xs) => percentil(xs, 0.5);
// CPU en regimen: la mediana de los segundos completos escuchando (≥ 25 cuadros), sin el arranque ni las capturas.
const cpuEscuchandoMediana = mediana(porVisual('escuchando').filter((m) => Number(m.cuadros) >= 25).map((m) => Number(m.cpuMs) / 10));
const fpsEscuchandoCompletos = mediana(porVisual('escuchando').filter((m) => Number(m.cuadros) >= 25).map((m) => Number(m.cuadros)));
const capturas = readdirSync(local).filter((n) => /^captura-.*\.png$/.test(n)).sort();
for (const c of capturas) copyFileSync(join(local, c), join(salida, c));
const visuales = lineas.filter((l) => l.texto.startsWith('pildora ')).map((l) => `${l.texto.slice(8)}@${((l.ms - t0) / 1000).toFixed(1)}s`);
const fecha = new Date().toISOString().slice(0, 10);
const resumen = { fecha, fpsEscuchando: fpsEscuchando === null ? null : +fpsEscuchando.toFixed(1), fpsEscuchandoSegundosCompletos: fpsEscuchandoCompletos, cpuEscuchandoMedianaPct: cpuEscuchandoMediana === null ? null : +cpuEscuchandoMediana.toFixed(1), saludosExcluidos: saludos, latenciaEstadoPintadoP50: mediana(latenciasReales), latenciaEstadoPintadoMax: latenciasReales.length ? Math.max(...latenciasReales) : null, cpuEscuchandoPct: cpuEscuchando === null ? null : +cpuEscuchando.toFixed(1), cpuReposoPct: cpuReposo === null ? null : +cpuReposo.toFixed(1), bytesPorSegundoEscuchando: bytesEscuchando === null ? null : Math.round(bytesEscuchando), latencias, secuenciaVisual: visuales, capturas, medidas };
writeFileSync(join(salida, `pildora-${fecha}.json`), JSON.stringify(resumen, null, 1));
const md = [`# Píldora flotante — medición ${fecha}`, '', 'Sesión de tres frases sintéticas por `dictar --entrada` (el archivo hace de micrófono, a tiempo real), icono lanzado con `-Medir`, motor residente. Cuadro de 33 ms; PowerShell pinta 20 barras por cuadro.', '', '| medida | valor |', '|---|---|', `| cuadros por segundo mientras escucha (media de todos los segundos / mediana de los segundos enteros) | ${resumen.fpsEscuchando ?? '—'} / ${resumen.fpsEscuchandoSegundosCompletos ?? '—'} |`, `| CPU del PowerShell escuchando, de un núcleo (media con arranque y capturas / mediana en régimen) | ${resumen.cpuEscuchandoPct ?? '—'} % / ${resumen.cpuEscuchandoMedianaPct ?? '—'} % |`, `| CPU del PowerShell en reposo (reloj a 100 ms, tras la sesión) | ${resumen.cpuReposoPct ?? '—'} % |`, `| bytes por segundo del socket escuchando | ${resumen.bytesPorSegundoEscuchando ?? '—'} |`, `| latencia estado → anotado en el icono p50 / máx | ${resumen.latenciaEstadoPintadoP50 ?? '—'} / ${resumen.latenciaEstadoPintadoMax ?? '—'} ms (${latenciasReales.length} estados; ${saludos} saludo(s) al conectar excluidos) |`, '', `Secuencia de visuales (segundos desde el arranque): ${visuales.join(' · ')}`, '', `Capturas: ${capturas.join(', ') || 'ninguna'}`, ''].join('\n');
writeFileSync(join(salida, `pildora-${fecha}.md`), md);
console.log(md);
