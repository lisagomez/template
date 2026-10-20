/**
 * TODA operación que la vía oficial no hace (imposible), que esta fachada todavía no hace (pendiente) o que es
 * administración propia de OpenWA (fuera) contesta 501 con el sobre de error de OpenWA, el código de su estado, la
 * alternativa oficial y la fuente de su fila. Se prueba sobre todas, no sobre una muestra; nada se simula.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATRIZ_OPENWA } from '../dist/openwa/index.js';
import { revisaError } from './_contrato.ts';
import { bancoOpenWA } from './_openwa.ts';

const CODIGO = { imposible: 'NO_DISPONIBLE_EN_LA_VIA_OFICIAL', pendiente: 'PENDIENTE_EN_ESTA_FACHADA', fuera: 'FUERA_DE_ALCANCE' } as const;
const NO_SERVIDAS = MATRIZ_OPENWA.filter((f) => f.estado !== 'igual' && f.estado !== 'diferencia');

test('cada operación no servida contesta 501 + alternativa oficial (n/n)', async () => {
  const b = bancoOpenWA();
  const { id } = await b.sesionLista();
  const fallas: string[] = [];
  const porEstado: Record<string, number> = {};
  for (const f of NO_SERVIDAS) {
    const ruta = f.ruta.replace('{sessionId}', id).replace(/\{[^}]+\}/g, 'x1');
    const r = await b.pide(f.metodo, ruta, f.metodo === 'GET' || f.metodo === 'HEAD' ? undefined : {});
    const c = r.cuerpo as { statusCode?: number; code?: string; alternativa?: string; fuente?: string; estado?: string; signupUrl?: string };
    const mal = [
      r.status !== 501 && `status ${r.status}`, c.statusCode !== 501 && 'statusCode', c.code !== CODIGO[f.estado as keyof typeof CODIGO] && `code ${c.code}`,
      !c.alternativa?.trim() && 'sin alternativa', c.fuente !== f.fuente && 'fuente', c.estado !== f.estado && 'estado', revisaError(c),
      f.regla === 'sin-qr' && !c.signupUrl?.startsWith('https://') && 'el 501 del QR no trae la liga de alta',
    ].filter(Boolean);
    if (mal.length) fallas.push(`${f.metodo} ${f.ruta}: ${mal.join(', ')}`);
    else porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
  }
  const bien = Object.values(porEstado).reduce((a, n) => a + n, 0);
  console.log(`no disponibles: ${bien}/${NO_SERVIDAS.length} contestan 501 + alternativa · ${Object.entries(porEstado).map(([e, n]) => `${e} ${n}`).join(' · ')}`);
  assert.deepEqual(fallas, [], fallas.join('\n'));
  assert.equal(bien, NO_SERVIDAS.length);
  assert.equal(b.meta.registro.filter((x) => x.tipo === 'graph').length, 0, 'ninguna llamó a Meta');
});

test('sin llave: lo que el contrato publica sin llave contesta su 501; lo demás, 401 antes de decir nada', async () => {
  const b = bancoOpenWA();
  for (const f of MATRIZ_OPENWA.filter((x) => x.estado !== 'igual' && x.estado !== 'diferencia')) {
    const r = await b.pide(f.metodo, f.ruta.replace(/\{[^}]+\}/g, 'x1'), undefined, {}, null);
    const publica = /^(InfraStatusController_healthCheck|MetricsController_scrape|IngressController_)/.test(f.operacion);
    assert.equal(r.status, publica ? 501 : 401, `${f.metodo} ${f.ruta}`);
  }
});
