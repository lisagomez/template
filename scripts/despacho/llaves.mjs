#!/usr/bin/env node
/**
 * Los secretos del Supabase autohospedado del despacho (spec 015, fase 2). Se corre UNA vez, en la
 * máquina del despacho, antes de `configura:deploy`.
 *
 * Escribe en `.env.production` (o en `ENV_PRODUCCION`) lo que falte: `DESPLIEGUE=despacho`,
 * `POSTGRES_PASSWORD`, `JWT_SECRET`, y las dos llaves firmadas con ese secreto —la anónima, que viaja
 * en el navegador, y la de servicio, que solo lee el almacenamiento—. **Nunca reescribe una que ya
 * esté**: rotar `JWT_SECRET` deja inválidas todas las sesiones y las dos llaves, y eso se decide, no
 * se hace al volver a correr un script.
 *
 * NUNCA imprime un valor: solo qué escribió y el largo.
 *
 * Exit 0 escrito o ya estaba · 1 el archivo tiene llaves sin su secreto (no se puede firmar nada).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firmaJwt } from './reglas.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENV = resolve(raiz, process.env.ENV_PRODUCCION ?? '.env.production');
const DIEZ_ANOS_S = 10 * 365 * 24 * 3600;

const texto = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
const valores = new Map();
for (const linea of texto.split('\n')) {
  const m = linea.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m) valores.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
}

const llaves = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SERVICE_ROLE_KEY'];
if (!valores.get('JWT_SECRET') && llaves.some((clave) => valores.get(clave))) {
  console.error('✗ Hay llaves de Supabase pero no JWT_SECRET: no sé con qué se firmaron. No escribo nada.');
  console.error('  Restaura el JWT_SECRET con que se firmaron, o borra las llaves para generar todo de nuevo.');
  process.exit(1);
}

const nuevas = [];
const pon = (clave, valor) => {
  if (valores.get(clave)) return;
  valores.set(clave, valor);
  nuevas.push([clave, valor]);
};
pon('DESPLIEGUE', 'despacho');
pon('POSTGRES_PASSWORD', randomBytes(24).toString('hex'));
pon('JWT_SECRET', randomBytes(48).toString('base64url'));
const ahora = Math.floor(Date.now() / 1000);
for (const [clave, rol] of [['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon'], ['SERVICE_ROLE_KEY', 'service_role']]) {
  pon(clave, firmaJwt({ role: rol, iss: 'supabase', iat: ahora, exp: ahora + DIEZ_ANOS_S }, valores.get('JWT_SECRET')));
}

if (nuevas.length === 0) {
  console.log(`Ya estaba todo en ${ENV}: no toco nada.`);
  process.exit(0);
}
const bloque = ['', '# --- Secretos del despacho (generados por scripts/despacho/llaves.mjs) ---',
  ...nuevas.map(([clave, valor]) => `${clave}=${valor}`), ''].join('\n');
writeFileSync(ENV, `${texto.replace(/\n+$/, '')}${texto ? '\n' : ''}${bloque}`, { mode: 0o600 });
for (const [clave, valor] of nuevas) console.log(`✓ ${clave} escrita (${valor.length} car.)`);
