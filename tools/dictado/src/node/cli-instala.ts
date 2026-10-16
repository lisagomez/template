/**
 * `dictado instala`: una maquina nueva, en un paso, medido. Comprueba lo que hace falta,
 * descarga SOLO los pesos pineados necesarios (sin corpus ni motores de comparacion), instala
 * los runtimes pineados, deja el icono de Windows y el token del celular, y termina en
 * `dictado diagnostico`. Cada paso dice quien lo hace (script o persona) y cuanto tardo, para
 * que la cifra de «instalar en < 20 min con <= 6 acciones humanas» sea medida, no supuesta.
 *
 * No pide administrador: lo unico que lo necesita (abrir el puerto de WSL2 al telefono por LAN)
 * se deja como accion humana explicita, y con Tailscale ni hace falta.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { escribeArchivoAjustes, rutaAjustes } from './ajustes-archivo.js';
import { leeConfiguracion, type Configuracion } from './cli-config.js';
import { ordenDiagnostico } from './cli-diagnostico.js';
import { copiaIconoAWindows, ordenIcono } from './cli-icono.js';
import { mbDe, NECESARIOS, rutaDe, RUNTIMES, verificaHuella, type Peso } from './pesos.js';

const ESC = String.fromCharCode(27);
const gris = (s: string) => `${ESC}[2m${s}${ESC}[0m`;
const verde = (s: string) => `${ESC}[32m${s}${ESC}[0m`;
const rojo = (s: string) => `${ESC}[31m${s}${ESC}[0m`;

interface Paso {
  nombre: string;
  quien: 'script' | 'persona';
  ms: number;
  nota?: string;
}

const hay = (comando: string): boolean => {
  try {
    execFileSync('which', [comando], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

export function comprueba(): { ok: boolean; lineas: string[] } {
  const lineas: string[] = [];
  let ok = true;
  const [mayor, menor] = process.versions.node.split('.').map(Number);
  const nodeOk = (mayor ?? 0) > 22 || ((mayor ?? 0) === 22 && (menor ?? 0) >= 18);
  lineas.push(`${nodeOk ? verde('✓') : rojo('✗')} Node ${process.versions.node} (hace falta >= 22.18)`);
  ok &&= nodeOk;
  const ffmpeg = hay('ffmpeg');
  lineas.push(`${ffmpeg ? verde('✓') : rojo('✗')} ffmpeg ${ffmpeg ? '' : '— instalalo: sudo apt install ffmpeg'}`);
  ok &&= ffmpeg;
  const pulse = existsSync('/mnt/wslg/PulseServer');
  lineas.push(`${pulse ? verde('✓') : gris('·')} microfono por PulseAudio de WSLg ${pulse ? '' : '(no hay: sirve para archivos y celular, no para dictar aqui)'}`);
  const interop = existsSync('/mnt/c/Windows/System32/cmd.exe');
  lineas.push(`${interop ? verde('✓') : gris('·')} Windows al alcance (interop) ${interop ? '' : '(sin icono ni pegado en Windows)'}`);
  try {
    const st = statfsSync(process.env['HOME'] ?? '/');
    const libresMb = Math.round((Number(st.bavail) * Number(st.bsize)) / 1_048_576);
    const necesitaMb = mbDe(NECESARIOS) + 700;
    lineas.push(`${libresMb > necesitaMb ? verde('✓') : rojo('✗')} espacio libre ${Math.round(libresMb / 1024)} GB (hacen falta ~${Math.round(necesitaMb / 1024 * 10) / 10} GB)`);
    ok &&= libresMb > necesitaMb;
  } catch {
    lineas.push(gris('· espacio libre: no se pudo medir'));
  }
  return { ok, lineas };
}

function descargaPeso(modelos: string, p: Peso): 'ya' | 'bajado' {
  if (existsSync(rutaDe(modelos, p))) return 'ya';
  mkdirSync(modelos, { recursive: true });
  if (p.tipo === 'archivo') {
    execFileSync('curl', ['-sSL', '--fail', '-o', `${rutaDe(modelos, p)}.parcial`, p.url], { stdio: ['ignore', 'ignore', 'inherit'] });
    verificaHuella(`${rutaDe(modelos, p)}.parcial`, p.sha256);
    execFileSync('mv', [`${rutaDe(modelos, p)}.parcial`, rutaDe(modelos, p)]);
    return 'bajado';
  }
  const tar = join(modelos, `${p.carpeta}.tar.bz2`);
  execFileSync('curl', ['-sSL', '--fail', '-o', tar, p.url], { stdio: ['ignore', 'ignore', 'inherit'] });
  verificaHuella(tar, p.sha256);
  execFileSync('tar', ['-xjf', tar, '-C', modelos]);
  execFileSync('rm', [tar]);
  return 'bajado';
}

function instalaRuntimes(runtime: string): 'ya' | 'instalado' {
  const faltan = Object.entries(RUNTIMES).filter(([n]) => !existsSync(join(runtime, 'node_modules', n)));
  if (faltan.length === 0) return 'ya';
  mkdirSync(runtime, { recursive: true });
  if (!existsSync(join(runtime, 'package.json'))) execFileSync('npm', ['init', '-y'], { cwd: runtime, stdio: 'ignore' });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error', ...faltan.map(([n, v]) => `${n}@${v}`)], { cwd: runtime, stdio: ['ignore', 'ignore', 'inherit'] });
  return 'instalado';
}

/** El token del celular: se genera, se guarda en `.env.local` de la app si se indica, y NUNCA se imprime. */
function preparaToken(datos: string, app: string | undefined): string {
  const rutaToken = join(datos, 'movil.token');
  let token: string;
  if (existsSync(rutaToken)) token = readFileSync(rutaToken, 'utf8').trim();
  else {
    token = randomBytes(16).toString('hex');
    mkdirSync(datos, { recursive: true });
    appendFileSync(rutaToken, token + '\n', { mode: 0o600 });
  }
  if (app) {
    const env = join(app, '.env.local');
    const actual = existsSync(env) ? readFileSync(env, 'utf8') : '';
    if (!/^DICTADO_MOVIL_TOKEN=/m.test(actual)) appendFileSync(env, `DICTADO_MOVIL_TOKEN=${token}\n`);
    return `token en ${env} (presente, largo ${token.length})`;
  }
  return `token en ${rutaToken} (presente, largo ${token.length}); pasalo a la app con --app <ruta>`;
}

function direccionDelCelular(): string {
  try {
    const st = JSON.parse(execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8', timeout: 5_000 })) as { Self?: { DNSName?: string } };
    const dns = st.Self?.DNSName?.replace(/\.$/, '');
    if (dns) return `https://${dns}/dictar  (Tailscale: sin certificado propio ni puertos; recomendado)`;
  } catch {
    /* sin tailscale */
  }
  try {
    const ip = execFileSync('hostname', ['-I'], { encoding: 'utf8' }).trim().split(/\s+/)[0];
    return `https://${ip}:3000/dictar  (LAN: exige tools/dictado/windows/red-movil.ps1 como administrador y aceptar el certificado)`;
  } catch {
    return '(no se pudo leer la direccion de esta maquina)';
  }
}

export async function ordenInstala(config: Configuracion, opciones: Record<string, string | boolean>): Promise<void> {
  const pasos: Paso[] = [];
  const mide = async (nombre: string, quien: Paso['quien'], f: () => string | void | Promise<string | void>) => {
    const t0 = performance.now();
    const nota = await f();
    pasos.push({ nombre, quien, ms: Math.round(performance.now() - t0), ...(nota ? { nota } : {}) });
  };
  console.log(`dictado instala — modelos en ${config.modelos} · runtimes en ${config.runtime ?? join(config.datos, 'runtime')} · datos en ${config.datos}\n`);

  const c = comprueba();
  for (const l of c.lineas) console.log('  ' + l);
  if (!c.ok) {
    console.error(rojo('\nfalta algo de lo de arriba: resuelvelo y vuelve a correr dictado instala'));
    process.exitCode = 1;
    return;
  }
  pasos.push({ nombre: 'comprobar Node, ffmpeg, microfono, Windows y disco', quien: 'script', ms: 0 });

  const runtime = config.runtime ?? join(config.datos, 'runtime');
  await mide(`runtimes pineados (${Object.entries(RUNTIMES).map(([n, v]) => `${n}@${v}`).join(', ')})`, 'script', () => (instalaRuntimes(runtime) === 'ya' ? 'ya estaban' : 'instalados'));
  for (const p of NECESARIOS) {
    await mide(`${p.que} (~${p.mb} MB)`, 'script', () => (descargaPeso(config.modelos, p) === 'ya' ? 'ya estaba' : 'bajado'));
  }
  await mide('token del celular', 'script', () => preparaToken(config.datos, typeof opciones['app'] === 'string' ? opciones['app'] : undefined));
  // Los ajustes de la persona: el archivo nace con los defectos (motor parakeet, el instalado) y
  // desde ahi lo cambian `dictado ajustes` o la pagina /ajustes. Uno que ya exista no se toca.
  await mide('ajustes (ajustes.json)', 'script', () => {
    if (existsSync(rutaAjustes(config.datos))) return `ya existia: ${rutaAjustes(config.datos)} (no se toca)`;
    try {
      return `creado con los defectos (motor parakeet): ${escribeArchivoAjustes(config.datos, {})}`;
    } catch (e) {
      return `no se pudo crear (${e instanceof Error ? e.message : String(e)}); el dictado funciona igual con los defectos`;
    }
  });

  const interop = existsSync('/mnt/c/Windows/System32/cmd.exe');
  if (opciones['sin-icono'] !== true && interop) {
    await mide('icono de la barra de Windows', 'script', () => {
      ordenIcono(['instala']);
      return copiaIconoAWindows().windows;
    });
  } else {
    pasos.push({ nombre: 'icono de la barra de Windows', quien: 'script', ms: 0, nota: interop ? 'omitido (--sin-icono)' : 'omitido: sin Windows al alcance' });
  }

  console.log(`\n${verde('listo')}. Pasos y tiempos:\n`);
  console.log('  | paso | quien | tiempo | nota |');
  console.log('  |---|---|---|---|');
  for (const p of pasos) console.log(`  | ${p.nombre} | ${p.quien} | ${p.ms >= 1000 ? `${(p.ms / 1000).toFixed(1)} s` : `${p.ms} ms`} | ${p.nota ?? ''} |`);
  const total = pasos.reduce((s, p) => s + p.ms, 0);
  console.log(`  total del script: ${(total / 1000).toFixed(1)} s · acciones humanas del script: 0`);

  console.log('\nLo que queda en manos de una persona (Windows no deja hacerlo desde aqui):');
  console.log('  1. Permitir el microfono al navegador y a Windows Terminal la primera vez que lo pidan.');
  console.log('  2. Arrastrar el icono del dictado desde la flecha ^ del area de notificacion a la barra (opcional).');
  console.log(`  3. En el telefono, abrir: ${direccionDelCelular()}`);
  console.log('     y emparejar una vez (QR desde un navegador ya emparejado, o teclear el token).');
  console.log('  4. Solo por LAN sin Tailscale: correr tools/dictado/windows/red-movil.ps1 como administrador.');
  console.log(gris('\nDiagnostico (se puede pegar en un issue: no lleva secretos ni lo dictado):\n'));
  // Se vuelve a leer la configuracion: el ajustes.json recien creado tiene que verse en el diagnostico.
  await ordenDiagnostico(leeConfiguracion(opciones), {});
}
