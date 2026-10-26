/**
 * Banco común: dos módulos de ejemplo (una agenda y un buzón) con sus enchufes, y una composición que los usa.
 * Datos sintéticos: ningún cliente, ninguna persona real.
 */
import type { Composicion, Enchufe } from '../dist/index.js'

export const AGENDA: Enchufe = {
  enchufe: 1,
  modulo: 'agenda',
  activo: 'TPL-agenda',
  nombre: 'Agenda',
  pantallas: ['/agenda'],
  ranuras: ['lienzo', 'plan', 'intencion', 'memoria'],
  intenciones: [
    { id: 'agenda.consulta-hoy', queHace: 'Decirte qué tienes hoy.', ejemplos: ['qué tengo hoy', 'mi agenda de hoy', 'citas de hoy'], efecto: 'lee', irreversible: false, pantalla: '/agenda' },
    { id: 'agenda.reserva', queHace: 'Apartar una cita en la agenda.', ejemplos: ['agenda una cita mañana a las diez', 'aparta una cita', 'reserva un hueco el lunes'], efecto: 'escribe', irreversible: false, pantalla: '/agenda' },
    { id: 'agenda.cancela', queHace: 'Cancelar una cita y avisar a quien la tenía.', ejemplos: ['cancela la cita de mañana', 'quita la cita del lunes y avisa'], efecto: 'escribe', irreversible: true, pantalla: '/agenda' },
  ],
  freno: [{ accion: 'agenda.cancela', porque: 'avisa a una persona: no se puede desdecir' }],
  memoria: { lee: [], escribe: ['ultima-consulta'] },
  sinCapa: 'la agenda sigue sirviendo su API y su pantalla sin la capa',
  sale: [],
}

export const BUZON: Enchufe = {
  enchufe: 1,
  modulo: 'buzon',
  activo: 'TPL-buzon',
  nombre: 'Buzón',
  pantallas: ['/buzon'],
  ranuras: ['lienzo', 'intencion', 'explorador'],
  intenciones: [
    { id: 'buzon.pendientes', queHace: 'Contar los documentos pendientes de revisar.', ejemplos: ['cuántos documentos pendientes hay', 'qué falta por revisar'], efecto: 'lee', irreversible: false, pantalla: '/buzon' },
  ],
  freno: [],
  memoria: { lee: [], escribe: [] },
  sinCapa: 'el buzón funciona igual sin la capa',
  sale: [],
}

export const COMPOSICION: Composicion = {
  composicion: 1,
  producto: 'consultorio-demo',
  marca: { nombre: 'Consultorio Demo', asistente: 'Aurora', acento: '#0f766e', saludo: 'Te ayudo con la agenda y el buzón.' },
  funciones: ['conversacion', 'intencion', 'memoria', 'plan', 'voz', 'lienzo', 'explorador', 'panel', 'primer-arranque', 'ajustes'],
  modulos: ['agenda', 'buzon', 'voz-local'],
  ranuras: { plan: 'agenda' },
  memoria: { duena: 'inquilino', almacen: 'memoria' },
  modelo: { clase: null, estado: 'sin-llm' },
  voz: { stt: 'parakeet', tts: 'piper', vad: 'silero', nube: [] },
  datosSensibles: false,
  resumen: { conteos: ['citas-hoy', 'pendientes'], enlaces: ['agenda'] },
}

export const VOZ_LOCAL: Enchufe = {
  enchufe: 1,
  modulo: 'voz-local',
  activo: 'TPL-voz',
  nombre: 'Voz local',
  pantallas: [],
  ranuras: ['voz'],
  intenciones: [],
  freno: [],
  memoria: { lee: [], escribe: [] },
  sinCapa: 'el motor de voz no conoce la capa',
  sale: [],
}

export const ENCHUFES: Enchufe[] = [AGENDA, BUZON, VOZ_LOCAL]

export const copia = <T>(x: T): T => structuredClone(x)
