/**
 * El montaje del modo conversacion dentro de `dictado dictar`: la voz del agente (cargada una
 * vez, al encender la conversacion o al primer `di`), la conversacion con sus contadores y
 * trazas, y el socket por el que hablan `dictado di` y el hook del agente (RF-39, RF-41).
 * Mientras suena la voz el audio del microfono no entra (puerta logica en `cli-dictar.ts`).
 * Separado de `cli-dictar.ts` para que aquel quepa en sus 500 lineas.
 */
import type { Ajustes } from '../ajustes.js';
import type { Estado } from '../dictado.js';
import type { EnvioPorSilencio } from '../envio.js';
import { preparaVoz } from './cli-habla.js';
import type { Configuracion } from './cli-config.js';
import { gris } from './cli-dictar-piezas.js';
import { cargaRuntime } from './cli-motores.js';
import { creaConversacion, DEFECTOS_CONVERSACION, type Conversacion } from './conversacion.js';
import { escuchaConversacion, PUERTO_CONVERSACION, type EscuchaConversacion } from './conversacion-socket.js';
import { abreAltavozWindows, creaVozSintetica, type ModuloSherpaTts } from './habla.js';
import { creaHablante, type Hablante } from './hablante.js';
import type { ContadoresSesion } from './trayectoria.js';

export interface DependenciasConversacion {
  config: Configuracion;
  valores: Ajustes;
  envio: EnvioPorSilencio;
  contadores: ContadoresSesion;
  estado: () => Estado;
  detector: { readonly hablando: boolean; reinicia(): void };
  alEnviar: () => Promise<void>;
}

/**
 * La conversacion mas los dos mandos que cambian en caliente. `micDuranteVoz` se guarda para la
 * fase 4 (barge-in con auriculares); hoy `abierto` se comporta como `cerrado`: la puerta se cierra.
 */
export interface ConversacionMontada extends Conversacion {
  velocidad: number;
  micDuranteVoz: Ajustes['micDuranteVoz'];
}

export function montaConversacion(d: DependenciasConversacion): { conversacion: ConversacionMontada; cargaHablante: () => Promise<Hablante> } {
  const mandos = { velocidad: d.valores.velocidadVoz, micDuranteVoz: d.valores.micDuranteVoz };
  let hablantePromesa: Promise<Hablante> | undefined;
  const cargaHablante = () =>
    (hablantePromesa ??= (async () => {
      const carpeta = preparaVoz(d.config, d.valores.vozAgente);
      const sherpa = await cargaRuntime<ModuloSherpaTts>('sherpa-onnx-node', d.config);
      const voz = creaVozSintetica({ sherpa, carpeta, hilos: d.config.hilos });
      console.log(gris(`voz del agente: ${voz.id} lista (velocidad ${mandos.velocidad})`));
      return creaHablante({ voz, abreAltavoz: () => abreAltavozWindows(voz.frecuenciaHz), velocidad: () => mandos.velocidad });
    })());
  const conTraza = process.env['DICTADO_CONVERSACION_TRAZA'] === '1';
  /** SOLO medicion (`mide-conversacion.mjs`): el margen tras la voz, para barrerlo. */
  const margenMedicion = Number(process.env['DICTADO_CONVERSACION_MARGEN_MS']);
  const base = creaConversacion({
    envio: d.envio,
    alEnviar: async () => {
      await d.alEnviar();
      d.contadores.enviosPorSilencio += 1;
    },
    estado: d.estado,
    hablante: cargaHablante,
    detector: d.detector,
    msMargen: Number.isFinite(margenMedicion) ? margenMedicion : DEFECTOS_CONVERSACION.msMargen,
    alRespuestaHablada: (r) => {
      d.contadores.respuestasHabladas += 1;
      d.contadores.msPrimerAudio.push(r.msPrimerAudio);
      console.log(gris(`  voz del agente: primer audio ${r.msPrimerAudio.toFixed(0)} ms · total ${r.msTotal.toFixed(0)} ms${r.cortado ? ' · cortada' : ''}`));
    },
    log: (l) => console.log(l.startsWith('✗') ? l : `\u001b[32m${l}\u001b[0m`),
    ...(conTraza ? { traza: (etiqueta: string) => console.log(`traza conversacion ${Date.now()} ${etiqueta}`) } : {}),
  });
  const conversacion: ConversacionMontada = Object.assign(base, {
    get velocidad() {
      return mandos.velocidad;
    },
    set velocidad(v: number) {
      mandos.velocidad = v;
    },
    get micDuranteVoz() {
      return mandos.micDuranteVoz;
    },
    set micDuranteVoz(m: Ajustes['micDuranteVoz']) {
      mandos.micDuranteVoz = m;
    },
  });
  return { conversacion, cargaHablante };
}

/** Abre el socket local; si el puerto esta ocupado se avisa y `dictado di` sonara por su cuenta. */
export async function escuchaSocketConversacion(conversacion: Conversacion, puerto = PUERTO_CONVERSACION): Promise<EscuchaConversacion | undefined> {
  try {
    const socket = await escuchaConversacion({ puerto, saludo: () => conversacion.saludo(), alDi: (t) => conversacion.di(t), alCalla: () => conversacion.calla() });
    console.log(gris(`voz del agente: escucho en 127.0.0.1:${socket.puerto} (dictado di y el hook hablan por aqui)`));
    return socket;
  } catch (e) {
    console.log(gris(`voz del agente: no pude escuchar en 127.0.0.1:${puerto} (${e instanceof Error ? e.message : String(e)}): di sonara por su cuenta`));
    return undefined;
  }
}
