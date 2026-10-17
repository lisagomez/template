/**
 * El banco para medir el DETECTOR de voz del centro de mando con ruido de sala (punto 4 de
 * `docs/goals/propuesta-cdc.md`): cinco salas reales de DEMAND, el runtime de ONNX y los pesos de Silero.
 *
 *   node scripts/centro-de-mando/banco-ruido.ts        # baja lo que falte y lo verifica; idempotente
 *
 * Vive FUERA del repo (`~/.cache/banco-ruido`, o `BANCO_RUIDO`): es audio de terceros que no se
 * redistribuye, y lo comparten todos los worktrees.
 *
 * DEMAND (Thiemann, Ito y Vincent, 2013; Zenodo 10.5281/zenodo.1227121, CC BY 4.0): ruido grabado en
 * salas reales con 16 micrófonos. Se guarda UN canal (`ch01`) de cada sala: 5 min a 16 kHz. Las salas
 * son las de un centro de mando de verdad: oficina, junta, sala de estar, cocina y cafetería.
 *
 * Todo va con huella: el zip, la md5 que publica Zenodo; el canal extraído y el modelo, una sha256
 * fijada aquí. Lo que no coincide se borra y no se usa (la regla de `tools/voz/src/node/pesos.ts`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIMES, SILERO, verificaHuella } from '../../tools/voz/dist/node/index.js';

export const BANCO = process.env['BANCO_RUIDO'] ?? join(homedir(), '.cache', 'banco-ruido');

interface Sala {
  sala: string;
  que: string;
  /** La que publica Zenodo para el zip. */
  md5: string;
  /** La del `ch01.wav` extraído, fijada al bajarlo la primera vez (2026-10-16). */
  sha256: string;
}

export const SALAS: readonly Sala[] = [
  { sala: 'OOFFICE', que: 'oficina', md5: '7b61cc2d182d5a654cb9c3101ddd4041', sha256: 'sha256:a831879b26e15732ed511a8d3bf72e23aa1689383aac6c5ba76bcaaa528bc2f2' },
  { sala: 'OMEETING', que: 'sala de juntas', md5: '62f7cfe7fe6d30b7d8a215fe37c2dfd2', sha256: 'sha256:f10223b276fdb1efe9fe9e1795a1fe15cde54d74ddbd9b69563fa3e322dfe630' },
  { sala: 'DLIVING', que: 'sala de estar', md5: '46741384d9e434a0bd8b3ec1830b6052', sha256: 'sha256:9567ff039c040359534075d575b469b587b1e3858ef48a93acd3ecba95f57210' },
  { sala: 'DKITCHEN', que: 'cocina', md5: '7ffbf52d7f4699f96927846103dc8788', sha256: 'sha256:94eda18f9461348d1d070ca69d001e7fa9e51604731509026b4905d2e321561d' },
  { sala: 'PCAFETER', que: 'cafetería', md5: '99927d148128254141a9417d051510bb', sha256: 'sha256:854dd0e5ef334a66abdd02d6d2b3e9d01b685df033d0acd1cd06e471c062550b' },
];

const urlSala = (s: Sala) => `https://zenodo.org/api/records/1227121/files/${s.sala}_16k.zip/content`;
const md5De = (ruta: string) => createHash('md5').update(readFileSync(ruta)).digest('hex');

export interface Banco {
  salas: Record<string, string>;
  silero: string;
  /** El `index.js` de `onnxruntime-node`, para importarlo. */
  ort: string;
}

function bajaSala(s: Sala, destino: string): void {
  const descargas = join(BANCO, 'descargas');
  mkdirSync(descargas, { recursive: true });
  const zip = join(descargas, `${s.sala}_16k.zip`);
  if (!existsSync(zip) || md5De(zip) !== s.md5) {
    console.log(`  bajando ${s.sala} (${s.que}), ~100 MB`);
    execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '900', '-o', zip, urlSala(s)], { stdio: 'inherit' });
    if (md5De(zip) !== s.md5) {
      rmSync(zip, { force: true });
      throw new Error(`la md5 de ${s.sala} no coincide con la de Zenodo: se borró`);
    }
  }
  // `unzip -p` saca UN miembro a la salida estándar: ninguna ruta del zip toca el disco.
  const temporal = `${destino}.parcial`;
  writeFileSync(temporal, execFileSync('unzip', ['-p', zip, `${s.sala}/ch01.wav`], { maxBuffer: 64 * 1024 * 1024 }));
  verificaHuella(temporal, s.sha256);
  renameSync(temporal, destino);
  rmSync(zip, { force: true });
}

function aseguraOrt(): string {
  const version = RUNTIMES['onnxruntime-node'];
  if (!version) throw new Error('voz no declara la versión de onnxruntime-node');
  const pkg = join(BANCO, 'node_modules', 'onnxruntime-node', 'package.json');
  const instalada = existsSync(pkg) ? (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version : undefined;
  if (instalada !== version) {
    if (!existsSync(join(BANCO, 'package.json'))) writeFileSync(join(BANCO, 'package.json'), JSON.stringify({ name: 'banco-ruido', private: true, type: 'module' }));
    console.log(`  instalando onnxruntime-node@${version} (el pineado de voz)`);
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--save-exact', `onnxruntime-node@${version}`], { cwd: BANCO, stdio: 'inherit' });
  }
  return join(BANCO, 'node_modules', 'onnxruntime-node', 'dist', 'index.js');
}

function aseguraSilero(): string {
  const ruta = join(BANCO, 'modelos', SILERO.archivo);
  if (existsSync(ruta)) {
    verificaHuella(ruta, SILERO.sha256);
    return ruta;
  }
  mkdirSync(dirname(ruta), { recursive: true });
  console.log(`  bajando ${SILERO.que} (~${SILERO.mb} MB)`);
  execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '120', '-o', ruta, SILERO.url], { stdio: 'inherit' });
  verificaHuella(ruta, SILERO.sha256);
  return ruta;
}

/** `soloSalas`: las que se van a usar (por defecto, todas). */
export function aseguraBanco(soloSalas: readonly string[] = SALAS.map((s) => s.sala)): Banco {
  mkdirSync(join(BANCO, 'demand'), { recursive: true });
  const salas: Record<string, string> = {};
  for (const s of SALAS.filter((x) => soloSalas.includes(x.sala))) {
    const ruta = join(BANCO, 'demand', `${s.sala}.wav`);
    if (existsSync(ruta)) verificaHuella(ruta, s.sha256);
    else bajaSala(s, ruta);
    salas[s.sala] = ruta;
  }
  return { salas, silero: aseguraSilero(), ort: aseguraOrt() };
}

/**
 * El banco de `tools/dictado` (no se versiona): FLEURS es_419 (CC BY 4.0), las voces Piper y su runtime de
 * sherpa. Se busca en este árbol y, si no, en la copia principal (un worktree no lo tiene). `BANCO_DICTADO`
 * lo fija a mano.
 */
export function bancoDictado(): string {
  if (process.env['BANCO_DICTADO']) return process.env['BANCO_DICTADO'];
  const relativa = join('tools', 'dictado', 'medicion', 'banco');
  const aqui = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  if (existsSync(join(aqui, relativa, 'corpus', 'fleurs'))) return join(aqui, relativa);
  const comun = execFileSync('git', ['-C', aqui, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  const principal = join(dirname(comun), relativa);
  if (!existsSync(join(principal, 'corpus', 'fleurs'))) throw new Error(`no encuentro el banco de dictado (${relativa}): fíjalo con BANCO_DICTADO o córrelo en tools/dictado`);
  return principal;
}

/** Las 150 frases de FLEURS es_419 en el orden del manifiesto: las 100 primeras son voz de prueba, las 50 últimas el murmullo. */
export function rutasFleurs(): string[] {
  const carpeta = join(bancoDictado(), 'corpus', 'fleurs');
  const manifiesto = JSON.parse(readFileSync(join(carpeta, 'manifiesto.json'), 'utf8')) as { archivo: string }[];
  return manifiesto.map((m) => join(carpeta, basename(m.archivo)));
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  const b = aseguraBanco();
  console.log(`banco listo en ${BANCO}: ${Object.keys(b.salas).length} salas, Silero y onnxruntime-node`);
}
