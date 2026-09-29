/**
 * La recepcion con foto del lado de la app: lo que valida Zod en cada accion nueva, que un
 * dispositivo de conteo no puede leer caducidades ni confirmar nada, y la subida de una foto REAL
 * por el mismo camino del servidor (con EXIF y GPS dentro): se guarda sin ellos, y un SVG, un
 * HTML o un archivo vacio se rechazan por sus bytes.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { huellaDeBytes, metadatosDeJpeg } from '../services/nucleo.ts';
import { esquemaAccion } from '../services/esquemas.ts';
import { permitida } from '../services/servidor/roles.ts';

const H = `sha256:${'a'.repeat(64)}`;
const valida = (x: unknown) => esquemaAccion.safeParse(x).success;

test('Zod: las acciones de la recepcion con foto aceptan lo bueno y rechazan lo que sobra o falta', () => {
  const lee = { accion: 'lee-caducidad', sitio: 'CEDIS-NTE', sku: 'REF-600', cajas: 20, codigo: { gtin: '07501031302741', nivel: 'unidad', formato: 'ean-13' }, foto: H, tomas: [H], zona: { x: 0.08, y: 0.36, ancho: 0.84, alto: 0.28 } };
  assert.ok(valida(lee));
  assert.ok(!valida({ ...lee, zona: { x: 0.1, y: 0.1, ancho: 2, alto: 0.2 } }), 'la zona va en fraccion de la foto');
  assert.ok(!valida({ ...lee, foto: '../../etc/passwd' }), 'una foto se cita por su huella SHA-256');
  assert.ok(!valida({ ...lee, tomas: [H, H, H] }), 'dos tomas extra como mucho');
  assert.ok(!valida({ ...lee, extra: 1 }), 'estricto: una clave que no se espera es un error');
  assert.ok(valida({ accion: 'revision-confirma', sitio: 'CEDIS-NTE', revision: H, caducidad: '2027-05-30', lote: 'L4471', formato: 'DDMMAA', tipo: 'caducidad' }));
  assert.ok(!valida({ accion: 'revision-confirma', sitio: 'CEDIS-NTE', revision: H, caducidad: '2027-05-30', lote: 'L 4471' }), 'el lote va en CSET 82, sin espacios');
  assert.ok(!valida({ accion: 'revision-confirma', sitio: 'CEDIS-NTE', revision: H, caducidad: '2027-05-30', lote: 'L4471', formato: 'latest' }));
  assert.ok(!valida({ accion: 'revision-descarta', sitio: 'CEDIS-NTE', revision: H, motivo: 'x' }), 'descartar lleva su motivo');
  assert.ok(valida({ accion: 'vincula-gtin', sku: 'DUL-001', gtin: '17506475123614', nivel: 'caja' }));
  assert.ok(valida({ accion: 'foto-articulo', sku: 'DUL-001', vista: 'caducidad', huella: H, nota: 'cuello, por encima del líquido' }));
  assert.ok(!valida({ accion: 'foto-articulo', sku: 'DUL-001', vista: 'principal' }), 'sin foto ni «retirada» no hay nada que registrar');
  assert.ok(valida({ accion: 'correccion', sitio: 'CEDIS-NTE', corrige: H, motivo: 'se leyó 38 por 30', caducidad: '2026-10-30', foto: H }));
});

test('un dispositivo de CONTEO no lee caducidades, no confirma, no vincula ni pone fotos', () => {
  for (const a of ['lee-caducidad', 'revision-confirma', 'revision-descarta', 'revisiones', 'vincula-gtin', 'foto-articulo']) assert.equal(permitida('conteo', a), false, a);
  assert.equal(permitida('operacion', 'lee-caducidad'), true);
});

test('subir una foto REAL con EXIF y GPS: se guarda normalizada y SIN ellos; SVG, HTML y vacio se rechazan', async () => {
  process.env['ETIQUETAS_DATOS'] = await mkdtemp(join(tmpdir(), 'etiquetas-fotos-'));
  const { subeFoto, fotosDelServidor } = await import('../services/servidor/fotos.ts');
  const celular = new Uint8Array(await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2a6' } }).jpeg()
    .withExifMerge({ IFD0: { Make: 'Telefono', Model: 'X' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '19/1 25/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '99/1 8/1 0/1' } }).toBuffer());
  assert.deepEqual(metadatosDeJpeg(celular), { exif: true, gps: true });
  const r = await subeFoto(celular);
  assert.ok(!('error' in r));
  assert.deepEqual([r.exifQuitado, r.gpsQuitado, r.ancho, r.alto], [true, true, 1200, 900]);
  const guardada = await fotosDelServidor().lee(r.huella);
  assert.ok(guardada);
  assert.deepEqual(metadatosDeJpeg(guardada.bytes), { exif: false, gps: false }, 'en disco no queda ni el EXIF ni la ubicación');
  assert.equal(huellaDeBytes(guardada.bytes), r.huella);
  const archivos = (await readdir(join(process.env['ETIQUETAS_DATOS']!, 'fotos', r.huella.slice(7, 9))));
  for (const a of archivos) assert.deepEqual(metadatosDeJpeg(new Uint8Array(await readFile(join(process.env['ETIQUETAS_DATOS']!, 'fotos', r.huella.slice(7, 9), a)))).gps, false);
  assert.match(String((await subeFoto(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) as { error: string }).error), /SVG/);
  assert.match(String((await subeFoto(new TextEncoder().encode('<html><body>hola</body></html>')) as { error: string }).error), /no es una foto/);
  assert.match(String(((await subeFoto(new Uint8Array())) as { error: string }).error), /vacía/);
  assert.equal(await subeFoto(celular).then((x) => ('huella' in x ? x.huella : '')), r.huella, 'la misma foto, la misma huella: no se duplica');
});
