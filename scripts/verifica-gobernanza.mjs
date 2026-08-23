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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOB = '.claude/gobernanza';

const fallos = [];
const ok = [];

const ruta = (p) => join(raiz, p);
const lee = (p) => (existsSync(ruta(p)) ? readFileSync(ruta(p), 'utf8') : null);

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
const claudeMd = lee('CLAUDE.md') ?? '';
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
const geminiMd = lee('GEMINI.md');
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

// --- 3e. El conteo de skills declarado coincide con los directorios reales ---
const dirSkills = join(raiz, '.claude/skills');
if (existsSync(dirSkills)) {
  const reales = readdirSync(dirSkills, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  // \b evita capturar el "4" de "V4 Skills"
  const patrones = [/\b(\d+)\s+[Ss]kills\b/g, /[Ss]kills\s*\((\d+)\s*total\)/g, /[Ss]kills:\s*(\d+)/g];
  for (const doc of ['README.md', '.claude/README.md', 'CLAUDE.md']) {
    const contenido = lee(doc);
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
  const contenido = lee(doc);
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
    const contenido = lee(doc);
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
let corpusRama = null;
try {
  corpusRama = execFileSync('git', ['show', 'golden-sets:casos-trampa.md'], {
    cwd: raiz, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
} catch { /* la rama no existe o no tiene el archivo */ }
comprueba(
  'el corpus es recuperable desde la rama golden-sets',
  corpusRama !== null,
  'sin la rama, C2 capa B queda inaccesible: git show golden-sets:casos-trampa.md',
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
  try {
    execFileSync('git', ['cat-file', '-e', `golden-sets:${basename}`], { cwd: raiz, stdio: 'ignore' });
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
if (real !== null && ejemplo !== null) {
  const declarados = new Set(servidores(ejemplo) ?? []);
  const configurados = servidores(real) ?? [];
  const huerfanos = configurados.filter((s) => !declarados.has(s));
  comprueba(
    'todo servidor MCP configurado esta declarado en example.mcp.json',
    huerfanos.length === 0,
    `sin declarar: ${huerfanos.join(', ')} — anadir un MCP es un CDC (C1) y debe quedar revisable`,
  );
}

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
try {
  const versionados = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !SIN_ESCANEAR.has(f));
  const encontrados = [];
  for (const archivo of versionados) {
    const contenido = lee(archivo);
    if (contenido === null || contenido.includes(String.fromCharCode(0))) continue; // binario
    for (const [nombre, patron] of FIRMAS) {
      if (patron.test(contenido)) encontrados.push(`${archivo} (${nombre})`);
    }
  }
  comprueba(
    'ningun archivo versionado lleva una credencial viva',
    encontrados.length === 0,
    `${encontrados.join('; ')} — rotala YA: lo versionado se hereda, y git recuerda aunque lo borres`,
  );
} catch {
  comprueba('ningun archivo versionado lleva una credencial viva', false, 'no se pudo listar el arbol con git ls-files');
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
