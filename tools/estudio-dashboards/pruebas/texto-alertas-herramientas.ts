/**
 * Números del texto ⊆ resultados; alertas que se proponen y piden confirmación (y nunca envían); métricas que se
 * proponen como diff; la superficie de herramientas en seco por defecto; y el núcleo sin React, Next, Supabase ni Node.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  RechazoEsquema, cifrasRespaldadas, construyeCatalogo, consultor, ejecutaHerramienta, memoriaAlertas, memoriaVersiones,
  numerosDe, proponeAlerta, proponeMetrica, registraAlerta, HERRAMIENTAS, type ContextoEstudio,
} from '../dist/index.js'
import { FOTO, RAIZ, doble, tablero } from './_doble.ts'

const cat = construyeCatalogo(FOTO, FOTO.dominios)
const ev = [{ etiqueta: 'margen jul 2026', valor: 17.8203, unidad: '%', consulta: 'q' }, { etiqueta: 'ventas', valor: 74_530_332, unidad: 'MXN', consulta: 'q' }, { etiqueta: 'devolución', valor: 0.0247, unidad: 'proporción', consulta: 'q' }]

test('números del texto: se reconocen con signo, miles, decimales y «M»', () => {
  assert.deepEqual(numerosDe('pasó de 1,027 MXN a −7.8 pp y +22.7 %; 74.5 M').map((n) => [n.valor, n.decimales, n.escala]), [[1027, 0, 1], [-7.8, 1, 1], [22.7, 1, 1], [74.5, 1, 1e6]])
})

test('números del texto ⊆ resultados: lo que no sale de una consulta se señala', () => {
  assert.equal(cifrasRespaldadas('El margen quedó en 17.8 % con ventas de 74.5 M y devolución de 2.5 %.', ev).ok, true)
  const malo = cifrasRespaldadas('El margen quedó en 18.2 % y las ventas en 80 M.', ev)
  assert.deepEqual(malo.sinRespaldo, ['18.2', '80 M'])
  assert.equal(cifrasRespaldadas('En 2026 el margen fue 17.8 %.', ev, [2026]).ok, true, 'un año que dijo el usuario no es cifra')
})

test('alertas: se proponen, se validan y solo se registran con una persona que confirma; nunca hay canal', async () => {
  const regla = { metrica: 'ventas_netas', filtros: [{ dimension: 'tienda__tienda_nombre', operador: 'en', valores: ['Mérida'] }], condicion: 'cae_mas_de', valor: 5, unidad: '%', ventana: 'semanal' }
  const p = proponeAlerta(cat, regla)
  assert.equal(p.ok, true, JSON.stringify(p))
  if (!p.ok) return
  assert.equal(p.valor.estado, 'propuesta'); assert.equal(p.valor.canal, 'ninguno')
  const almacen = memoriaAlertas()
  await assert.rejects(registraAlerta(almacen, p.valor, null), /confirmación de una persona/)
  assert.equal((await almacen.lista()).length, 0)
  assert.equal((await registraAlerta(almacen, p.valor, 'Dirección comercial')).estado, 'registrada')
  assert.equal(proponeAlerta(cat, { ...regla, metrica: 'nps' }).ok, false)
  assert.equal(proponeAlerta(cat, { ...regla, metrica: 'clientes_activos', ventana: 'diaria' }).ok, false, 'clientes va por mes')
  assert.equal(proponeAlerta(cat, { ...regla, unidad: 'pp' }).ok, false, 'pp solo en métricas en %')
})

test('proponer métrica: diff si se arma con piezas que existen; si falta el dato, lo dice y no inventa YAML', () => {
  const ok = proponeMetrica(cat, { nombre: 'ventas_por_pedido_ecommerce', etiqueta: 'Venta e-commerce por pedido', descripcion: 'Ventas e-commerce / pedidos', tipo: 'ratio', numerador: 'ventas_ecommerce', denominador: 'pedidos', dueno: 'Digital', unidad: 'MXN' })
  assert.equal(ok.ok && ok.valor.tipo, 'diff')
  if (ok.ok) assert.match(ok.valor.diff ?? '', /^\+\s+- name: ventas_por_pedido_ecommerce$/m)
  const nps = proponeMetrica(cat, { nombre: 'nps', etiqueta: 'NPS', descripcion: 'Net Promoter Score', tipo: 'simple', medida: 'respuestas_nps', dueno: 'Experiencia', unidad: 'puntos' })
  assert.equal(nps.ok && nps.valor.tipo, 'requiere_datos')
  assert.equal(proponeMetrica(cat, { nombre: 'ventas_netas', etiqueta: 'x', descripcion: 'x', tipo: 'simple', medida: 'venta_neta', dueno: 'x', unidad: 'x' }).ok, false, 'la que ya existe se usa')
})

function contexto(): ContextoEstudio {
  return { consultor: consultor(doble(), cat), versiones: memoriaVersiones(), alertas: memoriaAlertas(), tablerosBase: { ejecutivo: tablero('ejecutivo') }, fechaCorte: '2026-09', reloj: () => '2026-10-20T12:00:00.000Z' }
}

test('herramientas: escribir va en seco por defecto; con aplicar queda una versión', async () => {
  const c = contexto()
  const parche = { esquema: 'estudio.parche/1', base: 0, alcance: { tipo: 'modificar', componentes: ['por_region'] }, operaciones: [{ op: 'cambiar', id: 'por_region', cambios: { tipo: 'linea' } }] }
  const seco = await ejecutaHerramienta(c, 'editar_dashboard', { tablero: 'ejecutivo', parche }) as { aplicado: boolean }
  assert.equal(seco.aplicado, false)
  assert.equal(await c.versiones.lee('ejecutivo'), null, 'en seco no se guarda nada')
  const hecho = await ejecutaHerramienta(c, 'editar_dashboard', { tablero: 'ejecutivo', parche, aplicar: true, autor: 'agente' }) as { aplicado: boolean; version: number }
  assert.deepEqual([hecho.aplicado, hecho.version], [true, 1])
  const leido = await ejecutaHerramienta(c, 'leer_dashboard', { tablero: 'ejecutivo' }) as { version: number; versiones: unknown[] }
  assert.deepEqual([leido.version, leido.versiones.length], [1, 2])
  await assert.rejects(ejecutaHerramienta(c, 'editar_dashboard', { tablero: 'ejecutivo', parche }), RechazoEsquema, 'el mismo parche ya va contra otra versión')
  await assert.rejects(ejecutaHerramienta(c, 'describir_metrica', { metrica: 'nps' }), /proponer_metrica/)
  await assert.rejects(ejecutaHerramienta(c, 'borrar_todo', {}), /no existe la herramienta/)
  const alerta = await ejecutaHerramienta(c, 'crear_alerta', { regla: { metrica: 'ventas_netas', filtros: [], condicion: 'cae_mas_de', valor: 5, unidad: '%', ventana: 'mensual' } }) as { alerta: { estado: string } }
  assert.equal(alerta.alerta.estado, 'propuesta')
  assert.equal((await c.alertas.lista()).length, 0)
})

test('la superficie: las nueve herramientas de la propuesta y las tres de versiones; las que escriben se declaran', () => {
  assert.deepEqual(HERRAMIENTAS.map((h) => h.nombre), ['listar_metricas', 'describir_metrica', 'consultar_metricas', 'leer_dashboard', 'editar_dashboard', 'analizar_variacion', 'ver_senales', 'crear_alerta', 'proponer_metrica', 'comparar_versiones', 'volver_version', 'fijar_oficial'])
  assert.deepEqual(HERRAMIENTAS.filter((h) => h.escribe).map((h) => h.nombre), ['editar_dashboard', 'crear_alerta', 'volver_version', 'fijar_oficial'])
})

test('el núcleo no importa React, Next, Supabase ni módulos de Node', () => {
  const dist = resolve(RAIZ, 'dist')
  const vistos = new Set<string>()
  const pendientes = [join(dist, 'index.js')]
  const externos: string[] = []
  while (pendientes.length) {
    const f = pendientes.pop()!
    if (vistos.has(f)) continue
    vistos.add(f)
    for (const [, esp] of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      if (esp!.startsWith('.')) pendientes.push(resolve(dirname(f), esp!))
      else externos.push(esp!)
    }
  }
  assert.deepEqual([...new Set(externos)].sort(), ['zod'])
  assert.ok(vistos.size >= 10)
})
