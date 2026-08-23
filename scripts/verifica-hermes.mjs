#!/usr/bin/env node
/**
 * Vigilante del pineo de la imagen de Hermes — capa A del SDD.
 *
 * Diseno completo: docs/SDD-hermes-verificacion.md. Los tres principios que atraviesan
 * este archivo, por si alguien lo edita sin leer el SDD:
 *
 *   1. NUNCA cambia nada. Detecta deriva y prepara la decision. Actualizar el tag es un
 *      CDC completo (C1): diff, regresion, aprobacion y firma. Un job que actualizara
 *      solo seria el anti-patron que C1 existe para impedir, automatizado y por tanto peor.
 *   2. Sin LLM y sin credenciales. Compara, no razona; consulta un registro publico, no
 *      toca `.env`. Lo que no lee, no lo puede filtrar.
 *   3. Falla ruidosa. Sin red, con la API cambiada o con el repositorio caido devuelve
 *      exit 2 — "no pude verificar" —, que NO es exit 0. El modo de falla que esta capa ha
 *      sufrido tres veces es un control que parece funcionar y no mide nada.
 *
 * Exit 0 = sin novedades (silencio) · 1 = deriva o rojo (informe) · 2 = no pude verificar.
 *
 * Control negativo (obligatorio, §7 del SDD):
 *   node scripts/verifica-hermes.mjs --tag=v0000.0.0    -> rojo (exit 1)
 *   node scripts/verifica-hermes.mjs --api=https://127.0.0.1:9  -> exit 2, nunca 0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);

const RUNBOOK = 'docs/FASE0-INFRAESTRUCTURA.md';
const BASELINE = '.hermes-baseline.json';
const ESTADO = '.hermes-estado.json'; // runtime, no versionado
const INFORME = 'hermes-informe.md'; // runtime, no versionado
const DIAS_ANTIGUEDAD = 90; // §5: aviso de antiguedad del pineo
const DIAS_HEARTBEAT = 10; // §7: un vigilante mudo es indistinguible de uno muerto

const arg = (nombre, pordefecto) => {
  const p = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return p ? p.slice(nombre.length + 3) : pordefecto;
};
const API = arg('api', 'https://hub.docker.com/v2');

/** Todo lo que no se pueda afirmar sale por aqui: exit 2, nunca verde. */
class NoVerificable extends Error {}

async function pide(url) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new NoVerificable(`sin respuesta de ${url}: ${e.message}`);
  }
  if (r.status === 404) return { status: 404, cuerpo: null };
  if (!r.ok) throw new NoVerificable(`HTTP ${r.status} en ${url}`);
  try {
    return { status: 200, cuerpo: await r.json() };
  } catch {
    throw new NoVerificable(`respuesta no-JSON en ${url}: la API pudo cambiar`);
  }
}

// --- Entradas: el tag se lee del compose del runbook, NO se lleva escrito -----
// Un control anclado en una copia del dato se desincroniza del dato. Si el compose
// cambia, este script sigue al compose (§7 del SDD).
function imagenDelRunbook() {
  const texto = existsSync(ruta(RUNBOOK)) ? readFileSync(ruta(RUNBOOK), 'utf8') : null;
  if (texto === null) throw new NoVerificable(`no existe ${RUNBOOK}: no hay de donde leer el pineo`);
  const m = texto.match(/^\s*image:\s*([a-z0-9._\-/]+):([A-Za-z0-9._-]+)/m);
  if (!m) throw new NoVerificable(`no encuentro la linea "image:" en ${RUNBOOK}`);
  return { imagen: m[1], tag: m[2] };
}

const leeJson = (p) => (existsSync(ruta(p)) ? JSON.parse(readFileSync(ruta(p), 'utf8')) : null);
const dias = (desde, hasta = Date.now()) => Math.floor((hasta - new Date(desde).getTime()) / 86400000);

async function main() {
  const compose = imagenDelRunbook();
  const imagen = arg('imagen', compose.imagen);
  const tag = arg('tag', compose.tag);
  // Los overrides existen SOLO para el control negativo. Una corrida asi no puede tocar la
  // marca de exito ni la lista de releases avisadas: dejaria al vigilante creyendo que ya
  // aviso de cosas que nunca miro, y la siguiente corrida real se callaria.
  const esControlNegativo = imagen !== compose.imagen || tag !== compose.tag;
  const baseline = leeJson(BASELINE);
  if (!baseline) throw new NoVerificable(`falta ${BASELINE}: sin ancla no hay nada contra que comparar`);

  const estado = leeJson(ESTADO) ?? {};
  const hoy = new Date().toISOString().slice(0, 10);
  const rojos = [];
  const avisos = [];
  let incidente = null;

  // --- A1. El repositorio responde ------------------------------------------
  const repo = await pide(`${API}/repositories/${imagen}/`);
  if (repo.status === 404) {
    // Se corta aqui a proposito: "el repositorio no existe" es una DETERMINACION (rojo),
    // no un fallo al determinar (exit 2). Seguir preguntando por tags de un repositorio
    // inexistente solo produciria 404 en cadena y acabaria degradando el rojo a un
    // "no pude verificar" — que es exactamente el fallo que este script existe para no tener.
    rojos.push(`A1 · el repositorio \`${imagen}\` no existe en el registro. O lo retiraron, o ` +
      'el nombre del compose esta mal escrito (typosquatting, O5).');
    const informeA1 = [
      `# Vigilancia del pineo de Hermes — ${hoy}`,
      '',
      `Imagen: \`${imagen}:${tag}\` (leida de ${RUNBOOK})`,
      '',
      '## Rojo',
      '',
      ...rojos.map((r) => `- ${r}`),
      '',
      '> Este informe **propone**; no aplica nada.',
      '',
    ].join('\n');
    writeFileSync(ruta(INFORME), informeA1);
    console.log(informeA1);
    return 1;
  }

  // --- A2/A3. El tag pineado sigue publicado, y con el mismo digest ----------
  const t = await pide(`${API}/repositories/${imagen}/tags/${tag}`);
  if (t.status === 404) {
    rojos.push(`A2 · el tag pineado \`${tag}\` ya no esta publicado. Un servidor nuevo fallaria ` +
      'en el `docker compose up`. El digest anterior sigue siendo descargable: fijar por digest.');
  } else {
    const digest = t.cuerpo?.digest;
    if (typeof digest !== 'string') throw new NoVerificable('la respuesta del tag no trae digest: la API cambio');
    if (baseline.digest && digest !== baseline.digest) {
      incidente =
        `A3 · **el digest del tag pineado cambio**. Alguien re-publico sobre un nombre que este ` +
        `proyecto trata como fijo.\n` +
        `  esperado: ${baseline.digest}\n  actual:   ${digest}\n` +
        '  Esto NO es deriva: es cadena de suministro (O5). Procedimiento de incidente ' +
        '(`.claude/gobernanza/plantillas/incidente.md`) y entrada en INCIDENTES.md.\n' +
        '  NO se actualiza para "arreglarlo": se contiene fijando el compose al digest anterior.';
      rojos.push(incidente);
    }
  }

  // --- A4. Cuantas releases hay mas nuevas (informa, no falla) ---------------
  const listado = await pide(`${API}/repositories/${imagen}/tags?page_size=100&ordering=last_updated`);
  if (listado.status === 404 || !Array.isArray(listado.cuerpo?.results)) {
    throw new NoVerificable('no pude listar los tags: la API cambio o el repositorio desaparecio');
  }
  const MOVIL = /^(latest|main|edge|nightly)$/;
  const versiones = listado.cuerpo.results.filter((x) => !MOVIL.test(x.name) && x.tag_last_pushed);
  const pineado = versiones.find((x) => x.name === tag);
  const masNuevas = pineado
    ? versiones.filter((x) => new Date(x.tag_last_pushed) > new Date(pineado.tag_last_pushed))
    : [];
  const nombresNuevos = masNuevas.map((x) => x.name);

  // --- A5. `latest`/`main` siguen siendo moviles (control positivo) ----------
  const moviles = listado.cuerpo.results.filter((x) => MOVIL.test(x.name));
  const movilesQueSeMueven = moviles.filter((x) => x.digest && x.digest !== baseline.digest);
  const a5 = moviles.length === 0
    ? 'A5 · no hay tags moviles publicados ahora mismo.'
    : `A5 · ${movilesQueSeMueven.length}/${moviles.length} tags moviles apuntan a algo distinto del ` +
      'pineo: el anti-patron de `latest` sigue siendo real.';

  // --- §5. Se reporta el CAMBIO, no el estado -------------------------------
  // Un informe semanal que repite "13 releases por detras" deja de leerse a la tercera.
  // Eso es O3, y es el modo de falla mas probable de este mecanismo.
  const yaAvisadas = new Set(estado.releasesAvisadas ?? []);
  const sinAvisar = nombresNuevos.filter((n) => !yaAvisadas.has(n));
  if (sinAvisar.length > 0) {
    avisos.push(`Hay ${sinAvisar.length} release(s) nueva(s) sin avisar (${nombresNuevos.length} por ` +
      `delante del pineo en total): ${sinAvisar.join(', ')}.\n` +
      `  Notas: https://hub.docker.com/r/${imagen}/tags\n` +
      '  Estar al dia no es un objetivo: el rezago es deuda cuando nadie decide, no cuando el ' +
      'numero crece. Adoptar una release es un CDC (C1) y pide capa B antes de firmar.');
  }

  const edad = pineado ? dias(pineado.tag_last_pushed) : null;
  const avisadaAntiguedad = estado.antiguedadAvisadaPara === tag;
  if (edad !== null && edad >= DIAS_ANTIGUEDAD && !avisadaAntiguedad) {
    avisos.push(`El pineo \`${tag}\` cumple ${edad} dias. Aviso de antiguedad (una sola vez por tag).`);
  }

  // --- §7. Heartbeat: un vigilante mudo parece uno muerto --------------------
  if (estado.ultimoExito && dias(estado.ultimoExito) > DIAS_HEARTBEAT) {
    avisos.push(`El vigilante llevaba ${dias(estado.ultimoExito)} dias sin correr (marca de exito del ` +
      `${estado.ultimoExito}). El silencio solo significa "todo igual" si el job corre.`);
  }

  // --- Salida ---------------------------------------------------------------
  const hayNovedad = rojos.length > 0 || avisos.length > 0;
  const nuevoEstado = {
    ultimoExito: hoy,
    tagVigilado: tag,
    releasesAvisadas: nombresNuevos,
    antiguedadAvisadaPara: edad !== null && edad >= DIAS_ANTIGUEDAD ? tag : estado.antiguedadAvisadaPara ?? null,
    ultimoInforme: hayNovedad ? hoy : estado.ultimoInforme ?? null,
  };
  if (!esControlNegativo) writeFileSync(ruta(ESTADO), `${JSON.stringify(nuevoEstado, null, 2)}\n`);
  else console.log('(control negativo: no se toca la marca de exito ni las releases avisadas)');

  if (!hayNovedad) {
    console.log(`✓ sin novedades: \`${imagen}:${tag}\` intacto, ${nombresNuevos.length} release(s) por ` +
      'delante ya avisadas. El silencio es la senal.');
    console.log(`  ${a5}`);
    return 0;
  }

  const informe = [
    `# Vigilancia del pineo de Hermes — ${hoy}`,
    '',
    `Imagen: \`${imagen}:${tag}\` (leida de ${RUNBOOK})`,
    `Ancla: \`${baseline.digest ?? 'sin digest en el baseline'}\` (verificado ${baseline.verificado ?? '?'})`,
    '',
    ...(rojos.length ? ['## Rojo', '', ...rojos.map((r) => `- ${r}`), ''] : []),
    ...(avisos.length ? ['## Avisos', '', ...avisos.map((a) => `- ${a}`), ''] : []),
    `## Control positivo`,
    '',
    `- ${a5}`,
    '',
    '> Este informe **propone**; no aplica nada. Mover el pineo es un CDC (C1) con capa B,',
    '> aprobacion humana y entrada firmada en `.claude/gobernanza/BITACORA-CDC.md`.',
    '',
  ].join('\n');
  writeFileSync(ruta(INFORME), informe);
  console.log(informe);
  console.log(`(informe escrito en ${INFORME})`);
  return 1;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    if (e instanceof NoVerificable) {
      console.error(`✗ NO PUDE VERIFICAR: ${e.message}`);
      console.error('  Exit 2 a proposito: ausencia de respuesta NO es ausencia de deriva.');
      process.exit(2);
    }
    console.error(`✗ fallo inesperado del vigilante: ${e?.stack ?? e}`);
    process.exit(2);
  });
