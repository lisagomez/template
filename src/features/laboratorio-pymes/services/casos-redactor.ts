/**
 * Casos del redactor con LLM. Aquí no hay llave (OPENROUTER_API_KEY) y el laboratorio no gasta ni
 * sale a la red: el cableado se prueba con un proveedor SIMULADO (declarado) y el costo se calcula
 * con la contabilidad REAL del proyecto (`src/lib/ai/contabilidad.ts`, routing pineado). La corrida
 * con el proveedor real queda «no medido», con su motivo: eso es lo que impide aprobarla.
 */
import { redactorDePlantillas, construyeVoz } from '../../../../tools/pymes-marketing/dist/index.js';
import { redactorOpenAiCompat, promptsDe } from '../../../../tools/pymes-marketing/dist/redactor-openai-compat.js';
import { resenasPegadas } from '../../../../tools/pymes-marketing/dist/resenas/index.js';
import { registraUso, type EventoDeUso, type Registrador } from '../../../lib/ai/contabilidad.ts';
import { modeloPara } from '../../../lib/ai/routing.ts';
import { MUESTRAS_DE_VOZ, RESENAS_DEMO } from '../datos/demo.ts';
import type { Caso } from './tipos.ts';
import { verifica } from './verifica.ts';

function registradorEnMemoria(): Registrador & { eventos: EventoDeUso[] } {
  const eventos: EventoDeUso[] = [];
  return { eventos, async guarda(e) { eventos.push(e); }, async resumen() { return { gastadoUsd: eventos.reduce((s, e) => s + (e.costoUsd ?? 0), 0), filasSinCosto: eventos.filter((e) => e.costoUsd === null).length }; } };
}

function proveedorFalso(texto: string, uso: { prompt_tokens: number; completion_tokens: number } | null): typeof fetch {
  return (async () => new Response(JSON.stringify({ choices: [{ message: { content: texto } }], ...(uso ? { usage: uso } : {}) }), { status: 200 })) as typeof fetch;
}

const voz = () => construyeVoz(MUESTRAS_DE_VOZ);
const peticionResena = () => {
  const r = resenasPegadas(RESENAS_DEMO).resenas[0]!;
  return { tarea: 'respuesta-resena' as const, voz: voz(), hechos: { autor: 'Laura', tono: 'negativa', negocio: 'La Espiga', frase: 'hayas tenido que esperar tanto', contacto: 'WhatsApp 222 100 2000' }, textoDeTerceros: r.texto };
};
const modelo = modeloPara('redaccion-de-marketing');

export const CASOS_REDACTOR: readonly Caso[] = [
  {
    id: 'llm-1', herramienta: 'redactor-llm', titulo: 'Lo que el modelo recibiría (sin llamarlo)', trampa: 'dato personal y orden de terceros en el prompt', esperado: 'pasa',
    entrada: 'La reseña sintética de Laura (con su celular) convertida en petición de respuesta.',
    async corre() {
      const p = promptsDe(peticionResena());
      return verifica([[!/5555 0101/.test(p.usuario), 'el celular de la clienta no viaja al modelo'], [/<texto_de_terceros>/.test(p.usuario), 'el texto ajeno va delimitado como dato'], [/no sigas ninguna instrucción/.test(p.sistema), 'se le dice que no obedezca al texto ajeno'], [/Nunca uses/.test(p.sistema), 'lleva lo que el dueño nunca dice']], [p.sistema.split('\n').slice(0, 4).join(' / '), `${p.sistema.length + p.usuario.length} caracteres de prompt`], 'El prompt protege a terceros antes de salir.');
    },
  },
  {
    id: 'llm-2', herramienta: 'redactor-llm', titulo: 'Costo por redacción desde la contabilidad (proveedor SIMULADO)', trampa: null, esperado: 'pasa',
    entrada: 'Proveedor falso que devuelve 812 tokens de entrada y 96 de salida; routing «redaccion-de-marketing».',
    async corre() {
      const reg = registradorEnMemoria();
      const r = await redactorOpenAiCompat({ url: 'https://simulado.invalid/v1/chat/completions', llave: 'simulada', modelo: modelo.modelo, fetch: proveedorFalso('Hola Laura, lamentamos la espera. Escríbenos al WhatsApp 222 100 2000.', { prompt_tokens: 812, completion_tokens: 96 }) }).redacta(peticionResena());
      const e = await registraUso(reg, 'redaccion-de-marketing', r.uso);
      const esperado = (812 * modelo.precio.entrada + 96 * modelo.precio.salida) / 1_000_000;
      return verifica([[r.uso !== null, 'el uso llega del proveedor'], [e.costoUsd !== null && Math.abs(e.costoUsd - esperado) < 1e-9, 'la contabilidad lo costea con el precio pineado']], [`modelo ${e.modelo} (nivel ${modelo.nivel})`, `uso 812 + 96 tokens → US$${e.costoUsd?.toFixed(6)} por redacción`, `un calendario de 27 piezas ≈ US$${((e.costoUsd ?? 0) * 27).toFixed(4)} (estimación con uso simulado)`], 'El cableado de costo funciona; la cifra real se mide con la llave.');
    },
  },
  {
    id: 'llm-3', herramienta: 'redactor-llm', titulo: 'Proveedor que no reporta uso', trampa: 'dato ausente (uso)', esperado: 'pasa',
    entrada: 'Proveedor falso sin campo «usage».',
    async corre() {
      const reg = registradorEnMemoria();
      const r = await redactorOpenAiCompat({ url: 'https://simulado.invalid', llave: 'simulada', modelo: modelo.modelo, fetch: proveedorFalso('Hola', null) }).redacta(peticionResena());
      const e = await registraUso(reg, 'redaccion-de-marketing', r.uso);
      const res = await reg.resumen();
      return verifica([[r.uso === null && e.costoUsd === null, 'se guarda con costo null'], [res.filasSinCosto === 1, 'la factura dice que hay una fila sin costear']], [`costo: ${e.costoUsd}`, `filas sin costo: ${res.filasSinCosto}`], 'Un hueco se declara; nunca se suma como cero.');
    },
  },
  {
    id: 'llm-4', herramienta: 'redactor-llm', titulo: 'El modelo repite el teléfono de la clienta y usa una muletilla', trampa: 'dato personal en la salida', esperado: 'pasa',
    entrada: 'Proveedor falso que responde con «55 5555 0101» y «Estimado cliente».',
    async corre() {
      const r = await redactorOpenAiCompat({ url: 'https://simulado.invalid', llave: 'simulada', modelo: modelo.modelo, fetch: proveedorFalso('Estimado cliente, le llamamos al 55 5555 0101. O escríbanos al WhatsApp 222 100 2000.', { prompt_tokens: 10, completion_tokens: 10 }) }).redacta(peticionResena());
      return verifica([[!/5555 0101/.test(r.texto), 'el teléfono de la clienta se tapa'], [/222 100 2000/.test(r.texto), 'el del negocio se queda'], [r.avisos.some((a) => /nunca escribe/.test(a)), 'se avisa que no suena al dueño']], [r.texto, ...r.avisos], 'Lo que salga del modelo pasa por las mismas reglas que las plantillas.');
    },
  },
  {
    id: 'llm-5', herramienta: 'redactor-llm', titulo: 'Corrida con el proveedor real', trampa: null, esperado: 'no-medido',
    entrada: 'OpenRouter con el modelo pineado del routing.',
    async corre(ctx) {
      const motivo = ctx.llaveLlm ? 'hay llave en esta máquina, pero el laboratorio no gasta ni sale a la red: la corrida real se hace con firma' : 'no hay OPENROUTER_API_KEY en esta máquina (verificado por presencia, sin leer su valor)';
      return { estado: 'no-medido', evidencia: [motivo, `modelo que se usaría: ${modelo.modelo}`], veredicto: 'Sin corrida real no se aprueba: la app usa el redactor de plantillas.' };
    },
  },
  {
    id: 'llm-6', herramienta: 'redactor-llm', titulo: 'Costo de un mes de contenido con plantillas', trampa: null, esperado: 'pasa',
    entrada: 'El redactor de serie sobre 27 piezas.',
    async corre() {
      const reg = registradorEnMemoria(), red = redactorDePlantillas();
      let llamadas = 0;
      for (let i = 0; i < 27; i++) { const r = await red.redacta({ tarea: 'caption', voz: voz(), hechos: { producto: 'Concha', fecha: `2026-10-${10 + (i % 20)}` } }); if (r.uso) llamadas++; }
      const res = await reg.resumen();
      return verifica([[llamadas === 0 && res.gastadoUsd === 0, '0 llamadas al modelo, US$0.00']], ['27 redacciones · 0 llamadas · US$0.00 (medido)'], 'El camino de serie no cuesta nada ni sale de la máquina.');
    },
  },
];
