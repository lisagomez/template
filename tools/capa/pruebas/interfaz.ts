/**
 * La interfaz renderizada en el servidor (sin navegador): la ventana trae sus ranuras, la marca del producto y el
 * botón «Modo conversación» accesible; sin voz local el botón no aparece y se explica por qué; y nada lleva la
 * marca de Arbrain. El recorrido con navegador (Playwright) va aparte, sobre la app.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { AlmacenEnMemoria, resuelveComposicion, type ControlConversacion, type ModuloDeVoz } from '../dist/index.js'
import { CapaProveedor, moduloDeRuta, Ventana } from '../dist/react/index.js'
import { AGENDA, BUZON, COMPOSICION, ENCHUFES, copia } from './_base.ts'

const control: ControlConversacion = { estado: () => 'apagado', enciende: async () => ({ ok: true }), apaga: () => undefined, suscribe: () => () => undefined }
const voz: ModuloDeVoz = { creaControl: () => control, lee: async () => undefined, dicta: async () => '' }

function pinta(composicion = COMPOSICION, enchufes = ENCHUFES, modulo: ModuloDeVoz | undefined = voz) {
  const producto = resuelveComposicion(composicion, enchufes)
  return renderToString(h(CapaProveedor, { producto, inquilino: 'demo', manejadores: {}, almacen: new AlmacenEnMemoria(), voz: modulo, ruta: '/agenda', children: h(Ventana, null, h('p', null, 'pantalla de la agenda')) }))
}

test('la ventana trae sus ranuras, la marca del producto y la pantalla del módulo en el lienzo', () => {
  const html = pinta()
  for (const r of ['lienzo', 'explorador', 'panel', 'conversacion', 'voz']) assert.match(html, new RegExp(`data-capa-ranura="${r}"`), r)
  assert.match(html, /data-capa-ventana="consultorio-demo"/)
  assert.match(html, /data-capa-modulo="agenda"/)
  assert.match(html, /Consultorio Demo/)
  assert.match(html, /pantalla de la agenda/)
  assert.doesNotMatch(html, /Levy|Arbrain|levy-face|retratos/)
})

test('el botón «Modo conversación» se ve, se puede usar con teclado y dice su estado', () => {
  const html = pinta()
  assert.match(html, /data-capa-boton="modo-conversacion"/)
  assert.match(html, /aria-pressed="false"/)
  assert.match(html, /aria-keyshortcuts="Alt\+C"/)
  assert.match(html, /Micrófono cerrado/)
})

test('sin motor local la ranura de voz no pinta el botón: explica por qué', () => {
  const sinLocal = { ...copia(COMPOSICION), voz: { stt: 'groq', tts: 'elevenlabs', vad: 'silero', nube: [] } }
  const html = pinta(sinLocal, [AGENDA, BUZON])
  assert.doesNotMatch(html, /data-capa-boton="modo-conversacion"/)
  assert.match(html, /data-capa-voz="no-disponible"/)
  assert.match(html, /no se llena sola con la nube/)
})

test('la ruta encuentra a su módulo (la pantalla declarada más larga; [segmento] vale por uno)', () => {
  const pantallas = [{ modulo: 'sgi', ruta: '/sgi' }, { modulo: 'sgi-org', ruta: '/sgi/[org]' }, { modulo: 'agenda', ruta: '/agenda' }]
  assert.equal(moduloDeRuta('/sgi/acme/riesgos', pantallas), 'sgi-org')
  assert.equal(moduloDeRuta('/sgi', pantallas), 'sgi')
  assert.equal(moduloDeRuta('/agenda', pantallas), 'agenda')
  assert.equal(moduloDeRuta('/otra', pantallas), null)
})

test('el módulo que llena el explorador pinta lo suyo arriba y las pantallas siguen debajo', () => {
  const producto = resuelveComposicion({ ...copia(COMPOSICION), ranuras: { plan: 'agenda', explorador: 'buzon' } }, ENCHUFES)
  assert.equal(producto.ranuras.explorador.quien, 'buzon')
  const html = renderToString(h(CapaProveedor, { producto, inquilino: 'demo', manejadores: {}, almacen: new AlmacenEnMemoria(), voz, ruta: '/agenda',
    componentes: { buzon: { explorador: () => h('ul', { 'data-arbol': 'buzon' }, h('li', null, 'Carpeta del buzón')) } },
    children: h(Ventana, null, h('p', null, 'pantalla')) }))
  const nav = html.slice(html.indexOf('class="capa-explorador"'), html.indexOf('</nav>'))
  assert.match(nav, /data-capa-ranura="explorador" data-capa-llena="buzon"/)
  assert.ok(nav.indexOf('Carpeta del buzón') < nav.indexOf('href="/agenda"'), 'lo del módulo va antes que la lista de pantallas')
  assert.match(nav, /href="\/buzon"/, 'las pantallas siguen ahí')
})

test('sin componente del módulo, el explorador es el de la capa (nada cambia para quien no lo llena)', () => {
  const html = pinta()
  const nav = html.slice(html.indexOf('class="capa-explorador"'), html.indexOf('</nav>'))
  assert.doesNotMatch(nav, /data-capa-llena=/)
  assert.match(nav, /href="\/agenda"/)
})

test('lo que pinta el módulo de la conversación va junto al hilo de la capa, nunca en su lugar', () => {
  const conChat = { ...copia(BUZON), ranuras: [...BUZON.ranuras, 'conversacion' as const] }
  const producto = resuelveComposicion({ ...copia(COMPOSICION), ranuras: { plan: 'agenda', conversacion: 'buzon' } }, [AGENDA, conChat, ENCHUFES[2]!])
  const html = renderToString(h(CapaProveedor, { producto, inquilino: 'demo', manejadores: {}, almacen: new AlmacenEnMemoria(), voz, ruta: '/agenda',
    componentes: { buzon: { conversacion: () => h('div', { 'data-hilo-del-modulo': '1' }, 'Hilo del canal') } },
    children: h(Ventana, null, h('p', null, 'pantalla')) }))
  const aside = html.slice(html.indexOf('class="capa-conversacion"'))
  assert.match(aside, /data-hilo-del-modulo/)
  assert.ok(aside.indexOf('Hilo del canal') < aside.indexOf('role="log"'), 'va antes del hilo de la capa')
  assert.match(aside, /data-capa-entrada/, 'el compositor de la capa sigue ahí')
})
