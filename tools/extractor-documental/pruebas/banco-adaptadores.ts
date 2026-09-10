/**
 * Los puertos implementados sobre la base: que guarden, que lean, y que la idempotencia sea la
 * correcta para cada CLASE de fuente.
 *
 * Lo ultimo es lo que mas importa. Deduplicar por contenido es correcto para una factura y
 * catastrofico para un evento de trazabilidad, y la diferencia no produce ningun error: produce un
 * evento que desaparece (§2.9 del SDD).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  identidadDe, identidadDeLectura, encola, marcaSincronizada, marcaFallida,
  abreLote, cierraLote, rutaDeOriginal, extensionPermitida, extraeIdentificadoresIndexables, desfaseDeReloj,
} from '../dist/index.js'
import type { LecturaDeCodigo } from '../dist/index.js'
import { siembra } from '../banco/semilla.ts'
import { abreBase } from '../banco/base.ts'
import {
  almacenDeDocumentos, almacenDePlantillas, almacenDeOriginales,
  almacenDeCola, repositorioDeRegistros,
} from '../banco/adaptadores.ts'
import { ORGANIZACION, USUARIOS, GUIAS, PRODUCTOS } from '../banco/negocio.ts'
import { comoBytes } from '../banco/documentos.ts'

const opcionesDe = (base: ReturnType<typeof abreBase>) => ({ base, organizacionId: ORGANIZACION.id })

test('AlmacenDocumentos: guarda, lee y lista', async () => {
  const { base, resumen } = siembra()
  try {
    const almacen = almacenDeDocumentos(opcionesDe(base))
    const bytes = comoBytes(resumen.documentos[0])
    const id = await identidadDe(bytes)
    await almacen.guarda(id, [{ indice: 0, markdown: 'hola', campos: [] }])
    const leido = await almacen.lee(id)
    assert.ok(leido)
    assert.equal(leido[0].markdown, 'hola')
    assert.deepEqual(await almacen.lista(), [id])
  } finally {
    base.cierra()
  }
})

test('AlmacenDocumentos: un documento inexistente devuelve null, no lanza', async () => {
  const { base } = siembra()
  try {
    assert.equal(await almacenDeDocumentos(opcionesDe(base)).lee('f'.repeat(64)), null)
  } finally {
    base.cierra()
  }
})

test('DOCUMENTO: el mismo contenido guardado dos veces produce UN registro', async () => {
  const { base, resumen } = siembra()
  try {
    const almacen = almacenDeDocumentos(opcionesDe(base))
    const bytes = comoBytes(resumen.documentos[0])
    const id = await identidadDe(bytes)
    await almacen.guarda(id, [{ indice: 0, markdown: 'primera vez', campos: [] }])
    await almacen.guarda(id, [{ indice: 0, markdown: 'reprocesado', campos: [] }])
    // Reprocesar es idempotente: es la propiedad entera de `identidadDe()`. Un insert a secas
    // habria duplicado el archivo en el primer reintento de un lote a medio fallar.
    assert.equal((await almacen.lista()).length, 1)
    const leido = await almacen.lee(id)
    assert.equal(leido?.[0].markdown, 'reprocesado')
  } finally {
    base.cierra()
  }
})

test('EVENTO: el mismo codigo escaneado dos veces produce DOS eventos', async () => {
  const guia = GUIAS[0]
  const salida: LecturaDeCodigo = {
    clase: 'evento',
    carga: guia.numero,
    instanteDispositivo: '2026-09-01T09:15:00.000Z',
    puesto: 'almacen-norte',
  }
  const llegada: LecturaDeCodigo = { ...salida, instanteDispositivo: '2026-09-01T17:40:00.000Z', puesto: 'cliente' }
  const [a, b] = await Promise.all([identidadDeLectura(salida), identidadDeLectura(llegada)])
  // Escanear la misma guia al salir del almacen y al llegar son legitimamente dos hechos. Una
  // identidad por el codigo solo habria descartado el segundo EN SILENCIO, y perder un evento es
  // exactamente lo que vuelve inutil un sistema de trazabilidad.
  assert.notEqual(a, b)
})

test('EVENTO: dos eventos del mismo puesto y distinto instante siguen siendo dos', async () => {
  const base: LecturaDeCodigo = {
    clase: 'evento',
    carga: GUIAS[1].numero,
    instanteDispositivo: '2026-09-01T09:00:00.000Z',
    puesto: 'reparto-02',
  }
  const [a, b] = await Promise.all([
    identidadDeLectura(base),
    identidadDeLectura({ ...base, instanteDispositivo: '2026-09-01T09:00:01.000Z' }),
  ])
  assert.notEqual(a, b)
})

test('ETIQUETA: dos lecturas del mismo GTIN, lote y serie son la misma caja', async () => {
  const claves = { gtin: PRODUCTOS[0].gtin, lote: 'L2609', serie: '00042' }
  const primera: LecturaDeCodigo = {
    clase: 'etiqueta',
    carga: `01${claves.gtin}10${claves.lote}21${claves.serie}`,
    instanteDispositivo: '2026-09-01T10:00:00.000Z',
    claves,
  }
  // Distinto instante y distinto puesto: para una ETIQUETA eso da igual, la identidad son sus claves.
  const segunda: LecturaDeCodigo = { ...primera, instanteDispositivo: '2026-09-01T11:00:00.000Z', puesto: 'otro' }
  const [a, b] = await Promise.all([identidadDeLectura(primera), identidadDeLectura(segunda)])
  assert.equal(a, b)
})

test('AlmacenLocal: la cola guarda, cuenta pendientes y respeta el orden del dispositivo', async () => {
  const { base } = siembra()
  try {
    const cola = almacenDeCola(opcionesDe(base))
    const tarde = encola('e2', {
      clase: 'evento', carga: GUIAS[0].numero, instanteDispositivo: '2026-09-01T17:40:00.000Z', puesto: 'cliente',
    })
    const temprano = encola('e1', {
      clase: 'evento', carga: GUIAS[0].numero, instanteDispositivo: '2026-09-01T09:15:00.000Z', puesto: 'almacen-norte',
    })
    await cola.guarda(tarde)
    await cola.guarda(temprano)
    assert.equal(await cola.cuenta(), 2)
    // El orden lo manda el instante del DISPOSITIVO, no el de insercion: es lo que hace que la
    // trazabilidad sobreviva a una sincronizacion en rafaga al recuperar cobertura.
    assert.deepEqual((await cola.listaPendientes()).map((e) => e.id), ['e1', 'e2'])
  } finally {
    base.cierra()
  }
})

test('AlmacenLocal: sincronizar no toca el instante del dispositivo', async () => {
  const { base } = siembra()
  try {
    const cola = almacenDeCola(opcionesDe(base))
    const entrada = encola('e1', {
      clase: 'evento', carga: GUIAS[0].numero, instanteDispositivo: '2026-09-01T09:15:00.000Z', puesto: 'p1',
    })
    await cola.guarda(entrada)
    await cola.guarda(marcaSincronizada(entrada, '2026-09-01T09:20:00.000Z'))
    const leida = await cola.lee('e1')
    assert.equal(leida?.estado, 'sincronizada')
    assert.equal(leida?.lectura.instanteDispositivo, '2026-09-01T09:15:00.000Z')
    assert.equal(desfaseDeReloj(leida!), 300_000)
    assert.equal(await cola.cuenta(), 0, 'ya no esta pendiente')
  } finally {
    base.cierra()
  }
})

test('AlmacenLocal: una entrada fallida conserva el error y suma intento', async () => {
  const { base } = siembra()
  try {
    const cola = almacenDeCola(opcionesDe(base))
    const entrada = encola('e1', {
      clase: 'documento', carga: 'x', instanteDispositivo: '2026-09-01T09:00:00.000Z',
    })
    await cola.guarda(marcaFallida(entrada, 'sin conexion'))
    const leida = await cola.lee('e1')
    assert.equal(leida?.estado, 'fallida')
    assert.equal(leida?.intentos, 1)
    assert.equal(leida?.ultimoError, 'sin conexion')
  } finally {
    base.cierra()
  }
})

test('AlmacenPlantillas: el trabajo del humano se guarda por tipo de documento', async () => {
  const { base } = siembra()
  try {
    const almacen = almacenDePlantillas(opcionesDe(base))
    assert.equal(await almacen.leePorDefecto('factura'), null)
    await almacen.guardaPorDefecto('factura', { campos: ['folio', 'total'] })
    assert.deepEqual(await almacen.leePorDefecto('factura'), { campos: ['folio', 'total'] })
    await almacen.guardaPorDefecto('factura', { campos: ['folio'] })
    assert.deepEqual(await almacen.leePorDefecto('factura'), { campos: ['folio'] }, 'una por tipo')
  } finally {
    base.cierra()
  }
})

test('AlmacenDeOriginales: guarda bytes, los devuelve firmados y los borra', async () => {
  const { base, resumen } = siembra()
  try {
    const almacen = almacenDeOriginales(opcionesDe(base))
    const bytes = comoBytes(resumen.documentos[0])
    const sha = await identidadDe(bytes)
    // 'pdf' y no 'txt': el original es la EVIDENCIA visual, y el nucleo solo admite formatos de
    // documento o imagen. Los documentos sinteticos de este banco son texto plano, asi que lo que
    // se guarda aqui son sus bytes bajo una extension admitida — el almacen no interpreta el
    // contenido, y esa separacion es justo lo que permite probarlo sin fabricar un PDF de verdad.
    const ruta = rutaDeOriginal(ORGANIZACION.id, sha, 'pdf')
    await almacen.guarda(ruta, bytes, 'text/plain')
    const url = await almacen.urlFirmada(ruta, 60)
    assert.ok(url.includes('vence='), 'el plazo tiene que viajar en lo devuelto')
    assert.ok(url.includes('simulada=si'), 'y tiene que decir que no es una firma de verdad')
    await almacen.borra(ruta)
    await assert.rejects(() => almacen.urlFirmada(ruta, 60), /no hay original/)
  } finally {
    base.cierra()
  }
})

test('AlmacenDeOriginales: la ruta empieza por la organizacion', async () => {
  // Espejo de la politica de RLS de `storage.objects`, que autoriza por `(storage.foldername(name))[1]`.
  const sha = await identidadDe(new TextEncoder().encode('x'))
  assert.ok(rutaDeOriginal(ORGANIZACION.id, sha, 'pdf').startsWith(`${ORGANIZACION.id}/`))
})

test('AlmacenDeOriginales: un formato que no es evidencia visual se rechaza', async () => {
  const sha = await identidadDe(new TextEncoder().encode('x'))
  assert.equal(extensionPermitida('txt'), false)
  assert.throws(() => rutaDeOriginal(ORGANIZACION.id, sha, 'txt'), /Extension no admitida/)
})

test('RepositorioDeRegistros: guarda un lote y lo recupera igual', async () => {
  const { base } = siembra()
  try {
    const repo = repositorioDeRegistros(opcionesDe(base))
    const lote = abreLote({
      id: 'lote-1', organizacionId: ORGANIZACION.id, titulo: 'Facturas de septiembre',
      tipoTrabajo: 'facturas', creadoPor: USUARIOS.operario.id, rol: 'operario',
    }, new Date('2026-09-01T08:00:00.000Z'))
    await repo.guardaLote(lote)
    assert.deepEqual(await repo.leeLote('lote-1'), lote)
  } finally {
    base.cierra()
  }
})

test('RepositorioDeRegistros: busca por titulo parcial y por estado', async () => {
  const { base } = siembra()
  try {
    const repo = repositorioDeRegistros(opcionesDe(base))
    const lote = abreLote({
      id: 'lote-1', organizacionId: ORGANIZACION.id, titulo: 'Conteo almacen norte 07/09',
      tipoTrabajo: 'inventario', creadoPor: USUARIOS.operario.id, rol: 'operario',
    }, new Date('2026-09-01T08:00:00.000Z'))
    await repo.guardaLote(lote)
    assert.equal((await repo.busca({ titulo: 'almacen' })).length, 1)
    assert.equal((await repo.busca({ titulo: 'ALMACEN' })).length, 1, 'sin distinguir mayusculas')
    assert.equal((await repo.busca({ titulo: 'inexistente' })).length, 0)
    assert.equal((await repo.busca({ estado: 'abierto' })).length, 1)
    await repo.guardaLote(cierraLote(lote, 'revisor', new Date('2026-09-02T08:00:00.000Z')))
    assert.equal((await repo.busca({ estado: 'abierto' })).length, 0)
    assert.equal((await repo.busca({ estado: 'cerrado' })).length, 1)
  } finally {
    base.cierra()
  }
})

test('el indice de identificadores es lo que hace recuperable un lote', () => {
  // El titulo es para el humano; lo que se busca de verdad es "la factura A-1004".
  const entradas = extraeIdentificadoresIndexables([
    { clave: 'folio', valor: ' a-1004 ', confianza: 0.9, procedencia: 'ocr', formato: 'identificador' },
    { clave: 'total', valor: '123.45', confianza: 0.9, procedencia: 'ocr' },
  ])
  assert.deepEqual(entradas, [{ clave: 'folio', valorNormalizado: 'A-1004' }])
})

test('el aislamiento por organizacion: otra organizacion no ve los documentos', async () => {
  const { base } = siembra()
  try {
    base.db
      .prepare('insert into organizaciones (id, nombre, creado_en) values (?, ?, ?)')
      .run('org-ajena', 'Otra empresa', '2026-09-01T08:00:00.000Z')
    const mio = almacenDeDocumentos(opcionesDe(base))
    const ajeno = almacenDeDocumentos({ base, organizacionId: 'org-ajena' })
    const id = await identidadDe(new TextEncoder().encode('secreto'))
    await mio.guarda(id, [{ indice: 0, markdown: 'secreto', campos: [] }])
    assert.equal(await ajeno.lee(id), null)
    assert.deepEqual(await ajeno.lista(), [])
    // OJO: aqui lo impone este codigo, no la base. En produccion lo imponen las policies de RLS,
    // que son una garantia mas fuerte — y que este banco NO ejercita (ver `banco/esquema.ts`).
  } finally {
    base.cierra()
  }
})

test('RepositorioDeRegistros: el rango de fechas se APLICA, no se ignora', async () => {
  const { base } = siembra()
  try {
    const repo = repositorioDeRegistros(opcionesDe(base))
    const enAgosto = abreLote({
      id: 'lote-ago', organizacionId: ORGANIZACION.id, titulo: 'Facturas de agosto',
      tipoTrabajo: 'facturas', creadoPor: USUARIOS.operario.id, rol: 'operario',
    }, new Date('2026-08-15T08:00:00.000Z'))
    const enSeptiembre = abreLote({
      id: 'lote-sep', organizacionId: ORGANIZACION.id, titulo: 'Facturas de septiembre',
      tipoTrabajo: 'facturas', creadoPor: USUARIOS.operario.id, rol: 'operario',
    }, new Date('2026-09-15T08:00:00.000Z'))
    await repo.guardaLote(enAgosto)
    await repo.guardaLote(enSeptiembre)

    assert.equal((await repo.busca({})).length, 2)
    const soloSeptiembre = await repo.busca({ desde: '2026-09-01T00:00:00.000Z' })
    assert.equal(soloSeptiembre.length, 1, 'pedir "desde septiembre" no puede devolver agosto')
    assert.equal((soloSeptiembre[0] as { id: string }).id, 'lote-sep')
    assert.equal((await repo.busca({ hasta: '2026-08-31T23:59:59.999Z' })).length, 1)
    assert.equal(
      (await repo.busca({ desde: '2026-09-01T00:00:00.000Z', hasta: '2026-09-30T23:59:59.999Z' })).length,
      1,
    )
    assert.equal((await repo.busca({ desde: '2027-01-01T00:00:00.000Z' })).length, 0)
  } finally {
    base.cierra()
  }
})

test('AlmacenDocumentos: dos identidades con el mismo prefijo no colisionan', async () => {
  const { base } = siembra()
  try {
    const almacen = almacenDeDocumentos(opcionesDe(base))
    // Se fuerza el caso que un id truncado a 16 caracteres habria confundido: mismo prefijo largo,
    // hashes distintos. Con el prefijo, el segundo habria pisado al primero en la clave primaria.
    const a = `${'ab'.repeat(8)}${'0'.repeat(48)}`
    const b = `${'ab'.repeat(8)}${'1'.repeat(48)}`
    assert.equal(a.slice(0, 16), b.slice(0, 16), 'los 16 primeros caracteres coinciden')
    await almacen.guarda(a, [{ indice: 0, markdown: 'documento A', campos: [] }])
    await almacen.guarda(b, [{ indice: 0, markdown: 'documento B', campos: [] }])
    assert.equal((await almacen.lista()).length, 2, 'son dos documentos distintos')
    assert.equal((await almacen.lee(a))?.[0].markdown, 'documento A')
    assert.equal((await almacen.lee(b))?.[0].markdown, 'documento B')
  } finally {
    base.cierra()
  }
})
