/**
 * Lo que entro en 0.5.0 al alinear `voz` con `dictado`: perfiles del detector con nombre, el
 * `Transcriptor` con opciones (y compatible con uno de 0.4), el nivel en dB, las inversas de
 * WAV y los pesos pineados. Contra `dist/`, como todo lo demas.
 *
 *   node --test tools/voz/pruebas/familia.ts   (requiere `npm run build` en tools/voz)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { creaDetectorVoz, factorDeDb, modeloEnergia, nivelDb, PERFILES_DETECTOR, picoDb, rms, transcribeTurnos, type Muestras, type OpcionesTranscribe, type Transcripcion, type Transcriptor, type Turno } from '../dist/index.js';
import { codificaWav, floatAPcm16, leeWav, mbDe, pcm16aFloat, PESOS, RUNTIMES } from '../dist/node/index.js';

const seno = (hz: number, ms: number, amplitud = 0.5, fs = 16_000): Muestras => {
  const n = Math.round((fs * ms) / 1000);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = amplitud * Math.sin((2 * Math.PI * hz * i) / fs);
  return s;
};

test('perfiles: bargeIn es lo que 0.4 hacia sin nombre; dictado es lo medido; lo explicito manda', async () => {
  assert.deepEqual(PERFILES_DETECTOR.bargeIn, { umbralEntrada: 0.5, umbralSalida: 0.35, msSilencioParaCerrar: 500, msMinimoHabla: 120, msRelleno: 200 });
  assert.deepEqual(PERFILES_DETECTOR.dictado, { umbralEntrada: 0.5, umbralSalida: 0.35, msSilencioParaCerrar: 1000, msMinimoHabla: 200, msRelleno: 250 });
  assert.ok(Object.isFrozen(PERFILES_DETECTOR) && Object.isFrozen(PERFILES_DETECTOR.dictado), 'nadie los muta en caliente');
  // Un modelo falso: 1 mientras hay senal, 0 en silencio. Con el perfil `dictado` un hueco de
  // 700 ms NO parte la frase; con `bargeIn` (500 ms) si.
  const modelo = { tamMarco: 512, frecuenciaHz: 16_000, async probabilidad(m: Muestras) { return rms(m) > 0.01 ? 1 : 0; }, reinicia() {} };
  const frase = new Float32Array([...seno(440, 600), ...new Float32Array(Math.round(16_000 * 0.7)), ...seno(440, 600)]);
  const turnosCon = async (opciones: object) => {
    const d = creaDetectorVoz({ modelo, ...opciones });
    const ev = [...(await d.procesa(frase)), ...(await d.cierra())];
    return ev.filter((e) => e.tipo === 'finHabla').length;
  };
  assert.equal(await turnosCon({ perfil: 'dictado' }), 1, 'dictado: un hueco de 700 ms no parte la frase');
  assert.equal(await turnosCon({ perfil: 'bargeIn' }), 2, 'bargeIn: 500 ms cierran el turno');
  assert.equal(await turnosCon({}), 2, 'sin perfil, bargeIn: nada cambia para quien ya usaba 0.4');
  assert.equal(await turnosCon({ perfil: 'dictado', msSilencioParaCerrar: 300 }), 2, 'lo explicito manda sobre el perfil');
});

test('transcriptor: uno de 0.4 (sin opciones) sigue valiendo; transcribeTurnos pasa idioma y pista a uno de 0.5', async () => {
  // Escrito como en 0.4: dos parametros y solo `texto`. Tiene que ser un `Transcriptor` de 0.5 sin tocarlo.
  const viejo = { async transcribe(_m: Muestras, hz: number) { return { texto: `viejo@${hz}` }; } };
  const comoTranscriptor: Transcriptor = viejo;
  const turnos: Turno[] = [{ inicioMs: 0, finMs: 100, audio: seno(440, 100) }];
  assert.equal((await transcribeTurnos(turnos, comoTranscriptor, { frecuenciaHz: 16_000, idioma: 'es', pista: 'Luis' }))[0]!.texto, 'viejo@16000');
  const recibidas: OpcionesTranscribe[] = [];
  const nuevo: Transcriptor = { async transcribe(_m, _hz, o): Promise<Transcripcion> { recibidas.push(o ?? {}); return { texto: 'nuevo', idioma: 'es', ms: 3 }; } };
  await transcribeTurnos(turnos, nuevo, { frecuenciaHz: 16_000, idioma: 'es', pista: 'Luis Martinez' });
  assert.deepEqual(recibidas, [{ idioma: 'es', pista: 'Luis Martinez' }]);
  await transcribeTurnos(turnos, nuevo, { frecuenciaHz: 16_000 });
  assert.deepEqual(recibidas[1], {}, 'sin idioma ni pista no se inventa nada');
});

test('nivel: rms, dBFS, pico por ventanas y factor; la misma aritmetica que el modelo de energia', async () => {
  const s = seno(440, 100, 0.5);
  assert.ok(Math.abs(rms(s) - 0.5 / Math.SQRT2) < 0.01);
  assert.ok(Math.abs(nivelDb(s) - 20 * Math.log10(0.5 / Math.SQRT2)) < 0.2);
  assert.equal(nivelDb(new Float32Array(0)), -180);
  assert.equal(nivelDb(new Float32Array(100)), -180, 'silencio digital: -180, no -Infinity');
  const conPico = new Float32Array([...new Float32Array(1600), ...seno(440, 30, 0.9), ...new Float32Array(1600)]);
  assert.ok(picoDb(conPico, 480) > nivelDb(conPico) + 6, 'el pico por ventanas ve lo que el RMS global diluye');
  assert.ok(Math.abs(factorDeDb(6) - 1.995) < 0.01);
  assert.equal(factorDeDb(0), 1);
  // El modelo de energia y nivelDb miden lo mismo: sobre un marco a -20 dBFS, calibrado con silencio, dice voz.
  const m = modeloEnergia({ marcosCalibracion: 2 });
  await m.probabilidad(new Float32Array(512));
  await m.probabilidad(new Float32Array(512));
  assert.equal(await m.probabilidad(seno(440, 32, 0.1)), 1);
});

test('wav: codificaWav ↔ leeWav y floatAPcm16 ↔ pcm16aFloat van y vuelven; los extremos se recortan', () => {
  const original = seno(440, 50, 0.7);
  const bytes = codificaWav(original, 16_000);
  assert.equal(bytes.length, 44 + original.length * 2);
  const leido = leeWav(new Uint8Array(bytes).buffer as ArrayBuffer);
  assert.equal(leido.frecuenciaHz, 16_000);
  assert.equal(leido.canales.length, 1);
  assert.equal(leido.canales[0]!.length, original.length);
  let maxDiff = 0;
  for (let i = 0; i < original.length; i++) maxDiff = Math.max(maxDiff, Math.abs(original[i]! - leido.canales[0]![i]!));
  assert.ok(maxDiff <= 0.5 / 32768 + 1e-7, `ida y vuelta con error de cuantizacion (${maxDiff})`);
  const vuelta = pcm16aFloat(floatAPcm16(new Float32Array([1.5, -1.5, 0, 0.5])));
  assert.ok(Math.abs(vuelta[0]! - 32767 / 32768) < 1e-6 && vuelta[1] === -1 && vuelta[2] === 0);
});

test('pesos: pineados por URL exacta, con tamano, y runtimes con version', () => {
  assert.equal(PESOS.length, 3);
  for (const p of PESOS) {
    assert.match(p.url, /^https:\/\/(github\.com|huggingface\.co)\//);
    assert.ok(p.mb > 0 && p.archivo.endsWith('.onnx'));
  }
  assert.ok(mbDe(PESOS) < 60, 'menos de 60 MB en total');
  for (const v of Object.values(RUNTIMES)) assert.match(v, /^\d+\.\d+\.\d+$/, 'pineado exacto, nunca latest ni un rango');
});
