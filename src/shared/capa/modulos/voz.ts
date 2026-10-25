'use client';

/**
 * El módulo de voz LOCAL de la capa: llena la ranura de voz con NUESTROS motores, por las mismas rutas del servidor
 * que usa el centro de mando (Parakeet para oír y Piper para hablar, en el demonio de `tools/dictado`; Silero o la
 * energía calibrada en el navegador para saber cuándo habla la persona). El audio no sale de la máquina.
 *
 *  - `creaControl`: el bucle de `bucle-voz` en manos libres. El CEREBRO de cada turno es la conversación de la capa
 *    (`responde`): la misma intención y el mismo freno que el chat escrito. No hay cerebro preventivo: la capa
 *    ejecuta intenciones, así que solo recibe un turno ya cerrado (nunca una especulación). El acuse inmediato suena
 *    solo si la capa tarda más de `MS_GRACIA_ACUSE` (con la capa local casi nunca hace falta).
 *  - El freno no se salta: si la respuesta quedó frenada, se lee y se añade que el clic es de la persona; y un «sí,
 *    confírmalo» dicho mientras hay una tarjeta del freno no se manda a ninguna parte: se contesta que por voz no.
 *  - Apagar cierra el micrófono AL INSTANTE (las pistas se detienen antes de volver de `apaga`), también si se apaga
 *    mientras se pedía el permiso.
 *  - `dicta`: una toma hasta que la persona calla, transcrita en local. `lee`: Piper por el servidor y, si no hay,
 *    la mejor voz LOCAL del dispositivo (nunca una de red).
 */
import { capturaMicrofono, type CapturaMicrofono } from '../../../../tools/voz/dist/browser/index.js';
import type { DetectorVoz, ModeloVoz } from '../../../../tools/voz/dist/index.js';
import { creaReproductorNavegador, hablaConDispositivo, type ReproductorNavegador } from '../../../../tools/bucle-voz/dist/navegador/index.js';
import {
  creaAcuse, creaBucle, creaEnrutadorLocal, creaOido, creaSeparador, juezConPregunta, nivelDb, ORDENES_ES,
  type Bucle, type Cerebro, type EstadoBucle, type EventoDetector, type Lector, type Oido, type PiezaCerebro,
} from '../../../../tools/bucle-voz/dist/index.js';
import type { AvisoConversacion, ControlConversacion, EstadoConversacion, ModuloDeVoz, RespuestaDeTurno } from '../../../../tools/capa/dist/index.js';
import { useDictadoMovil } from '@/features/dictado/store/movil';
import { tokenDelEnlace } from '@/shared/lib/token-enlace';
import { creaDetector, creaModelo, DETECTOR_POR_DEFECTO, energiaCalibrada, HZ, MS_CIERRE } from '@/features/centro-de-mando/services/detector';
import { creaPuertos, type Puertos } from '@/features/centro-de-mando/services/puertos';
import * as cliente from '@/features/centro-de-mando/services/cliente';

/** Si la capa contesta antes de esto, el acuse sobra. */
export const MS_GRACIA_ACUSE = 450;
export const AVISO_FRENO = 'Por voz no lo confirmo: el clic en «Confirmar» es tuyo.';
export const RESPUESTA_CONFIRMAR_POR_VOZ = 'Eso no lo confirmo por voz. Si lo quieres, dale clic a «Confirmar» en la tarjeta; si no, a «Descartar».';
const SIN_EMPAREJAR = 'empareja este navegador con la llave del dictado (en Dictado, o con el enlace del QR): sin ella, los motores locales no contestan';

/** Las órdenes que el bucle resuelve solo en la capa: las del propio bucle. Lo demás va a la conversación de la capa. */
const ORDENES_CAPA = ORDENES_ES.filter((o) => ['para', 'repite', 'mas-despacio', 'mas-rapido'].includes(o.id));

/** «sí», «confírmalo», «hazlo», «adelante»… al principio: una confirmación dicha. */
export const esConfirmacion = (t: string) => /^(si|claro|va|dale|hazlo|adelante|de acuerdo|ok|confirmo|confirmalo|confirma|procede)([\s,.!¡¿?]|$)/.test(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^[¡¿\s]+/, '').trim());

const DE_BUCLE: Readonly<Record<EstadoBucle, EstadoConversacion>> = { reposo: 'escuchando', escuchando: 'escuchando', transcribiendo: 'pensando', pensando: 'pensando', hablando: 'hablando' };

/** El token del dictado: el emparejado en este navegador, o el del enlace (`#t=…`), que se empareja al usarlo. */
async function tokenDeVoz(): Promise<string | undefined> {
  const tienda = useDictadoMovil.getState();
  if (!tienda.token) tienda.carga();
  const ya = useDictadoMovil.getState().token;
  if (ya) return ya;
  const enlace = tokenDelEnlace(window.location);
  if (!enlace || !(await tienda.empareja(enlace.token))) return undefined;
  history.replaceState(null, '', enlace.urlLimpia);
  return enlace.token;
}

async function modeloDeVoz(maquinaHabla: () => boolean): Promise<ModeloVoz> {
  try {
    return await creaModelo(DETECTOR_POR_DEFECTO, () => import('@/features/centro-de-mando/services/silero-navegador').then((m) => m.creaSileroNavegador()), maquinaHabla);
  } catch {
    return energiaCalibrada(); // sin Silero preparado: la energía calibrada, igual que el HUD
  }
}

const abreMicrofono = () =>
  navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false } });

/** La conversación de la capa como cerebro del bucle: un turno ya cerrado entra, su respuesta sale de una vez. */
function cerebroDeLaCapa(responde: (texto: string, senal: AbortSignal) => Promise<RespuestaDeTurno>, estado: { frenoPendiente: boolean }): Cerebro {
  return {
    async *piensa(mensajes, senal): AsyncGenerator<PiezaCerebro> {
      const texto = mensajes.at(-1)?.texto ?? '';
      if (estado.frenoPendiente && esConfirmacion(texto)) {
        yield { tipo: 'token', texto: RESPUESTA_CONFIRMAR_POR_VOZ };
        return;
      }
      const r = await responde(texto, senal);
      estado.frenoPendiente = r.frenada;
      const dicho = r.frenada ? `${r.texto} ${AVISO_FRENO}` : r.texto;
      if (dicho.trim()) yield { tipo: 'token', texto: dicho };
    },
  };
}

/** Las órdenes del bucle en la capa son de control (callar, repetir, velocidad): no hay lecturas propias. */
const lectorVacio: Lector = { lee: async () => 'Eso no lo puedo leer aquí.' };

interface Partes {
  token: string;
  puertos: Puertos;
  bucle: Bucle;
  reproductor: ReproductorNavegador;
}

function creaPartes(token: string, responde: (texto: string, senal: AbortSignal) => Promise<RespuestaDeTurno>, estado: { frenoPendiente: boolean }): Partes {
  const acuse = creaAcuse({ msGracia: MS_GRACIA_ACUSE });
  const reproductor = creaReproductorNavegador();
  const puertos = creaPuertos(token, () => bucle.telemetria, undefined, acuse.frases);
  const bucle: Bucle = creaBucle({
    modo: 'manos-libres',
    transcriptor: puertos.transcriptor,
    sintetizador: puertos.sintetizador,
    cerebro: cerebroDeLaCapa(responde, estado),
    lector: lectorVacio,
    reproductor,
    enrutador: creaEnrutadorLocal({ ordenes: ORDENES_CAPA, verbosEscritura: [] }),
    reloj: () => performance.now(),
    juezCierre: juezConPregunta,
    cerebroPreventivo: false,
    acuse,
  });
  return { token, puertos, bucle, reproductor };
}

/** Un `ControlConversacion` del botón: abre el micrófono al primer clic y lo cierra al instante al apagar. */
function creaControlLocal(responde: (texto: string, senal: AbortSignal) => Promise<RespuestaDeTurno>): ControlConversacion & { diagnostico(): { pistas: string[]; bucle?: Bucle; reproductor?: ReproductorNavegador } } {
  const oyentes = new Set<(a: AvisoConversacion) => void>();
  const memoria = { frenoPendiente: false };
  let estado: EstadoConversacion = 'apagado';
  let partes: Partes | undefined;
  let flujo: MediaStream | undefined;
  let captura: CapturaMicrofono | undefined;
  let detector: DetectorVoz | undefined;
  let oido: Oido | undefined;
  let generacion = 0;
  let quitaBucle: (() => void) | undefined;
  let turno: string | undefined;

  const avisa = (extra: Partial<AvisoConversacion> = {}) => {
    for (const f of oyentes) f({ estado, ...extra });
  };
  const pasa = (e: EstadoConversacion, extra: Partial<AvisoConversacion> = {}) => {
    estado = e;
    avisa(extra);
  };
  const escuchaBucle = (b: Bucle) =>
    b.suscribe((e) => {
      if (estado === 'apagado' || estado === 'pidiendo-permiso') return;
      if (e.tipo === 'estado' && DE_BUCLE[e.estado] !== estado) pasa(DE_BUCLE[e.estado], turno ? { turno } : {});
      else if (e.tipo === 'decision' && e.decision.tipo !== 'nada') turno = e.decision.texto;
      else if (e.tipo === 'respuesta') avisa({ ...(turno ? { turno } : {}), respuesta: e.texto });
      else if (e.tipo === 'interrumpido') avisa({ interrumpida: true, ...(turno ? { turno } : {}) });
      else if (e.tipo === 'aviso') avisa({ error: e.mensaje });
    });

  /** Detiene las pistas YA (síncrono) y suelta lo demás. */
  const cierraMicrofono = () => {
    const c = captura;
    captura = undefined;
    if (c) void c.detiene(); // `detiene` para las pistas antes de su primer `await`
    for (const p of flujo?.getTracks() ?? []) p.stop();
    oido?.reinicia();
    detector?.reinicia();
  };

  const conecta = async (p: Partes, g: number, f: MediaStream) => {
    const maquinaHabla = () => p.bucle.estado === 'hablando';
    const d = creaDetector(await modeloDeVoz(maquinaHabla));
    const o = creaOido({ bucle: p.bucle, hz: HZ, msSilencioCierre: MS_CIERRE, maquinaHabla, atenua: (a) => p.reproductor.atenua(a), nivelSalidaDb: () => p.reproductor.nivelReferenciaEcoDb() });
    let cola: Promise<void> = Promise.resolve();
    const c = await capturaMicrofono({
      frecuenciaHz: HZ,
      stream: f,
      alRecibir: (m) => {
        o.alimenta(m, performance.now());
        const nivel = nivelDb(m);
        cola = cola.then(async () => o.procesa((await d.procesa(m)) as EventoDetector[], nivel)).catch(() => undefined);
      },
    });
    if (g !== generacion) return void c.detiene(); // se apagó mientras se abría: nada queda abierto
    detector = d;
    oido = o;
    captura = c;
  };

  return {
    estado: () => estado,
    suscribe(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    async enciende() {
      if (estado !== 'apagado') return { ok: true };
      const g = ++generacion;
      pasa('pidiendo-permiso');
      const token = await tokenDeVoz();
      if (g !== generacion) return { ok: false, motivo: 'se apagó antes de abrir el micrófono' };
      if (!token) return pasa('apagado', { error: SIN_EMPAREJAR }), { ok: false, motivo: SIN_EMPAREJAR };
      try {
        const f = await abreMicrofono(); // el permiso del micrófono se pide aquí: al primer clic
        if (g !== generacion) {
          for (const p of f.getTracks()) p.stop();
          return { ok: false, motivo: 'se apagó mientras pedía el micrófono' };
        }
        flujo = f;
        if (!partes || partes.token !== token) {
          quitaBucle?.();
          partes = creaPartes(token, responde, memoria);
          quitaBucle = escuchaBucle(partes.bucle);
        }
        partes.reproductor.desbloquea();
        await conecta(partes, g, f);
        if (g !== generacion) return { ok: false, motivo: 'se apagó mientras abría el micrófono' };
        partes.bucle.activa();
        pasa('escuchando');
        void partes.puertos.sintetizador.calienta(); // el acuse y las frases fijas, listos antes del primer turno
        return { ok: true };
      } catch (e) {
        cierraMicrofono();
        const motivo = e instanceof DOMException && e.name === 'NotAllowedError' ? 'no diste permiso al micrófono' : `no se pudo abrir el micrófono: ${e instanceof Error ? e.message : 'error'}`;
        pasa('apagado', { error: motivo });
        return { ok: false, motivo };
      }
    },
    apaga() {
      generacion++;
      cierraMicrofono();
      partes?.bucle.desactiva();
      partes?.reproductor.detiene();
      turno = undefined;
      if (estado !== 'apagado') pasa('apagado');
    },
    diagnostico: () => ({ pistas: (flujo?.getTracks() ?? []).map((p) => p.readyState), bucle: partes?.bucle, reproductor: partes?.reproductor }),
  };
}

/** Una toma: se abre el micrófono, se escucha hasta que la persona calla (o 30 s) y se transcribe en local. */
async function dictaUnaToma(senal: AbortSignal): Promise<string> {
  const token = await tokenDeVoz();
  if (!token) throw new Error(SIN_EMPAREJAR);
  senal.throwIfAborted();
  const f = await abreMicrofono();
  let c: CapturaMicrofono | undefined;
  try {
    const audio = await new Promise<Float32Array>((resuelve, rechaza) => {
      const tope = setTimeout(() => resuelve(new Float32Array(0)), 30_000);
      senal.addEventListener('abort', () => { clearTimeout(tope); rechaza(new DOMException('cancelado', 'AbortError')); }, { once: true });
      void (async () => {
        const d = creaDetector(await modeloDeVoz(() => false));
        let cola: Promise<void> = Promise.resolve();
        if (senal.aborted) return;
        c = await capturaMicrofono({
          frecuenciaHz: HZ,
          stream: f,
          alRecibir: (m) => {
            cola = cola.then(async () => {
              for (const e of (await d.procesa(m)) as EventoDetector[]) if (e.tipo === 'finHabla' && e.turno.audio) { clearTimeout(tope); resuelve(e.turno.audio); }
            });
          },
        });
      })().catch(rechaza);
    });
    for (const p of f.getTracks()) p.stop();
    if (audio.length === 0) return '';
    return (await cliente.transcribe(token, { muestras: audio, hz: HZ }, senal))[0] ?? '';
  } finally {
    if (c) void c.detiene();
    for (const p of f.getTracks()) p.stop();
  }
}

/** Lee con Piper por el servidor, frase a frase; sin servidor o sin emparejar, con la mejor voz LOCAL del dispositivo. */
async function leeEnVoz(texto: string, senal: AbortSignal): Promise<void> {
  const token = useDictadoMovil.getState().token ?? (useDictadoMovil.getState().carga(), useDictadoMovil.getState().token);
  if (!token) return hablaConDispositivo(texto, senal);
  const s = creaSeparador();
  const frases = [...s.empuja(texto), ...s.cierra()];
  if (frases.length === 0) return;
  const reproductor = creaReproductorNavegador();
  try {
    await new Promise<void>((resuelve, rechaza) => {
      let terminadas = 0;
      reproductor.alEvento((e) => {
        if (e.tipo === 'termina' || e.tipo === 'error') terminadas++;
        if (terminadas >= frases.length) resuelve();
      });
      senal.addEventListener('abort', () => { reproductor.detiene(); rechaza(new DOMException('cortado', 'AbortError')); }, { once: true });
      void (async () => {
        for (const [i, f] of frases.entries()) reproductor.reproduce({ turno: 1, indice: i, texto: f, audio: await cliente.sintetiza(token, f, senal) });
      })().catch((e: unknown) => (senal.aborted ? undefined : hablaConDispositivo(texto, senal).then(resuelve, () => rechaza(e))));
    });
  } finally {
    reproductor.destruye();
  }
}

export function moduloDeVozLocal(): ModuloDeVoz {
  return {
    creaControl: ({ responde }) => {
      const control = creaControlLocal(responde);
      if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('medicion')) return control;
      // En medición, el control que de verdad se enciende se expone al encender (no al crearlo: en desarrollo React
      // llama dos veces a `useMemo` y se queda con el primero, así que exponerlo al crear apuntaba al descartado).
      const enciende = control.enciende;
      return Object.assign(control, { enciende: () => (Object.assign(window, { __capaVoz: control }), enciende()) });
    },
    dicta: dictaUnaToma,
    lee: leeEnVoz,
    describe: () => ({
      stt: 'Parakeet int8, local (demonio de tools/dictado)',
      tts: 'Piper es_MX, local; si no hay, la mejor voz LOCAL del dispositivo',
      vad: 'Silero v6.2 en el navegador (o energía calibrada)',
      sale: 'nada: el audio no sale de la máquina',
    }),
  };
}
