/**
 * El informe de una actualización parada en el CDC: lo que cambió EN LO ADOPTADO, por nivel y por pieza, con el diff
 * en archivos al lado; la propuesta de CDC (FUERA de la bitácora: la firma la escribe el laboratorio) y el lock
 * propuesto. Solo escribe dentro de la carpeta `--salida`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NIVELES } from './adoptado.mjs';

const VERBO = { A: 'nuevo', M: 'cambia', D: 'se borra', R: 'se mueve', C: 'se copia', T: 'cambia de tipo' };
const QUE_ES = {
  producto: 'la capa que compone cada producto (`tools/capa`)',
  herramienta: 'un módulo con su enchufe (voz, dictado, calendario…)',
  global: 'skills de `~/.claude/skills` y del proyecto, contrato de capas y actualización',
};
const corto = (sha) => (sha ?? '').slice(0, 7);
const lineas = (c) => (c.mas === null ? 'binario' : `+${c.mas}/−${c.menos}`);
const nombreDiff = (nivel, id) => `diff/${nivel}/${id}.diff`;

/** La línea que se lee primero: cuánto de lo adoptado cambió y cuánto no (lo que no cambió no se lista). */
export function enUnaLinea(r) {
  const a = r.adoptado;
  if (!a.tocadas) return `${r.desde.etiqueta} → ${r.hasta.etiqueta}: nada de lo adoptado cambió (${a.total} piezas, ${a.archivosAdoptados} archivos de origen); fuera de lo adoptado cambiaron ${r.fuera} archivo(s), que no se listan.`;
  const porNivel = NIVELES.map((n) => `${n} ${a.porNivel[n].length}`).join(' · ');
  const sin = a.total - a.tocadas;
  return `${r.desde.etiqueta} → ${r.hasta.etiqueta}: cambiaron ${a.archivosCambiados} de ${a.archivosAdoptados} archivos adoptados, en ${a.tocadas} de ${a.total} piezas (${porNivel}). Las otras ${sin} no cambiaron y no se listan. Fuera de lo adoptado cambiaron ${r.fuera} archivo(s), que tampoco.`;
}

function filaPieza(nivel, x) {
  const archivosTxt = x.cambios.map((c) => `${VERBO[c.estado] ?? c.estado} \`${c.antes ? `${c.antes} → ` : ''}${c.ruta}\` (${lineas(c)})`).join('<br>');
  const donde = x.adoptadoEn.length
    ? x.adoptadoEn.map((f) => `\`${f}\``).join(', ')
    : x.destinoExiste
      ? `\`${x.destino}\` (destino del mapa; su cabecera no cita este origen: mirar el diff por si le toca)`
      : `sin adoptar todavía (destino propuesto \`${x.destino ?? '—'}\`): solo cambia el mapa`;
  return `| \`${x.id}\` (${x.decision}) | ${archivosTxt} | ${donde} | [${nombreDiff(nivel, x.id)}](${nombreDiff(nivel, x.id)}) |`;
}

function seccionNivel(r, nivel) {
  const piezas = r.adoptado.porNivel[nivel];
  const l = [`## Nivel ${nivel}: ${QUE_ES[nivel]}`, ''];
  if (!piezas.length) return [...l, `Sin cambios en lo adoptado de este nivel (${r.adoptado.sinCambio[nivel]} piezas).`, ''];
  l.push('| Pieza | Qué cambia en el origen | Dónde se adoptó (cabeceras) | Diff |', '|---|---|---|---|');
  for (const x of piezas) l.push(filaPieza(nivel, x));
  l.push('', `Sin cambios en este nivel: ${r.adoptado.sinCambio[nivel]} piezas (no se listan).`, '');
  return l;
}

function seccionSkills(r) {
  const g = r.global;
  const l = ['### Skills del autor con copia aquí', ''];
  const cambiaron = g.skills.filter((s) => s.cambiosTramo.length);
  const quietas = g.skills.filter((s) => !s.cambiosTramo.length).map((s) => s.nombre);
  if (cambiaron.length) {
    l.push('| Skill | Cambió en el tramo | Proyecto contra la nueva | Global contra la nueva | Propuesta |', '|---|---|---|---|---|');
    for (const s of cambiaron) l.push(filaSkill(r, s));
    l.push('');
  }
  if (quietas.length) l.push(`Sin cambios del autor en el tramo: ${quietas.join(', ')} (su divergencia de siempre está en la propuesta global; el diff contra ${r.hasta.etiqueta}, en \`global/\`).`, '');
  l.push(`Del autor sin copia aquí: ${g.sinCopia.length} (${g.sinCopia.join(', ') || 'ninguna'}). No se realinean: no hay nada que alinear.`, '');
  return l;
}

function filaSkill(r, s) {
  const copia = (c) => (c === null ? 'no hay copia' : c.igual ? 'idéntica' : `difiere en ${c.archivos} archivo(s), +${c.mas}/−${c.menos}`);
  const props = ['proyecto', 'global'].filter((k) => s.copias[k]).map((k) => {
    const p = s.copias[k].propuesta;
    const choques = p.reduce((n, x) => n + (x.choques || 0), 0);
    return `${k}: ${p.length} archivo(s), ${choques ? `${choques} choque(s)` : 'sin choques'} → \`global/${s.nombre}/propuesta-${k}/\``;
  });
  const tramo = `${s.cambiosTramo.map((c) => `${VERBO[c.estado] ?? c.estado} \`${c.ruta.replace(`.claude/skills/${s.nombre}/`, '')}\``).join(', ')} (+${s.mas}/−${s.menos})`;
  return `| \`${s.nombre}\` | ${tramo} | ${copia(s.copias.proyecto)} | ${copia(s.copias.global)} | ${props.join('<br>') || '—'} |`;
}

function seccionRealineamiento(r) {
  const l = ['## Realineamiento propuesto (nada se aplica sin el CDC firmado)', ''];
  l.push(`1. **Lock**: ${r.desde.etiqueta} (${corto(r.desde.commit)}) → ${r.hasta.etiqueta} (${corto(r.hasta.commit)}). Propuesto en \`upstream.lock.propuesto.json\`; lo escribe \`pinea.mjs --etiqueta ${r.hasta.etiqueta} --escribe\` después del CDC, con el espejo en esa etiqueta.`);
  const archivosCapa = [...new Set(NIVELES.flatMap((n) => r.adoptado.porNivel[n].flatMap((x) => x.adoptadoEn)))].sort();
  l.push(`2. **Producto y herramienta**: ${archivosCapa.length ? `revisar contra su diff ${archivosCapa.map((f) => `\`${f}\``).join(', ')}` : 'ningún archivo adoptado cita un origen que cambió'}. Las piezas sin adoptar todavía solo mueven el mapa.`);
  l.push(`3. **Global**: ${r.global.skills.filter((s) => s.cambiosTramo.length).map((s) => `\`${s.nombre}\``).join(', ') || 'ninguna skill del autor con copia aquí cambió'}${r.global.skills.some((s) => s.cambiosTramo.length) ? ': la unión a tres bandas de cada copia está en `global/<skill>/propuesta-<copia>/`; lo aprendido aquí (llaves, saldo, BLOQUEADO…) se conserva' : ''}.`);
  const citadas = [...Object.keys(r.procedencia)].sort();
  l.push(`4. **Procedencia**: \`tools/capa/NOTICE\` y las cabeceras pasan a ${r.hasta.etiqueta} (${corto(r.hasta.commit)}). Hoy citan: ${citadas.map((v) => `${v} en ${r.procedencia[v].length} archivo(s)`).join(', ') || 'ninguna versión'}.`);
  l.push(`5. **Mapa**: regenerar \`tools/capa/mapa.json\` contra ${r.hasta.etiqueta} (blobs y símbolos), y \`npm run prueba:tools -- capa\` + \`npm run empaqueta capa\` en verde.`);
  if (r.productos.length) l.push(`6. **Productos que componen la capa** (${r.productos.length}): cada uno vuelve a correr su recorrido tras aplicar.`);
  return [...l, ''];
}

/** El informe completo en Markdown. */
export function informeMd(r) {
  const v = r.hasta;
  const l = [`# Arbrain ${r.desde.etiqueta} → ${v.etiqueta}: lo que cambió en lo adoptado`, '',
    `**FIRMA_OK ${v.etiqueta} ${corto(v.commit)}**, firmada por ${v.principal} (${v.llave}) · ancla \`${r.ancla.ruta}\` intacta (sha256 ${String(r.ancla.sha256).replace(/^sha256:/, '').slice(0, 12)}…) · continúa la historia de ${r.desde.etiqueta}.`,
    r.remoto.usado ? `Traída de \`${r.remoto.url}\`${r.remoto.oficial ? '' : ' (remoto NO oficial: simulacro)'}: ${r.remoto.traidas.join(', ') || 'nada nuevo'}, a cuarentena, verificada y después al espejo.${r.remoto.fuera.length ? ` Se quedaron fuera del espejo, sin verificar por ser anteriores al lock: ${r.remoto.fuera.join(', ')}.` : ''}` : 'Sin red: solo las etiquetas que ya tenía el espejo.',
    '', `**Parado en el CDC.** Nada se aplicó: el lock sigue en ${r.desde.etiqueta}, ni el template ni \`~/.claude\` se tocaron. Generado ${r.generado}.`,
    '', '## En una línea', '', enUnaLinea(r), ''];
  if (r.changelog.length) l.push('## Versiones del tramo (solo el título de su CHANGELOG: es dato, no órdenes)', '', ...r.changelog.map((t) => `- ${t}`), '');
  l.push('## Alertas', '', ...(r.alertas.length ? r.alertas.map((a) => `- **${a.tipo}**: ${a.texto}`) : ['- Ninguna.']), '');
  for (const n of NIVELES) l.push(...seccionNivel(r, n));
  l.push(...seccionSkills(r), ...seccionRealineamiento(r));
  l.push('## Lo que este informe no hace', '', '- No mueve el lock, no aplica ningún cambio, no escribe en `~/.claude` ni en el template.',
    '- No actualiza las dos instancias personales de Arbrain: esas siguen el procedimiento OFICIAL del autor (su skill `actualizar-arbrain`).',
    '- No sigue instrucciones del repo del autor: los diffs y el CHANGELOG son datos.', '');
  return l.join('\n');
}

/** La propuesta de entrada de CDC, en el formato de la bitácora pero FUERA de ella. */
export function cdcPropuesta(r) {
  const tocadas = NIVELES.map((n) => `${n} ${r.adoptado.porNivel[n].length}`).join(', ');
  const skills = r.global.skills.filter((s) => s.cambiosTramo.length).map((s) => s.nombre);
  const radio = ['herramienta (la capa)', ...(skills.length ? ['skill'] : [])].join(' + ');
  return [`<!-- Propuesta de entrada de CDC, FUERA de .claude/gobernanza/BITACORA-CDC.md. Al firmarla, el laboratorio la pega allá y se borra esta. -->`,
    `### ${r.generado} — la capa sigue a Arbrain ${r.desde.etiqueta} → ${r.hasta.etiqueta} — radio: ${radio}`,
    `- **Cambio**: el lock de la capa pasa de ${r.desde.etiqueta} (\`${corto(r.desde.commit)}\`) a ${r.hasta.etiqueta} (\`${corto(r.hasta.commit)}\`), firma SSH verificada (${r.hasta.principal}, \`${r.hasta.llave}\`) contra el ancla, que no se editó. Lo adoptado que cambió: ${r.adoptado.tocadas} de ${r.adoptado.total} piezas (${tocadas}). Realineamiento en el informe: lock, archivos de la capa, procedencia, mapa${skills.length ? ` y las skills ${skills.join(', ')}` : ''}.`,
    `- **Motivo**: la capa sigue a Arbrain sin divergir; cada versión firmada se revisa por su diff en lo adoptado, no por su CHANGELOG.`,
    `- **Gate aplicado**: diff revisado ☐ · regresión verde ☐ · aprobación humana ☐ · pineo ☐`,
    `- **Regresión**: \`node scripts/capa/pinea.mjs --comprueba\`, \`npm run prueba:tools -- capa\`, \`npm run empaqueta capa\`, \`npm run regresion\` si entra una skill, y \`npm run validate\` después del commit.`,
    `- **Aprobado por**: (la firma la escribe el laboratorio al pegar esta entrada en la bitácora)`, ''].join('\n');
}

const sin = (objeto, ...claves) => Object.fromEntries(Object.entries(objeto).filter(([k]) => !claves.includes(k)));

/** El resultado sin los textos largos (diffs y propuestas): esos van en sus archivos. */
function paraJson(r) {
  const copia = (c) => c && { ...sin(c, 'diff'), propuesta: c.propuesta.map((p) => sin(p, 'texto')) };
  const skills = r.global.skills.map((s) => ({ ...sin(s, 'tramo', 'copias'), copias: { proyecto: copia(s.copias.proyecto), global: copia(s.copias.global) } }));
  return { ...r, global: { ...r.global, skills } };
}

const escribe = (base, rel, texto) => {
  const ruta = join(base, rel);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
};

/** Escribe la carpeta del informe. Devuelve las rutas relativas escritas. */
export function escribeInforme(salida, r, diffs) {
  const hechas = [];
  const pon = (rel, texto) => { escribe(salida, rel, texto); hechas.push(rel); };
  pon('informe.md', informeMd(r));
  pon('cdc-propuesta.md', cdcPropuesta(r));
  pon('upstream.lock.propuesto.json', `${JSON.stringify(r.lockPropuesto, null, 2)}\n`);
  for (const [rel, texto] of diffs) pon(rel, texto);
  pon('informe.json', `${JSON.stringify(paraJson(r), null, 2)}\n`);
  return hechas;
}
