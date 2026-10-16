'use client';

/**
 * La voz del portal en el navegador, con las piezas de la casa: micrófono abierto una vez (`@tu-scope/voz`),
 * detector por energía calibrada, el oído con su puerta de eco y el bucle de `@tu-scope/bucle-voz` (turnos,
 * interrupción, telemetría desde el fin real del habla). El audio va SOLO al servidor de la clínica, que lo pasa
 * al motor local (ASR Parakeet y TTS Piper): ninguna API de voz de terceros, ni Web Speech.
 *
 * Dos cerebros: la GUÍA del registro (local, sin LLM: `procesaGuia`) y el CHATBOT (el pipeline del servidor:
 * urgencia por regla → barreras → enrutador → LLM). Delante, el enrutador sin LLM; un envoltorio manda al
 * servidor todo lo que suene a urgencia, diagnóstico o inyección, aunque se parezca a una orden («para, me ahogo»).
 */
import { capturaMicrofono, type CapturaMicrofono } from '../../../../../tools/voz/dist/browser/index.js';
import { creaDetectorVoz, modeloEnergia, type DetectorVoz } from '../../../../../tools/voz/dist/index.js';
import { creaReproductorNavegador, type ReproductorNavegador } from '../../../../../tools/bucle-voz/dist/navegador/index.js';
import {
  aPcm16, creaBucle, creaEnrutadorLocal, creaOido, creaSeparador, dePcm16, nivelDb, ORDENES_ES, VERBOS_ESCRITURA,
  type AudioFrase, type Bucle, type Cerebro, type Decision, type Enrutador, type EventoDetector, type Oido, type PiezaCerebro,
} from '../../../../../tools/bucle-voz/dist/index.js';
import {
  detectaUrgencia, escrituraA, ORDENES_CLINICA, pareceInyeccion, pideDiagnostico, respuestaLocal, TEXTO_ACCION, TEXTO_NO_PERMITIDA, VERBOS_ESCRITURA_CLINICA,
  type AccionPropuesta, type Clinica,
} from '../../../../../tools/clinica-dental/dist/index.js';

export const HZ = 16_000;
export const MS_CIERRE = 600;
const CONTROL = ORDENES_ES.filter((o) => ['para', 'repite', 'mas-despacio', 'mas-rapido'].includes(o.id));

export class SinMicrofono extends Error {}

async function transcribe(audio: { muestras: Float32Array; hz: number }, senal: AbortSignal): Promise<string[]> {
  const r = await fetch('/api/clinica-dental/voz/transcribir', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000' }, body: aPcm16(audio.muestras).buffer as ArrayBuffer, signal: senal });
  if (!r.ok) throw new Error('el motor de voz local no respondió');
  return ((await r.json()) as { candidatos: string[] }).candidatos;
}

function creaSintetizador() {
  const cache = new Map<string, AudioFrase>();
  return {
    async sintetiza(frase: string, senal: AbortSignal): Promise<AudioFrase> {
      const guardada = cache.get(frase);
      if (guardada) return guardada;
      const r = await fetch('/api/clinica-dental/voz/sintetizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: frase }), signal: senal });
      if (!r.ok) throw new Error('no se pudo generar la voz');
      const audio = { muestras: dePcm16(new Uint8Array(await r.arrayBuffer())), hz: Number(r.headers.get('x-frecuencia-hz') ?? 22_050) };
      if (frase.length <= 160 && cache.size < 128) cache.set(frase, audio);
      return audio;
    },
  };
}

/** El enrutador del chatbot: lo delicado SIEMPRE al servidor; la escritura se vuelve «abre la pantalla». */
export function enrutadorChat(c: Clinica): Enrutador {
  const base = creaEnrutadorLocal({ ordenes: [...CONTROL, ...ORDENES_CLINICA], vocativos: ['asistente'], verbosEscritura: [...VERBOS_ESCRITURA, ...VERBOS_ESCRITURA_CLINICA] });
  return {
    id: `${base.id}+clinica`,
    decide(candidatos): Decision {
      const texto = candidatos[0] ?? '';
      if (candidatos.some((t) => detectaUrgencia(t, c) || pideDiagnostico(t) || pareceInyeccion(t))) return { tipo: 'llm', motivo: 'conversacion', confianza: 1, texto };
      const d = base.decide(candidatos);
      if (d.tipo === 'orden' && d.clase === 'escritura') {
        const w = escrituraA(d.texto);
        return { ...d, clase: 'lectura', orden: w.accion ? `abrir:${w.accion.tipo}` : 'no-permitida' };
      }
      return d;
    },
  };
}

export interface PuertosConversacion {
  cerebro: Cerebro;
  enrutador: Enrutador;
  lee: (orden: string) => Promise<string>;
  /** Textos fijos cuya PRIMERA frase se sintetiza al encender (lo que el centro de mando llama calentar). */
  fijas?: readonly string[];
}

/** La primera frase tal como la cortará el canal de voz del bucle (mismo separador). */
const primeraFrase = (texto: string): string | undefined => {
  const s = creaSeparador();
  return [...s.empuja(texto), ...s.cierra()][0];
};

/** Puertos del CHATBOT: el cerebro es la ruta del servidor (NDJSON frase a frase). */
export function puertosChat(c: Clinica, p: { conversacion: string; visitante: string | null; alAccion: (a: AccionPropuesta) => void; alFin?: (r: Record<string, unknown>) => void }): PuertosConversacion {
  const cerebro: Cerebro = {
    async *piensa(mensajes, senal): AsyncGenerator<PiezaCerebro> {
      const ultimo = mensajes[mensajes.length - 1];
      const r = await fetch('/api/clinica-dental/asistente', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: senal, body: JSON.stringify({ clinica: c.id, candidatos: [ultimo?.texto ?? ''], historial: mensajes.slice(0, -1).slice(-6), modo: 'voz', conversacion: p.conversacion, visitante: p.visitante }) });
      if (!r.ok || !r.body) throw new Error('el asistente no respondió');
      for await (const l of lineas(r.body)) {
        if (l['t'] === 'frase') yield { tipo: 'token', texto: `${String(l['x'])} ` };
        else if (l['t'] === 'fin') {
          const a = l['accion'] as AccionPropuesta | null;
          if (a) p.alAccion(a);
          p.alFin?.(l);
          yield { tipo: 'uso', costoUsd: (l['costoUsd'] as number | null) ?? null };
        } else if (l['t'] === 'error') throw new Error(String(l['mensaje']));
      }
    },
  };
  const lee = async (orden: string): Promise<string> => {
    if (orden === 'horario' || orden === 'ubicacion') return respuestaLocal(orden, c);
    const mapa: Record<string, AccionPropuesta> = { 'mis-citas': { tipo: 'abrir_mis_citas' }, agendar: { tipo: 'abrir_agenda' }, cancelar: { tipo: 'abrir_cancelacion' }, reprogramar: { tipo: 'abrir_reprogramacion' } };
    const a = orden.startsWith('abrir:') ? ({ tipo: orden.slice(6) } as AccionPropuesta) : mapa[orden];
    if (!a) return orden === 'no-permitida' ? TEXTO_NO_PERMITIDA : 'Esa no la tengo.';
    p.alAccion(a);
    return TEXTO_ACCION[a.tipo];
  };
  const fijas = [respuestaLocal('horario', c), respuestaLocal('ubicacion', c), ...Object.values(TEXTO_ACCION), TEXTO_NO_PERMITIDA];
  return { cerebro, enrutador: enrutadorChat(c), lee, fijas };
}

export async function* lineas(cuerpo: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const lector = cuerpo.getReader();
  const decodifica = new TextDecoder();
  let resto = '';
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += decodifica.decode(value, { stream: true });
    let i: number;
    while ((i = resto.indexOf('\n')) >= 0) {
      const l = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (l) yield JSON.parse(l) as Record<string, unknown>;
    }
  }
}

/** Puertos de la GUÍA: solo control (para, repite, despacio) delante; lo demás lo interpreta la guía, sin LLM. */
export function puertosGuia(procesa: (texto: string) => string): PuertosConversacion {
  return {
    enrutador: creaEnrutadorLocal({ ordenes: CONTROL, vocativos: ['asistente'], verbosEscritura: [] }),
    cerebro: { async *piensa(mensajes) { yield { tipo: 'token', texto: procesa(mensajes[mensajes.length - 1]?.texto ?? '') }; } },
    lee: async () => '',
  };
}

export interface SesionVoz {
  bucle: Bucle;
  reproductor: ReproductorNavegador;
  readonly oido: Oido | undefined;
  enciende(): Promise<void>;
  apaga(): Promise<void>;
  destruye(): void;
}

export function creaSesionVoz(p: PuertosConversacion): SesionVoz {
  const reproductor = creaReproductorNavegador();
  const sintetizador = creaSintetizador();
  const bucle = creaBucle({
    modo: 'manos-libres', transcriptor: { transcribe }, sintetizador: { sintetiza: (f, s) => sintetizador.sintetiza(f, s) }, cerebro: p.cerebro, enrutador: p.enrutador,
    lector: { lee: (orden) => p.lee(orden) }, reproductor, reloj: () => performance.now(),
  });
  let captura: CapturaMicrofono | undefined;
  let detector: DetectorVoz | undefined;
  let oido: Oido | undefined;
  let cola: Promise<void> = Promise.resolve();
  const calienta = async () => {
    const senal = new AbortController().signal;
    for (const t of p.fijas ?? []) {
      const f = primeraFrase(t);
      if (f) await sintetizador.sintetiza(f, senal).catch(() => undefined);
    }
  };
  return {
    bucle, reproductor,
    get oido() { return oido; },
    async enciende() {
      reproductor.desbloquea();
      if (captura) return;
      const d = creaDetectorVoz({ modelo: modeloEnergia({ frecuenciaHz: HZ, marcosCalibracion: 9 }), msSilencioParaCerrar: MS_CIERRE, msMinimoHabla: 150, msRelleno: 200, conservaAudio: true });
      const o = creaOido({ bucle, hz: HZ, msSilencioCierre: MS_CIERRE, maquinaHabla: () => bucle.estado === 'hablando', atenua: (a) => reproductor.atenua(a), nivelSalidaDb: () => reproductor.nivelReferenciaEcoDb() });
      detector = d;
      oido = o;
      try {
        captura = await capturaMicrofono({
          frecuenciaHz: HZ, restricciones: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
          alRecibir: (m) => {
            o.alimenta(m, performance.now());
            const nivel = nivelDb(m);
            cola = cola.then(async () => o.procesa((await d.procesa(m)) as EventoDetector[], nivel)).catch(() => undefined);
          },
        });
      } catch {
        throw new SinMicrofono('sin permiso de micrófono');
      }
      void calienta();
    },
    async apaga() {
      bucle.desactiva();
      const c = captura;
      captura = undefined;
      await c?.detiene();
      oido?.reinicia();
      detector?.reinicia();
    },
    destruye() {
      void this.apaga();
      bucle.destruye();
      reproductor.destruye();
    },
  };
}
