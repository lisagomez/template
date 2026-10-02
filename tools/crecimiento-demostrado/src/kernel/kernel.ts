/**
 * EL KERNEL, al estilo LCF: pocas reglas, auditables, sin LLM y sin red. Recibe una derivación
 * cruda (lo que un agente propuso, sin confiar en nada) y devuelve un veredicto. Una afirmación
 * solo queda ACEPTADA si cada paso es una regla del conjunto cerrado, cada hecho citado coincide
 * con Γ recalculado, cada supuesto exigido está declarado, y el nivel declarado es el del paso
 * afirmado. La base de confianza es este directorio + `motor/` + la construcción de Γ.
 */
import { huellaDe, type Canonizable } from '../comun/canonico.js';
import { verificaSello, type Gamma } from '../datos/gamma.js';
import { huellaDeEspecificacion, type Especificacion } from '../ontologia/especificacion.js';
import { REGLAS, TEOREMAS, esquemaDerivacion, type Derivacion, type Nivel, type Paso } from './derivacion.js';
import * as R from './reglas.js';
import { Corte, rechaza, type Certificado, type Veredicto } from './veredicto.js';

export const VERSION_DEL_KERNEL = 'kernel-1.0.0';

const NIVEL_DE: Readonly<Record<Paso['regla'], Nivel>> = {
  cita: 'descriptivo', particion: 'descriptivo', suma_particion: 'descriptivo', teorema: 'descriptivo', aritmetica: 'descriptivo',
  compara: 'descriptivo', razon: 'descriptivo', cambio_relativo: 'descriptivo', supuesto: 'descriptivo', prueba: 'inferencial', hipotesis: 'causal',
};

function traeSql(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(traeSql);
  if (typeof v !== 'object' || v === null) return false;
  return Object.entries(v).some(([k, x]) => /^(sql|query|consulta_sql|raw)$/i.test(k) || traeSql(x));
}

/** Antes del esquema: lo que merece un motivo propio y no un «mal formada» genérico. */
function precomprueba(crudo: unknown): Derivacion {
  if (traeSql(crudo)) rechaza('sql_libre', null, 'la derivación trae SQL: el kernel solo acepta reglas');
  const pasos = (crudo as { pasos?: unknown })?.pasos;
  if (Array.isArray(pasos)) for (const p of pasos) {
    const regla = (p as { regla?: unknown })?.regla;
    if (!REGLAS.includes(regla as never)) rechaza('regla_inexistente', String((p as { id?: unknown })?.id ?? null), `«${String(regla)}» no es una regla del kernel (${REGLAS.join(', ')})`);
    const nombre = (p as { nombre?: unknown })?.nombre;
    if (regla === 'teorema' && !TEOREMAS.includes(nombre as never)) rechaza('teorema_inexistente', String((p as { id?: unknown }).id ?? null), `«${String(nombre)}» no está en el registro de teoremas`);
  }
  const r = esquemaDerivacion.safeParse(crudo);
  if (!r.success) return rechaza('derivacion_mal_formada', null, r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

function compruebaContexto(d: Derivacion, g: Gamma, e: Especificacion): void {
  if (!verificaSello(g)) rechaza('gamma_ajeno', null, 'Γ fue alterado después de sellarse');
  if (d.gamma !== g.hash) rechaza('gamma_ajeno', null, `la derivación es sobre ${d.gamma} y este Γ es ${g.hash}: un hecho de otro snapshot no existe aquí`);
  if (d.especificacion !== huellaDeEspecificacion(e)) rechaza('especificacion_ajena', null, 'la derivación es sobre otra versión de la spec');
  if (g.contenido.especificacion !== d.especificacion) rechaza('especificacion_ajena', null, 'Γ se construyó con otra spec');
  const desconocido = d.supuestos.find((sa) => !e.supuestos.some((x) => x.id === sa));
  if (desconocido) rechaza('supuesto_inexistente', null, `${desconocido} no existe en la spec`);
}

function aplica(s: R.Estado, p: Paso): R.Prop {
  switch (p.regla) {
    case 'cita': return R.cita(s, p);
    case 'particion': return R.particion(s, p);
    case 'suma_particion': return R.sumaParticion(s, p);
    case 'teorema': return R.teorema(s, p);
    case 'aritmetica': return R.aritmetica(s, p);
    case 'compara': return R.comparaPaso(s, p);
    case 'razon': return R.razon(s, p);
    case 'cambio_relativo': return R.cambioRelativo(s, p);
    case 'prueba': return R.prueba(s, p);
    case 'supuesto': return R.supuesto(s, p);
    case 'hipotesis': return R.hipotesis(s, p);
  }
}

const emitidos = new WeakSet<Certificado>();
export const esCertificadoDelKernel = (c: Certificado): boolean => emitidos.has(c);

function certifica(s: R.Estado, nivel: 'descriptivo' | 'inferencial', afirmado: Paso): Certificado {
  const hechos = [...s.props.values()].flatMap((p) => (p.k === 'hecho' ? [{ nombre: p.enunciado, termino: p.termino, valor: p.valor }] : []));
  const derivados = [...s.props.entries()].flatMap(([paso, p]) => ((p.k === 'escalar' || p.k === 'verdad') && p.escalar ? [{ paso, enunciado: p.enunciado, unidad: p.escalar.unidad, num: String(p.escalar.num), den: String(p.escalar.den) }] : []));
  // Los umbrales que la afirmación usó también son citables: «¿70 %?» se puede repetir al responder.
  for (const p of s.d.pasos) if (p.regla === 'razon' || p.regla === 'cambio_relativo') derivados.push({ paso: p.id, enunciado: `umbral de ${p.id}`, unidad: 'fraccion', num: String(p.umbralPorMil), den: '1000' });
  const sinHash = {
    kernel: VERSION_DEL_KERNEL, gamma: s.g.hash, especificacion: s.d.especificacion, derivacion: huellaDe('der', s.d as unknown as Canonizable), nivel,
    afirmacion: { regla: afirmado.regla, enunciado: s.props.get(afirmado.id)!.enunciado }, hechos, derivados, supuestos: [...s.d.supuestos].sort(),
  };
  const c: Certificado = { ...sinHash, hash: huellaDe('cert', sinHash as unknown as Canonizable) };
  emitidos.add(c);
  return c;
}

function concluye(s: R.Estado): Veredicto {
  const afirmado = s.d.pasos.find((p) => p.id === s.d.afirmacion.paso);
  if (!afirmado) return rechaza('paso_desconocido', null, `la afirmación señala «${s.d.afirmacion.paso}», que no es un paso`);
  const nivel = NIVEL_DE[afirmado.regla];
  const p = s.props.get(afirmado.id)!;
  if (p.k === 'hipotesis') {
    if (!p.experimento) throw new Corte({ estado: 'requiere_entrada', faltan: ['diseño del experimento'], paso: afirmado.id, detalle: 'una afirmación causal necesita el experimento que la pondría a prueba' });
    return { estado: 'hipotesis', paso: afirmado.id, experimento: p.experimento, reetiquetada: s.d.nivel !== 'causal', detalle: `${p.enunciado}: causal, nunca demostrada por los datos${s.d.nivel !== 'causal' ? ` (se declaró ${s.d.nivel}: reetiquetada)` : ''}` };
  }
  if (s.d.nivel !== nivel) rechaza('nivel_mal_etiquetado', afirmado.id, `el paso afirmado es ${nivel} y la derivación dice ${s.d.nivel}`);
  return { estado: 'aceptada', certificado: certifica(s, nivel as 'descriptivo' | 'inferencial', afirmado) };
}

/** Verifica una derivación cruda contra Γ y la spec. Nunca lanza: todo fallo es un veredicto. */
export function verifica(crudo: unknown, g: Gamma, e: Especificacion): Veredicto {
  try {
    const d = precomprueba(crudo);
    compruebaContexto(d, g, e);
    const s: R.Estado = { g, e, d, props: new Map() };
    for (const p of d.pasos) {
      if (s.props.has(p.id)) rechaza('id_repetido', p.id, `dos pasos se llaman «${p.id}»`);
      s.props.set(p.id, aplica(s, p));
    }
    return concluye(s);
  } catch (error) {
    if (error instanceof Corte) return error.veredicto;
    return { estado: 'rechazada', motivo: 'falla_del_motor', paso: null, detalle: error instanceof Error ? error.message : 'falla interna' };
  }
}

/** Un certificado se re-verifica re-ejecutando el kernel: mismo Γ + spec + derivación ⇒ mismo hash. */
export function verificaCertificado(c: Certificado, crudo: unknown, g: Gamma, e: Especificacion): boolean {
  const v = verifica(crudo, g, e);
  return v.estado === 'aceptada' && v.certificado.hash === c.hash;
}
