/**
 * Pruebas del nucleo. Se ejecutan contra `dist/`, no contra `src/`: lo que se prueba es el
 * artefacto que se instala en el proyecto de destino, que es donde fallan las cosas.
 *
 *   node --test tools/voz/pruebas/nucleo.ts   (requiere `npm run build` en tools/voz)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  agrupa,
  calibraUmbral,
  creaDetectorPorCanal,
  creaDetectorVoz,
  creaDiarizador,
  creaRelleno,
  creaRemuestreador,
  creaTroceador,
  distanciaCoseno,
  fbank,
  fusionaTurnos,
  modeloEnergia,
  transcribeTurnos,
  type EventoVoz,
  type ModeloVoz,
  type Turno,
} from '../dist/index.js';
import { leeWav, pcm16aFloat, preparaParaModelo } from '../dist/node/index.js';

const TAM = 512;
const HZ = 16_000;

/** Modelo de guion: devuelve las probabilidades que se le dan, una por marco. */
function modeloGuion(probabilidades: number[]): ModeloVoz {
  let i = 0;
  return {
    tamMarco: TAM,
    frecuenciaHz: HZ,
    async probabilidad() {
      return probabilidades[Math.min(i++, probabilidades.length - 1)] ?? 0;
    },
    reinicia() {
      i = 0;
    },
  };
}

const audioDe = (marcos: number) => new Float32Array(marcos * TAM);
const turnosDe = (eventos: EventoVoz[]) =>
  eventos.filter((e) => e.tipo === 'finHabla').map((e) => (e as { turno: Turno }).turno);

test('el troceador entrega marcos fijos con entradas de cualquier tamano', () => {
  const t = creaTroceador(512);
  assert.equal(t.empuja(new Float32Array(128)).length, 0);
  assert.equal(t.empuja(new Float32Array(128)).length, 0);
  assert.equal(t.empuja(new Float32Array(256)).length, 1);
  assert.equal(t.empuja(new Float32Array(1024)).length, 2);
  assert.equal(t.vacia(), null);
});

test('el troceador rellena con silencio el ultimo marco incompleto', () => {
  const t = creaTroceador(512);
  t.empuja(new Float32Array(100).fill(0.5));
  const ultimo = t.vacia();
  assert.ok(ultimo);
  assert.equal(ultimo.length, 512);
  assert.equal(ultimo[99], 0.5);
  assert.equal(ultimo[100], 0);
});

test('el relleno devuelve las ultimas muestras en orden cronologico', () => {
  const r = creaRelleno(4);
  r.escribe(Float32Array.from([1, 2]));
  r.escribe(Float32Array.from([3, 4, 5]));
  assert.deepEqual(Array.from(r.lee()), [2, 3, 4, 5]);
});

test('un tramo de habla claro produce exactamente un turno', async () => {
  const probs = [...Array(4).fill(0), ...Array(8).fill(0.9), ...Array(10).fill(0)];
  const d = creaDetectorVoz({
    modelo: modeloGuion(probs),
    msSilencioParaCerrar: 200,
    msMinimoHabla: 100,
    msRelleno: 100,
  });
  const eventos = [...(await d.procesa(audioDe(probs.length))), ...(await d.cierra())];
  const turnos = turnosDe(eventos);
  assert.equal(eventos.filter((e) => e.tipo === 'inicioHabla').length, 1);
  assert.equal(turnos.length, 1);
  assert.ok(turnos[0]!.finMs > turnos[0]!.inicioMs);
});

test('el relleno hace que el turno empiece ANTES de la deteccion', async () => {
  const probs = [...Array(4).fill(0), ...Array(8).fill(0.9), ...Array(10).fill(0)];
  const sinRelleno = creaDetectorVoz({ modelo: modeloGuion(probs), msRelleno: 0, msSilencioParaCerrar: 200 });
  const conRelleno = creaDetectorVoz({ modelo: modeloGuion(probs), msRelleno: 150, msSilencioParaCerrar: 200 });
  const a = turnosDe([...(await sinRelleno.procesa(audioDe(probs.length))), ...(await sinRelleno.cierra())]);
  const b = turnosDe([...(await conRelleno.procesa(audioDe(probs.length))), ...(await conRelleno.cierra())]);
  assert.ok(b[0]!.inicioMs < a[0]!.inicioMs, 'con relleno el turno tiene que empezar antes');
});

test('los golpes cortos se descartan: no son turnos', async () => {
  const probs = [0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const d = creaDetectorVoz({ modelo: modeloGuion(probs), msMinimoHabla: 200, msSilencioParaCerrar: 100 });
  const turnos = turnosDe([...(await d.procesa(audioDe(probs.length))), ...(await d.cierra())]);
  assert.equal(turnos.length, 0);
});

test('la histeresis impide que una senal oscilante abra varios turnos', async () => {
  // Oscila entre los dos umbrales (0.35 / 0.5): con un solo umbral esto abriria y cerraria
  // sin parar; con dos, es un unico turno.
  const probs = [0, 0.6, 0.4, 0.45, 0.4, 0.42, 0.6, 0.4, 0.44, ...Array(12).fill(0)];
  const d = creaDetectorVoz({ modelo: modeloGuion(probs), msSilencioParaCerrar: 200, msMinimoHabla: 50 });
  const eventos = [...(await d.procesa(audioDe(probs.length))), ...(await d.cierra())];
  assert.equal(eventos.filter((e) => e.tipo === 'inicioHabla').length, 1);
  assert.equal(turnosDe(eventos).length, 1);
});

test('una pausa corta dentro de la frase no parte el turno', async () => {
  const probs = [0, 0.9, 0.9, 0, 0, 0.9, 0.9, ...Array(12).fill(0)];
  const d = creaDetectorVoz({ modelo: modeloGuion(probs), msSilencioParaCerrar: 300, msMinimoHabla: 50 });
  const turnos = turnosDe([...(await d.procesa(audioDe(probs.length))), ...(await d.cierra())]);
  assert.equal(turnos.length, 1);
});

test('umbralSalida por encima de umbralEntrada se rechaza al construir', () => {
  assert.throws(
    () => creaDetectorVoz({ modelo: modeloGuion([0]), umbralEntrada: 0.4, umbralSalida: 0.8 }),
    /histeresis/,
  );
});

test('conservaAudio guarda el audio del turno y sin el no', async () => {
  const probs = [0, ...Array(8).fill(0.9), ...Array(10).fill(0)];
  const con = creaDetectorVoz({ modelo: modeloGuion(probs), conservaAudio: true, msSilencioParaCerrar: 200 });
  const sin = creaDetectorVoz({ modelo: modeloGuion(probs), conservaAudio: false, msSilencioParaCerrar: 200 });
  const a = turnosDe([...(await con.procesa(audioDe(probs.length))), ...(await con.cierra())]);
  const b = turnosDe([...(await sin.procesa(audioDe(probs.length))), ...(await sin.cierra())]);
  assert.ok(a[0]!.audio && a[0]!.audio.length > 0);
  assert.equal(b[0]!.audio, undefined);
});

test('el modelo de energia distingue silencio de un tono', async () => {
  const modelo = modeloEnergia({ frecuenciaHz: HZ, tamMarco: TAM });
  const silencio = new Float32Array(TAM);
  for (let i = 0; i < 10; i++) await modelo.probabilidad(silencio);
  const tono = new Float32Array(TAM);
  for (let i = 0; i < TAM; i++) tono[i] = 0.3 * Math.sin((2 * Math.PI * 300 * i) / HZ);
  assert.ok((await modelo.probabilidad(tono)) > 0.5);
  assert.ok((await modelo.probabilidad(silencio)) < 0.2);
});

test('el remuestreo baja la frecuencia y conserva la amplitud', () => {
  const entradaHz = 48_000;
  const entrada = new Float32Array(entradaHz);
  for (let i = 0; i < entrada.length; i++) entrada[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / entradaHz);
  const salida = creaRemuestreador(entradaHz, HZ).procesa(entrada);
  assert.ok(Math.abs(salida.length - HZ) < HZ * 0.02, `largo inesperado: ${salida.length}`);
  const centro = salida.subarray(2000, salida.length - 2000);
  const pico = Math.max(...Array.from(centro, Math.abs));
  assert.ok(pico > 0.4 && pico < 0.6, `amplitud fuera de rango: ${pico}`);
});

test('agrupa separa dos nubes de vectores y numera por primera aparicion', () => {
  const a = Float32Array.from([1, 0, 0]);
  const a2 = Float32Array.from([0.98, 0.05, 0]);
  const b = Float32Array.from([0, 1, 0]);
  const b2 = Float32Array.from([0.02, 0.99, 0]);
  assert.deepEqual(agrupa([a, b, a2, b2], { umbral: 0.5 }), [0, 1, 0, 1]);
});

test('agrupa respeta el numero de hablantes cuando se conoce', () => {
  const v = [
    Float32Array.from([1, 0]),
    Float32Array.from([0.99, 0.01]),
    Float32Array.from([0, 1]),
  ];
  assert.equal(new Set(agrupa(v, { hablantes: 2 })).size, 2);
  assert.equal(new Set(agrupa(v, { hablantes: 1 })).size, 1);
});

test('distanciaCoseno: identicos 0, ortogonales 1', () => {
  assert.equal(distanciaCoseno(Float32Array.from([1, 0]), Float32Array.from([1, 0])), 0);
  assert.equal(distanciaCoseno(Float32Array.from([1, 0]), Float32Array.from([0, 1])), 1);
});

test('calibraUmbral encuentra un umbral que reproduce el etiquetado real', () => {
  const v = [
    Float32Array.from([1, 0]),
    Float32Array.from([0.99, 0.02]),
    Float32Array.from([0, 1]),
    Float32Array.from([0.01, 0.98]),
  ];
  const { acierto } = calibraUmbral(v, ['a', 'a', 'b', 'b']);
  assert.equal(acierto, 1);
});

test('el diarizador etiqueta turnos con un modelo de embeddings falso', async () => {
  const vectores: Record<string, Float32Array> = {
    ana: Float32Array.from([1, 0]),
    luis: Float32Array.from([0, 1]),
  };
  const turnos: Turno[] = [
    { inicioMs: 0, finMs: 1000, audio: new Float32Array(16_000).fill(0.1) },
    { inicioMs: 1000, finMs: 2000, audio: new Float32Array(16_000).fill(0.2) },
    { inicioMs: 2000, finMs: 3000, audio: new Float32Array(16_000).fill(0.1) },
  ];
  const quien = [vectores.ana!, vectores.luis!, vectores.ana!];
  let i = 0;
  const etiquetados = await creaDiarizador({
    modelo: { frecuenciaHz: HZ, async vector() { return quien[i++]!; } },
    umbral: 0.5,
  }).asigna(turnos);
  assert.equal(etiquetados[0]!.hablante, 'Hablante 1');
  assert.equal(etiquetados[1]!.hablante, 'Hablante 2');
  assert.equal(etiquetados[2]!.hablante, 'Hablante 1');
});

test('el diarizador exige audio y lo dice claro', async () => {
  const d = creaDiarizador({ modelo: { frecuenciaHz: HZ, async vector() { return Float32Array.from([1]); } } });
  await assert.rejects(() => d.asigna([{ inicioMs: 0, finMs: 1000 }]), /conservaAudio/);
});

test('los turnos demasiado cortos se quedan sin hablante en vez de inventarselo', async () => {
  const etiquetados = await creaDiarizador({
    modelo: { frecuenciaHz: HZ, async vector() { return Float32Array.from([1, 0]); } },
    msMinimo: 500,
  }).asigna([{ inicioMs: 0, finMs: 200, audio: new Float32Array(3200) }]);
  assert.equal(etiquetados[0]!.hablante, undefined);
});

test('el reparto por canal pone la etiqueta del canal en cada turno', async () => {
  const probs = [0, ...Array(8).fill(0.9), ...Array(10).fill(0)];
  const d = creaDetectorPorCanal({
    etiquetas: ['agente', 'cliente'],
    modelos: [modeloGuion(probs), modeloGuion(Array(probs.length).fill(0))],
    msSilencioParaCerrar: 200,
  });
  const salida = [...(await d.procesa([audioDe(probs.length), audioDe(probs.length)])), ...(await d.cierra())];
  const finales = salida.filter((s) => s.evento.tipo === 'finHabla');
  assert.equal(finales.length, 1);
  assert.equal((finales[0]!.evento as { turno: Turno }).turno.hablante, 'agente');
});

test('el reparto por canal rechaza etiquetas repetidas', () => {
  assert.throws(
    () => creaDetectorPorCanal({ etiquetas: ['a', 'a'], modelos: [modeloGuion([0]), modeloGuion([0])] }),
    /distintas/,
  );
});

test('fusionaTurnos une intervenciones contiguas del mismo hablante', () => {
  const fusionados = fusionaTurnos(
    [
      { inicioMs: 0, finMs: 1000, hablante: 'Hablante 1', texto: 'hola' },
      { inicioMs: 1200, finMs: 2000, hablante: 'Hablante 1', texto: 'que tal' },
      { inicioMs: 2100, finMs: 3000, hablante: 'Hablante 2', texto: 'bien' },
    ],
    600,
  );
  assert.equal(fusionados.length, 2);
  assert.equal(fusionados[0]!.texto, 'hola que tal');
  assert.equal(fusionados[0]!.finMs, 2000);
});

test('transcribeTurnos sigue adelante si el transcriptor falla en un turno', async () => {
  let llamada = 0;
  const salida = await transcribeTurnos(
    [
      { inicioMs: 0, finMs: 100, audio: new Float32Array(160) },
      { inicioMs: 100, finMs: 200, audio: new Float32Array(160) },
    ],
    {
      async transcribe() {
        if (llamada++ === 0) throw new Error('se cayo la red');
        return { texto: 'segundo' };
      },
    },
    { frecuenciaHz: HZ },
  );
  assert.equal(salida[0]!.texto, undefined);
  assert.equal(salida[1]!.texto, 'segundo');
});

test('fbank devuelve marcos y reacciona a la energia', () => {
  const tono = new Float32Array(HZ / 2);
  for (let i = 0; i < tono.length; i++) tono[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / HZ);
  const marcos = fbank(tono, { frecuenciaHz: HZ, numMel: 40 });
  assert.ok(marcos.length > 40, `pocos marcos: ${marcos.length}`);
  assert.equal(marcos[0]!.length, 40);
  assert.ok(marcos.every((m) => m.every(Number.isFinite)));
});

test('leeWav recorre las cabeceras y no asume que data empieza en el byte 44', () => {
  // WAV con un bloque LIST antes de `data`, como los que escupen ffmpeg y el navegador.
  const muestras = Int16Array.from([0, 16384, -16384, 32767]);
  const extra = 12; // 'LIST' + largo + 4 bytes de cuerpo
  const largoDatos = muestras.length * 2;
  const buf = new ArrayBuffer(12 + 24 + extra + 8 + largoDatos);
  const v = new DataView(buf);
  const pon = (off: number, txt: string) => [...txt].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  pon(0, 'RIFF'); v.setUint32(4, buf.byteLength - 8, true); pon(8, 'WAVE');
  pon(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, HZ, true); v.setUint32(28, HZ * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  pon(36, 'LIST'); v.setUint32(40, 4, true); pon(44, 'INFO');
  pon(48, 'data'); v.setUint32(52, largoDatos, true);
  muestras.forEach((m, i) => v.setInt16(56 + i * 2, m, true));

  const { canales, frecuenciaHz } = leeWav(buf);
  assert.equal(frecuenciaHz, HZ);
  assert.equal(canales.length, 1);
  assert.equal(canales[0]!.length, 4);
  assert.ok(Math.abs(canales[0]![1]! - 0.5) < 0.01);
  assert.ok(Math.abs(canales[0]![2]! + 0.5) < 0.01);
});

test('pcm16aFloat convierte a [-1,1]', () => {
  const bytes = new Uint8Array(new Int16Array([0, 32767, -32768]).buffer);
  const f = pcm16aFloat(bytes);
  assert.equal(f[0], 0);
  assert.ok(f[1]! > 0.99);
  assert.ok(f[2]! < -0.99);
});

test('preparaParaModelo mezcla a mono y remuestrea', () => {
  const izq = new Float32Array(48_000).fill(0.4);
  const der = new Float32Array(48_000).fill(0.2);
  const salida = preparaParaModelo({ canales: [izq, der], frecuenciaHz: 48_000 }, HZ);
  assert.ok(Math.abs(salida.length - HZ) < HZ * 0.02);
  const centro = salida[8000]!;
  assert.ok(Math.abs(centro - 0.3) < 0.02, `la mezcla a mono deberia dar ~0.3, dio ${centro}`);
});
