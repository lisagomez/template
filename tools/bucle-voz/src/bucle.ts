/**
 * El bucle de un asistente de voz: reposo → escuchando → transcribiendo → pensando → hablando.
 *
 * Lo rediseñado respecto a `useVoiceLoop` de business-os (MIT), defecto por defecto:
 *  - **Un turno, un identificador** (`turnos.ts`): todo lo asíncrono va atado a su turno; abrir
 *    otro aborta transcripción, cerebro y voz del anterior, y lo que llegue tarde se tira.
 *  - **El micrófono no se cierra nunca**: escuchar es un estado lógico. Activar dos veces no abre
 *    dos micrófonos y la persona puede hablar encima mientras la máquina habla (`interrumpe`).
 *  - **La voz que suena durante la respuesta no abre turnos**: un tramo que empezó con la máquina
 *    hablando y sin interrupción confirmada es eco, y se descarta.
 *  - **Especulación**: en la primera pausa se transcribe, se enruta y se prepara la respuesta
 *    (retenida); si la voz sigue, se aborta; si el VAD cierra, ya está lista. Una orden segura
 *    cierra antes (`msCierreYa`); una frase abierta («…y») espera un poco más.
 *  - **Telemetría desde el fin real del habla** hasta la primera muestra que suena.
 */
import { concatena } from './audio.js';
import { creaCanalVoz, type AudioFrase, type CanalVoz } from './canal-voz.js';
import { juezPorTexto, type VeredictoCierre } from './cierre.js';
import { planControl, type PlanControl } from './control.js';
import type { Decision } from './enrutador.js';
import { pareceEco } from './activacion.js';
import { palabras } from './texto.js';
import { creaSeparador } from './separador.js';
import { creaTelemetria, type Etapa, type Telemetria } from './telemetria.js';
import { conSenal, creaGestorTurnos, type Turno } from './turnos.js';
import type { AudioTurno, EstadoBucle, EventoBucle, EventoReproductor, Mensaje, ModoBucle, OpcionesBucle } from './tipos.js';

export interface Bucle {
  readonly estado: EstadoBucle;
  readonly modo: ModoBucle;
  readonly velocidad: number;
  readonly telemetria: Telemetria;
  readonly historial: readonly Mensaje[];
  activa(): void;
  desactiva(): void;
  cambiaModo(modo: ModoBucle): void;
  /** El VAD abrió un tramo de voz (instante en el reloj de la página). */
  vozInicia(ms: number): void;
  /** Hubo pausa dentro del tramo: se especula con el audio hasta aquí. */
  pausa(audio: AudioTurno, finReal: number): void;
  /** La voz volvió tras la pausa: la especulación se tira. */
  vozReanuda(): void;
  /** El VAD cerró el tramo. `finReal`: último marco con voz; `cierre`: cuando el VAD decidió. */
  vozTermina(audio: AudioTurno, finReal: number, cierre: number): void;
  /** Interrupción confirmada (la persona habla encima de la máquina). */
  interrumpe(ms: number): void;
  /** Texto escrito en vez de hablado (sin transcripción). */
  dice(texto: string): void;
  suscribe(f: (e: EventoBucle) => void): () => void;
  destruye(): void;
}

interface Vuelo {
  turno: Turno;
  finReal: number;
  /** El tramo de voz de este turno interrumpió a la máquina. */
  interrumpio: boolean;
  /** Cuándo empezó la voz de este turno (para distinguir eco de respuesta). */
  inicioVoz: number;
  confirmado: boolean;
  desdeReposo: boolean;
  fase: 'transcribiendo' | 'pensando';
  veredicto: VeredictoCierre;
  ruta?: 'orden' | 'llm';
  canal?: CanalVoz;
  plan?: PlanControl;
  textoUsuario: string;
  respuesta: string;
  produccionTerminada: boolean;
  sonando: boolean;
  terminadas: number;
  fracciones: Map<number, number>;
  audios: Map<number, AudioFrase>;
  cancelaCierre?: () => void;
  cierreAnticipado: boolean;
}

const TOLERANCIA_MS = 40;
const programaPorDefecto = (f: () => void, ms: number) => {
  const id = setTimeout(f, ms);
  return () => clearTimeout(id);
};

export function creaBucle(o: OpcionesBucle): Bucle {
  if (o.modo === 'palabra' && !o.activacion) throw new Error('el modo palabra necesita `activacion`');
  const tel = creaTelemetria();
  const gestor = creaGestorTurnos();
  const oyentes = new Set<(e: EventoBucle) => void>();
  const programa = o.programa ?? programaPorDefecto;
  const juez = o.juezCierre ?? juezPorTexto;
  const msCierreYa = o.msCierreYa ?? 300;
  const msEsperaExtra = o.msEsperaExtra ?? 700;
  const msSeguimiento = o.msSeguimiento ?? 6000;
  const historial: Mensaje[] = [];
  let modo = o.modo;
  let estado: EstadoBucle = 'reposo';
  let activo = modo === 'manos-libres';
  let velocidad = o.velocidadInicial ?? 1;
  let vuelo: Vuelo | undefined;
  let retenido: { audio: AudioTurno } | undefined;
  let pendiente: string | undefined;
  let ultima: { frases: string[]; audios: AudioFrase[] } | undefined;
  let ultimoDicho = '';
  let finHablaAgente = Number.NEGATIVE_INFINITY;
  let vozSobreLaMaquina = false;
  let inicioVoz = Number.NEGATIVE_INFINITY;
  /** Fin real del último tramo que ya se atendió cerrando por sentido: su cierre del VAD, si llega, no abre otro turno. */
  let atendido: number | undefined;
  let tramoInterrumpio = false;
  let cancelaSeguimiento: (() => void) | undefined;

  const emite = (e: EventoBucle) => {
    for (const f of oyentes) f(e);
  };
  const pasaA = (e: EstadoBucle) => {
    if (estado === e) return;
    estado = e;
    emite({ tipo: 'estado', estado: e });
  };
  const vivo = (v: Vuelo) => vuelo === v && v.turno.vivo;
  const marca = (v: Vuelo, etapa: Etapa) => tel.marca(v.turno.id, etapa, o.reloj());
  const escucha = () => activo || modo === 'palabra';
  const reposoOEscucha = () => pasaA(activo ? 'escuchando' : 'reposo');

  const descarta = (v: Vuelo, motivo: string) => {
    v.cancelaCierre?.();
    v.turno.aborta(motivo);
    tel.cierra(v.turno.id, 'descartado');
    emite({ tipo: 'descartado', turno: v.turno.id, motivo });
    if (vuelo === v) {
      vuelo = undefined;
      reposoOEscucha();
    }
  };

  const arranca = (finReal: number, confirmado: boolean): Vuelo => {
    const anterior = vuelo;
    if (anterior && tel.turno(anterior.turno.id)?.estado === 'en-curso') tel.cierra(anterior.turno.id, anterior.confirmado ? 'interrumpido' : 'descartado');
    anterior?.cancelaCierre?.();
    cancelaSeguimiento?.();
    const turno = gestor.nuevo();
    const v: Vuelo = {
      turno, finReal, interrumpio: tramoInterrumpio, inicioVoz: Math.min(inicioVoz, finReal), confirmado, desdeReposo: !activo, fase: 'transcribiendo', veredicto: 'normal', textoUsuario: '', respuesta: '',
      produccionTerminada: false, sonando: false, terminadas: 0, fracciones: new Map(), audios: new Map(), cierreAnticipado: false,
    };
    vuelo = v;
    tel.abre(turno.id, finReal);
    if (confirmado) {
      // Un turno nuevo y firme calla lo que quedara sonando del anterior (p. ej. una pregunta escrita).
      if (anterior?.sonando) o.reproductor.detiene();
      pasaA('transcribiendo');
      emite({ tipo: 'confirmado', turno: turno.id, anticipado: false });
    }
    return v;
  };

  /** Activación, eco y enrutado. `undefined` = el turno se descartó. */
  const decide = (v: Vuelo, candidatos: readonly string[]): Decision | undefined => {
    let textos = candidatos.filter((c) => c.trim().length > 0);
    if (textos.length === 0) return void descarta(v, 'sin texto');
    // Eco: solo si la voz empezó mientras la máquina sonaba o justo al callar (la cola de la sala).
    // Quien CONTESTA repitiendo una palabra de la máquina («di confirmo» → «confirmo») empieza después.
    if (ultimoDicho && v.inicioVoz < finHablaAgente + 250 && pareceEco(textos[0] ?? '', ultimoDicho)) return void descarta(v, 'eco de la máquina');
    if (v.desdeReposo && modo === 'palabra' && o.activacion) {
      const hallada = textos.map((t) => o.activacion?.detecta(t)).find((r) => r?.activada);
      if (!hallada?.activada) return void descarta(v, 'sin palabra de activación');
      activo = true;
      emite({ tipo: 'activado', turno: v.turno.id, texto: textos[0] ?? '' });
      if (hallada.resto.length === 0) return { tipo: 'orden', orden: 'escucha', clase: 'control', confianza: 1, texto: '' };
      textos = [hallada.resto];
    }
    const decision = o.enrutador.decide(textos);
    if (decision.tipo === 'nada') return void descarta(v, 'nada que hacer');
    // Quien corta a la máquina con dos palabras que no se entienden casi siempre dijo «para» o «espera» (medido: el
    // «Para.» sintético se transcribió «But» y «Lara.» y el cerebro volvía a hablar). Mejor callar que contestar a eso.
    if (v.interrumpio && decision.tipo === 'llm' && palabras(decision.texto).length <= 2) {
      return { tipo: 'orden', orden: 'para', clase: 'control', confianza: 0.6, texto: decision.texto };
    }
    return decision;
  };

  const prepara = async (v: Vuelo, audio: AudioTurno | undefined, texto: string | undefined) => {
    try {
      const candidatos = texto !== undefined ? [texto] : audio ? await conSenal(o.transcriptor.transcribe(audio, v.turno.senal), v.turno.senal) : [];
      if (!vivo(v)) return;
      marca(v, 'transcrito');
      tel.anota(v.turno.id, { especulativo: !v.confirmado, texto: candidatos[0] ?? '' });
      emite({ tipo: 'oido', turno: v.turno.id, texto: candidatos[0] ?? '', especulativo: !v.confirmado });
      const decision = decide(v, candidatos);
      if (!decision || decision.tipo === 'nada' || !vivo(v)) return;
      marca(v, 'enrutado');
      emite({ tipo: 'decision', turno: v.turno.id, decision });
      v.ruta = decision.tipo === 'orden' ? 'orden' : 'llm';
      v.textoUsuario = decision.texto;
      tel.anota(v.turno.id, { ruta: v.ruta, ...(decision.tipo === 'orden' ? { orden: decision.orden } : {}) });
      v.veredicto = juez.juzga(decision.texto, { esOrdenSegura: decision.tipo === 'orden' && decision.confianza >= 0.9 });
      v.fase = 'pensando';
      if (v.confirmado) pasaA('pensando');
      else planificaCierre(v);
      await responde(v, decision);
    } catch (e) {
      if (!vivo(v)) return;
      emite({ tipo: 'aviso', turno: v.turno.id, mensaje: e instanceof Error ? e.message : 'el turno falló' });
      if (!v.confirmado) return descarta(v, 'falló la especulación');
      if (!v.canal) v.canal = nuevoCanal(v);
      // Un error no se queda mudo: si aún no se dijo nada, se dice que no se pudo.
      if (v.canal.frases.length === 0) hablaTexto(v, v.canal, 'Perdón, no pude contestar ahora.');
      v.produccionTerminada = true;
      v.canal.termina();
      compruebaFin(v);
    }
  };

  const nuevoCanal = (v: Vuelo): CanalVoz =>
    creaCanalVoz({
      turno: v.turno,
      sintetizador: o.sintetizador,
      confirmado: v.confirmado,
      entrega: (p) => {
        v.audios.set(p.indice, p.audio);
        o.reproductor.reproduce(p);
      },
      alVozLista: (i) => i === 0 && marca(v, 'vozLista'),
      alFallo: (indice, texto, mensaje) => {
        emite({ tipo: 'aviso', turno: v.turno.id, mensaje: `no pude decir «${texto}»: ${mensaje}` });
        compruebaFin(v);
      },
    });

  const agregaFrase = (v: Vuelo, canal: CanalVoz, frase: string) => {
    marca(v, 'primeraFrase');
    emite({ tipo: 'frase', turno: v.turno.id, indice: canal.frases.length, texto: frase });
    canal.agrega(frase);
  };

  const hablaTexto = (v: Vuelo, canal: CanalVoz, texto: string) => {
    v.respuesta = texto;
    emite({ tipo: 'respuesta', turno: v.turno.id, texto });
    const sep = creaSeparador();
    for (const f of [...sep.empuja(texto), ...sep.cierra()]) agregaFrase(v, canal, f);
  };

  const responde = async (v: Vuelo, d: Exclude<Decision, { tipo: 'nada' }>) => {
    const canal = nuevoCanal(v);
    v.canal = canal;
    if (d.tipo === 'llm') await piensa(v, canal, d.texto);
    else if (d.clase === 'lectura') hablaTexto(v, canal, await conSenal(o.lector.lee(d.orden, v.turno.senal), v.turno.senal));
    else {
      v.plan = planControl(d.orden, d.texto, { velocidad, pendiente, hayUltima: ultima !== undefined });
      if (v.plan.texto) hablaTexto(v, canal, v.plan.texto);
      if (v.plan.repite && ultima) ultima.frases.forEach((f, i) => ultima && canal.agregaHecha(f, ultima.audios[i] as AudioFrase));
      if (v.confirmado) aplicaPlan(v);
    }
    if (!vivo(v)) return;
    v.produccionTerminada = true;
    canal.termina();
    compruebaFin(v);
  };

  const piensa = async (v: Vuelo, canal: CanalVoz, texto: string) => {
    // Con la frase abierta («…y») el cerebro preventivo sería gasto casi seguro: espera al cierre.
    if (!v.confirmado && (o.cerebroPreventivo === false || v.veredicto === 'espera')) await esperaConfirmacion(v);
    if (!vivo(v)) return;
    const sep = creaSeparador();
    const mensajes = [...historial.slice(-(o.maxHistorial ?? 8)), { rol: 'usuario' as const, texto }];
    for await (const p of o.cerebro.piensa(mensajes, v.turno.senal)) {
      if (!vivo(v)) return;
      if (p.tipo === 'uso') {
        tel.anota(v.turno.id, { costoUsd: p.costoUsd });
        continue;
      }
      marca(v, 'primerToken');
      v.respuesta += p.texto;
      emite({ tipo: 'respuesta', turno: v.turno.id, texto: v.respuesta });
      for (const f of sep.empuja(p.texto)) agregaFrase(v, canal, f);
    }
    if (vivo(v)) for (const f of sep.cierra()) agregaFrase(v, canal, f);
  };

  const esperaConfirmacion = (v: Vuelo) =>
    new Promise<void>((resuelve) => {
      const revisa = () => (v.confirmado || !v.turno.vivo ? resuelve() : void programa(revisa, 20));
      revisa();
    });

  const aplicaPlan = (v: Vuelo) => {
    const plan = v.plan;
    if (!plan) return;
    v.plan = undefined;
    if (plan.velocidad !== undefined) {
      velocidad = plan.velocidad;
      o.reproductor.velocidad(velocidad);
    }
    if (plan.pendiente !== undefined) pendiente = plan.pendiente ?? undefined;
    if (plan.despues === 'reposo') activo = false;
  };

  const planificaCierre = (v: Vuelo) => {
    if (v.veredicto !== 'ya') return;
    const espera = v.finReal + msCierreYa - o.reloj();
    if (espera <= 0) return confirma(v, true);
    v.cancelaCierre = programa(() => vuelo === v && !v.confirmado && v.turno.vivo && confirma(v, true), espera);
  };

  const confirma = (v: Vuelo, anticipado: boolean) => {
    if (v.confirmado || !vivo(v)) return;
    v.confirmado = true;
    v.cancelaCierre?.();
    marca(v, 'cierre');
    if (anticipado) {
      v.cierreAnticipado = true;
      atendido = v.finReal;
      tel.anota(v.turno.id, { cierreAnticipado: true });
    }
    emite({ tipo: 'confirmado', turno: v.turno.id, anticipado });
    pasaA(v.sonando ? 'hablando' : v.fase);
    aplicaPlan(v);
    v.canal?.confirma();
    compruebaFin(v);
  };

  const compruebaFin = (v: Vuelo) => {
    if (!vivo(v) || !v.confirmado || !v.produccionTerminada || !v.canal) return;
    if (v.terminadas + v.canal.fallidas < v.canal.frases.length) return;
    termina(v);
  };

  const termina = (v: Vuelo) => {
    marca(v, 'fin');
    tel.cierra(v.turno.id, 'completo');
    emite({ tipo: 'fin', turno: v.turno.id });
    if (v.ruta === 'llm' && v.respuesta) historial.push({ rol: 'usuario', texto: v.textoUsuario }, { rol: 'asistente', texto: v.respuesta });
    if (v.canal && v.canal.entregadas > 0) {
      const frases = v.canal.frases.filter((_, i) => v.audios.has(i));
      ultima = { frases, audios: [...v.audios.keys()].sort((a, b) => a - b).map((i) => v.audios.get(i) as AudioFrase) };
    }
    vuelo = undefined;
    if (!activo || modo === 'toque') {
      activo = modo === 'manos-libres' && activo;
      return reposoOEscucha();
    }
    pasaA('escuchando');
    if (modo === 'palabra') cancelaSeguimiento = programa(() => (estado === 'escuchando' && !vuelo ? ((activo = false), pasaA('reposo')) : undefined), msSeguimiento);
  };

  const alReproductor = (e: EventoReproductor) => {
    const v = vuelo;
    if (!v || e.turno !== v.turno.id || !v.turno.vivo) return;
    if (e.tipo === 'suena') {
      if (!v.sonando) tel.marca(v.turno.id, 'suena', e.t);
      v.sonando = true;
      ultimoDicho = v.canal?.frases[e.indice] ?? '';
      if (v.confirmado) pasaA('hablando');
    } else if (e.tipo === 'progreso') {
      v.fracciones.set(e.indice, e.fraccion);
      emite({ tipo: 'karaoke', turno: v.turno.id, indice: e.indice, fraccion: e.fraccion });
    } else {
      v.terminadas++;
      v.fracciones.set(e.indice, 1);
      finHablaAgente = e.tipo === 'termina' ? e.t : o.reloj();
      if (e.tipo === 'error') emite({ tipo: 'aviso', turno: v.turno.id, mensaje: `no sonó la frase ${e.indice + 1}: ${e.mensaje}` });
      compruebaFin(v);
    }
  };
  const quitaReproductor = o.reproductor.alEvento(alReproductor);

  /** Lo que la persona alcanzó a oír: frases enteras más la parte proporcional de la que sonaba. */
  const dichoHastaAhora = (v: Vuelo): string => {
    const frases = v.canal?.frases ?? [];
    return frases
      .map((f, i) => {
        const fr = v.fracciones.get(i) ?? 0;
        if (fr >= 1) return f;
        const corte = Math.round(f.length * fr);
        return fr > 0 ? f.slice(0, f.lastIndexOf(' ', corte) > 0 ? f.lastIndexOf(' ', corte) : corte) : '';
      })
      .filter(Boolean)
      .join(' ');
  };

  const activa = () => {
    cancelaSeguimiento?.();
    activo = true;
    if (estado === 'reposo') pasaA('escuchando');
  };

  return {
    get estado() {
      return estado;
    },
    get modo() {
      return modo;
    },
    get velocidad() {
      return velocidad;
    },
    telemetria: tel,
    get historial() {
      return historial;
    },
    activa,
    desactiva() {
      activo = false;
      if (vuelo) descarta(vuelo, 'desactivado');
      gestor.abortaActual('desactivado');
      retenido = undefined;
      o.reproductor.detiene();
      pasaA('reposo');
    },
    cambiaModo(m) {
      modo = m;
      if (m === 'manos-libres') activa();
    },
    vozInicia(ms) {
      cancelaSeguimiento?.();
      inicioVoz = ms;
      tramoInterrumpio = false;
      vozSobreLaMaquina = estado === 'hablando';
      const v = vuelo;
      if (v && !v.confirmado && retenido && ms >= v.finReal) descarta(v, 'la frase seguía');
      if (estado === 'reposo' && activo) pasaA('escuchando');
    },
    pausa(audio, finReal) {
      if (!escucha() || vozSobreLaMaquina || estado === 'hablando') return;
      if (vuelo && !vuelo.confirmado && Math.abs(vuelo.finReal - finReal) <= TOLERANCIA_MS) return;
      if (vuelo?.confirmado) return;
      const v = arranca(finReal, false);
      void prepara(v, retenido ? concatena(retenido.audio, audio) : audio, undefined);
    },
    vozReanuda() {
      if (vuelo && !vuelo.confirmado) descarta(vuelo, 'la voz siguió');
    },
    vozTermina(audio, finReal, cierre) {
      const sobreMaquina = vozSobreLaMaquina;
      vozSobreLaMaquina = false;
      // Un tramo que empezó con la máquina hablando, sin interrupción confirmada, es eco o ruido.
      if (!escucha() || (sobreMaquina && (estado === 'hablando' || finReal - finHablaAgente < 300))) return;
      // Ya se contestó cerrando por sentido y el turno pudo acabar antes de que el VAD cerrara («Para.» no dice nada).
      if (atendido !== undefined && Math.abs(atendido - finReal) <= TOLERANCIA_MS) return void (atendido = undefined);
      const v = vuelo;
      if (v && Math.abs(v.finReal - finReal) <= TOLERANCIA_MS && v.turno.vivo) {
        if (v.confirmado) return; // ya cerró por sentido
        if (v.veredicto === 'espera') {
          retenido = { audio: retenido ? concatena(retenido.audio, audio) : audio };
          v.cancelaCierre = programa(() => {
            retenido = undefined;
            confirma(v, false);
          }, msEsperaExtra);
          return;
        }
        retenido = undefined;
        return confirma(v, false);
      }
      const completo = retenido ? concatena(retenido.audio, audio) : audio;
      retenido = undefined;
      const nv = arranca(finReal, true);
      tel.marca(nv.turno.id, 'cierre', Math.max(cierre, finReal));
      void prepara(nv, completo, undefined);
    },
    interrumpe(ms) {
      vozSobreLaMaquina = false;
      tramoInterrumpio = true;
      const v = vuelo;
      if (!v || !v.confirmado) return;
      const dicho = dichoHastaAhora(v);
      tel.marca(v.turno.id, 'interrumpido', ms);
      tel.cierra(v.turno.id, 'interrumpido');
      if (v.ruta === 'llm') historial.push({ rol: 'usuario', texto: v.textoUsuario }, { rol: 'asistente', texto: `${dicho} [interrumpido]`.trim() });
      emite({ tipo: 'interrumpido', turno: v.turno.id, dicho });
      v.turno.aborta('interrumpido');
      vuelo = undefined;
      finHablaAgente = ms;
      o.reproductor.detiene();
      activo = true;
      pasaA('escuchando');
    },
    dice(texto) {
      const ahora = o.reloj();
      inicioVoz = ahora;
      const v = arranca(ahora, true);
      tel.marca(v.turno.id, 'cierre', ahora);
      v.desdeReposo = false;
      void prepara(v, undefined, texto);
    },
    suscribe(f) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    destruye() {
      quitaReproductor();
      gestor.abortaActual('destruido');
      cancelaSeguimiento?.();
      oyentes.clear();
    },
  };
}
