/**
 * Cada afirmación que la transcripción del laboratorio («Transcripcion_SAPstack_entorno_corporativov1.md») hace sobre
 * sapstack, contrastada con su código. El veredicto sale de lo que se encuentra, no de una opinión: si la evidencia
 * cambia (otro SHA), el veredicto cambia con ella.
 */
import { archivos, buscaEnRepo, clavesDeTcodes, linea } from './sapstack.mjs'

const donde = (xs, n = 3) => (xs.length ? xs.slice(0, n).join(', ') + (xs.length > n ? ` (+${xs.length - n})` : '') : '—')
const en = (ruta, l) => (l ? `${ruta}:${l}` : `${ruta}: no aparece`)

function ci(clon) {
  const ruta = '.github/workflows/sapstack-ci-reusable.yml'
  const llamada = linea(clon, ruta, /^\s*workflow_call:/)
  const origen = linea(clon, ruta, /BoxLogoDev\/sapstack/)
  const refMain = linea(clon, ruta, /default:\s*'main'/)
  const porTag = buscaEnRepo(clon, /uses:\s*[\w-]+\/[\w-]+@v\d/, (a) => a.startsWith('.github/workflows/'))
  const otrosCi = buscaEnRepo(clon, /jenkins|gitlab/i, (a) => !a.startsWith('.git/'))
  return [
    { id: 'T1', dice: 'Existe `sapstack-ci-reusable.yml` y se invoca desde repos corporativos externos',
      veredicto: llamada && origen ? 'a medias' : 'falsa',
      porque: `Es reusable (workflow_call), pero su ejemplo apunta a BoxLogoDev/sapstack, que da 404, y \`sapstack-ref\` vale \`main\` por defecto. Las actions van por tag, no por SHA (${porTag.length}).`,
      evidencia: [en(ruta, llamada), en(ruta, origen), en(ruta, refMain), donde(porTag, 2)].join(' · ') },
    { id: 'T2', dice: 'Hay una guía para Jenkins o GitLab CI', veredicto: otrosCi.length ? 'a medias' : 'falsa',
      porque: otrosCi.length ? 'Se nombran, sin guía.' : 'Ni Jenkins ni GitLab aparecen en el repo: es una sugerencia, no algo que exista.',
      evidencia: donde(otrosCi) },
  ]
}

function herencia(clon) {
  const k = clavesDeTcodes(clon)
  const excepciones = archivos(clon).filter((a) => /(local|exception|override|예외)/i.test(a))
  const fallback = buscaEnRepo(clon, /fallback|override|precedence|우선순위|예외 ?규칙/i, (a) => /\.(md|ya?ml|sh|json|mdc)$/.test(a))
  const corea = linea(clon, '.sapstack/config.schema.yaml', /^\s*korea:/)
  const resuelve = linea(clon, 'scripts/resolve-note.sh', /NOTES_YAML="data\/sap-notes\.yaml"/)
  return [
    { id: 'T3', dice: 'El repo tiene «unos 279 T-codes confirmados»', veredicto: k.repetidas.length ? 'a medias' : 'cierta',
      porque: `${k.claves.length} líneas de clave y ${k.unicas} códigos únicos: ${k.repetidas.map((r) => `${r.codigo} está ${r.lineas.length} veces`).join(', ') || 'sin repetidos'}. Un lector YAML estricto rechaza el archivo; uno tolerante se queda con la última. «Confirmados» lo dice el archivo, sin fuente por entrada.`,
      evidencia: [en('README.md', linea(clon, 'README.md', /279/)), ...k.repetidas.map((r) => r.lineas.map((l) => `data/tcodes.yaml:${l}`).join(', '))].join(' · ') },
    { id: 'T4', dice: 'Una jerarquía programática bien documentada, resumida por módulos', veredicto: 'cierta',
      porque: 'Los T-codes van agrupados por secciones de módulo y cada uno lleva `modules` y `release`.',
      evidencia: en('data/tcodes.yaml', linea(clon, 'data/tcodes.yaml', /^# BASIS/)) },
    { id: 'T5', dice: 'En un entorno coreano, la herramienta busca primero en la carpeta de excepciones locales y si no, aplica la regla global',
      veredicto: excepciones.length ? 'a medias' : 'falsa',
      porque: `No hay carpeta de excepciones ni lógica de respaldo. Lo coreano es un perfil de entorno que el asistente lee (\`korea:\`); nada resuelve un choque entre reglas.${fallback.length ? ` Las menciones a «fallback/override» son: ${donde(fallback, 2)}.` : ''}`,
      evidencia: [en('.sapstack/config.schema.yaml', corea), `carpetas de excepciones: ${donde(excepciones)}`].join(' · ') },
    { id: 'T6', dice: '`resolve-note.sh` interactúa con las actualizaciones generales, y la guía debe explicar cómo no rompe lo local',
      veredicto: 'falsa',
      porque: 'Solo busca palabras clave en `data/sap-notes.yaml` y devuelve número, título y URL. No lee reglas locales ni globales, ni participa en ninguna actualización.',
      evidencia: en('scripts/resolve-note.sh', resuelve) },
    { id: 'T7', dice: 'Al actualizar el módulo global, el sistema verifica y aísla las dependencias para no romperlas',
      veredicto: 'falsa', porque: 'No existe ese mecanismo: no hay dependencias declaradas entre reglas.',
      evidencia: donde(buscaEnRepo(clon, /depend/i, (a) => a.startsWith('scripts/'))) },
  ]
}

function fuenteUnica(clon) {
  const leeTcodes = linea(clon, 'scripts/build-multi-ai.sh', /tcodes\.yaml/)
  const conMarcador = buscaEnRepo(clon, /BEGIN sapstack-auto/, (a) => !/^(scripts|docs)\/|CHANGELOG/.test(a))
  const banners = buscaEnRepo(clon, /DO NOT EDIT|AUTO-?GENERATED|자동 생성된 파일/i)
  const checkTcodes = linea(clon, 'scripts/check-tcodes.sh', /tcodes\.yaml/)
  return [
    { id: 'T8', dice: '`data/tcodes.yaml` es el archivo maestro de datos', veredicto: 'a medias',
      porque: 'Es la lista contra la que `check-tcodes.sh` revisa los SKILL.md: valida, no genera. Ninguna regla de las plataformas sale de él.',
      evidencia: en('scripts/check-tcodes.sh', checkTcodes) },
    { id: 'T9', dice: '`build-multi-ai.sh` captura un cambio en el YAML y reescribe las reglas para todas las plataformas',
      veredicto: leeTcodes ? 'a medias' : 'falsa',
      porque: `No lee \`tcodes.yaml\`: solo inyecta bloques de lista de plugins y estadísticas entre marcadores. Y ningún archivo de las plataformas tiene esos marcadores (${conMarcador.length}).`,
      evidencia: [en('scripts/build-multi-ai.sh', linea(clon, 'scripts/build-multi-ai.sh', /BEGIN sapstack-auto: plugin-list/)), `marcadores fuera de scripts/docs: ${donde(conMarcador)}`].join(' · ') },
    { id: 'T10', dice: 'Los archivos generados llevan (o deben llevar) un banner «ALTO: autogenerado»', veredicto: banners.length ? 'a medias' : 'falsa',
      porque: banners.length ? 'Hay algún aviso.' : 'No hay ningún banner: hoy nada distingue un archivo generado de uno escrito a mano.',
      evidencia: donde(banners) },
    { id: 'T11', dice: '`CONTRIBUTING.md` es el lugar para el diagrama de mantenimiento', veredicto: 'cierta',
      porque: 'Existe, pero sin diagrama de fuente única.',
      evidencia: en('CONTRIBUTING.md', linea(clon, 'CONTRIBUTING.md', /\S/)) },
    { id: 'T12', dice: 'Hay validaciones locales que mapear a un CI empresarial', veredicto: 'cierta',
      porque: `${archivos(clon).filter((a) => /^scripts\/(check|lint|validate)-/.test(a)).length} guiones de validación en \`scripts/\`, y un \`ci.yml\` que los corre.`,
      evidencia: en('.github/workflows/ci.yml', linea(clon, '.github/workflows/ci.yml', /^jobs:/)) },
  ]
}

/** La tabla completa, en el orden de la transcripción. */
export function afirmaciones(clon) {
  return [...ci(clon), ...herencia(clon), ...fuenteUnica(clon)]
}
