/**
 * El despliegue en el despacho contable (spec 015, fase 2). Cinco piezas, puras —no leen el disco ni
 * imprimen: decide quien llama—:
 *
 *   · `revisaDespacho`: lo que `configura:deploy` exige con `DESPLIEGUE=despacho`. Lo contrario del
 *     despliegue normal: ahí se exige un Supabase gestionado; aquí se RECHAZA, porque sacaría de la
 *     máquina del despacho los datos de pymes y proveedores que no firmaron nada (RF-6).
 *   · `firmaJwt` / `leeJwt`: las llaves de Supabase son JWT firmados con `JWT_SECRET`. Una llave firmada
 *     con otro secreto no da error al arrancar: auth, rest y storage la rechazan después, en silencio.
 *   · `revisaPerimetro`: lee el compose del despacho y dice qué servicio tiene salida a internet,
 *     publica puertos, usa una imagen sin pinear o puede mandar un documento fuera.
 *   · `revisaImagen`: lo que el compose no ve. Dice si un archivo con llaves entraría a la imagen de la
 *     app (y de ahí a su entorno) y si el `Dockerfile` perdió la guarda que lo impide.
 *   · `revisaConstruible`: si la imagen se construye desde un clon limpio, sin lo que solo tiene el
 *     anfitrión (`dist`, `node_modules`, tarballs).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Los límites declarados en `docker-compose.despacho.yml` (sus defaults), no una medición. */
export const RESERVA_SUPABASE_MB = 1024 + 256 + 256 + 512; // db + auth + rest + storage
/** SO 768 + Caddy 512 + Supabase + al menos 1 GB para la app y 1 GB para el OCR. */
export const RAM_MINIMA_DESPACHO_MB = 768 + 512 + RESERVA_SUPABASE_MB + 1024 + 1024;

/** El único servicio que puede salir a internet y publicar puertos: Caddy (TLS y entrada). */
export const CON_SALIDA = new Set(['caddy']);

const GESTIONADO = /\.supabase\.(co|in|net)(\/|:|$)/i;
const LLAVE_DE_FUERA = /SERVICE_ROLE|OPENROUTER|MISTRAL/;
const LLAMA_A = 'corre `node scripts/despacho/llaves.mjs`';

const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const firma = (contenido, secreto) => createHmac('sha256', secreto).update(contenido).digest('base64url');

export function firmaJwt(payload, secreto) {
  const contenido = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${contenido}.${firma(contenido, secreto)}`;
}

/** `{ rol, valida }`, o null si el valor no es un JWT legible. */
export function leeJwt(token, secreto) {
  const [cabecera, cuerpo, recibida] = token.split('.');
  if (!recibida) return null;
  try {
    const rol = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')).role ?? null;
    const esperada = Buffer.from(firma(`${cabecera}.${cuerpo}`, secreto));
    const dada = Buffer.from(recibida);
    return { rol, valida: esperada.length === dada.length && timingSafeEqual(esperada, dada) };
  } catch {
    return null;
  }
}

function revisaLlaves(valores, problemas) {
  const secreto = valores.get('JWT_SECRET') ?? '';
  if (secreto.length < 32) problemas.push(`JWT_SECRET falta o tiene menos de 32 caracteres: ${LLAMA_A}.`);
  if ((valores.get('POSTGRES_PASSWORD') ?? '').length < 32) problemas.push(`POSTGRES_PASSWORD falta o tiene menos de 32 caracteres: ${LLAMA_A}.`);
  for (const [clave, rol] of [['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon'], ['SERVICE_ROLE_KEY', 'service_role']]) {
    const valor = valores.get(clave);
    if (!valor) { problemas.push(`${clave} falta: ${LLAMA_A}.`); continue; }
    const jwt = secreto.length >= 32 ? leeJwt(valor, secreto) : null;
    if (secreto.length >= 32 && !jwt?.valida) {
      problemas.push(`${clave} no está firmada con JWT_SECRET: auth, rest y storage la rechazarán sin un error claro. Regénerala: ${LLAMA_A}.`);
    } else if (jwt && jwt.rol !== rol) {
      problemas.push(`${clave} lleva el rol «${jwt.rol}» y tiene que ser «${rol}».`);
    }
  }
}

/**
 * Lo que `configura:deploy` exige en modo despacho. `valores` es el Map del `.env.production`.
 * Nunca mete un valor en un mensaje: nombres de variable y, a lo sumo, el rol de una llave.
 */
export function revisaDespacho(valores, { ramMB }) {
  const problemas = [];
  const avisos = [];
  const dominio = valores.get('DOMAIN');
  const url = (valores.get('NEXT_PUBLIC_SUPABASE_URL') ?? '').replace(/\/$/, '');
  if (!url) {
    problemas.push('NEXT_PUBLIC_SUPABASE_URL falta: en el despacho es https://<DOMAIN>, el mismo origen que la app.');
  } else if (GESTIONADO.test(url)) {
    problemas.push('NEXT_PUBLIC_SUPABASE_URL apunta a un Supabase gestionado: los datos de las pymes y de sus proveedores ' +
      'saldrían de la máquina del despacho (spec 015, RF-6). Aquí va su Supabase autohospedado, en https://<DOMAIN>.');
  } else if (dominio && url !== `https://${dominio}`) {
    problemas.push('NEXT_PUBLIC_SUPABASE_URL no es https://<DOMAIN>: en el despacho la API de Supabase vive en el mismo ' +
      'origen que la app, detrás de Caddy.');
  }
  const respaldo = valores.get('OCR_RESPALDO');
  if (respaldo && respaldo !== 'ninguno') {
    problemas.push(`OCR_RESPALDO=${respaldo}: en el despacho no hay cola de visión fuera de su máquina (RF-7). El compose la ` +
      'fija en «ninguno»; quítala del .env para que nadie crea que se puede encender. Con datos de terceros, ninguna firma lo autoriza.');
  }
  for (const clave of ['MISTRAL_API_KEY', 'OCR_DECISION_C4_ARCHIVO']) {
    if (valores.get(clave)) problemas.push(`${clave} está puesta: en el despacho no existe ningún camino para mandar un documento fuera (RF-7). Bórrala.`);
  }
  if (valores.get('SUPABASE_SERVICE_ROLE_KEY')) {
    problemas.push('SUPABASE_SERVICE_ROLE_KEY está puesta para la app: la app del despacho no usa service_role (C7). ' +
      'La llave de servicio del almacenamiento va en SERVICE_ROLE_KEY y solo la lee ese servicio.');
  }
  revisaLlaves(valores, problemas);
  if (ramMB < RAM_MINIMA_DESPACHO_MB) {
    problemas.push(`Con ${ramMB} MB no cabe el stack del despacho: hacen falta ${RAM_MINIMA_DESPACHO_MB} MB (SO, Caddy, ` +
      `${RESERVA_SUPABASE_MB} MB de Supabase y al menos 1 GB para la app y otro para el OCR).`);
  }
  if (valores.get('OPENROUTER_API_KEY')) {
    avisos.push('OPENROUTER_API_KEY está puesta, pero la app del despacho no tiene salida a internet: no se usará. Mejor quitarla.');
  }
  return { problemas, avisos };
}

// --- El perímetro, leído del compose -------------------------------------------------------------

const redesDe = (servicio) => (Array.isArray(servicio.networks) ? servicio.networks : Object.keys(servicio.networks ?? {}));
const entornoDe = (servicio) => (Array.isArray(servicio.environment)
  ? Object.fromEntries(servicio.environment.map((linea) => linea.split(/=(.*)/s).slice(0, 2)))
  : servicio.environment ?? {});

/**
 * Donde viven las llaves del servidor. `.env.production` lo escribe `llaves.mjs` (y `configura:deploy`
 * lo valida); los demás, por si alguien los deja en el árbol del servidor.
 */
export const ARCHIVOS_CON_LLAVES = ['.env', '.env.production', '.env.local', '.env.development',
  '.env.production.local', 'hermes/.env', 'tools/una-herramienta/.env.production'];

/** Un patrón de `.dockerignore` a expresión regular, con la semántica de Docker (`**`, `*`, `?`). */
function patronARegex(patron) {
  let re = '';
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i];
    if (c === '*' && patron[i + 1] === '*') {
      i++;
      if (patron[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[\\^$.|+(){}[\]]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Docker excluye una ruta si un patrón la nombra a ella o a una carpeta suya; gana la última regla. */
function excluida(dockerignore, ruta) {
  const partes = ruta.split('/');
  const prefijos = partes.map((_, i) => partes.slice(0, i + 1).join('/'));
  let fuera = false;
  for (const linea of dockerignore.split('\n').map((l) => l.trim())) {
    if (!linea || linea.startsWith('#')) continue;
    const niega = linea.startsWith('!');
    const re = patronARegex((niega ? linea.slice(1) : linea).replace(/^\/+|\/+$/g, ''));
    if (prefijos.some((p) => re.test(p))) fuera = !niega;
  }
  return fuera;
}

/**
 * Lo que la IMAGEN le pasa a la app por detrás del compose. El build standalone de Next copia `.env` y
 * `.env.production` a la imagen final y los carga al arrancar: si entran al contexto, la app recibe
 * `service_role` y todas las llaves del servidor aunque el compose no se las dé (PRP-010 H-29). Vale
 * para los dos composes, que construyen con el mismo `Dockerfile`. Devuelve qué archivo con llaves
 * entraría al contexto y si al `Dockerfile` le falta la guarda que tumba el build cuando entra uno.
 */
export function revisaImagen({ dockerignore, dockerfile }) {
  const entran = ARCHIVOS_CON_LLAVES.filter((ruta) => !excluida(dockerignore, ruta));
  const copia = dockerfile.indexOf('COPY . .');
  const guarda = dockerfile.search(/RUN if find \.[^\n]*-name '\.env\*'[^\n]*\n[^\n]*exit 1/);
  const build = dockerfile.indexOf('RUN npm run build');
  return { entran, sinGuarda: !(copia >= 0 && guarda > copia && guarda < build) };
}

/** Lo que el anfitrión tiene y un clon limpio no: si entra al contexto, tapa que la imagen no sabe hacerlo. */
const DEL_ANFITRION = ['tools/una-herramienta/node_modules/un-paquete/index.js', 'tools/una-herramienta/dist/index.js',
  'tools/una-herramienta/tu-scope-una-herramienta-0.1.0.tgz'];

/**
 * Si la imagen se construye desde un clon limpio, que es lo que tiene un servidor recién clonado
 * (PRP-010 H-30). `importados` son las rutas, relativas a la raíz, que `src/` importa desde fuera de
 * `src/`; las lee quien llama. Devuelve:
 *   · `sinHerramientas`: el build no compila `tools/<x>/dist` ni instala sus peers (`prepara-gate`).
 *   · `importsExcluidos`: lo que la app importa y `.dockerignore` deja fuera del contexto.
 *   · `delAnfitrion`: `node_modules`, `dist` o tarballs del anfitrión que entrarían al contexto.
 */
export function revisaConstruible({ dockerignore, dockerfile, scripts, importados }) {
  const build = dockerfile.indexOf('RUN npm run build');
  const enDockerfile = dockerfile.search(/RUN [^\n]*prepara-gate/);
  const compila = build >= 0 && (/prepara-gate/.test(scripts.prebuild ?? '') || (enDockerfile >= 0 && enDockerfile < build));
  const generado = (ruta) => /^tools\/[^/]+\/dist\//.test(ruta);
  return {
    sinHerramientas: !compila,
    importsExcluidos: importados.filter((ruta) => !generado(ruta) && excluida(dockerignore, ruta)),
    delAnfitrion: DEL_ANFITRION.filter((ruta) => !excluida(dockerignore, ruta)),
  };
}

/**
 * Recibe el compose ya parseado. Devuelve cada infracción con el servicio que la comete; todo vacío
 * significa que ningún servicio con documentos puede salir a internet ni mandar uno fuera.
 */
export function revisaPerimetro(compose) {
  const redes = compose.networks ?? {};
  const interna = (red) => redes[red]?.internal === true;
  const r = { conSalida: [], conPuertos: [], sinPinear: [], respaldoAbierto: [], llavesDeFuera: [], sinRed: [] };
  for (const [nombre, servicio] of Object.entries(compose.services ?? {})) {
    const suyas = redesDe(servicio);
    if (suyas.length === 0) r.sinRed.push(nombre); // sin `networks`, Compose lo pone en `default`, que sí sale
    if (!CON_SALIDA.has(nombre)) {
      if (suyas.some((red) => !interna(red))) r.conSalida.push(nombre);
      if ((servicio.ports ?? []).length > 0) r.conPuertos.push(nombre);
    }
    if (!servicio.build && !/@sha256:[0-9a-f]{64}$/.test(servicio.image ?? '')) r.sinPinear.push(nombre);
    const entorno = entornoDe(servicio);
    if ('EXTRACTOR_RESPALDO' in entorno && entorno.EXTRACTOR_RESPALDO !== 'ninguno') r.respaldoAbierto.push(nombre);
    if (!CON_SALIDA.has(nombre) && Object.keys(entorno).some((clave) => LLAVE_DE_FUERA.test(clave))) {
      r.llavesDeFuera.push(nombre);
    }
  }
  return r;
}
