#!/usr/bin/env node
/**
 * Validador propio de la puerta de Cloudflare del VPS: `cloudflared tunnel ingress validate` comprueba que las
 * reglas se entienden, pero no que cada una exija Access. Este sí, sin conexión y sin dependencias.
 *
 * Exige, regla por regla:
 *   - cada regla que lleva a un servicio: `originRequest.access.required: true`, `teamName` y al menos un `audTag`;
 *   - servicios solo de 127.0.0.1 (http o https), con hostname explícito y sin comodines;
 *   - la última regla: `service: http_status:404` y nada más;
 *   - sin `warp-routing.enabled: true`.
 * Lee un subconjunto ESTRICTO de YAML (mapas y listas en bloque, escalares simples o entre comillas, comentarios).
 * Lo que no entiende (flujo {}, [], anclas, etiquetas, bloques | >, tabulaciones, claves repetidas) lo rechaza:
 * no se aprueba lo que no se entiende.
 *
 * Uso: node valida-access.mjs <config.yml>      Exit: 0 ACCESS_OK · 1 ACCESS_FALLA · 64 uso.
 */
import { readFileSync } from 'node:fs';

class NoLoEntiendo extends Error {}

const sinComentario = (l) => {
  let enSimple = false, enDoble = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === "'" && !enDoble) enSimple = !enSimple;
    else if (c === '"' && !enSimple && l[i - 1] !== '\\') enDoble = !enDoble;
    else if (c === '#' && !enSimple && !enDoble && (i === 0 || /\s/.test(l[i - 1]))) return l.slice(0, i).trimEnd();
  }
  return l.trimEnd();
};

function escalar(texto, n) {
  const t = texto.trim();
  if (/^["']/.test(t)) {
    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
      try { return JSON.parse(t); } catch { throw new NoLoEntiendo(`línea ${n}: cadena entre comillas dobles ilegible`); }
    }
    if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replaceAll("''", "'");
    throw new NoLoEntiendo(`línea ${n}: comillas sin cerrar`);
  }
  if (/^[[{&*!|>%@`]/.test(t) || /^(<<|\? )/.test(t)) throw new NoLoEntiendo(`línea ${n}: «${t.slice(0, 20)}» es YAML que este validador no acepta`);
  if (/^(true|false)$/.test(t)) return t === 'true';
  if (/^(null|~)?$/.test(t)) return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}

/** YAML en bloque, estricto → objeto. */
export function leeYaml(texto) {
  const lineas = [];
  texto.split('\n').forEach((crudo, i) => {
    if (/^\s*\t/.test(crudo) || crudo.includes('\t')) throw new NoLoEntiendo(`línea ${i + 1}: tabulación`);
    const l = sinComentario(crudo);
    if (!l.trim()) return;
    if (/^(---|\.\.\.)\s*$/.test(l)) throw new NoLoEntiendo(`línea ${i + 1}: varios documentos`);
    lineas.push({ n: i + 1, sangria: l.length - l.trimStart().length, texto: l.trim() });
  });
  let pos = 0;
  const clave = (t, n) => {
    const m = /^([A-Za-z0-9_.-]+|"[^"]*"|'[^']*'):(\s+(.*))?$/.exec(t);
    if (!m) throw new NoLoEntiendo(`línea ${n}: no es «clave: valor» ni «- elemento»`);
    return { k: String(escalar(m[1], n)), v: m[3] ?? '' };
  };
  const bloque = (sangria) => {
    const primera = lineas[pos];
    if (!primera || primera.sangria !== sangria) throw new NoLoEntiendo(`línea ${primera?.n ?? 'final'}: sangría inesperada`);
    return primera.texto.startsWith('- ') || primera.texto === '-' ? lista(sangria) : mapa(sangria);
  };
  const valorDe = (resto, n, sangriaPadre, admiteListaMismaSangria) => {
    if (resto.trim()) return escalar(resto, n);
    const sig = lineas[pos];
    if (sig && sig.sangria > sangriaPadre) return bloque(sig.sangria);
    if (admiteListaMismaSangria && sig && sig.sangria === sangriaPadre && sig.texto.startsWith('- ')) return lista(sangriaPadre);
    return null;
  };
  function mapa(sangria) {
    const o = {};
    while (pos < lineas.length && lineas[pos].sangria === sangria && !lineas[pos].texto.startsWith('- ')) {
      const { n, texto } = lineas[pos++];
      const { k, v } = clave(texto, n);
      if (Object.hasOwn(o, k)) throw new NoLoEntiendo(`línea ${n}: clave repetida «${k}»`);
      o[k] = valorDe(v, n, sangria, true);
    }
    return o;
  }
  function lista(sangria) {
    const a = [];
    while (pos < lineas.length && lineas[pos].sangria === sangria && (lineas[pos].texto.startsWith('- ') || lineas[pos].texto === '-')) {
      const { n, texto } = lineas[pos];
      const resto = texto === '-' ? '' : texto.slice(2);
      if (!resto.trim()) { pos++; a.push(valorDe('', n, sangria, false)); continue; }
      if (/^([A-Za-z0-9_.-]+|"[^"]*"|'[^']*'):(\s|$)/.test(resto)) {
        // «- clave: valor» abre un mapa cuya sangría es la de la clave.
        lineas[pos] = { n, sangria: sangria + 2 + (resto.length - resto.trimStart().length), texto: resto.trim() };
        a.push(mapa(lineas[pos].sangria));
        continue;
      }
      pos++;
      a.push(escalar(resto, n));
    }
    return a;
  }
  if (!lineas.length) return null;
  const raiz = bloque(lineas[0].sangria);
  if (pos !== lineas.length) throw new NoLoEntiendo(`línea ${lineas[pos].n}: sangría inesperada`);
  return raiz;
}

const esMapa = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Revisa la configuración ya leída. Devuelve { reglas: [{ n, nombre, fallos }], generales: [] }. */
export function revisa(cfg) {
  const generales = [];
  if (!esMapa(cfg)) return { reglas: [], generales: ['la configuración no es un mapa'] };
  if (cfg['warp-routing']?.enabled === true) generales.push('warp-routing está encendido: abriría la red privada por el túnel');
  const ingress = cfg.ingress;
  if (!Array.isArray(ingress) || ingress.length < 2) return { reglas: [], generales: [...generales, 'ingress necesita al menos una regla de servicio y la final http_status:404'] };
  const reglas = ingress.map((r, i) => {
    const ultima = i === ingress.length - 1;
    const nombre = esMapa(r) ? `${r.hostname ?? '(sin hostname)'}${r.path ? ` ${r.path}` : ''} → ${r.service ?? '(sin servicio)'}` : '(no es un mapa)';
    const fallos = [];
    if (!esMapa(r)) return { n: i + 1, nombre, fallos: ['la regla no es un mapa'] };
    if (ultima) {
      if (r.service !== 'http_status:404' || Object.keys(r).length !== 1) fallos.push('la última regla debe ser solo «service: http_status:404»');
      return { n: i + 1, nombre, fallos, final: true };
    }
    if (/^http_status:\d{3}$/.test(r.service ?? '')) return { n: i + 1, nombre, fallos };
    if (!/^https?:\/\/127\.0\.0\.1:\d{1,5}(\/\S*)?$/.test(r.service ?? '')) fallos.push('el servicio no es de 127.0.0.1 (http o https)');
    if (typeof r.hostname !== 'string' || !r.hostname || r.hostname.includes('*')) fallos.push('hostname explícito y sin comodines');
    const a = r.originRequest?.access;
    if (!esMapa(a)) fallos.push('sin originRequest.access: la regla no exige Access');
    else {
      if (a.required !== true) fallos.push('originRequest.access.required no es true');
      if (typeof a.teamName !== 'string' || !a.teamName.trim()) fallos.push('falta originRequest.access.teamName');
      if (!Array.isArray(a.audTag) || !a.audTag.length || !a.audTag.every((x) => typeof x === 'string' && x.trim())) fallos.push('falta originRequest.access.audTag');
    }
    return { n: i + 1, nombre, fallos };
  });
  return { reglas, generales };
}

function principal() {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: valida-access.mjs <config.yml>'); process.exit(64); }
  let cfg;
  try { cfg = leeYaml(readFileSync(ruta, 'utf8')); } catch (e) {
    console.log(`ACCESS_FALLA ${ruta}: ${e instanceof NoLoEntiendo ? e.message : `no pude leerlo (${e.message})`}`);
    process.exit(1);
  }
  const { reglas, generales } = revisa(cfg);
  for (const r of reglas) console.log(`  ${r.fallos.length ? '✗' : '✓'} regla ${r.n}: ${r.nombre}${r.final ? ' (final)' : ''}${r.fallos.length ? `\n      · ${r.fallos.join('\n      · ')}` : ''}`);
  for (const g of generales) console.log(`  ✗ ${g}`);
  const conServicio = reglas.filter((r) => !r.final && !/→ http_status:/.test(r.nombre));
  const malas = reglas.filter((r) => r.fallos.length).length + generales.length;
  if (malas) { console.log(`ACCESS_FALLA ${ruta}: ${malas} problema(s)`); process.exit(1); }
  console.log(`ACCESS_OK ${ruta}: ${conServicio.length}/${conServicio.length} regla(s) de servicio con Access obligatorio, solo 127.0.0.1, final http_status:404`);
}

if (import.meta.url === `file://${process.argv[1]}`) principal();
