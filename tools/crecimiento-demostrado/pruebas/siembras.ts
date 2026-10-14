/**
 * SIEMBRAS: se muta una copia del `dist` (se apaga una defensa del kernel, del motor, de los
 * invariantes o de la narración) y la batería del laboratorio TIENE que caer. Una siembra que
 * sobrevive es una defensa que ninguna prueba mira. Cada mutación busca un texto que existe UNA
 * vez; si el código cambia y el texto ya no está, la siembra falla en vez de pasar en silencio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XML } from './_ayuda.ts';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
type Bateria = 'trampas' | 'sucios' | 'cotejo';
interface Siembra { readonly id: string; readonly archivo: string; readonly busca: string; readonly cambia: string; readonly bateria: Bateria }

const SIEMBRAS: readonly Siembra[] = [
  { id: 'kernel: partición sin disjunción', archivo: 'kernel/reglas.js', busca: "rechaza('particion_no_disjunta'", cambia: "void ('particion_no_disjunta'", bateria: 'trampas' },
  { id: 'kernel: partición sin exhaustividad', archivo: 'kernel/reglas.js', busca: 'if (fuera || sobran)', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'kernel: cree el valor citado', archivo: 'kernel/reglas.js', busca: "rechaza('valor_alterado'", cambia: "void ('valor_alterado'", bateria: 'trampas' },
  { id: 'kernel: no exige supuestos', archivo: 'kernel/reglas.js', busca: '.filter((sa) => !s.d.supuestos.includes(sa))', cambia: '.filter((sa) => false)', bateria: 'trampas' },
  { id: 'kernel: acepta otro Γ', archivo: 'kernel/kernel.js', busca: 'if (d.gamma !== g.hash)', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'kernel: no nombra la regla inexistente', archivo: 'kernel/kernel.js', busca: 'if (!REGLAS.includes(regla))', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'kernel: proporción con signos contrarios', archivo: 'kernel/reglas.js', busca: 'if (signo(num) * signo(den) < 0)', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'kernel: sin n mínimo', archivo: 'kernel/reglas.js', busca: 'if (r.n < s.e.inferencia.nMinimo)', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'kernel: sin control de nivel', archivo: 'kernel/kernel.js', busca: 'if (s.d.nivel !== nivel)', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'kernel: una causal se certifica', archivo: 'kernel/kernel.js', busca: "if (p.k === 'hipotesis') {", cambia: 'if (false) {', bateria: 'trampas' },
  { id: 'teorema: sin la hipótesis R_hasta(L) = 0', archivo: 'kernel/teoremas.js', busca: "exige('R', 'L', 'hasta', 'R_hasta(L) = 0');", cambia: '', bateria: 'trampas' },
  { id: 'plan: deja pasar SQL', archivo: 'motor/plan.js', busca: 'if (traeSql(crudo))', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'narración: cualquier cifra coincide', archivo: 'narracion/inclusion.js', busca: 'const v = permitidos.find((p) => coincide(n, p));', cambia: 'const v = permitidos.find((p) => coincide(n, p)) ?? permitidos[0];', bateria: 'trampas' },
  { id: 'narración: sin detector causal', archivo: 'narracion/inclusion.js', busca: 'if (causal && !opciones.causalPermitido)', cambia: 'if (false)', bateria: 'trampas' },
  { id: 'Γ: sella con violaciones', archivo: 'datos/construye.js', busca: 'if (acta.violaciones.length)', cambia: 'if (false)', bateria: 'sucios' },
  { id: 'Γ: la global no concilia', archivo: 'datos/construye-relaciones.js', busca: 'if (neto !== (anonimosPorMes.get(mes) ?? 0))', cambia: 'if (false)', bateria: 'sucios' },
  { id: 'Γ: la global cuenta en su fecha de emisión', archivo: 'datos/cfdi.js', busca: "if (!g || g.periodicidad !== '04'", cambia: "if (true || !g || g.periodicidad !== '04'", bateria: 'cotejo' },
  { id: 'motor: banda de estabilidad ignorada', archivo: 'motor/clases.js', busca: 'if (esEstable(r0, d, e.estable.bandaPorMil))', cambia: 'if (esEstable(r0, d, 0))', bateria: 'cotejo' },
  { id: 'motor: suma el IVA al ingreso', archivo: 'motor/indice.js', busca: 'a.facturado += t.centavos;', cambia: 'a.facturado += t.totalCentavos;', bateria: 'cotejo' },
];

interface Lab {
  correTrampas(x: unknown): Promise<{ pasa: boolean }[]>;
  correSucios(x: unknown): { pasa: boolean }[];
  cotejaConLaVerdad(x: unknown, id: 'distribuidora' | 'tienda'): { cierra: boolean }[];
}

async function caidas(lab: Lab, b: Bateria): Promise<number> {
  try {
    if (b === 'trampas') return (await lab.correTrampas(XML)).filter((r) => !r.pasa).length;
    if (b === 'sucios') return lab.correSucios(XML).filter((r) => !r.pasa).length;
    return (['distribuidora', 'tienda'] as const).flatMap((id) => lab.cotejaConLaVerdad(XML, id)).filter((r) => !r.cierra).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

test('cada siembra (una defensa apagada) tumba la batería del laboratorio', async () => {
  const sobreviven: string[] = [];
  for (const [i, s] of SIEMBRAS.entries()) {
    const dir = join(DIST, '.siembras', String(i));
    // Entrada por entrada: copiar `dist` dentro de sí mismo está prohibido, sus hijos no.
    for (const n of readdirSync(DIST).filter((x) => x !== '.siembras')) cpSync(join(DIST, n), join(dir, n), { recursive: true });
    try {
      const ruta = join(dir, s.archivo);
      const original = readFileSync(ruta, 'utf8');
      assert.equal(original.split(s.busca).length - 1, 1, `${s.id}: «${s.busca}» tiene que existir una vez en ${s.archivo}`);
      writeFileSync(ruta, original.replace(s.busca, s.cambia));
      const lab = (await import(pathToFileURL(join(dir, 'laboratorio', 'index.js')).href)) as Lab;
      const n = await caidas(lab, s.bateria);
      if (n === 0) sobreviven.push(s.id);
      else console.log(`  tumbada: ${s.id} (${n === Number.POSITIVE_INFINITY ? 'la batería revienta' : `${n} caso(s) de ${s.bateria} en rojo`})`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  rmSync(join(DIST, '.siembras'), { recursive: true, force: true });
  console.log(`  siembras tumbadas: ${SIEMBRAS.length - sobreviven.length}/${SIEMBRAS.length}`);
  assert.deepEqual(sobreviven, [], 'siembras que ninguna prueba ve');
});
