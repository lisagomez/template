#!/usr/bin/env node
/**
 * Mide lo que cuestan EN CONTEXTO los servidores MCP declarados en `example.mcp.json`.
 *
 * Por que existe: un servidor MCP inyecta los esquemas de sus herramientas en CADA sesion,
 * se usen o no. Un CLI se paga cuando se invoca. Esa es la tercera palanca de eficiencia de
 * la fabrica —hermana del routing y del cache de prefijo— y hasta hoy nadie habia medido su
 * mitad izquierda: cuanto cuesta de verdad el lado MCP.
 *
 * El material de origen (`04-politica-cli-first.md`, Hermes OS) afirma "~100x menos tokens".
 * Es una afirmacion PELADA: sin medicion, sin metodo, sin fuente. Este script existe para
 * sustituirla por una cifra propia, o para declarar honestamente que no se pudo medir.
 *
 * NO corre en `npm run validate`: necesita red y `npx` para arrancar cada servidor, y el
 * gate tiene que seguir pasando sin red, sin Go y sin credenciales. Se corre a mano, deja
 * un artefacto fechado, y es el artefacto lo que el gate lee.
 *
 * Uso:  node scripts/mide-mcp.mjs [--timeout=60]
 * Exit: 0 medido (aunque algun servidor fallara: se declara cual y por que)
 *       2 no pude medir nada — y entonces NO se escribe artefacto: un artefacto vacio se
 *         leeria luego como "los MCP no cuestan nada", que es exactamente al reves.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);
const EJEMPLO = '.claude/example.mcp.json';
const SALIDA = '.claude/imprenta/medicion-mcp.json';
const PRESUPUESTO = '.claude/presupuesto-contexto.json';

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;

const argTimeout = process.argv.find((a) => a.startsWith('--timeout='));
const TIMEOUT_MS = (argTimeout ? Number(argTimeout.split('=')[1]) : 60) * 1000;

// --- El contador: el MISMO criterio que mide-contexto.mjs -------------------
// Si los dos midieran distinto, comparar sus cifras seria comparar dos reglas diferentes.
let cuenta;
let metodo;
try {
  const { encode } = await import('gpt-tokenizer/esm/encoding/o200k_base');
  cuenta = (texto) => encode(texto).length;
  metodo = 'BPE real (o200k_base, `gpt-tokenizer` presente)';
} catch {
  let ratio = 3.644;
  try {
    ratio = JSON.parse(readFileSync(ruta(PRESUPUESTO), 'utf8')).calibracion?.ratio_chars_por_token ?? ratio;
  } catch { /* se queda el ratio por defecto, y el metodo lo dice */ }
  cuenta = (texto) => Math.round(texto.length / ratio);
  metodo = `estimado: chars / ${ratio} (calibrado en ${PRESUPUESTO})`;
}

if (!existsSync(ruta(EJEMPLO))) {
  console.error(rojo(`✗ NO PUDE MEDIR: falta ${EJEMPLO}`));
  process.exit(2);
}
let servidores;
try {
  servidores = JSON.parse(readFileSync(ruta(EJEMPLO), 'utf8')).mcpServers ?? {};
} catch (e) {
  console.error(rojo(`✗ NO PUDE MEDIR: ${EJEMPLO} no es JSON valido (${e.message})`));
  process.exit(2);
}

/**
 * Arranca un servidor MCP por stdio, hace el handshake y pide `tools/list`.
 * Devuelve {tokens, herramientas} o {error} — nunca lanza: un servidor que no arranca es
 * un dato ("no se pudo medir, por esto"), no el final de la corrida.
 */
function midaServidor(nombre, cfg) {
  return new Promise((resolver) => {
    if (!cfg?.command) return resolver({ error: 'sin `command` en la configuracion' });
    // Placeholders del espejo: arrancarlo pediria credenciales que no tenemos y que no
    // debemos tener. Se declara, no se intenta.
    const texto = JSON.stringify(cfg);
    if (/YOUR_[A-Z_]+/.test(texto)) {
      return resolver({ error: 'requiere credenciales (placeholders en el espejo): no se mide sin ellas' });
    }
    let hijo;
    try {
      hijo = spawn(cfg.command, cfg.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(cfg.env ?? {}) },
      });
    } catch (e) {
      return resolver({ error: `no arranco: ${e.message}` });
    }

    let buffer = '';
    let listo = false;
    const cerrar = (resultado) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      try { hijo.kill('SIGKILL'); } catch { /* ya murio */ }
      resolver(resultado);
    };
    const reloj = setTimeout(() => cerrar({ error: `timeout de ${TIMEOUT_MS / 1000}s` }), TIMEOUT_MS);

    const enviar = (obj) => {
      try { hijo.stdin.write(JSON.stringify(obj) + '\n'); } catch { /* el cierre lo maneja */ }
    };

    hijo.stdout.on('data', (trozo) => {
      buffer += trozo.toString();
      let corte;
      while ((corte = buffer.indexOf('\n')) !== -1) {
        const linea = buffer.slice(0, corte).trim();
        buffer = buffer.slice(corte + 1);
        if (!linea) continue;
        let msg;
        try { msg = JSON.parse(linea); } catch { continue; }
        if (msg.id === 1 && msg.result) {
          enviar({ jsonrpc: '2.0', method: 'notifications/initialized' });
          enviar({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        }
        if (msg.id === 2) {
          if (msg.error) return cerrar({ error: `tools/list fallo: ${msg.error.message ?? 'sin mensaje'}` });
          const herramientas = msg.result?.tools ?? [];
          // Se cuenta el JSON de los esquemas: es lo que el arnes serializa al contexto.
          // No es el formato exacto de cada proveedor, y el artefacto lo dice.
          return cerrar({
            tokens: cuenta(JSON.stringify(herramientas)),
            herramientas: herramientas.length,
          });
        }
      }
    });
    hijo.on('error', (e) => cerrar({ error: `no arranco: ${e.message}` }));
    hijo.on('exit', (codigo) => cerrar({ error: `el proceso salio con codigo ${codigo} antes de responder` }));

    enviar({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mide-mcp', version: '1.0.0' },
      },
    });
  });
}

console.log(`Medicion de servidores MCP — ${Object.keys(servidores).filter((k) => !k.startsWith('_')).length} declarados en ${EJEMPLO}`);
console.log(gris(`Metodo: ${metodo}`));
console.log(gris(`Timeout por servidor: ${TIMEOUT_MS / 1000}s\n`));

const medidos = {};
const noMedidos = {};
for (const [nombre, cfg] of Object.entries(servidores)) {
  if (nombre.startsWith('_')) continue; // los "_comment_*" del espejo no son servidores
  process.stdout.write(`  ${nombre.padEnd(22)} `);
  const r = await midaServidor(nombre, cfg);
  if (r.error) {
    noMedidos[nombre] = r.error;
    console.log(ambar(`no medido — ${r.error}`));
  } else {
    medidos[nombre] = r;
    console.log(verde(`${String(r.tokens).padStart(6)} tokens`) + gris(`  ${r.herramientas} herramientas`));
  }
}

const total = Object.values(medidos).reduce((a, r) => a + r.tokens, 0);
const nMedidos = Object.keys(medidos).length;
const nNo = Object.keys(noMedidos).length;

if (nMedidos === 0) {
  console.error(rojo('\n✗ NO PUDE MEDIR NINGUN SERVIDOR.'));
  console.error('  No se escribe artefacto: un artefacto vacio se leeria despues como "los MCP');
  console.error('  no cuestan nada", que es exactamente lo contrario de lo que sabemos.');
  process.exit(2);
}

console.log(`\n  ${'TOTAL medido'.padEnd(22)} ${verde(String(total).padStart(6) + ' tokens')} en ${nMedidos} servidor(es)`);
if (nNo > 0) {
  console.log(ambar(`  ${nNo} servidor(es) sin medir: el total real es MAYOR que esta cifra.`));
}

const artefacto = {
  _nota: 'Generado por scripts/mide-mcp.mjs. Es la mitad IZQUIERDA de la comparacion MCP vs CLI: '
    + 'lo que cuesta tener el servidor cargado, se use o no. La mitad derecha (el coste de invocar '
    + 'un CLI) depende de cuantas veces el agente relea su --help, asi que no es un numero unico. '
    + 'Comparar ambas cifras sin declarar esto favorece a quien le caiga mejor a quien compara.',
  generado: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  metodo,
  advertencia_de_alcance: 'Se cuentan los tokens del JSON de `tools/list`. El arnes puede serializar '
    + 'los esquemas con otro envoltorio, asi que la cifra sirve para COMPARAR y CONTROLAR CRECIMIENTO, '
    + 'no para facturar.',
  total_medido: total,
  servidores_medidos: nMedidos,
  servidores_no_medidos: nNo,
  el_total_real_es_mayor: nNo > 0,
  medidos,
  no_medidos: noMedidos,
};

const dir = ruta(dirname(SALIDA));
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(ruta(SALIDA), JSON.stringify(artefacto, null, 2) + '\n', 'utf8');
console.log(gris(`\nArtefacto -> ${SALIDA}`));
