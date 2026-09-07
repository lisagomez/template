#!/usr/bin/env node
/**
 * Verificador de cableado de la capa de gobernanza.
 *
 * Falla (exit 1) si el papel y el codigo divergen: si falta un control, si CLAUDE.md
 * dejo de referenciar la capa, si prp-base.md perdio sus secciones, o si una plantilla
 * referenciada no existe en disco.
 *
 * Es el control C6/§9 de GOBERNANZA.md aplicado a la propia capa: un documento que
 * nada obliga a mantener se pudre en silencio.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leeConImports } from './lee-instrucciones.mjs';
import { geminiSincronizado } from './sincroniza-gemini.mjs';
import { estadoCorpus } from './lib/corpus.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOB = '.claude/gobernanza';

const fallos = [];
const ok = [];

const ruta = (p) => join(raiz, p);
const lee = (p) => (existsSync(ruta(p)) ? readFileSync(ruta(p), 'utf8') : null);
/** Los archivos de instrucciones se leen EXPANDIDOS: `CLAUDE.md` importa `AGENTS.md`, que
 *  es la fuente unica. Sin expandir, todas las comprobaciones de reglas darian falso rojo
 *  sobre un archivo de 17 lineas. */
const INSTRUCCIONES = new Set(['CLAUDE.md', 'GEMINI.md', 'AGENTS.md']);
const leeDoc = (p) => (INSTRUCCIONES.has(p) ? leeConImports(ruta(p)) : lee(p));

const vistas = new Set();
function comprueba(descripcion, condicion, pista) {
  if (vistas.has(descripcion)) return; // una referencia repetida se verifica una vez
  vistas.add(descripcion);
  if (condicion) ok.push(descripcion);
  else fallos.push({ descripcion, pista });
}

/** Busca un basename en el repo, ignorando ruido. Un enlace a `prp-base.md` es valido
 *  aunque el archivo viva en .claude/PRPs/ y no junto al documento que lo nombra. */
const IGNORAR = new Set(['node_modules', '.next', '.git', 'dist', '.turbo']);
function existeEnRepo(basename, desde = raiz) {
  for (const entrada of readdirSync(desde, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    if (entrada.isDirectory()) {
      if (existeEnRepo(basename, join(desde, entrada.name))) return true;
    } else if (entrada.name === basename) return true;
  }
  return false;
}

// --- 1. Los documentos de la capa existen -----------------------------------
const documentos = [
  `${GOB}/GOBERNANZA.md`,
  `${GOB}/golden-sets/contratos.json`,
  `${GOB}/REGISTRO-RIESGO.md`,
  `${GOB}/BITACORA-CDC.md`,
  `${GOB}/INCIDENTES.md`,
  `${GOB}/plantillas/aisia.md`,
  `${GOB}/plantillas/modelo-amenazas.md`,
  `${GOB}/plantillas/incidente.md`,
];
for (const doc of documentos) {
  comprueba(`existe ${doc}`, existsSync(ruta(doc)), 'el documento fue borrado o movido');
}

// --- 2. Los 7 controles siguen declarados -----------------------------------
const gobernanza = lee(`${GOB}/GOBERNANZA.md`) ?? '';
const controles = {
  C1: 'Cambio de Comportamiento',
  C2: 'regresión de skills',
  C3: 'Modelo de amenazas',
  C4: 'Evaluación de Impacto',
  C5: 'decisiones de riesgo',
  C6: 'incidente',
  C7: 'service_role',
};
for (const [id, titulo] of Object.entries(controles)) {
  comprueba(
    `control ${id} (${titulo}) declarado en GOBERNANZA.md`,
    new RegExp(`\\*\\*${id}\\*\\*`).test(gobernanza) && gobernanza.includes(titulo),
    `añade el control ${id} a la tabla de §1 y su sección propia`,
  );
}

// --- 3. CLAUDE.md referencia la capa (el cable principal) -------------------
const claudeMd = leeDoc('CLAUDE.md') ?? '';
comprueba(
  'CLAUDE.md referencia .claude/gobernanza/',
  claudeMd.includes(`${GOB}/GOBERNANZA.md`) || claudeMd.includes('.claude/gobernanza'),
  'la capa quedo suelta: sin esto nada del flujo obliga a consultarla',
);
comprueba(
  'CLAUDE.md tiene entrada de gobernanza en su decision tree',
  /GOBERNANZA|gobernanza/i.test(claudeMd) && claudeMd.includes('Decision Tree'),
  'añade la rama de gobernanza al decision tree',
);
comprueba(
  'CLAUDE.md declara la regla service_role (C7) en Reglas de Codigo',
  claudeMd.includes('service_role'),
  'sin esta regla, "SIEMPRE habilitar RLS" es decorativo',
);

// --- 3b. GEMINI.md tambien, o una sesion con Gemini se salta la capa entera --
const geminiMd = leeDoc('GEMINI.md');
if (geminiMd !== null) {
  comprueba(
    'GEMINI.md referencia .claude/gobernanza/',
    geminiMd.includes('.claude/gobernanza'),
    'el espejo de instrucciones quedo sin gobernanza: una sesion con Gemini la ignoraria',
  );
  comprueba(
    'GEMINI.md declara la regla service_role (C7)',
    geminiMd.includes('service_role'),
    'la regla C7 tiene que estar en AMBOS archivos de instrucciones',
  );
  // --- 3b-bis. GEMINI.md se GENERA desde AGENTS.md; a mano diverge en silencio -----
  // Antes era una copia condensada mantenida a mano y nadie comparaba los dos: ya
  // divergian en Comandos, Gobernanza y Aprendizajes sin que ningun gate lo viera.
  const sincronizado = geminiSincronizado(raiz);
  comprueba(
    'GEMINI.md coincide con lo que genera sincroniza-gemini.mjs desde AGENTS.md',
    sincronizado === true,
    `${sincronizado === true ? '' : sincronizado + ' — '}regenerar con npm run sincroniza:gemini; editarlo a mano reintroduce la divergencia`,
  );
}

// --- 3c. Los READMEs documentan la capa --------------------------------------
for (const readme of ['README.md', '.claude/README.md']) {
  const contenido = lee(readme);
  if (contenido === null) continue;
  comprueba(
    `${readme} documenta la capa de gobernanza`,
    contenido.includes('gobernanza'),
    'la documentacion publica dejo de mencionar la capa',
  );
}

// --- 3d. new-app sigue emitiendo la AISIA en BUSINESS_LOGIC.md ---------------
const newApp = lee('.claude/skills/new-app/SKILL.md');
if (newApp !== null) {
  comprueba(
    'el skill new-app emite la seccion de Gobernanza en BUSINESS_LOGIC.md',
    /##\s*6\.\s*Gobernanza/.test(newApp),
    'sin esto, cada proyecto nuevo nace sin evaluacion de impacto (C4)',
  );
}
// Si el proyecto ya tiene su BUSINESS_LOGIC.md, tiene que llevarla.
const businessLogic = lee('BUSINESS_LOGIC.md');
if (businessLogic !== null) {
  comprueba(
    'BUSINESS_LOGIC.md incluye su seccion de Gobernanza',
    /Gobernanza/.test(businessLogic),
    'fue generado antes de la capa: regeneralo o anade la seccion 6 a mano',
  );
}

// --- 3d-bis. Todo paso de `validate` esta declarado en la documentacion -----
// Un gate que corre sin que ningun documento lo nombre es media divergencia papel-codigo: el
// que lee el README no sabe que existe, y quien lo quite no encuentra nada que actualizar.
// Se descubrio con un gate nuevo que llevaba horas corriendo sin aparecer en ningun sitio — y
// al mirarlo resulto que NO era la excepcion: cuatro de trece pasos estaban sin declarar. Los
// otros nueve lo estaban por costumbre, no por control. Esto lo vuelve control.
{
  const pkgTxt = lee('package.json');
  const pkgJson = pkgTxt === null ? null : JSON.parse(pkgTxt);
  const validate = pkgJson?.scripts?.validate ?? '';
  const pasos = [...validate.matchAll(/npm run ([a-z:]+)/g)].map((m) => m[1]);
  const docs = ['README.md', 'AGENTS.md', '.claude/README.md']
    .map((d) => leeDoc(d)).filter((t) => t !== null).join('\n');
  const sinDeclarar = pasos.filter((paso) => !docs.includes(paso));
  comprueba(
    `todo paso de validate esta declarado en la documentacion (${pasos.length} pasos)`,
    pasos.length > 0 && sinDeclarar.length === 0,
    `paso(s) sin declarar: ${sinDeclarar.join(', ')} — un gate que el papel no nombra no lo `
      + 'conoce quien lee, y quien lo quite no encuentra que actualizar',
  );
}

// --- 3e. El conteo de skills declarado coincide con los directorios reales ---
const dirSkills = join(raiz, '.claude/skills');
if (existsSync(dirSkills)) {
  const reales = readdirSync(dirSkills, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  // \b evita capturar el "4" de "V4 Skills"
  const patrones = [/\b(\d+)\s+[Ss]kills\b/g, /[Ss]kills\s*\((\d+)\s*total\)/g, /[Ss]kills:\s*(\d+)/g];
  for (const doc of ['README.md', '.claude/README.md', 'CLAUDE.md']) {
    const contenido = leeDoc(doc);
    if (contenido === null) continue;
    const declarados = new Set();
    for (const patron of patrones) {
      for (const [, n] of contenido.matchAll(patron)) declarados.add(Number(n));
    }
    if (declarados.size === 0) continue; // el documento no declara conteo: nada que verificar
    const malos = [...declarados].filter((n) => n !== reales);
    comprueba(
      `${doc} declara el numero real de skills (${reales})`,
      malos.length === 0,
      `declara ${malos.join(', ')} pero hay ${reales} directorios en .claude/skills/`,
    );
  }
}

// --- 3f. Los controles que NO disparaban: C1, C5 e idioma, inline en las reglas
for (const doc of ['CLAUDE.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: el CDC (C1) nombra la configuracion (settings.json / model)`,
    /settings\.json/.test(contenido) && /BITACORA-CDC/.test(contenido),
    'sin nombrarla, un cambio de modelo se lee como tarea de config y el CDC no dispara',
  );
  comprueba(
    `${doc}: rechaza \`latest\` explicitamente`,
    /latest/.test(contenido) && /PINEADO|pineado/.test(contenido),
    'el modelo en produccion va pineado; latest es anti-patron',
  );
  comprueba(
    `${doc}: C5 esta en las reglas, no solo en el documento`,
    /REGISTRO-RIESGO/.test(contenido),
    'nadie enruta "acepto el riesgo" al registro si no esta en las reglas',
  );
  comprueba(
    `${doc}: declara el limite de C5 (riesgos infirmables)`,
    /INFIRMABLE|infirmable/.test(contenido) && /terceros/.test(contenido),
    'sin el limite, C5 se lee como llave maestra: una firma no cubre el dano a terceros',
  );
  comprueba(
    `${doc}: prohibe imprimir valores de variables de entorno`,
    /enmascar/i.test(contenido) && /variable de entorno|variables de entorno/i.test(contenido),
    'sin la regla es azar: un agente enmascara y otro imprime (incidente del 2026-08-23)',
  );
  comprueba(
    `${doc}: declara la regla de idioma`,
    /[Ii]dioma/.test(contenido) && /espa[nñ]ol/i.test(contenido),
    'sin regla explicita, una sesion fria de cada dos responde en ingles',
  );
  // Las tres reglas del CDC del cableado (2026-08-23). Entraron sin vigilancia:
  // se podian borrar y el verificador seguia en verde. Medidas en frio por la capa B.
  // Ancladas en lo que SOLO afirma la regla, no en palabras que tambien salen en el
  // decision tree: la primera version pasaba con la regla borrada. La cazo el control
  // negativo, que es justo para lo que existe.
  comprueba(
    `${doc}: el respaldo es un contrato y las cifras no se inventan`,
    /respaldo impl[ií]cito/i.test(contenido) && /GATE 3/.test(contenido) && /RTO/.test(contenido),
    'sin la regla, un agente escribe un RPO/RTO que nadie midio — y acaba en una propuesta',
  );
  comprueba(
    `${doc}: los canales de chat externos exigen C3 y C4`,
    /entrada \*\*?no autenticada|entrada NO autenticada/i.test(contenido) &&
      /Telegram|Slack/.test(contenido) &&
      /C3/.test(contenido) && /C4/.test(contenido),
    'un canal de chat es entrada no autenticada hacia un agente con llaves: sin la regla se conecta "rapido"',
  );
  comprueba(
    `${doc}: el pineo cubre tambien la imagen del agente`,
    /tag de una imagen de agente/.test(contenido),
    'una imagen con :latest cambia el comportamiento del sistema sin diff ni regresion',
  );
}

// --- 3g. El gate esta en la ruta de deploy, no solo en validate --------------
const pkg = lee('package.json');
if (pkg !== null) {
  const scripts = JSON.parse(pkg).scripts ?? {};
  comprueba(
    'existe el gate predeploy (verificador + regresion)',
    /verify:gobernanza/.test(scripts.predeploy ?? '') && /regresion/.test(scripts.predeploy ?? ''),
    'sin predeploy se puede desplegar con la gobernanza en rojo: el gate seria decorativo',
  );
}

// --- 3g-ter. `validate` corre lo que los documentos dicen que corre ---------
// El bloque 3g comprueba que exista `predeploy`, pero NO el contenido de `validate`:
// se le podia quitar un paso sin que el gate se pusiera rojo, desincronizando en
// silencio a los documentos que declaran lo que corre. Hallazgo de un sujeto de capa B.
const PASOS_GATE = [
  ['typecheck', /\btypecheck\b/],
  ['build', /\bbuild\b/],
  ['gobernanza', /verify:gobernanza/],
  ['regresion', /\bregresion\b/],
];
if (pkg !== null) {
  const validate = (JSON.parse(pkg).scripts ?? {}).validate ?? '';
  const reales = PASOS_GATE.filter(([, re]) => re.test(validate)).map(([n]) => n);
  const faltan = PASOS_GATE.map(([n]) => n).filter((n) => !reales.includes(n));
  comprueba(
    'el script validate corre los cuatro pasos del gate',
    faltan.length === 0,
    `falta(n) ${faltan.join(', ')} — quitar un paso del gate es un CDC, no una edicion suelta`,
  );
  // Y el papel tiene que decir lo mismo que el codigo: es el proposito del verificador.
  for (const doc of ['CLAUDE.md', 'README.md', '.claude/README.md']) {
    const contenido = leeDoc(doc);
    if (contenido === null) continue;
    for (const linea of contenido.split('\n')) {
      if (!/validate/.test(linea) || !linea.includes('+')) continue;
      const declarados = PASOS_GATE.map(([n]) => n).filter((n) => new RegExp(n, 'i').test(linea));
      if (declarados.length === 0) continue;
      const sobran = declarados.filter((n) => !reales.includes(n));
      const omiten = reales.filter((n) => !declarados.includes(n));
      comprueba(
        `${doc} describe validate con los pasos que realmente corre`,
        sobran.length === 0 && omiten.length === 0,
        `declara de mas: [${sobran.join(', ')}]; omite: [${omiten.join(', ')}]`,
      );
    }
  }
}

// --- 3g-bis. El chequeo de tipos no puede desaparecer del gate en silencio ---
// `validate` corre `typecheck` Y `build`, y el build typechequea por su cuenta. Pero
// `typescript.ignoreBuildErrors` vacia el chequeo del build sin tocar el gate: seguiria
// verde verificando menos. Es el movimiento de "desbloquear el build un viernes".
// Contrapartida propuesta por un sujeto de capa B al medir el caso del typecheck.
const nextConfigTs = lee('next.config.ts');
if (nextConfigTs !== null) {
  comprueba(
    'next.config.ts no desactiva el chequeo de tipos del build',
    !/ignoreBuildErrors\s*:\s*true/.test(nextConfigTs),
    'con ignoreBuildErrors el build deja de typechequear: el gate verifica menos y sigue verde',
  );
  comprueba(
    'next.config.ts no desactiva ESLint en el build',
    !/ignoreDuringBuilds\s*:\s*true/.test(nextConfigTs),
    'mismo patron que ignoreBuildErrors, un piso mas abajo',
  );
}

// --- 3h. El corpus vive FUERA del arbol de trabajo, en su propia rama -------
comprueba(
  'el corpus de casos-trampa NO esta en el arbol de trabajo',
  !existsSync(ruta(`${GOB}/golden-sets/casos-trampa.md`)),
  'si esta en disco, una sesion fria lo encuentra leyendo el directorio (paso 2 veces)',
);
/** Un clon normal trae `origin/golden-sets` pero NO crea la rama local: `git show
 *  golden-sets:...` fallaba en todo clon fresco y el gate salia rojo por el entorno, no por
 *  el papel. Se resuelve la ref local y, si no existe, la remota. Sin ninguna de las dos
 *  (clon con --single-branch) si es rojo: la capa B no esta.
 *
 *  La resolucion vive en `lib/corpus.mjs` desde el 2026-08-31, compartida con
 *  `audita-fugas.mjs` y `regresion-skills.mjs`: estaba copiada en los tres, y por eso el
 *  punto ciego del rezago —una rama local por detras gana en silencio— estaba en los tres. */
const { ref: REF_CORPUS, detras: CORPUS_DETRAS } = estadoCorpus(raiz);
/** Se comprueba SIEMPRE, tambien cuando no hay par que comparar (`detras` es 0 y pasa): una
 *  comprobacion que solo existe en algunos entornos descuadra el conteo del bloque 9. */
comprueba(
  'la rama local golden-sets no esta rezagada respecto a origin',
  CORPUS_DETRAS === 0,
  `va ${CORPUS_DETRAS} commit(s) por detras: el gate mediria un corpus que ya no es el vigente. ` +
    'Ponla al dia: git branch -f golden-sets origin/golden-sets (o merge --ff-only en su worktree)',
);
let corpusRama = null;
if (REF_CORPUS) {
  try {
    corpusRama = execFileSync('git', ['show', `${REF_CORPUS}:casos-trampa.md`], {
      cwd: raiz, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
  } catch { /* la rama no tiene el archivo */ }
}
comprueba(
  'el corpus es recuperable desde la rama golden-sets',
  corpusRama !== null,
  'sin la rama, C2 capa B queda inaccesible. Traela: git fetch origin golden-sets:golden-sets (o clona sin --single-branch)',
);
if (corpusRama) {
  comprueba(
    'las expectativas del corpus siguen codificadas',
    !/\*\*Expectativa:\*\*/.test(corpusRama) && /Expectativa \(b64\)/.test(corpusRama),
    'defensa en profundidad: si alguien saca la rama, que no las lea de un vistazo',
  );
}

// --- 3i. El arbol de trabajo no habla del corpus ---------------------------
// Sacar el corpus a su rama no basta: la fuga que quemo tres corridas fue *hablar* de los
// casos desde el arbol (memoria, bitacora, INCIDENTES.md). Hasta ahora eso lo cazaba un
// grep manual antes de cada corrida, o sea una costumbre. Aqui se vuelve gate.
//
// Dos modos de fuga, dos comprobaciones:
//   (a) identificador: NINGUNO aparece fuera de la rama. La regla es de trazo grueso a
//       proposito. Las versiones matizadas ("solo si revela que mide") pedian un juicio
//       en cada frase y fallaron cuatro veces: basta con el identificador en una entrada
//       y la regla medida en otra para que el par se reconstruya. La traza hacia un caso
//       es el commit de corridas.md, no el identificador.
//   (b) entrada literal: un fragmento verbatim de la entrada de un caso.
// Ninguna de las dos imprime el texto filtrado — solo donde esta. Un mensaje de error que
// cita la fuga la copia a los logs.
const ARCHIVOS_TEXTO = /\.(md|mjs|ts|tsx|json)$/;
const SIN_PROSA = /(^|\/)package-lock\.json$/;
let versionados = [];
try {
  versionados = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && ARCHIVOS_TEXTO.test(f) && !SIN_PROSA.test(f));
} catch { /* sin git no hay nada que comprobar */ }

// El propio patron se compone para que esta linea no se delate a si misma.
const ID_CASO = new RegExp(`\\b${'T'}\\d{1,2}\\b`);
const conIdentificador = [];
for (const archivo of versionados) {
  const contenido = lee(archivo);
  if (contenido !== null && ID_CASO.test(contenido)) conIdentificador.push(archivo);
}
comprueba(
  'ningun identificador de caso aparece en el arbol de trabajo',
  conIdentificador.length === 0,
  `identificador(es) en: ${conIdentificador.join(', ')} — el par caso->regla se reconstruye ` +
    'leyendo el repo. La traza es el commit de corridas.md, no el identificador',
);

if (corpusRama) {
  const normaliza = (t) => t.toLowerCase().replace(/[^a-z0-9áéíóúüñ ]+/gi, ' ').replace(/\s+/g, ' ').trim();
  const arbol = normaliza(
    versionados.map((f) => lee(f) ?? '').join(' \n '),
  );
  const filtrados = [];
  const bloquesCaso = corpusRama.split(/^## /m).slice(1);
  for (const bloque of bloquesCaso) {
    const id = (bloque.match(/^(T\d{1,2})/) ?? [])[1];
    const entrada = (bloque.match(/\*\*Entrada:\*\*([\s\S]*?)\n\s*\n/) ?? [])[1];
    if (!id || !entrada) continue;
    const palabras = normaliza(entrada).split(' ');
    for (let i = 0; i + 8 <= palabras.length; i++) {
      if (arbol.includes(palabras.slice(i, i + 8).join(' '))) {
        filtrados.push(id);
        break;
      }
    }
  }
  comprueba(
    'ninguna entrada del corpus aparece verbatim en el arbol de trabajo',
    filtrados.length === 0,
    `caso(s) con entrada filtrada: ${filtrados.join(', ')} — el sujeto la reconoce al leer ` +
      'el repo. Retirar el texto (redaccion marcada) antes de volver a medir',
  );
}

// --- 3j. El vigilante del pineo tiene ancla, y el ancla sigue al compose ----
// El SDD (docs/SDD-hermes-verificacion.md) exige que el script LEA el tag del compose en
// vez de llevarlo escrito. Aqui se vigila la otra mitad: que el ancla contra la que compara
// no se desincronice del compose. Un control anclado en una copia del dato es la clase de
// fallo que esta capa ya sufrio.
// Esta comprobacion NO toca la red: mira papel contra papel. La corrida real es semanal y
// vive en el entorno (`npm run vigila:hermes`), no en este gate.
const baselineTexto = lee('.hermes-baseline.json');
comprueba(
  'existe el ancla del vigilante de Hermes (.hermes-baseline.json)',
  baselineTexto !== null,
  'sin ancla, la capa A del SDD no tiene contra que comparar el digest',
);
const runbookHermes = lee('docs/FASE0-INFRAESTRUCTURA.md') ?? '';
// Dos formas validas: `imagen:tag` y `imagen:tag@sha256:...`. La segunda es el pineo por
// digest de §3 del SDD: si esta, tiene que coincidir con el ancla, o el vigilante compara
// contra una imagen distinta de la que se despliega.
const composeHermes = runbookHermes.match(/^\s*image:\s*([a-z0-9._\-/]+):([A-Za-z0-9._-]+)(@sha256:[0-9a-f]{64})?/m);
if (baselineTexto !== null && composeHermes) {
  let baselineJson = null;
  try {
    baselineJson = JSON.parse(baselineTexto);
  } catch { /* JSON roto: lo dice la comprobacion de abajo */ }
  comprueba(
    'el ancla de Hermes coincide con la imagen pineada en el runbook',
    baselineJson !== null &&
      baselineJson.imagen === composeHermes[1] &&
      baselineJson.tag === composeHermes[2],
    `runbook: ${composeHermes[1]}:${composeHermes[2]} · ancla: ` +
      `${baselineJson?.imagen}:${baselineJson?.tag} — si divergen, el vigilante compara ` +
      'contra un digest que no es el de la imagen que se despliega',
  );
  comprueba(
    'el ancla de Hermes declara el digest del tag pineado',
    typeof baselineJson?.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(baselineJson.digest),
    'sin digest no hay A3: un tag se puede re-publicar y nadie se enteraria',
  );
  comprueba(
    'el runbook pinea la imagen del agente por digest',
    typeof composeHermes[3] === 'string',
    'con solo el tag, una re-publicacion cambia lo que se despliega. Por digest es imposible ' +
      'por construccion (§3 del SDD)',
  );
  if (composeHermes[3]) {
    comprueba(
      'el digest del compose y el del ancla coinciden',
      composeHermes[3].slice(1) === baselineJson?.digest,
      'si divergen, alguien movio el pineo sin actualizar el ancla: el vigilante compararia ' +
        'contra una imagen que ya no se despliega',
    );
  }
}

// --- 4. prp-base.md gana sus secciones (el segundo cable) ------------------
const prpBase = lee('.claude/PRPs/prp-base.md') ?? '';
comprueba(
  'prp-base.md contiene la seccion "Modelo de amenazas"',
  prpBase.includes('Modelo de amenazas'),
  'todo PRP debe responder: ¿quien nos ataca?',
);
comprueba(
  'prp-base.md contiene la seccion "Evaluación de impacto"',
  /Evaluaci[oó]n de impacto/i.test(prpBase),
  'todo PRP debe responder: ¿a quien podemos dañar sin atacante?',
);
comprueba(
  'prp-base.md pregunta por CDC aplicable',
  /CDC/.test(prpBase),
  'el PRP debe declarar si cambia comportamiento de agentes',
);

// --- 5. Toda plantilla referenciada existe en disco ------------------------
const enlaceMd = /\[[^\]]*\]\(([^)#]+\.md)\)/g;
for (const doc of documentos) {
  const contenido = lee(doc);
  if (!contenido) continue;
  for (const [, destino] of contenido.matchAll(enlaceMd)) {
    if (/^https?:/.test(destino)) continue;
    const resuelto = join(dirname(doc), destino);
    comprueba(
      `enlace vivo: ${doc} -> ${destino}`,
      existsSync(ruta(resuelto)),
      'enlace roto hacia una plantilla inexistente',
    );
  }
}
// referencias por backtick del tipo `plantillas/aisia.md`
// El corpus y sus reportes viven en la rama `golden-sets`, no en disco: nombrarlos es
// legitimo y NO es un enlace roto. Se comprueba tambien alli.
const enRamaCorpus = (basename) => {
  if (!REF_CORPUS) return false;
  try {
    execFileSync('git', ['cat-file', '-e', `${REF_CORPUS}:${basename}`], { cwd: raiz, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const refBacktick = /`((?:\.\.\/)?(?:plantillas\/)?[A-Za-z0-9_.-]+\.md)`/g;
for (const [, destino] of gobernanza.matchAll(refBacktick)) {
  const resuelto = join(GOB, destino);
  const basename = destino.split('/').pop();
  comprueba(
    `referencia viva: GOBERNANZA.md -> ${destino}`,
    existsSync(ruta(resuelto)) || existeEnRepo(basename) || enRamaCorpus(basename),
    'GOBERNANZA.md nombra un archivo que no existe ni en el repo ni en la rama golden-sets',
  );
}

// --- 6. Los registros append-only conservan su marca ----------------------
for (const registro of [`${GOB}/REGISTRO-RIESGO.md`, `${GOB}/BITACORA-CDC.md`, `${GOB}/INCIDENTES.md`]) {
  const contenido = lee(registro) ?? '';
  comprueba(
    `${registro} conserva la marca append-only`,
    /NO editar (las|los) anteriores/i.test(contenido),
    'sin la marca, alguien reescribira una decision pasada',
  );
}

// --- 6h. El routing por nivel existe, esta en el flujo y en las reglas ------
// El ahorro por routing no se pierde de golpe: se pierde porque una clase de tarea que
// nadie asigno hereda el default caro y nadie se entera. Aqui se vigila que el catalogo
// exista, que su gate corra, y que la regla este INLINE en las instrucciones — si vive
// solo en un JSON, no dispara cuando alguien decide.
comprueba(
  'existe .claude/routing-modelos.json (routing por nivel de tarea)',
  existsSync(ruta('.claude/routing-modelos.json')),
  'sin catalogo, cada tarea usa el modelo por defecto y el reparto no existe',
);
comprueba(
  'existe scripts/verifica-routing.mjs',
  existsSync(ruta('scripts/verifica-routing.mjs')),
  'un catalogo que nada comprueba se desincroniza del dia a dia',
);
comprueba(
  'el gate de routing corre en validate',
  /"validate":\s*"[^"]*verifica:routing/.test(lee('package.json') ?? ''),
  'si depende de que alguien lo invoque, es una costumbre',
);
for (const doc of ['AGENTS.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: declara el routing por nivel y el limite de lo que no se abarata`,
    /routing-modelos\.json/.test(contenido) && /no se abarata/i.test(contenido),
    'la regla tiene que estar donde decide el agente, no solo en el JSON',
  );
}

// --- 6i. La contabilidad de tokens existe, cuelga del catalogo y esta en la ruta
// El routing decide lo que una tarea DEBERIA costar; sin esta mitad, las tarifas del
// catalogo son una estimacion que nadie puede desmentir. Lo que se vigila aqui es que el
// modulo saque el precio del catalogo (y no de una cifra pegada a mano, que es la forma
// que toma "no inventar cifras" cuando se rompe), que su prueba corra dentro del gate, y
// que la regla del hueco declarado viva INLINE donde decide el agente.
const contabilidad = 'src/lib/ai/contabilidad.ts';
const pruebaContabilidad = 'scripts/prueba-contabilidad.ts';
comprueba(
  `existe ${contabilidad} (contabilidad de tokens y presupuesto)`,
  existsSync(ruta(contabilidad)),
  'sin registro de lo gastado, el coste del catalogo no se puede contrastar con nada',
);
comprueba(
  `existe ${pruebaContabilidad}`,
  existsSync(ruta(pruebaContabilidad)),
  'la aritmetica del coste y el aviso del 80 % se rompen en silencio si nada los prueba',
);
const contabilidadTexto = lee(contabilidad);
if (contabilidadTexto !== null) {
  comprueba(
    'la contabilidad saca el precio del catalogo de routing, no de una cifra pegada',
    /from '\.\/routing/.test(contabilidadTexto) && /costeUsd/.test(contabilidadTexto),
    'un precio duplicado a mano se desincroniza del catalogo y nadie se entera hasta la factura',
  );
}
comprueba(
  'la prueba de contabilidad corre en validate y en predeploy',
  /"validate":\s*"[^"]*prueba:contabilidad/.test(lee('package.json') ?? '') &&
    /"predeploy":\s*"[^"]*prueba:contabilidad/.test(lee('package.json') ?? ''),
  'si depende de que alguien la invoque, es una costumbre y no un gate',
);
for (const doc of ['AGENTS.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: declara que una llamada sin uso se guarda con coste null, no como cero`,
    /Contabilidad de tokens/.test(contenido) && /`null`/.test(contenido) && /nunca como cero/.test(contenido),
    'sumar huecos como ceros da una factura que parece completa: la regla tiene que estar donde decide el agente',
  );
}

// --- 6j. Ningun gate depende de un arnes concreto --------------------------
// "Si un gate solo pasa desde Claude Code, no es un gate del repo: es una costumbre de un
// arnes." Medido el 2026-08-24 corriendo `validate` entero dentro de opencode
// (docs/PORTABILIDAD-ARNESES.md). Lo que se vigila aqui es que siga siendo cierto: basta
// que un script del gate llame al binario de un arnes para que el repo quede casado con el.
const ARNESES = /(^|[^\w-])(claude|opencode|gemini|cursor|aider)([^\w-]|$)/i;
if (pkg !== null) {
  const scripts = JSON.parse(pkg).scripts ?? {};
  const casados = Object.entries(scripts).filter(([, cmd]) => ARNESES.test(String(cmd)));
  comprueba(
    'ningun script de npm invoca el binario de un arnes',
    casados.length === 0,
    `${casados.map(([n]) => n).join(', ')} — un gate que necesita un arnes concreto no es del repo`,
  );
}
const portabilidad = 'docs/PORTABILIDAD-ARNESES.md';
comprueba(
  `existe ${portabilidad} (la portabilidad, medida y no afirmada)`,
  existsSync(ruta(portabilidad)),
  'sin el informe, "corre en otro arnes" vuelve a ser una afirmacion sin corrida detras',
);

// --- 6g. El vigilante de frescura cubre TODO lo pineado --------------------
// El pineo da estabilidad y quita noticias. Ya habia sensor para la imagen del agente;
// esto lo generaliza al stack y a los MCP. Vive FUERA de validate a proposito: usa red.
const vigilante = 'scripts/vigila-versiones.mjs';
comprueba(
  `existe ${vigilante} (frescura de lo pineado)`,
  existsSync(ruta(vigilante)),
  'sin el, el rezago del stack y de los MCP no se nota hasta que duele',
);
comprueba(
  'el vigilante de versiones NO corre dentro de validate',
  !/"validate":\s*"[^"]*vigila:versiones/.test(lee('package.json') ?? ''),
  'usa red: dentro del gate lo pondria rojo por causas que no son el codigo',
);

// --- 6f. El presupuesto de contexto existe, esta calibrado y esta en la ruta
// El contexto base se paga en CADA sesion y nadie lo habia medido nunca: crecia sin
// sensor, igual que el rezago de versiones. Lo que se vigila aqui es que el sensor exista,
// que declare de donde sale su numero (un contador sin calibracion es un invento con
// formato de medicion) y que corra dentro del gate.
const medidor = 'scripts/mide-contexto.mjs';
comprueba(
  `existe ${medidor} (presupuesto de contexto)`,
  existsSync(ruta(medidor)),
  'sin el, el contexto base crece sin que nadie lo note',
);
const presupuestoTexto = lee('.claude/presupuesto-contexto.json');
comprueba(
  'existe .claude/presupuesto-contexto.json',
  presupuestoTexto !== null,
  'sin presupuesto declarado no hay contra que comparar la medicion',
);
if (presupuestoTexto !== null) {
  let presupuesto = null;
  try {
    presupuesto = JSON.parse(presupuestoTexto);
  } catch { /* lo dice la comprobacion */ }
  comprueba(
    'el presupuesto de contexto declara su calibracion (ratio, muestra y margen)',
    typeof presupuesto?.calibracion?.ratio_chars_por_token === 'number' &&
      Boolean(presupuesto?.calibracion?.muestra) &&
      Boolean(presupuesto?.calibracion?.margen),
    'un contador sin calibracion declarada da un numero que nadie puede auditar',
  );
}
comprueba(
  'la medicion de contexto corre en validate y en predeploy',
  // `lee` directo y no la constante `paquete`: esa se declara mas abajo (bloque 6c) y
  // usarla aqui cae en su zona muerta temporal — el verificador reventaba en vez de fallar.
  /"validate":\s*"[^"]*mide:contexto/.test(lee('package.json') ?? '') &&
    /"predeploy":\s*"[^"]*mide:contexto/.test(lee('package.json') ?? ''),
  'si depende de que alguien lo invoque, es una costumbre y no un gate',
);

// --- 6e. El camino de "herramienta empaquetada" existe y esta en el flujo ---
// Este template servia solo para "una app que se despliega". El otro caso real es "una
// herramienta que construyo una vez y reuso en mis proyectos", y ahi lo que falla no es el
// codigo: es el contrato del paquete, que revienta en el proyecto de DESTINO.
const empaquetador = 'scripts/empaqueta-herramienta.mjs';
comprueba(
  `existe ${empaquetador} (empaqueta y PRUEBA la integracion)`,
  existsSync(ruta(empaquetador)),
  'sin el, "es compatible" es una opinion en vez de una instalacion probada',
);
comprueba(
  'existe el andamio tools/ejemplo-herramienta con su contrato',
  existsSync(ruta('tools/ejemplo-herramienta/package.json')),
  'el andamio es lo que se copia: sin el, cada herramienta inventa su package.json',
);
for (const doc of ['CLAUDE.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: el decision tree enruta "herramienta / libreria / paquete"`,
    /EMPAQUETAR-HERRAMIENTA/.test(contenido),
    'si no esta en el camino de quien decide, el agente tratara una libreria como una app',
  );
}
const andamio = lee('tools/ejemplo-herramienta/package.json');
if (andamio !== null) {
  let json = null;
  try {
    json = JSON.parse(andamio);
  } catch { /* lo dice la comprobacion */ }
  comprueba(
    'el andamio no mete React en dependencies (va como peer)',
    json !== null && !Object.keys(json.dependencies ?? {}).some((d) => ['react', 'react-dom', 'next'].includes(d)),
    'un andamio con React empaquetado ensena el bug de los dos Reacts a todo el que lo copie',
  );
}

// --- 6e-bis. La PUERTA de entrada a la vertiente "herramienta" ---------------
// El runbook tecnico (EMPAQUETAR-HERRAMIENTA.md) esta escrito para quien teclea. Pero la
// filosofia de esta fabrica es que el humano HABLA y el agente construye: sin una puerta en
// ese registro, la mitad "herramienta" del template solo es accesible a quien ya sabe.
const puertaRuta = 'docs/CREAR-UNA-HERRAMIENTA.md';
const puerta = lee(puertaRuta);
comprueba(
  `existe ${puertaRuta} (puerta de entrada Agent-First)`,
  puerta !== null,
  'sin puerta, quien no sabe empaquetar no sabe ni que este template puede hacerlo',
);
// Sin `if (puerta !== null)`: si el documento desaparece, estas tres tienen que FALLAR,
// no saltarse. Una comprobacion que se salta baja el total en silencio y el gate sigue
// pareciendo casi verde — exactamente el fallo que este verificador existe para evitar.
comprueba(
  'la puerta delega el contrato tecnico en EMPAQUETAR-HERRAMIENTA.md',
  puerta !== null && /EMPAQUETAR-HERRAMIENTA\.md/.test(puerta),
  'si lo duplica en vez de enlazarlo, los dos documentos divergen y uno miente',
);
comprueba(
  'la puerta declara el registro Agent-First (el lector no teclea)',
  puerta !== null && /no vas a teclear nada/i.test(puerta),
  'un documento que le pide comandos al humano contradice AGENTS.md y devuelve el techo tecnico al lector',
);
comprueba(
  'la puerta nombra el gate humano de publicacion (irreversible)',
  puerta !== null && /nunca publica/i.test(puerta) && /irreversible/i.test(puerta),
  'publicar no se deshace: un unpublish no borra lo que ya se descargo (C1 + accion irreversible)',
);
for (const doc of ['CLAUDE.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: el decision tree enruta a la puerta CREAR-UNA-HERRAMIENTA`,
    /CREAR-UNA-HERRAMIENTA/.test(contenido),
    'una puerta a la que nada apunta es un archivo, no un camino (leccion del 2026-08-23)',
  );
}

// --- 6d. El deploy no asume un servidor concreto ---------------------------
// Un boilerplate se despliega en la maquina de otro. Un limite de memoria cableado a un
// modelo de VPS es una afirmacion sobre hardware que no conocemos: en un servidor mas
// pequeño el OOM killer decide por nosotros. Los limites salen de `configura-deploy.mjs`,
// que mide `nproc` y `/proc/meminfo` ahi donde corre.
const configurador = 'scripts/configura-deploy.mjs';
comprueba(
  `existe ${configurador} (dimensiona el deploy contra la maquina real)`,
  existsSync(ruta(configurador)),
  'sin el, los limites del compose vuelven a ser una suposicion sobre el servidor de otro',
);
const compose = lee('docker-compose.yml') ?? '';
const cableados = [];
for (const linea of compose.split('\n')) {
  if (/^\s*(?:cpus|memory):/.test(linea) && !/\$\{/.test(linea) && !/reservations/.test(linea)) {
    // `reservations` puede ser un minimo fijo: lo que no puede ser fijo es el LIMITE.
    const previas = compose.split('\n').slice(0, compose.split('\n').indexOf(linea));
    const enLimits = previas.reverse().find((l) => /^\s*(limits|reservations):/.test(l));
    if (/limits/.test(enLimits ?? '')) cableados.push(linea.trim());
  }
}
comprueba(
  'los limites del compose no estan cableados a un modelo de servidor',
  cableados.length === 0,
  `cableado(s): ${cableados.join(' | ')} — deben venir de .env.production (${'${APP_MEM}'}, ` +
    `${'${APP_CPUS}'}), que escribe el configurador midiendo la maquina`,
);
comprueba(
  'la imagen de la app lleva el nombre del proyecto, no el del template',
  /image:\s*\$\{APP_NAME/.test(compose),
  'un boilerplate que impone su nombre a la imagen de cada proyecto no es personalizable',
);
comprueba(
  '.env.production.example documenta las variables de tamaño',
  /APP_MEM|NODE_HEAP_MB/.test(lee('.env.production.example') ?? ''),
  'si el ejemplo no las nombra, nadie sabe que existen ni de donde salen',
);

// --- 6c. La auditoria de credenciales existe y esta en la ruta -------------
// El escaneo del arbol de trabajo (bloque de mas abajo) es condicion necesaria y NO
// suficiente: un boilerplate se clona con su historia, y un secreto borrado al commit
// siguiente sigue viajando. Eso lo cubre `scripts/audita-secretos.mjs`. Aqui solo se
// vigila que exista y que este cableado — un auditor que hay que acordarse de correr es
// una costumbre, no un gate.
const auditor = 'scripts/audita-secretos.mjs';
comprueba(
  `existe ${auditor} (auditoria de credenciales sobre la historia)`,
  existsSync(ruta(auditor)),
  'sin el, solo se mira el arbol de trabajo y la historia queda sin auditar',
);
const paquete = lee('package.json') ?? '';
comprueba(
  'la auditoria de credenciales corre en validate y en predeploy',
  /"validate":\s*"[^"]*audita:secretos/.test(paquete) && /"predeploy":\s*"[^"]*audita:secretos/.test(paquete),
  'si depende de que alguien se acuerde de invocarla, no es un gate',
);

// --- 6b. Ninguna entrada se queda sin firma -------------------------------
// Una decision de riesgo sin firmar no es una decision: es un descuido con formato de
// decision, y esa diferencia es justo lo que pregunta un auditor. Paso el gate una que
// llevaba dias sin firma porque nada la miraba — la marca append-only si se vigilaba,
// la firma no. Solo se miran las entradas reales (tras "## Entradas"), no la plantilla
// del bloque "## Formato", que nace vacia a proposito.
const FIRMA = /^[-*]\s+\*\*(?:Firmado|Aprobado) por\*\*(?:\s*\([^)]*\))?:\s*(.+)$/m;
const SIN_VALOR = /^(_?pendiente|\[|☐|todo\b|—\s*$)/i;
for (const registro of [`${GOB}/REGISTRO-RIESGO.md`, `${GOB}/BITACORA-CDC.md`]) {
  const contenido = lee(registro) ?? '';
  const cuerpo = contenido.split(/^##\s+Entradas\s*$/m)[1];
  const sinFirma = [];
  for (const entrada of (cuerpo ?? '').split(/^### /m).slice(1)) {
    const titulo = entrada.split('\n')[0].trim();
    const firma = entrada.match(FIRMA);
    if (!firma || SIN_VALOR.test(firma[1].trim())) sinFirma.push(titulo.slice(0, 60));
  }
  comprueba(
    `toda entrada de ${registro} esta firmada`,
    cuerpo !== undefined && sinFirma.length === 0,
    cuerpo === undefined
      ? 'no se encontro la seccion "## Entradas": el registro cambio de forma'
      : `sin firma: ${sinFirma.join(' | ')} — una decision sin dueno no es una decision`,
  );
}

// --- 6k. La escalera CLI-first y las cuatro reglas, INLINE ------------------
// La tercera palanca de eficiencia solo existe si esta donde el agente decide. Escrita solo
// en el SDD seria un documento bonito: la leccion de que "un control escrito solo en el
// documento NO dispara" ya se pago una vez (C1 y C5, 2026-08-23).
for (const doc of ['AGENTS.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: declara la escalera CLI-first y que imprimir es un CDC`,
    /CLI-first/.test(contenido) && /manifiesto\.json/.test(contenido) && /CDC \(C1\)/.test(contenido),
    'sin la escalera inline, "¿que modelo uso?" vuelve a ser la primera pregunta en vez de la ultima',
  );
  comprueba(
    `${doc}: declara la regla anti-reimplementacion de los CLIs`,
    /anti-reimplementacion/i.test(contenido) && /jamas\s+inventa\s+una\s+respuesta/i.test(contenido),
    'un CLI que inventa la respuesta en vez de llamar a la API es indistinguible de uno que funciona, hasta que decide algo',
  );
  comprueba(
    `${doc}: sin grado no es aprobado`,
    /sin\s+grado\s+no\s+es\s+aprobado/i.test(contenido),
    'un CLI impreso sin grado medible contado como bueno es el mismo fallo que el coste `null` sumado como cero',
  );
  // El escalon 2 es el unico que adopta un CLI que no medimos nosotros: la libreria publica
  // NO publica grados (verificado el 2026-08-26 sobre su registro: 465 entradas, ningun
  // campo de grado). Sin esta frase, "sin grado no es aprobado" y "instala, que ya esta
  // publicado" se contradicen en silencio, y gana el atajo.
  comprueba(
    `${doc}: instalar de la libreria publica es adoptar un CLI no medido`,
    /no\s+hay\s+grados/i.test(contenido) && /printing-press-score/.test(contenido),
    'la libreria publica no publica grados: sin decirlo, el escalon 2 es una via para saltarse la regla del grado sin notarlo',
  );
}

// El contrato y el auditor tienen que existir, o la escalera apunta a un archivo fantasma.
for (const f of ['.claude/imprenta/manifiesto.json', 'scripts/audita-imprenta.mjs']) {
  comprueba(
    `existe ${f}`,
    existsSync(ruta(f)),
    'la regla CLI-first manda mirar aqui: si no existe, la regla enseña a mirar un hueco',
  );
}
comprueba(
  'el auditor de la imprenta corre en validate y en predeploy',
  /"validate":\s*"[^"]*audita:imprenta/.test(lee('package.json') ?? '') &&
    /"predeploy":\s*"[^"]*audita:imprenta/.test(lee('package.json') ?? ''),
  'si depende de que alguien lo invoque, es una costumbre y no un gate',
);

// --- 6b. Los gates nacidos el 2026-08-30, vigilados como el de la imprenta ----
// Se anadieron tres gates ese dia y ninguno estaba vigilado: borrarlos de `package.json`
// no rompia nada, que es el modo de falla que esta capa persigue en todos los demas sitios.
// El patron es el de arriba: existe el script Y sigue enganchado donde corre solo.
const pkgJson = lee('package.json') ?? '';
for (const f of ['scripts/verifica-specs.mjs', 'scripts/prepara-gate.mjs']) {
  comprueba(
    `existe ${f}`,
    existsSync(ruta(f)),
    'un gate que no existe no protege nada, y su entrada en package.json enseña a confiar en el',
  );
}
comprueba(
  'el verificador de specs corre en validate y en predeploy',
  /"validate":\s*"[^"]*verifica:specs/.test(pkgJson) &&
    /"predeploy":\s*"[^"]*verifica:specs/.test(pkgJson),
  'vigila lo que ningun otro gate mira: que una spec no pierda un requisito al reformatearse',
);
// `pretypecheck` es el enganche que npm ejecuta SOLO: por eso el gate viaja a `validate`,
// a `predeploy` y a cualquier `npm run typecheck` suelto sin que nadie lo recuerde. Si se
// renombra a algo que npm no dispara, el preparador deja de correr en silencio.
comprueba(
  'el preparador del gate cuelga de pretypecheck (lo dispara npm, no una costumbre)',
  /"pretypecheck":\s*"[^"]*prepara-gate\.mjs/.test(pkgJson),
  'sin el hook, un clon limpio vuelve a fallar citando las pruebas de tools/ y la version de Node',
);
comprueba(
  'package.json declara engines.node, que es lo que el preparador hace cumplir',
  /"engines"\s*:\s*\{[^}]*"node"\s*:\s*"[^"]+"/.test(pkgJson),
  'sin engines declarado el preparador no tiene contra que comparar y deja de proteger',
);

// --- 6c. La ruta spec -> plan -> tareas, enrutada y con constitucion ----------
// El skill nacio con su `description` en contexto, que basta para que el modelo lo active,
// pero NO estaba en el decision tree: un agente que leyera el arbol ante "feature compleja"
// iba a `/prp` y no sabia que existe la otra ruta ni cuando toca cada una. Es la misma
// forma de fallo que la puerta de herramientas ya pago: alcanzable solo para quien ya sabe.
for (const doc of ['AGENTS.md', 'GEMINI.md']) {
  const contenido = leeDoc(doc);
  if (contenido === null) continue;
  comprueba(
    `${doc}: el decision tree rutea a spec-generator`,
    /spec-generator/i.test(contenido),
    'sin rama, la ruta spec -> plan -> tareas solo la encuentra quien ya sabe que existe',
  );
  // Se busca sobre el texto con los saltos aplanados: el decision tree es un arbol ASCII y
  // parte las frases donde le cabe. Una comprobacion atada a la maquetacion se cae al
  // reajustar un margen, y entonces el rojo no significa lo que dice.
  const plano = contenido.replace(/\s+/g, ' ');
  comprueba(
    `${doc}: distingue cuando toca spec y cuando PRP`,
    /spec-generator/i.test(plano) && /CUAL DE LOS DOS/i.test(plano) && /PRP directo/i.test(plano),
    'dos rutas para planificar sin criterio de cual usar es peor que una sola',
  );
  comprueba(
    `${doc}: nombra docs/constitution.md`,
    /docs\/constitution\.md/.test(contenido),
    'los principios que ninguna spec puede contradecir tienen que estar en el camino, no solo en disco',
  );
}
comprueba(
  'existe docs/constitution.md',
  existsSync(ruta('docs/constitution.md')),
  'el skill y el decision tree mandan leerla: si no existe, enseñan a mirar un hueco',
);

// --- 7. C1 muerde sobre .mcp.json -----------------------------------------
// C1 declara `.mcp.json` material de CDC, pero `.gitignore` lo excluye (y debe: lleva
// credenciales vivas). Sin superficie trackeada, "diff revisado" es imposible y el
// control se vuelve papel. El espejo es `example.mcp.json`, que SI se versiona: todo
// servidor configurado tiene que estar declarado ahi. Hallazgo de una corrida de capa B.
const servidores = (texto) => {
  try {
    const j = JSON.parse(texto ?? '');
    return Object.entries(j.mcpServers ?? {})
      .filter(([, v]) => v && typeof v === 'object')
      .map(([k]) => k);
  } catch {
    return null;
  }
};

const ejemplo = lee('.claude/example.mcp.json');
comprueba(
  'existe .claude/example.mcp.json (superficie revisable de los MCP)',
  ejemplo !== null && servidores(ejemplo) !== null,
  'sin el ejemplo trackeado, un cambio de MCP no pasa por revision de codigo',
);

const real = lee('.mcp.json');

// Las dos comprobaciones sobre el `.mcp.json` VIVO se emiten SIEMPRE, exista o no el archivo.
// Cuando eran condicionales, el TOTAL del verificador dependia de la maquina: 128 en un clon
// recien hecho, 130 en cualquiera que trabaje con MCPs. El bloque 9 declara ese total en los
// README, asi que salia rojo en toda maquina real por una divergencia que no existia — la peor
// clase de gate, el que grita donde no hay nada. La cifra del papel solo significa algo si el
// numero de comprobaciones depende de lo VERSIONADO y jamas del entorno. Ausente no se calla ni
// se disfraza de verde a secas: la propia linea dice que aqui no hay `.mcp.json` vivo, que era
// justo lo que la version condicional queria evitar.
const SIN_VIVO = real === null ? ' (no hay .mcp.json vivo en esta maquina)' : '';

const declarados = new Set(servidores(ejemplo ?? '') ?? []);
const configurados = servidores(real ?? '') ?? [];
const huerfanos = configurados.filter((s) => !declarados.has(s));
comprueba(
  `todo servidor MCP configurado esta declarado en example.mcp.json${SIN_VIVO}`,
  huerfanos.length === 0,
  `sin declarar: ${huerfanos.join(', ')} — anadir un MCP es un CDC (C1) y debe quedar revisable`,
);

// Los MCP van PINEADOS, igual que el modelo y la imagen del agente (C1). Un servidor
// que se auto-actualiza cambia las capacidades del agente sin diff, sin regresion y sin
// aprobacion. Hallazgo de un sujeto de capa B sobre el archivo que C1 ya gobernaba.
if (ejemplo !== null) {
  const flotantes = [];
  for (const linea of ejemplo.split('\n')) {
    if (/@latest|:latest|@next\b|:main\b|@canary/.test(linea)) flotantes.push(linea.trim().slice(0, 60));
  }
  comprueba(
    'example.mcp.json pinea sus servidores MCP (sin alias auto-actualizables)',
    flotantes.length === 0,
    `flotante(s): ${flotantes.join(' | ')} — es el anti-patron de C1, aqui tambien`,
  );
}

// El espejo pineado no sirve de nada si el archivo VIVO flota: es el vivo el que carga los
// esquemas de herramientas en cada sesion. Con `@latest`, esa superficie cambia de tamano y
// de capacidades sin diff, sin regresion y sin aprobacion — justo lo que C1 existe para
// impedir. Una maquina sin `.mcp.json` no es una maquina en falta: por eso la linea sale igual,
// verde y diciendo que no hay archivo vivo. Callar y dar verde a secas seria el mismo fallo que
// "0 faltantes" cuando la respuesta es "no se"; desaparecer de la lista, ademas, movia el total.
const flotantesVivos = [];
for (const linea of (real ?? '').split('\n')) {
  if (/@latest|:latest|@next\b|:main\b|@canary/.test(linea)) flotantesVivos.push(linea.trim().slice(0, 60));
}
comprueba(
  `.mcp.json vivo pinea sus servidores MCP${SIN_VIVO}`,
  flotantesVivos.length === 0,
  `flotante(s): ${flotantesVivos.join(' | ')} — los esquemas que se pagan en CADA sesion pueden cambiar sin gate. Copia las versiones de example.mcp.json`,
);

// El espejo se versiona: no puede llevar credenciales reales.
if (ejemplo !== null) {
  let vivos = [];
  try {
    const j = JSON.parse(ejemplo);
    for (const [nombre, cfg] of Object.entries(j.mcpServers ?? {})) {
      if (!cfg || typeof cfg !== 'object') continue;
      for (const [clave, valor] of Object.entries(cfg.env ?? {})) {
        // Un placeholder es explicito. Cualquier otra cosa se trata como sospechosa.
        if (typeof valor === 'string' && !/^(YOUR_|<|\$\{|)$|^YOUR_/.test(valor)) {
          vivos.push(`${nombre}.${clave}`);
        }
      }
    }
  } catch {
    vivos = ['(example.mcp.json no es JSON valido)'];
  }
  comprueba(
    'example.mcp.json no lleva credenciales reales, solo placeholders',
    vivos.length === 0,
    `valores sospechosos en ${vivos.join(', ')} — el ejemplo se versiona: ahi solo van YOUR_*`,
  );
}

// --- 8. Ningun archivo versionado lleva una credencial viva -----------------
// Es un boilerplate: lo que se versiona lo hereda cada proyecto que nazca de aqui.
// Los archivos IGNORADOS (.env.production, .mcp.json) si llevan secretos — es su
// trabajo. La regla universal, valida tambien en los proyectos derivados, es que lo
// TRACKEADO nunca los lleve.
const FIRMAS = [
  ['token de Supabase (sbp_)', /sbp_[A-Za-z0-9]{36,}/],
  ['clave estilo OpenAI/OpenRouter (sk-)', /\bsk-[A-Za-z0-9_-]{24,}/],
  ['token de GitHub', /\bghp_[A-Za-z0-9]{36}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['token de Slack', /\bxox[baprs]-[A-Za-z0-9-]{12,}/],
  ['clave de AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT con las tres partes completas', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
];
// Este propio script contiene las firmas: se excluye o se delata a si mismo.
const SIN_ESCANEAR = new Set(['scripts/verifica-gobernanza.mjs', 'package-lock.json']);
// El `try` cubre SOLO el listado. Antes envolvia tambien el bucle de lectura, y entonces un
// unico archivo ilegible se reportaba como "no se pudo listar el arbol" — un gate rojo por
// una razon que no era la suya, que manda a buscar donde no es. Lo destapo el symlink
// `.opencode/skill/spec-generator`: git lo lista, y leerlo sigue el enlace hasta un
// DIRECTORIO (EISDIR).
let versionadosCred = null;
try {
  versionadosCred = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !SIN_ESCANEAR.has(f));
} catch { /* sin listado no hay nada que escanear; se reporta abajo */ }

comprueba(
  'el arbol versionado se puede listar (requisito del escaneo de credenciales)',
  versionadosCred !== null,
  'git ls-files fallo: sin el listado, el escaneo de credenciales no prueba nada',
);

if (versionadosCred !== null) {
  const encontrados = [];
  const ilegibles = [];
  for (const archivo of versionadosCred) {
    // Un enlace a directorio no es contenido: lo que apunta ya se escanea por su ruta real.
    let esArchivo = false;
    try {
      esArchivo = statSync(ruta(archivo)).isFile();
    } catch { /* borrado o roto: cae a ilegibles */ }
    if (!esArchivo) {
      if (!existsSync(ruta(archivo))) ilegibles.push(archivo);
      continue;
    }
    const contenido = lee(archivo);
    if (contenido === null) { ilegibles.push(archivo); continue; }
    if (contenido.includes(String.fromCharCode(0))) continue; // binario
    for (const [nombre, patron] of FIRMAS) {
      if (patron.test(contenido)) encontrados.push(`${archivo} (${nombre})`);
    }
  }
  comprueba(
    'ningun archivo versionado lleva una credencial viva',
    encontrados.length === 0,
    `${encontrados.join('; ')} — rotala YA: lo versionado se hereda, y git recuerda aunque lo borres`,
  );
  // Un archivo que no se pudo mirar NO es un archivo limpio. Se dice, en vez de sumarlo al
  // verde: misma doctrina que el exit 2 del vigilante y el coste `null` de la contabilidad.
  comprueba(
    'ningun archivo versionado quedo sin escanear',
    ilegibles.length === 0,
    `sin mirar: ${ilegibles.join(', ')} — no se pudo leer, que no es lo mismo que estar limpio`,
  );
}

// --- 9. La cifra de comprobaciones que declaran los README es la real ---------
// README.md decia "107 comprobaciones" y .claude/README.md "58" cuando el verificador ya
// hacia 126: cada bloque nuevo dejaba las dos cifras mas viejas y nada lo miraba. Misma
// pudricion que el conteo de skills (3e), mismo remedio. Va al final porque necesita el
// total, y se cuenta a si misma: una comprobacion por documento que declare cifra.
const DECLARAN_CIFRA = ['README.md', '.claude/README.md']
  .map((doc) => ({ doc, contenido: lee(doc) }))
  .filter(({ contenido }) => contenido !== null)
  .map(({ doc, contenido }) => {
    const linea = contenido.split('\n').find((l) => /verify:gobernanza/.test(l) && /\d+\s+comprobaciones/.test(l));
    return { doc, cifra: linea ? Number(linea.match(/(\d+)\s+comprobaciones/)[1]) : null };
  })
  .filter(({ cifra }) => cifra !== null);
const totalEsperado = ok.length + fallos.length + DECLARAN_CIFRA.length;
for (const { doc, cifra } of DECLARAN_CIFRA) {
  comprueba(
    `${doc} declara el numero real de comprobaciones del verificador (${totalEsperado})`,
    cifra === totalEsperado,
    `declara ${cifra} pero el verificador hace ${totalEsperado}: actualizar la linea de verify:gobernanza`,
  );
}

// --- Reporte --------------------------------------------------------------
const total = ok.length + fallos.length;
for (const linea of ok) console.log(`  \x1b[32m✓\x1b[0m ${linea}`);
for (const f of fallos) {
  console.log(`  \x1b[31m✗\x1b[0m ${f.descripcion}`);
  console.log(`      \x1b[2m↳ ${f.pista}\x1b[0m`);
}
console.log('');
if (fallos.length === 0) {
  console.log(`\x1b[32mGobernanza cableada: ${ok.length}/${total} comprobaciones en verde.\x1b[0m`);
  process.exit(0);
}
console.log(`\x1b[31mGobernanza DIVERGENTE: ${fallos.length} de ${total} comprobaciones fallaron.\x1b[0m`);
console.log('\x1b[2mEl papel y el codigo dejaron de decir lo mismo. Ese es el hallazgo que un auditor busca.\x1b[0m');
process.exit(1);
