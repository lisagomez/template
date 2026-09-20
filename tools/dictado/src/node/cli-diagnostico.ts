/**
 * `dictado diagnostico`: lo que un tercero pega en un issue sin filtrar nada. Version, piezas
 * presentes, pico del microfono, salud del demonio, ultimas lineas UTILES del log (estados,
 * latencias, avisos: nunca lo dictado) y las ultimas trayectorias (forma). `limpiaParaCompartir`
 * quita cualquier cosa con forma de secreto, correo o ruta de usuario, y esta probado.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Configuracion } from './cli-config.js';
import { NECESARIOS, rutaDe, RUNTIMES } from './pesos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lineas del log que hablan de ESTADO, no de contenido: nunca la que empieza por ✓ (lleva el texto). */
const LINEA_UTIL = /motor |microfono|conectad|icono|latencia|sin voz|pico durante|escuchando|en espera|EADDRINUSE|ffmpeg|ganancia|trayectoria|demonio|✗/;
const FORMAS = [
  [/\b(sk|rk|pk)[-_][A-Za-z0-9_-]{10,}/g, '[clave]'],
  [/\beyJ[A-Za-z0-9_-]{20,}/g, '[jwt]'],
  [/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[correo]'],
  [/\b[0-9a-f]{32}\b/gi, '[token]'],
  [/\/home\/[^/\s]+/g, '/home/[usuario]'],
  [/\/Users\/[^/\s]+/g, '/Users/[usuario]'],
  [/[A-Z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[usuario]'],
  [/[A-Z][A-Z0-9_]{3,}=\S{8,}/g, '[variable=valor]'],
] as const;

export function limpiaParaCompartir(texto: string): string {
  let t = texto.replace(/\x1b\[[0-9;]*m/g, '');
  for (const [forma, por] of FORMAS) t = t.replace(forma, por);
  return t;
}

export function lineasUtilesDelLog(ruta: string, cuantas = 12): string[] {
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, 'utf8').split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter((l) => l.length > 0 && !l.startsWith('✓') && !l.startsWith('[pegar=') && LINEA_UTIL.test(l)).slice(-cuantas);
}

function picoMicrofono(): string {
  if (!existsSync('/mnt/wslg/PulseServer')) return 'sin PulseAudio de WSLg (no se mide)';
  // volumedetect escribe por stderr; spawnSync lo recoge tanto si ffmpeg sale con 0 como si no.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-f', 'pulse', '-i', 'default', '-t', '2', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', timeout: 8_000, env: { ...process.env, PULSE_SERVER: process.env['PULSE_SERVER'] ?? 'unix:/mnt/wslg/PulseServer' } });
  const m = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(r.stderr ?? '');
  return m ? `pico ${m[1]} dBFS en 2 s sin hablar (al hablar, sano entre -20 y -6)` : 'no se pudo abrir el microfono';
}

async function saludDemonio(): Promise<string> {
  const puerto = process.env['DICTADO_DEMONIO_PUERTO'] ?? '47125';
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}/health`, { signal: AbortSignal.timeout(800) });
    return r.ok ? `vivo en 127.0.0.1:${puerto}` : `responde ${r.status}`;
  } catch {
    return `parado (npm run demonio lo levanta; sin el, cada frase arranca el motor)`;
  }
}

function trayectoriasRecientes(cuantas = 5): string[] {
  const corpus = process.env['DICTADO_TRAYECTORIAS'] ?? join(RAIZ, 'corpus');
  if (!existsSync(corpus)) return [];
  return readdirSync(corpus)
    .filter((n) => n.startsWith('salida-dictar-'))
    .sort()
    .slice(-cuantas)
    .map((n) => {
      try {
        const t = JSON.parse(readFileSync(join(corpus, n, 'trayectoria.json'), 'utf8')) as { id: string; cuando: { inicio: string }; resultado: { metricas: Record<string, number | null> }; acciones: { herramientas: Record<string, number> } };
        const m = t.resultado.metricas;
        return `${t.cuando.inicio.slice(0, 16).replace('T', ' ')} · ${t.acciones.herramientas['turnos'] ?? 0} turnos · latencia p50 ${m['latenciaP50Ms'] ?? '—'} ms · pico ${m['picoDbMax'] ?? '—'} dBFS`;
      } catch {
        return `${n}: ilegible`;
      }
    });
}

export async function ordenDiagnostico(config: Configuracion, opciones: Record<string, string | boolean>): Promise<void> {
  const version = (JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { version: string }).version;
  const runtime = config.runtime ?? join(config.datos, 'runtime');
  const lineas: string[] = [];
  lineas.push(`dictado ${version} · Node ${process.versions.node} · ${process.platform}${process.env['WSL_DISTRO_NAME'] ? ` · WSL ${process.env['WSL_DISTRO_NAME']}` : ''}`);
  lineas.push('piezas:');
  for (const p of NECESARIOS) lineas.push(`  ${existsSync(rutaDe(config.modelos, p)) ? '✓' : '✗'} ${p.que}`);
  for (const [n, v] of Object.entries(RUNTIMES)) lineas.push(`  ${existsSync(join(runtime, 'node_modules', n)) ? '✓' : '✗'} ${n}@${v}`);
  let ffmpeg = false;
  try {
    execFileSync('which', ['ffmpeg'], { stdio: 'ignore' });
    ffmpeg = true;
  } catch {
    /* no */
  }
  lineas.push(`  ${ffmpeg ? '✓' : '✗'} ffmpeg`);
  lineas.push(`  ${existsSync('/mnt/wslg/PulseServer') ? '✓' : '·'} microfono por PulseAudio de WSLg`);
  lineas.push(`  ${existsSync('/mnt/c/Windows/System32/cmd.exe') ? '✓' : '·'} Windows al alcance (icono, pegado, altavoz)`);
  lineas.push(`microfono: ${opciones['sin-microfono'] === true ? 'no medido (--sin-microfono)' : picoMicrofono()}`);
  lineas.push(`demonio de transcripcion: ${await saludDemonio()}`);
  const banco = join(RAIZ, 'medicion', 'banco');
  for (const [nombre, ruta] of [['en-vivo', join(banco, 'en-vivo.log')], ['demonio', join(banco, 'demonio.log')]] as const) {
    const ultimas = lineasUtilesDelLog(ruta, 8);
    if (ultimas.length > 0) lineas.push(`log ${nombre} (ultimas lineas de estado, sin texto dictado):`, ...ultimas.map((l) => '  ' + l));
  }
  const tr = trayectoriasRecientes();
  if (tr.length > 0) lineas.push('ultimas sesiones (trayectorias, solo forma):', ...tr.map((l) => '  ' + l));
  lineas.push(`datos en ${config.datos} · modelos en ${config.modelos}`);
  const texto = limpiaParaCompartir(lineas.join('\n'));
  if (opciones['json'] === true) console.log(JSON.stringify({ version, lineas: texto.split('\n') }, null, 1));
  else console.log(texto);
}
