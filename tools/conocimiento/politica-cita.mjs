/**
 * Qué cita cada dominio, con qué fecha de corte (RF-5) y de qué fuente puede salir una regla de un dominio que nace
 * aquí. Lo lee la suite (`pruebas/conocimiento.ts` y `pruebas/cita.ts`), que corre dentro de `npm run validate`: lo que
 * no cumple no se siembra.
 *
 * - Los dominios migrados de Hermes citan leyes publicadas (`publica`), con el corte de Hermes.
 * - Un dominio que nace aquí se declara en `DOMINIOS_PROPIOS`, con su cita, desde cuándo corta y qué fuentes admite.
 *   Declararlo abre la suite: es un CDC. Uno sin declarar se mide como migrado, y no pasa.
 * - `sap-soporte` (D-SS-3, 2026-10-22) cita `interna`, porque una de sus fuentes es la experiencia del experto, que no
 *   es pública. Sus reglas salen de una SAP Note (solo el número y el enlace a SAP for Me), de SAP Help o de la
 *   experiencia documentada en CAMBIOS.md; sapstack, nunca por sí solo (D-SS-2). La suite comprueba la forma de la
 *   fuente, no que sea buena: eso lo decide el laboratorio al firmar.
 */
import { CORTE_HERMES } from '../grafo-conocimiento/dist/index.js'

/** El corte de los dominios migrados: entre el primer seed y el commit congelado de Hermes. */
export const VENTANA_HERMES = { desde: '2026-07-01', hasta: CORTE_HERMES.fecha }

const NOTA = /^https:\/\/me\.sap\.com\/notes\/(\d+)(?:[/?#]|$)/
const AYUDA = /^https:\/\/help\.sap\.com\//
const EXPERIENCIA = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/tools\/conocimiento\/CAMBIOS\.md(?:#\S*)?$/

/** D-SS-2: la fuente de una regla de Soporte SAP, o por qué no vale. */
function fuenteSapSoporte(r) {
  if (/sapstack/i.test(r.fuente_url)) return 'cita a sapstack: es una fuente secundaria y nunca basta por sí sola (D-SS-2)'
  const nota = NOTA.exec(r.fuente_url)
  if (nota) return new RegExp(`\\bSAP Note ${nota[1]}\\b`).test(r.fuente_cita) ? null : `el enlace es la SAP Note ${nota[1]} y la cita no la nombra`
  if (AYUDA.test(r.fuente_url)) return null
  if (EXPERIENCIA.test(r.fuente_url)) {
    return r.fuente_cita.startsWith('Experiencia documentada del experto') ? null : 'un enlace a CAMBIOS.md cita «Experiencia documentada del experto…»'
  }
  return 'fuente no admitida en sap-soporte: una SAP Note (me.sap.com/notes/N), SAP Help (help.sap.com) o la experiencia documentada en CAMBIOS.md (D-SS-2)'
}

/** Los dominios que nacen aquí y no en Hermes. Añadir uno es un CDC de la suite. */
export const DOMINIOS_PROPIOS = {
  'sap-soporte': {
    cita: 'interna',
    desde: '2026-10-22',
    porque: 'D-SS-3 (docs/goals/soporte-sap-sapstack-propuesta.md §10.2): cita la experiencia del experto, que no es pública',
    fuente: fuenteSapSoporte,
  },
}

/**
 * Lo que no cumple, como `{ clave, motivo }`; vacío es que pasa. `c` es el conocimiento validado y `cambios`, el texto
 * de CAMBIOS.md: cada regla de un dominio propio aparece ahí, entre comillas invertidas, que es donde firma el laboratorio.
 */
export function problemasDeCita(c, cambios) {
  const problemas = []
  const mal = (clave, motivo) => problemas.push({ clave, motivo })
  for (const d of c.dominios) {
    const propio = DOMINIOS_PROPIOS[d.clave]
    if (!propio) {
      if (d.cita !== 'publica') mal(d.clave, 'sin declarar en DOMINIOS_PROPIOS es de los migrados de Hermes, que citan leyes publicadas: `publica`')
      if (d.corte < VENTANA_HERMES.desde || d.corte > VENTANA_HERMES.hasta) mal(d.clave, `corte ${d.corte} fuera del de Hermes (${VENTANA_HERMES.desde} a ${VENTANA_HERMES.hasta}): un dominio nuevo se declara en DOMINIOS_PROPIOS`)
      continue
    }
    if (d.cita !== propio.cita) mal(d.clave, `cita \`${d.cita}\` y su declaración dice \`${propio.cita}\``)
    if (d.corte < propio.desde) mal(d.clave, `corte ${d.corte} anterior a ${propio.desde}, cuando nace el dominio`)
    for (const r of c.reglas.filter((x) => x.impactos.some((i) => d.categorias.includes(i.categoria)))) {
      const motivo = propio.fuente(r)
      if (motivo) mal(r.clave, motivo)
      if (!cambios.includes(`\`${r.clave}\``)) mal(r.clave, 'no aparece en CAMBIOS.md: ahí la anota y la firma el laboratorio')
    }
  }
  return problemas
}
