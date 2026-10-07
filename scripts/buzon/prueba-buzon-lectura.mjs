/**
 * La lógica del buzón (spec 015, fase 4: RF-1, RF-9 a RF-17 y TAR-11). Parte del gate `prueba:buzon`.
 *
 * Lo puro (`services/lectura.ts`) y el ORDEN de la ingesta (`services/servidor/buzon.ts`): con un Supabase y un
 * extractor falsos, se exige que sin consentimiento el extractor ni siquiera se llame (RF-1: «no lo leerá»).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCsv, celda, clasifica, empareja, pendientes, revisaCampo, revisaDiscrepancia } from '../../src/features/buzon-cfdi/services/lectura.ts';
import { ingresa } from '../../src/features/buzon-cfdi/services/servidor/buzon.ts';
import { FalloDeCapacidad } from '../../src/features/a2a/servicio-extractor.ts';

const RFC_PYME = 'ABC010203XY9';
const FOLIO = 'a1b2c3d4-0000-4000-8000-000000000001';
const exacto = (clave, valor) => ({ clave, valor, confianza: 1, procedencia: 'xml', evidencia: 'exacto', revisionHumana: false });
const deImagen = (clave, valor) => ({ clave, valor, confianza: 0.6, procedencia: 'ocr', evidencia: 'motor', revisionHumana: true });
const leido = (ruta, campos) => ({
  ruta, motivo: '', clase: 'cfdi', sinClase: false, campos, faltantes: [], identificadoresInvalidos: [],
  evidencia: { codigo: 0, exacto: 0, corroboracion: 0, checksum: 0, motor: 0 }, revisionHumana: 0,
  tiempos: { codigos: 0, motor: 0, respaldo: 0, total: 0 }, selloVerificado: false,
});
const XML = leido('xml', [exacto('uuid', FOLIO), exacto('rfc_receptor', RFC_PYME), exacto('rfc_emisor', 'EMI990101AB1'), exacto('total', '1160.00')]);

// --- Clasificación (RF-9, RF-10, RF-11, RF-12) ---------------------------------------------------------------

test('un XML de la pyme entra en revisión, con el folio en mayúsculas y sin nada que revisar', () => {
  const c = clasifica(XML, RFC_PYME);
  assert.equal(c.tipo, 'xml');
  assert.equal(c.estado, 'en_revision');
  assert.equal(c.uuid, FOLIO.toUpperCase());
  assert.deepEqual(pendientes({ estado: c.estado, campos: c.campos, discrepancias: [] }), []);
});

test('RF-12: si el receptor es otro, el documento queda como «receptor ajeno» y lo dice', () => {
  const c = clasifica(leido('xml', [exacto('uuid', FOLIO), exacto('rfc_receptor', 'XYZ040506AB1')]), RFC_PYME);
  assert.equal(c.estado, 'receptor_ajeno');
  assert.ok(c.avisos.some((a) => /RF-12/.test(a)));
});

test('sin el receptor leído, se pide a la persona antes de confirmar', () => {
  const c = clasifica(leido('motor', [deImagen('total', '1160.00')]), RFC_PYME);
  assert.equal(c.tipo, 'impresa');
  assert.ok(c.campos.some((x) => x.clave === 'rfc_receptor' && x.revisionHumana));
  assert.ok(pendientes({ estado: c.estado, campos: c.campos, discrepancias: [] }).some((p) => /rfc_receptor/.test(p)));
});

test('un RFC que no pasa su dígito verificador no se pierde: entra marcado para revisión y lo dice', () => {
  const conMalo = { ...XML, campos: XML.campos.filter((c) => c.clave !== 'rfc_emisor'),
    identificadoresInvalidos: [{ clave: 'rfc_emisor', valor: 'AAA010101AAA', procedencia: 'xml', pagina: 0, motivo: 'digito' }] };
  const c = clasifica(conMalo, RFC_PYME);
  const rfc = c.campos.find((x) => x.clave === 'rfc_emisor');
  assert.equal(rfc?.valor, 'AAA010101AAA');
  assert.equal(rfc?.revisionHumana, true);
  assert.ok(c.avisos.some((a) => /rfc_emisor.*no pasa su validación/.test(a)));
  assert.ok(pendientes({ estado: c.estado, campos: c.campos, discrepancias: [] }).some((p) => /rfc_emisor/.test(p)));
});

test('RF-11: lo que solo sale de una imagen sigue marcado para revisión', () => {
  const c = clasifica(leido('motor', [deImagen('rfc_receptor', RFC_PYME), deImagen('total', '11G0.00')]), RFC_PYME);
  assert.deepEqual(c.campos.filter((x) => x.revisionHumana).map((x) => x.clave), ['rfc_receptor', 'total']);
});

// --- Emparejamiento XML ↔ impresa (RF-14) ----------------------------------------------------------------------

test('RF-14: XML e impresa iguales no dan discrepancias; un importe que difiere en menos de medio centavo, tampoco', () => {
  const impresa = [exacto('uuid', FOLIO.toUpperCase()), exacto('rfc_receptor', RFC_PYME.toLowerCase()), exacto('total', '$1,160.004')];
  assert.deepEqual(empareja(XML.campos, impresa), []);
});

test('RF-14: lo que difiere se marca, y lo que una de las dos no trae no se coteja', () => {
  const impresa = [exacto('uuid', FOLIO), exacto('rfc_emisor', 'OTR990101AB1'), exacto('total', '1106.00')];
  assert.deepEqual(empareja(XML.campos, impresa).map((d) => d.clave), ['rfc_emisor', 'total']);
});

// --- Revisión (RF-17, RF-21) -----------------------------------------------------------------------------------

test('revisar un campo lo deja como de la persona, sin pedir más revisión y sin decir quién fue (RF-21)', () => {
  const [revisado] = revisaCampo([deImagen('total', '11G0.00')], 'total', ' 1160.00 ')
  assert.deepEqual(revisado, { clave: 'total', valor: '1160.00', confianza: 0.6, procedencia: 'humano', evidencia: 'motor', revisionHumana: false, revisado: true });
  assert.throws(() => revisaCampo([], 'total', '1'), /no tiene el campo/);
});

test('RF-17: lo pendiente incluye campos y discrepancias; una revisada deja de estarlo', () => {
  const discrepancias = [{ clave: 'total', xml: '1', impresa: '2', revisada: false }];
  assert.equal(pendientes({ estado: 'en_revision', campos: [deImagen('total', '1')], discrepancias }).length, 2);
  assert.deepEqual(pendientes({ estado: 'en_revision', campos: [], discrepancias: revisaDiscrepancia(discrepancias, 'total') }), []);
  assert.match(pendientes({ estado: 'emparejada', campos: [], discrepancias: [] })[0], /se confirma el XML/);
});

// --- Exportación (TAR-11, RF-16) -------------------------------------------------------------------------------

const doc = (tipo, estado, uuid, campos) => ({ id: uuid ?? 'x', pyme_id: 'p', nombre_archivo: 'f', tipo, ruta: tipo, uuid, rfc_receptor: RFC_PYME, campos, discrepancias: [], estado, recibido_en: '', confirmado_en: estado === 'confirmado' ? '2026-10-07T10:00:00Z' : null });

test('RF-16: el CSV lleva solo lo confirmado, cada folio una vez y el XML antes que su impresa', () => {
  const F = FOLIO.toUpperCase();
  const csv = aCsv([
    doc('impresa', 'confirmado', F, [exacto('total', '1')]),
    doc('xml', 'confirmado', F, [exacto('total', '2')]),
    doc('xml', 'en_revision', 'B1B2C3D4-0000-4000-8000-000000000002', [exacto('total', '3')]),
  ]);
  const filas = csv.trim().split('\r\n');
  assert.equal(filas.length, 2);
  assert.match(filas[1], /"xml"/);
  assert.match(filas[1], /"2"/);
});

test('el CSV no ejecuta fórmulas: un valor que empieza por = + - @ sale como texto', () => {
  assert.equal(celda('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(celda('+1'), `"'+1"`);
  assert.equal(celda('Pyme, S.A.'), '"Pyme, S.A."');
});

// --- El orden de la ingesta (RF-1) -----------------------------------------------------------------------------

function supabaseFalso({ consiente, otro = null }) {
  const registro = [];
  const consulta = (tabla) => {
    let op = 'select';
    const q = {
      select: () => q, eq: () => q, neq: () => q, is: () => q, order: () => q, limit: () => q,
      insert: (fila) => { op = 'insert'; registro.push(['insert', tabla, fila]); return q; },
      update: (cambio) => { op = 'update'; registro.push(['update', tabla, cambio]); return q; },
      maybeSingle: async () => ({ data: tabla === 'buzon_pymes' ? { id: 'p', rfc: RFC_PYME } : otro }),
      single: async () => (op === 'insert' ? { data: { id: 'nuevo' }, error: null } : { data: null, error: null }),
      then: (resolver) => Promise.resolve({ data: null, error: null }).then(resolver),
    };
    return q;
  };
  return { registro, cliente: { from: consulta, rpc: async (f) => ({ data: f === 'buzon_consiente' ? consiente : true }) } };
}
const archivo = { bytes: new Uint8Array([1, 2, 3]), nombre: 'cfdi.xml', tipoMime: 'application/xml' };

test('RF-1: sin consentimiento, el extractor NI SE LLAMA y no se guarda nada', async () => {
  const { registro, cliente } = supabaseFalso({ consiente: false });
  let leyo = false;
  const r = await ingresa(cliente, 'p', archivo, async () => { leyo = true; return XML; });
  assert.equal(r.ok, false);
  assert.equal(r.estado, 403);
  assert.equal(leyo, false);
  assert.deepEqual(registro, []);
});

test('con consentimiento: se lee, se guarda la LECTURA con la huella, y no el archivo', async () => {
  const { registro, cliente } = supabaseFalso({ consiente: true });
  const r = await ingresa(cliente, 'p', archivo, async () => XML);
  assert.equal(r.ok, true);
  const [[, tabla, fila]] = registro;
  assert.equal(tabla, 'buzon_documentos');
  assert.match(fila.huella, /^sha256:[0-9a-f]{64}$/);
  assert.equal(fila.estado, 'en_revision');
  assert.ok(!('bytes' in fila) && !Object.values(fila).some((v) => v instanceof Uint8Array), 'el archivo no se guarda');
});

test('RF-14: una impresa cuyo XML ya está entra «emparejada» y marca la discrepancia en el XML', async () => {
  const { registro, cliente } = supabaseFalso({ consiente: true, otro: { id: 'x', campos: XML.campos, estado: 'en_revision' } });
  const impresa = leido('capa-cero', [exacto('uuid', FOLIO), exacto('rfc_receptor', RFC_PYME), exacto('total', '1106.00')]);
  const r = await ingresa(cliente, 'p', { ...archivo, nombre: 'cfdi.pdf', tipoMime: 'application/pdf' }, async () => impresa);
  assert.equal(r.ok && r.datos.estado, 'emparejada');
  const actualizacion = registro.find(([op]) => op === 'update');
  assert.deepEqual(actualizacion?.[2].discrepancias.map((d) => d.clave), ['total']);
});

test('si el extractor no puede leer, se dice por qué y no se guarda nada', async () => {
  const { registro, cliente } = supabaseFalso({ consiente: true });
  const r = await ingresa(cliente, 'p', archivo, async () => { throw new FalloDeCapacidad('el documento llego vacio'); });
  assert.equal(r.ok, false);
  assert.equal(r.estado, 422);
  assert.deepEqual(registro, []);
});
