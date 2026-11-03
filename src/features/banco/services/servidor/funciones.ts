/**
 * Las funciones del banco y los motores que corren detrás. Cada motor entra por el MISMO adaptador que
 * usa producción, con sus barreras (validación, temporal borrado siempre, errores sin stdout):
 *
 *   ocr-tesseract   Tesseract (Python) por `motorPorProceso` de tools/extractor-documental
 *   codigo-gs1      `leeCodigoDeProducto` de tools/etiquetas-gs1 (TS puro, lo que usa /etiquetas)
 *   peor-caso       el generador de datos de peor caso de tools/banco-motores
 *
 * Solo datos sintéticos: los ejemplos son una factura inventada y códigos con el prefijo 952 que GS1
 * reserva para ejemplos. Sin `TESSERACT_CMD` el OCR no finge: responde «no medido».
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { bytesDeDataUrl, campoImagen, defineFuncion, FAMILIAS, peorCaso, type FuncionDeBanco } from '../../../../../tools/banco-motores/dist/index.js';
import { motorPorProceso } from '../../../../../tools/extractor-documental/dist/motores/proceso-local.js';
import type { MotorOcr } from '../../../../../tools/extractor-documental/dist/puertos.js';
import { leeCodigoDeProducto } from '../../../../../tools/etiquetas-gs1/dist/index.js';

let motorCache: MotorOcr | null | undefined;

/** El motor de OCR de esta máquina, o `null` si no lo declara (TESSERACT_CMD). Mismo cableado que la mesa de Soporte SAP. */
function motorTesseract(): MotorOcr | null {
  if (motorCache !== undefined) return motorCache;
  const cmd = process.env['TESSERACT_CMD'];
  if (!cmd) return (motorCache = null);
  const entorno: Record<string, string> = { EXTRACTOR_IDIOMA: 'spa' };
  for (const k of ['LD_LIBRARY_PATH', 'TESSDATA_PREFIX', 'TESSERACT_CMD']) if (process.env[k]) entorno[k] = process.env[k]!;
  const version = execFileSync(cmd, ['--version'], { encoding: 'utf8', env: { ...process.env, ...entorno } }).split('\n')[0]!.replace(/^tesseract\s+/, '').trim();
  const script = join(/*turbopackIgnore: true*/ process.cwd(), 'tools', 'extractor-documental', 'motores-locales', 'tesseract.py');
  motorCache = motorPorProceso({ comando: 'python3', argumentos: [script], modelo: `tesseract-${version}-spa-zonal-1`, entorno, milisegundosDeEspera: 120_000 });
  return motorCache;
}

const ocr = defineFuncion({
  id: 'ocr-tesseract',
  titulo: 'Leer el texto de una imagen',
  descripcion: 'OCR local con Tesseract por el adaptador de proceso del extractor documental. La imagen no sale de la máquina y el temporal se borra siempre.',
  motor: 'Tesseract (spa) por motorPorProceso de tools/extractor-documental',
  entrada: z.object({ imagen: campoImagen('Imagen del documento') }),
  salida: z.object({
    texto: z.string().meta({ title: 'Texto leído', bloque: 'texto-largo' }),
    confianza: z.number().min(0).max(1).nullable().meta({ title: 'Confianza media', unidad: 'de 0 a 1' }),
    paginas: z.number().int().min(0).meta({ title: 'Páginas' }),
    modelo: z.string().meta({ title: 'Modelo pineado' }),
  }),
  ejemplos: [
    { id: 'factura-sintetica', titulo: 'Factura sintética', entrada: {}, archivos: { imagen: '/banco/ejemplos/factura-sintetica.png' }, trampa: null, sintetico: true },
  ],
  async ejecuta({ imagen }) {
    const motor = motorTesseract();
    if (!motor) throw new Error('no medido: esta máquina no declara TESSERACT_CMD (el motor de OCR local)');
    const paginas = await motor.extrae(bytesDeDataUrl(imagen));
    const confianzas = paginas.map((p) => p.confianza).filter((c): c is number => typeof c === 'number');
    return {
      texto: paginas.map((p) => p.markdown).join('\n\n').trim(),
      confianza: confianzas.length ? Number((confianzas.reduce((a, b) => a + b, 0) / confianzas.length).toFixed(3)) : null,
      paginas: paginas.length,
      modelo: motor.modelo,
    };
  },
});

const gs1 = defineFuncion({
  id: 'codigo-gs1',
  titulo: 'Interpretar un código de producto GS1',
  descripcion: 'Lo que manda la pistola o la cámara (GTIN, EAN, ITF-14 o GS1 Digital Link), descompuesto en sus identificadores de aplicación. Es el núcleo de /etiquetas, sin pantalla de por medio.',
  motor: 'leeCodigoDeProducto de tools/etiquetas-gs1 (TS puro)',
  entrada: z.object({ cadena: z.string().min(1).max(512).meta({ title: 'Lo que leyó el escáner', bloque: 'texto' }) }),
  salida: z.object({
    reconocido: z.boolean().meta({ title: '¿Es un código de producto GS1?' }),
    formato: z.string().nullable().meta({ title: 'Formato' }),
    motivo: z.string().nullable().meta({ title: 'Por qué no se reconoce' }),
    elementos: z.array(z.object({ ai: z.string(), valor: z.string() })).meta({ title: 'Identificadores de aplicación' }),
  }),
  ejemplos: [
    { id: 'gtin-952', titulo: 'GTIN-14 con prefijo 952', entrada: { cadena: '09520123456788' }, trampa: null, sintetico: true },
    { id: 'digital-link', titulo: 'Digital Link con lote y caducidad', entrada: { cadena: 'https://id.gs1.org/01/09520123456788/10/LOTE-A1?17=281231' }, trampa: null, sintetico: true },
    { id: 'digito-malo', titulo: 'GTIN con dígito verificador malo', entrada: { cadena: '09520123456781' }, trampa: 'dígito verificador', sintetico: true },
    { id: 'ajeno', titulo: 'Un QR que no es GS1', entrada: { cadena: ']Q1hola desde un cartel' }, trampa: 'no es GS1', sintetico: true },
  ],
  async ejecuta({ cadena }) {
    const r = leeCodigoDeProducto(cadena);
    if (!r) return { reconocido: false, formato: null, motivo: 'no se pudo interpretar', elementos: [] };
    if ('ajeno' in r) return { reconocido: false, formato: null, motivo: r.motivo, elementos: [] };
    return { reconocido: true, formato: String(r.formato), motivo: null, elementos: r.elementos.map((e) => ({ ai: e.ai, valor: e.valor })) };
  },
});

const datosDePeorCaso = defineFuncion({
  id: 'peor-caso',
  titulo: 'Generar datos de peor caso',
  descripcion: 'Nombres larguísimos, correos que no se cortan, texto de derecha a izquierda, cifras enormes. Sintéticos y deterministas: la misma semilla da lo mismo.',
  motor: 'peorCaso de tools/banco-motores (catálogo de break-ui, Emil Kowalski, f1090bec)',
  entrada: z.object({
    familia: z.enum(FAMILIAS).meta({ title: 'Familia' }),
    semilla: z.number().int().min(0).max(9999).default(25).meta({ title: 'Semilla' }),
  }),
  salida: z.object({
    datos: z.array(z.object({ valor: z.string(), rompe: z.string() })).meta({ title: 'Datos' }),
    cuantos: z.number().int().meta({ title: 'Cuántos' }),
  }),
  ejemplos: [
    { id: 'nombres', titulo: 'Nombres', entrada: { familia: 'nombres', semilla: 25 }, trampa: null, sintetico: true },
    { id: 'cifras', titulo: 'Cifras', entrada: { familia: 'cifras', semilla: 25 }, trampa: null, sintetico: true },
  ],
  async ejecuta({ familia, semilla }) {
    const datos = peorCaso(familia, semilla).map((d) => ({ valor: String(d.valor), rompe: d.rompe }));
    return { datos, cuantos: datos.length };
  },
});

export const FUNCIONES: readonly FuncionDeBanco[] = [ocr, gs1, datosDePeorCaso];

/** Qué tiene esta máquina, dicho en la pantalla (como los laboratorios: lo que falta, «no medido»). */
export function maquinaDelBanco() {
  return { tesseract: Boolean(process.env['TESSERACT_CMD']) };
}
