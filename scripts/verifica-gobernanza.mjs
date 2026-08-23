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
const refBacktick = /`((?:\.\.\/)?(?:plantillas\/)?[A-Za-z0-9_.-]+\.md)`/g;
for (const [, destino] of gobernanza.matchAll(refBacktick)) {
  const resuelto = join(GOB, destino);
  const basename = destino.split('/').pop();
  comprueba(
    `referencia viva: GOBERNANZA.md -> ${destino}`,
    existsSync(ruta(resuelto)) || existeEnRepo(basename),
    'GOBERNANZA.md nombra un archivo que no existe en ninguna parte del repo',
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
