#!/usr/bin/env node
/**
 * Red privada simulada, a la manera de Tailscale con su relevo DERP: los nodos SALEN hacia un relevo y nadie
 * escucha en las instancias. Tres papeles en un archivo, sin dependencias:
 *
 *   relevo                     (contenedor «red») el ÚNICO que escucha, en la red interna de Docker.
 *   agente                     (contenedor «vps») sale hacia el relevo, se registra como nodo y, por cada flujo que
 *                              le llega, ejecuta SOLO `git upload-pack` o `git receive-pack` del repo del centro
 *                              (ruta fija, nunca la que pida el otro lado). No abre ningún puerto.
 *   conecta <nodo> <servicio>  (contenedor «local») el comando del transporte `ext::` de git: sale hacia el relevo,
 *                              pide un flujo hacia <nodo> y conecta su stdin/stdout con el del agente.
 *
 * El remoto del job en la instancia local:  ext::node /opt/cerebro-sync/tunel.mjs conecta vps %S
 *
 * Cada conexión empieza con una línea JSON de cabecera (con el token de la red) y después son bytes crudos. El relevo
 * no guarda nada y no interpreta lo que pasa. En la realidad esto es WireGuard (llaves por nodo y ACL de Tailscale):
 * aquí el token compartido solo evita que la red interna sea una puerta abierta, y los bytes van sin cifrar.
 */
import { spawn } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';

const RED_HOST = process.env.CEREBRO_RED_HOST ?? 'red';
const RED_PUERTO = Number(process.env.CEREBRO_RED_PUERTO ?? 7443);
const ARCHIVO_TOKEN = process.env.CEREBRO_RED_TOKEN ?? '/run/secrets/red_token';
const NODO = process.env.CEREBRO_LADO ?? 'local';
const CENTRO = process.env.CEREBRO_CENTRO_DIR ?? '/srv/cerebro/centro.git';
const SERVICIOS = new Map([['git-upload-pack', 'upload-pack'], ['git-receive-pack', 'receive-pack']]);
const NOMBRE = /^[a-z0-9-]{1,32}$/;

const log = (m) => process.stderr.write(`[tunel ${NODO} ${new Date().toISOString()}] ${m}\n`);
const token = () => (existsSync(ARCHIVO_TOKEN) ? readFileSync(ARCHIVO_TOKEN, 'utf8').trim() : '');
const tokenValido = (dado) => {
  const a = Buffer.from(String(dado ?? '')), b = Buffer.from(token());
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
};

/** Lee la primera línea (cabecera JSON) de un socket; entrega el objeto y lo que llegó detrás. */
function cabecera(socket, alLeer) {
  let acumulado = Buffer.alloc(0);
  const alDato = (parte) => {
    acumulado = Buffer.concat([acumulado, parte]);
    const i = acumulado.indexOf(10);
    if (i < 0) {
      if (acumulado.length > 8192) socket.destroy();
      return;
    }
    socket.off('data', alDato);
    socket.pause();
    let obj = null;
    try { obj = JSON.parse(acumulado.subarray(0, i).toString('utf8')); } catch { /* cabecera ilegible */ }
    alLeer(obj, acumulado.subarray(i + 1));
  };
  socket.on('data', alDato);
}

const linea = (obj) => `${JSON.stringify(obj)}\n`;

function relevo() {
  if (!token()) { log(`no hay token en ${ARCHIVO_TOKEN}: el relevo no arranca sin él`); process.exit(78); }
  const nodos = new Map();
  const pendientes = new Map();
  const servidor = net.createServer({ allowHalfOpen: true }, (s) => {
    s.on('error', () => s.destroy());
    s.setTimeout(15_000, () => { if (!s.unido) s.destroy(); });
    cabecera(s, (cab, resto) => {
      const rechaza = (motivo) => { log(`rechazo (${motivo})`); s.end(linea({ ok: false, error: motivo })); };
      if (!cab || cab.v !== 1) return rechaza('cabecera ilegible');
      if (!tokenValido(cab.token)) return rechaza('token de la red no válido');
      if (cab.rol === 'escucha' && NOMBRE.test(cab.nodo ?? '')) {
        nodos.get(cab.nodo)?.destroy();
        nodos.set(cab.nodo, s);
        s.unido = true;
        s.setTimeout(0);
        s.on('close', () => { if (nodos.get(cab.nodo) === s) nodos.delete(cab.nodo); });
        s.resume();
        log(`nodo «${cab.nodo}» conectado (sale hacia el relevo; no escucha)`);
        return;
      }
      if (cab.rol === 'conecta' && NOMBRE.test(cab.a ?? '') && SERVICIOS.has(cab.servicio)) {
        const control = nodos.get(cab.a);
        if (!control) return rechaza(`el nodo «${cab.a}» no está conectado`);
        const id = randomUUID();
        const vence = setTimeout(() => { pendientes.delete(id); rechaza('el nodo no aceptó el flujo'); }, 10_000);
        pendientes.set(id, { s, resto, vence });
        control.write(linea({ tipo: 'abre', id, servicio: cab.servicio, de: NOMBRE.test(cab.de ?? '') ? cab.de : 'desconocido', protocolo: cab.protocolo }));
        log(`flujo ${cab.de ?? '?'} → ${cab.a} (${cab.servicio})`);
        return;
      }
      if (cab.rol === 'acepta' && pendientes.has(cab.id)) {
        const p = pendientes.get(cab.id);
        pendientes.delete(cab.id);
        clearTimeout(p.vence);
        p.s.unido = true; s.unido = true;
        p.s.setTimeout(0); s.setTimeout(0);
        p.s.write(linea({ ok: true }));
        if (p.resto.length) s.write(p.resto);
        if (resto.length) p.s.write(resto);
        p.s.pipe(s); s.pipe(p.s);
        const corta = () => { p.s.destroy(); s.destroy(); };
        p.s.on('error', corta); s.on('error', corta);
        p.s.resume(); s.resume();
        return;
      }
      return rechaza('petición no válida');
    });
  });
  servidor.listen(RED_PUERTO, '0.0.0.0', () => log(`relevo escuchando en la red interna, puerto ${RED_PUERTO}`));
}

function agente() {
  if (!existsSync(CENTRO)) log(`aviso: todavía no existe el centro ${CENTRO}`);
  const abre = ({ id, servicio, de, protocolo }) => {
    const sub = SERVICIOS.get(servicio);
    if (!sub) return log(`servicio no permitido: ${servicio}`);
    const t = net.connect({ host: RED_HOST, port: RED_PUERTO, allowHalfOpen: true });
    t.on('error', (e) => log(`flujo ${id}: ${e.message}`));
    t.write(linea({ v: 1, rol: 'acepta', nodo: NODO, id, token: token() }));
    const env = { ...process.env, CEREBRO_VIA: 'tunel', CEREBRO_DE: de };
    delete env.GIT_PROTOCOL;
    if (/^version=[012]$/.test(protocolo ?? '')) env.GIT_PROTOCOL = protocolo;
    const hijo = spawn('git', [sub, CENTRO], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    t.pipe(hijo.stdin);
    hijo.stdout.pipe(t);
    hijo.stdin.on('error', () => {});
    hijo.on('exit', (c) => log(`flujo ${id} de «${de}»: git ${sub} terminó (${c})`));
  };
  const conecta = (espera = 500) => {
    const s = net.connect({ host: RED_HOST, port: RED_PUERTO, allowHalfOpen: true });
    let resto = '';
    s.on('connect', () => { s.write(linea({ v: 1, rol: 'escucha', nodo: NODO, token: token() })); log('conectado al relevo (saliente)'); espera = 500; });
    s.on('data', (d) => {
      resto += d.toString('utf8');
      let i;
      while ((i = resto.indexOf('\n')) >= 0) {
        const l = resto.slice(0, i); resto = resto.slice(i + 1);
        try { const m = JSON.parse(l); if (m.tipo === 'abre') abre(m); else if (m.ok === false) log(`el relevo rechazó: ${m.error}`); } catch { /* línea ilegible */ }
      }
    });
    s.on('error', () => {});
    s.on('close', () => setTimeout(() => conecta(Math.min(espera * 2, 10_000)), espera));
  };
  conecta();
}

function cliente(destino, servicio) {
  if (!NOMBRE.test(destino ?? '') || !SERVICIOS.has(servicio)) {
    process.stderr.write(`uso: tunel.mjs conecta <nodo> <git-upload-pack|git-receive-pack> (recibí ${destino} ${servicio})\n`);
    process.exit(64);
  }
  const s = net.connect({ host: RED_HOST, port: RED_PUERTO, allowHalfOpen: true });
  s.on('error', (e) => { process.stderr.write(`tunel: no llego al relevo (${e.message})\n`); process.exit(128); });
  s.write(linea({ v: 1, rol: 'conecta', de: NODO, a: destino, servicio, protocolo: process.env.GIT_PROTOCOL, token: token() }));
  cabecera(s, (resp, resto) => {
    if (!resp?.ok) { process.stderr.write(`tunel: ${resp?.error ?? 'el relevo no respondió'}\n`); process.exit(128); }
    if (resto.length) process.stdout.write(resto);
    process.stdin.pipe(s);
    s.pipe(process.stdout);
    s.on('end', () => process.stdout.write('', () => process.exit(0)));
    s.resume();
  });
}

const [orden, ...args] = process.argv.slice(2);
if (orden === 'relevo') relevo();
else if (orden === 'agente') agente();
else if (orden === 'conecta') cliente(args[0], args[1]);
else { process.stderr.write('uso: tunel.mjs relevo | agente | conecta <nodo> <servicio>\n'); process.exit(64); }
