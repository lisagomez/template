/**
 * El registro de artefactos generados (D-SS-9): la mitad pura de `verifica:generados`.
 *
 * Vive en `.claude/gates.json`, clave `generados`, porque es parte del padron: sacar un
 * artefacto del registro es apagar su gate, y eso es un CDC (C1), no editar un JSON.
 *
 * Que se comprueba de cada artefacto declarado:
 *   1. Sus rutas existen y estan versionadas (un generado borrado deja al gate sin testigo).
 *   2. Lleva el banner en la cabeza (o en la de su bloque): quien lo abre para editarlo lo ve.
 *   3. Coincide con su fuente: su `comprueba` lo regenera en memoria y lo compara, o lo hace un
 *      gate del perfil `validate` que ya existia (entonces se exige que ese gate siga activo).
 * Y del repo entero:
 *   4. Ningun archivo versionado lleva el banner sin estar en el registro (huerfano): un
 *      generado nuevo entra declarado o pone el gate en rojo.
 *   5. Lo que se deja `fuera` va con clase, motivo y falta, como un gate inactivo, y no lleva
 *      el banner: lo que no se comprueba no puede presentarse como comprobado.
 *   6. Ningun archivo tiene dos duenos.
 *
 * Es el patron de `GEMINI.md` (sincroniza-gemini.mjs) extendido a todo lo generado: una
 * fuente, una funcion que la proyecta, y un gate que compara.
 */

export const MARCA = 'ALTO: ARTEFACTO AUTOGENERADO';
/** Lineas de cabeza donde se busca el banner (o tras el marcador de inicio de un bloque). */
export const LINEAS_CABEZA = 5;
const LINEAS_BLOQUE = 2;

const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** El banner va en un comentario o en la clave `_ALTO` de un JSON, nunca en prosa o en codigo. */
const CON_MARCA = new RegExp(`^\\s*(?:#|//|--|<!--|"_ALTO"\\s*:\\s*")\\s*${escapa(MARCA)}`);

/** `*` no cruza `/`; `**` si. */
export const comoRegex = (glob) =>
  new RegExp('^' + glob.split('**').map((p) => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*') + '$');

const noVacio = (v) => typeof v === 'string' && v.trim().length > 0;
const listaDeTextos = (v) => Array.isArray(v) && v.length > 0 && v.every(noVacio);

/** Las lineas donde tiene que estar el banner: la cabeza del archivo, o la de su bloque. */
export function cabezaDe(texto, bloque) {
  const lineas = texto.split('\n');
  if (!bloque) return lineas.slice(0, LINEAS_CABEZA);
  const i = lineas.findIndex((l) => l.trim() === bloque);
  return i < 0 ? [] : lineas.slice(i + 1, i + 1 + LINEAS_BLOQUE);
}

export const llevaMarca = (lineas) => lineas.some((l) => CON_MARCA.test(l));

/** Valida la forma del registro, fail-closed. Devuelve los errores (vacio = bien formado). */
export function validaRegistro(registro) {
  if (!registro || !Array.isArray(registro.artefactos) || !Array.isArray(registro.fuera)) {
    return ['`generados` necesita `artefactos` y `fuera` (aunque esten vacias)'];
  }
  const errores = [];
  const vistos = new Set();
  registro.artefactos.forEach((a, i) => {
    const donde = `artefacto ${noVacio(a.nombre) ? `\`${a.nombre}\`` : `#${i + 1}`}`;
    if (!noVacio(a.nombre)) errores.push(`${donde}: sin \`nombre\``);
    else if (vistos.has(a.nombre)) errores.push(`${donde}: nombre duplicado`);
    vistos.add(a.nombre);
    if (!listaDeTextos(a.rutas)) errores.push(`${donde}: sin \`rutas\``);
    if (!listaDeTextos(a.fuentes)) errores.push(`${donde}: sin \`fuentes\` (de que se deriva)`);
    if (!noVacio(a.genera)) errores.push(`${donde}: sin \`genera\` (el comando que lo regenera)`);
    const c = a.comprueba ?? {};
    if (noVacio(c.gate) === noVacio(c.comando)) {
      errores.push(`${donde}: \`comprueba\` lleva exactamente uno de \`gate\` o \`comando\``);
    }
  });
  registro.fuera.forEach((f, i) => {
    const donde = `fuera #${i + 1}${noVacio(f.clase) ? ` (${f.clase})` : ''}`;
    for (const campo of ['clase', 'motivo', 'falta']) {
      if (!noVacio(f[campo])) errores.push(`${donde}: sin \`${campo}\` — lo que no se comprueba se dice por que`);
    }
    if (!listaDeTextos(f.rutas)) errores.push(`${donde}: sin \`rutas\``);
  });
  return errores;
}

/** Los archivos versionados que casan con alguna de las rutas (globs). */
const casan = (rutas, rastreados) => {
  const res = rutas.map(comoRegex);
  return rastreados.filter((r) => res.some((re) => re.test(r)));
};

/** Comprueba los artefactos declarados: rutas versionadas, fuentes, banner y comparacion. */
function revisaArtefactos({ registro, rastreados, lee, padron, corre }, mete) {
  const activosValidate = new Set(padron.gates.filter((g) => g.activo && g.perfiles.includes('validate')).map((g) => g.nombre));
  for (const a of registro.artefactos) {
    const archivos = casan(a.rutas, rastreados);
    const vacias = a.rutas.filter((r) => casan([r], rastreados).length === 0);
    mete(`\`${a.nombre}\`: sus rutas estan versionadas (${archivos.length} archivo(s))`, vacias.length === 0,
      `ningun archivo versionado en ${vacias.join(', ')}: se borro, se movio o nunca se agrego. Regenera con \`${a.genera}\``);
    const sinFuente = a.fuentes.filter((f) => casan([f], rastreados).length === 0);
    mete(`\`${a.nombre}\`: sus fuentes estan versionadas`, sinFuente.length === 0,
      `fuente que no esta en el repo: ${sinFuente.join(', ')} — sin fuente versionada no se puede regenerar`);
    const banner = a.banner ?? MARCA;
    const sinBanner = archivos.filter((r) => {
      const cabeza = cabezaDe(lee(r) ?? '', a.bloque);
      return a.banner ? !cabeza.some((l) => l.includes(banner)) : !llevaMarca(cabeza);
    });
    mete(`\`${a.nombre}\`: lleva el banner «${banner}»${a.bloque ? ` tras ${a.bloque}` : ''}`, sinBanner.length === 0,
      `sin banner: ${sinBanner.join(', ')} — el banner sale del generador: corrigelo alli y regenera con \`${a.genera}\``);
    if (a.comprueba.gate) {
      mete(`\`${a.nombre}\`: lo compara con su fuente el gate \`${a.comprueba.gate}\`, activo en validate`,
        activosValidate.has(a.comprueba.gate),
        `\`${a.comprueba.gate}\` no esta activo en el perfil validate: nadie compara este artefacto con su fuente`);
    } else {
      const r = corre(a.comprueba.comando);
      mete(`\`${a.nombre}\`: coincide con su fuente (\`${a.comprueba.comando}\`)`, r.status === 0,
        `diverge de su fuente o el generador falla (exit ${r.status}): ${r.salida} — regenera con \`${a.genera}\` y revisa el diff`);
    }
  }
}

/** Las comprobaciones, puras sobre sus entradas: `lee` y `corre` se inyectan (las siembras los falsean). */
export function revisaGenerados(mundo) {
  const ok = [];
  const fallos = [];
  const mete = (descripcion, cond, pista) => (cond ? ok.push(descripcion) : fallos.push({ descripcion, pista }));
  const { registro, rastreados, lee } = mundo;

  const forma = validaRegistro(registro);
  mete('el registro `generados` del padron esta bien formado', forma.length === 0, forma.join(' · '));
  if (forma.length) return { ok, fallos };

  revisaArtefactos(mundo, mete);

  const duenos = new Map();
  for (const a of registro.artefactos) for (const r of casan(a.rutas, rastreados)) duenos.set(r, [...(duenos.get(r) ?? []), a.nombre]);
  for (const f of registro.fuera) for (const r of casan(f.rutas, rastreados)) duenos.set(r, [...(duenos.get(r) ?? []), `fuera:${f.clase}`]);
  const repetidos = [...duenos].filter(([, d]) => d.length > 1).map(([r, d]) => `${r} (${d.join(' y ')})`);
  mete('ningun archivo tiene dos duenos en el registro', repetidos.length === 0, `con dos duenos: ${repetidos.join(', ')}`);

  const viejas = registro.fuera.flatMap((f) => f.rutas.filter((r) => casan([r], rastreados).length === 0).map((r) => `${f.clase}: ${r}`));
  mete(`lo declarado \`fuera\` existe (${registro.fuera.length} grupos, cada ruta con archivos)`, viejas.length === 0,
    `rutas sin ningun archivo versionado: ${viejas.join(', ')} — una declaracion vieja se lee como una decision que ya no aplica`);

  const enFuera = registro.fuera.flatMap((f) => casan(f.rutas, rastreados));
  const fueraConBanner = enFuera.filter((r) => llevaMarca(cabezaDe(lee(r) ?? '')));
  mete('nada de lo declarado `fuera` lleva el banner', fueraConBanner.length === 0,
    `llevan banner sin que nadie los compare: ${fueraConBanner.join(', ')} — o entran como artefacto, o se les quita`);

  const huerfanos = rastreados.filter((r) => !duenos.has(r) && llevaMarca(cabezaDe(lee(r) ?? '')));
  mete(`ningun archivo con banner queda fuera del registro (${rastreados.length} versionados revisados)`, huerfanos.length === 0,
    `con banner y sin registrar: ${huerfanos.join(', ')} — declaralos en \`generados.artefactos\` de .claude/gates.json, con su \`comprueba\``);

  return { ok, fallos };
}

/** Las siembras: cada una rompe una cosa y el verificador tiene que verla. */
export function siembrasGenerados(mundo) {
  const copia = () => structuredClone(mundo.registro);
  const conComando = mundo.registro.artefactos.find((a) => a.comprueba.comando);
  const conGate = mundo.registro.artefactos.find((a) => a.comprueba.gate);
  const archivoDe = (a) => casan(a.rutas, mundo.rastreados)[0];
  const fueraUno = mundo.registro.fuera.length ? casan(mundo.registro.fuera[0].rutas, mundo.rastreados)[0] : null;
  const leeCon = (ruta, texto) => (r) => (r === ruta ? texto : mundo.lee(r));
  const BANNER = `// ${MARCA} por un generador que nadie registro.`;
  return [
    ['un artefacto editado a mano (su comprobacion sale en rojo)', {
      corre: (c) => (c === conComando?.comprueba.comando ? { status: 1, salida: 'diverge' } : { status: 0, salida: '' }),
    }],
    ['el banner borrado de un artefacto', { lee: leeCon(archivoDe(conComando), 'export const x = 1\n') }],
    ['un artefacto borrado del repo', { rastreados: mundo.rastreados.filter((r) => r !== archivoDe(conComando)) }],
    ['un generado nuevo sin registrar', {
      rastreados: [...mundo.rastreados, 'tools/inventado/datos.ts'], lee: leeCon('tools/inventado/datos.ts', `${BANNER}\n`),
    }],
    ['el gate que lo compara, apagado', {
      padron: { gates: mundo.padron.gates.map((g) => (g.nombre === conGate?.comprueba.gate ? { ...g, activo: false } : g)) },
    }],
    ['un grupo `fuera` sin motivo', { registro: (() => { const r = copia(); delete r.fuera[0].motivo; return r; })() }],
    ['algo `fuera` que lleva el banner', { lee: leeCon(fueraUno, `${BANNER}\n`) }],
    ['un archivo con dos duenos', {
      registro: (() => { const r = copia(); r.artefactos[1].rutas.push(r.artefactos[0].rutas[0]); return r; })(),
    }],
  ];
}
