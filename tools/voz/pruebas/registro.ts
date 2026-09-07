/**
 * Pruebas de la identidad persistente: voces con nombre que sobreviven a la sesion.
 *
 * Como en el resto de la casa, aqui no se mide si un modelo de embeddings acierta —el que se
 * usa es de mentira a proposito— sino las DECISIONES de alrededor: cuando el registro se
 * calla, quien gana cuando el registro y la sesion se contradicen, que numero se gasta y cual
 * no, y que se cuenta cuando una identificacion llega tarde.
 *
 *   node --test tools/voz/pruebas/registro.ts   (requiere `npm run build` en tools/voz)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creaDiarizador,
  creaDiarizadorSolapeEnVivo,
  creaDiarizadorStreaming,
  creaRegistroHablantes,
  importaRegistro,
  type EventoDiarizacion,
  type ModeloHablante,
  type ModeloSegmentacion,
  type Turno,
} from '../dist/index.js';

const HZ = 16_000;

/** Mismo truco que en `streaming.ts`: el audio lleva escrito quien habla, como angulo. */
function modeloAngulo(): ModeloHablante {
  return {
    frecuenciaHz: HZ,
    async vector(muestras) {
      let i = 0;
      while (i < muestras.length && muestras[i] === 0) i++;
      const radianes = (Math.round((muestras[i] ?? 0) * 1000) * Math.PI) / 180;
      const v = new Float32Array(4);
      v[0] = Math.cos(radianes);
      v[1] = Math.sin(radianes);
      return v;
    },
  };
}

/** El vector que produciria ese angulo. Es lo que un humano le da al registro al enrolar. */
function vectorDe(grados: number): Float32Array {
  const radianes = (grados * Math.PI) / 180;
  const v = new Float32Array(4);
  v[0] = Math.cos(radianes);
  v[1] = Math.sin(radianes);
  return v;
}

const audioDe = (grados: number) => Float32Array.from([0, 0, grados / 1000, 0]);
const turnoDe = (grados: number, inicioMs: number, finMs = inicioMs + 1000): Turno => ({
  inicioMs,
  finMs,
  audio: audioDe(grados),
});

const turnos = (eventos: EventoDiarizacion[]) => eventos.flatMap((e) => (e.tipo === 'turno' ? [e] : []));
const correcciones = (eventos: EventoDiarizacion[]) =>
  eventos.flatMap((e) => (e.tipo === 'correccion' ? [e] : []));
const firmes = (eventos: EventoDiarizacion[]) => eventos.flatMap((e) => (e.tipo === 'firme' ? e.ids : []));

// ---------------------------------------------------------------- el registro, por si solo

test('una voz registrada se reconoce, y dice a que distancia', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  registro.registra('luis', [vectorDe(120)]);

  const encontrada = registro.identifica(vectorDe(10));
  assert.equal(encontrada?.nombre, 'ana');
  assert.ok(encontrada!.distancia < 0.02, 'diez grados es practicamente la misma voz');
  assert.deepEqual([...registro.voces].map((v) => v.nombre), ['ana', 'luis']);
});

test('una voz que no se parece a ninguna registrada devuelve null, no la menos mala', () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  registro.registra('luis', [vectorDe(120)]);
  assert.equal(registro.identifica(vectorDe(60)), null, 'a 60 grados de las dos no es ninguna');
});

test('dos voces registradas igual de cerca no se resuelven a cara o cruz', () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  registro.registra('su hermana', [vectorDe(40)]);
  // El vector cae justo en medio: las dos caben dentro del umbral y ninguna le saca margen.
  assert.equal(registro.identifica(vectorDe(20)), null);
  // Y con margen 0 si decide, porque entonces se le ha pedido que decida.
  const sinMargen = creaRegistroHablantes({ margen: 0 });
  sinMargen.registra('ana', [vectorDe(0)]);
  sinMargen.registra('su hermana', [vectorDe(40)]);
  assert.ok(sinMargen.identifica(vectorDe(19))?.nombre === 'ana');
});

test('un nombre con forma de etiqueta anonima se rechaza', () => {
  const registro = creaRegistroHablantes();
  assert.throws(() => registro.registra('Hablante 2', [vectorDe(0)]), /anonima/);
  assert.throws(() => registro.registra('   ', [vectorDe(0)]), /necesita un nombre/);
  assert.throws(() => registro.registra('ana', []), /sin vectores/);
});

test('un vector de otra dimension no se mezcla en silencio: falla nombrando el problema', () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  assert.throws(() => registro.registra('luis', [new Float32Array(8)]), /modelos\s+distintos/);
  assert.throws(() => registro.identifica(new Float32Array(8)), /no es el mismo/);
});

test('registrar dos veces el mismo nombre ACUMULA evidencia, no la sustituye', () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(-10)]);
  registro.registra('ana', [vectorDe(10)]);
  assert.equal(registro.voces[0]?.muestras, 2);
  // El centroide de -10 y 10 es 0: si la segunda llamada hubiera sustituido, seria 10.
  assert.ok(registro.identifica(vectorDe(0))!.distancia < 1e-6);
  assert.equal(registro.voces.length, 1, 'sigue siendo una sola voz');
});

test('el registro sobrevive al viaje por JSON, con su peso', () => {
  const ida = creaRegistroHablantes();
  ida.registra('ana', [vectorDe(-4), vectorDe(4)]);
  ida.registra('luis', [vectorDe(120)]);

  // JSON.parse/stringify de verdad: es como va a viajar, no una copia de objetos.
  const vuelta = importaRegistro(JSON.parse(JSON.stringify(ida.exporta())));
  assert.equal(vuelta.identifica(vectorDe(0))?.nombre, 'ana');
  assert.equal(vuelta.identifica(vectorDe(118))?.nombre, 'luis');
  assert.equal(vuelta.voces.find((v) => v.nombre === 'ana')?.muestras, 2, 'el peso viaja');
});

test('importar con un modelo de embeddings distinto falla en vez de dar nombres plausibles', () => {
  const registro = creaRegistroHablantes({ modelo: 'embeddings-a@1' });
  registro.registra('ana', [vectorDe(0)]);
  assert.throws(
    () => importaRegistro(registro.exporta(), { modelo: 'embeddings-b@1' }),
    /no son comparables/,
  );
  // Sin declarar modelo al importar, se hereda el del registro: no hay contradiccion que detectar.
  assert.equal(importaRegistro(registro.exporta()).exporta().modelo, 'embeddings-a@1');
});

test('olvida() borra una voz y dice si existia', () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  assert.equal(registro.olvida('ana'), true);
  assert.equal(registro.olvida('ana'), false);
  assert.equal(registro.identifica(vectorDe(0)), null, 'un registro vacio no identifica a nadie');
});

// ------------------------------------------------------------------------ por lotes

test('por lotes, los grupos reconocidos salen con su nombre y el resto sigue anonimo', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);

  const d = creaDiarizador({ modelo: modeloAngulo(), registro, umbral: 0.3 });
  const salida = await d.asigna([turnoDe(0, 0), turnoDe(120, 2000), turnoDe(2, 4000)]);

  assert.deepEqual(salida.map((t) => t.hablante), ['ana', 'Hablante 2', 'ana']);
});

test('el numero del anonimo NO se recorre cuando otro grupo se lleva un nombre', async () => {
  // "Hablante 2" sigue queriendo decir "la segunda persona que hablo". Con y sin registro, el
  // mismo audio numera igual a las mismas personas; lo unico que cambia es que la primera
  // ahora tiene nombre. Si se renumerase, dos actas del mismo audio no se podrian comparar.
  const conRegistro = creaRegistroHablantes();
  conRegistro.registra('ana', [vectorDe(0)]);
  const turnosPrueba = [turnoDe(0, 0), turnoDe(120, 2000)];

  const con = await creaDiarizador({ modelo: modeloAngulo(), registro: conRegistro, umbral: 0.3 }).asigna(turnosPrueba);
  const sin = await creaDiarizador({ modelo: modeloAngulo(), umbral: 0.3 }).asigna(turnosPrueba);

  assert.deepEqual(con.map((t) => t.hablante), ['ana', 'Hablante 2']);
  assert.deepEqual(sin.map((t) => t.hablante), ['Hablante 1', 'Hablante 2']);
});

test('si dos grupos reclaman el mismo nombre, se lo queda el mas cercano y el otro vuelve a anonimo', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  // 5 y 40 grados caen los dos dentro del umbral del registro, pero el agrupamiento los
  // separa: el registro se esta equivocando en uno de los dos y repartir "ana" entre dos
  // filas del acta seria peor que no ponerlo.
  const d = creaDiarizador({ modelo: modeloAngulo(), registro, umbral: 0.1 });
  const salida = await d.asigna([turnoDe(5, 0), turnoDe(40, 2000)]);
  assert.deepEqual(salida.map((t) => t.hablante), ['ana', 'Hablante 2']);
});

// -------------------------------------------------------------------------- en vivo

test('un conocido nace con su nombre y NO gasta un numero anonimo', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);

  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro });
  const uno = await d.empuja(turnoDe(1, 0));
  const dos = await d.empuja(turnoDe(120, 2000));

  assert.equal(turnos(uno)[0]?.turno.hablante, 'ana');
  assert.equal(
    turnos(dos)[0]?.turno.hablante,
    'Hablante 1',
    'el desconocido es el 1: a Ana nadie la leyo como "Hablante 1", asi que no gasto numero',
  );
  assert.equal(correcciones([...uno, ...dos]).length, 0);
});

test('un anonimo PASA a tener nombre cuando su centroide madura, y sale como correccion', async () => {
  // Ninguno de los dos turnos, por separado, cae dentro del umbral de Ana: uno se pasa por
  // arriba y el otro por abajo. Su media si. Es el caso que justifica repasar a los anonimos
  // despues de cada empuje en vez de solo al abrirlos.
  const registro = creaRegistroHablantes({ umbral: 0.05 });
  registro.registra('ana', [vectorDe(0)]);

  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro });
  const uno = await d.empuja(turnoDe(25, 0));
  assert.equal(turnos(uno)[0]?.turno.hablante, 'Hablante 1', 'a 25 grados todavia no es nadie');
  assert.equal(correcciones(uno).length, 0);

  const dos = await d.empuja(turnoDe(-25, 2000));
  assert.equal(turnos(dos)[0]?.turno.hablante, 'Hablante 1', 'la etiqueta sale YA, con lo que se sabe');

  const [correccion] = correcciones(dos);
  assert.equal(correccion?.motivo, 'identificacion');
  assert.deepEqual(
    correccion?.cambios.map((c) => `${c.id}→${c.hablante}`),
    ['t1→ana', 't2→ana'],
    'los dos turnos ya pintados se reescriben con el nombre',
  );
  assert.equal(correccion?.fuera, 0);
});

test('una identificacion tardia deja los turnos fuera de la ventana con su numero, y lo cuenta', async () => {
  const registro = creaRegistroHablantes({ umbral: 0.05 });
  registro.registra('ana', [vectorDe(0)]);

  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro, msVentanaCorreccion: 500 });
  await d.empuja(turnoDe(25, 0));
  const tarde = await d.empuja(turnoDe(-25, 5000));

  assert.deepEqual(firmes(tarde), ['t1'], 't1 salio de la ventana antes de que se supiera quien era');
  const [correccion] = correcciones(tarde);
  assert.equal(correccion?.motivo, 'identificacion');
  assert.deepEqual(correccion?.cambios.map((c) => c.id), ['t2'], 'a t1 ya no se le puede tocar');
  assert.equal(correccion?.fuera, 1, 'el acta queda partida entre "Hablante 1" y "ana", y se dice');
});

test('dos voces registradas parecidas NO se funden, aunque la sesion las daria por una', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);
  registro.registra('luis', [vectorDe(30)]);

  const guion = [turnoDe(0, 0), turnoDe(30, 2000)];
  const con = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro });
  const salida: EventoDiarizacion[] = [];
  for (const t of guion) salida.push(...(await con.empuja(t)));

  assert.deepEqual(turnos(salida).map((t) => t.turno.hablante), ['ana', 'luis']);
  assert.equal(con.hablantes, 2);
  assert.equal(correcciones(salida).length, 0, 'el registro dijo que son dos: no hay nada que corregir');

  // El contraste, que es lo que hace la prueba: sin registro son la MISMA persona. A 30
  // grados caen dentro del umbral, asi que la sesion nunca llega ni a abrir al segundo.
  const sin = creaDiarizadorStreaming({ modelo: modeloAngulo() });
  const sueltos: EventoDiarizacion[] = [];
  for (const t of guion) sueltos.push(...(await sin.empuja(t)));
  assert.deepEqual(turnos(sueltos).map((t) => t.turno.hablante), ['Hablante 1', 'Hablante 1']);
  assert.equal(sin.hablantes, 1);
});

test('al fundirse un anonimo con un conocido, sobrevive el NOMBRE y no el que hablo primero', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);

  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro });
  await d.empuja(turnoDe(60, 0));   // a 60 grados el registro se calla: anonimo, Hablante 1
  await d.empuja(turnoDe(0, 2000)); // esta si es Ana
  assert.equal(d.hablantes, 2, 'todavia estan lejos');

  // Este turno se va con Ana y arrastra su centroide hasta el del anonimo: eran la misma.
  const eventos = await d.empuja(turnoDe(50, 4000));
  const [correccion] = correcciones(eventos);
  assert.equal(correccion?.motivo, 'fusion');
  assert.deepEqual(
    correccion?.cambios.map((c) => `${c.id}→${c.hablante}`),
    ['t1→ana'],
    'el que hablo primero era Ana sin saberlo, no al reves',
  );
  assert.equal(d.hablantes, 1);
});

test('reinicia() olvida la sesion pero no las voces: manana Ana sigue siendo Ana', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(0)]);

  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro });
  await d.empuja(turnoDe(0, 0));
  await d.empuja(turnoDe(120, 2000));
  assert.equal(d.hablantes, 2);

  d.reinicia();
  assert.equal(d.hablantes, 0);
  const otraReunion = await d.empuja(turnoDe(1, 0));
  assert.equal(turnos(otraReunion)[0]?.turno.hablante, 'ana');
  assert.equal(turnos(otraReunion)[0]?.id, 't1', 'la numeracion de turnos si vuelve a empezar');
});

test('un registro de otra dimension revienta en el primer turno, no en el marco 4000', async () => {
  const registro = creaRegistroHablantes();
  registro.registra('ana', [new Float32Array([1, 0])]);
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), registro });
  await assert.rejects(() => d.empuja(turnoDe(0, 0)), /no es el mismo/);
});

// --------------------------------------------------------- y el camino con solape

const MARCOS_VENTANA = 10;
const MARCOS_SALTO = 5;
const MUESTRAS_MARCO = 1_600;

function segmentadorFalso(guion: number[][], hablantesLocales = 3): ModeloSegmentacion {
  let llamada = 0;
  return {
    frecuenciaHz: HZ,
    muestrasVentana: MARCOS_VENTANA * MUESTRAS_MARCO,
    hablantesLocales,
    async ventana() {
      const base = llamada * MARCOS_SALTO;
      llamada++;
      const marcos = guion.slice(base, base + MARCOS_VENTANA);
      const presentes = [...new Set(marcos.flat())].sort((a, b) => a - b);
      const salida: Float32Array[] = [];
      for (let m = 0; m < MARCOS_VENTANA; m++) {
        const fila = new Float32Array(hablantesLocales);
        for (const angulo of marcos[m] ?? []) {
          const k = presentes.indexOf(angulo);
          if (k >= 0 && k < hablantesLocales) fila[k] = 1;
        }
        salida.push(fila);
      }
      return salida;
    },
  };
}

function audioDeGuion(guion: number[][]): Float32Array {
  const audio = new Float32Array(guion.length * MUESTRAS_MARCO);
  guion.forEach((angulos, m) => {
    if (angulos.length === 0) return;
    audio.fill(angulos[angulos.length - 1]! / 1000, m * MUESTRAS_MARCO, (m + 1) * MUESTRAS_MARCO);
  });
  return audio;
}

test('el camino con solape hereda el registro: es la misma capa de identidad', async () => {
  // No hay cableado nuevo que probar aqui, y ese es justo el punto: la identidad global nunca
  // supo de donde venian los turnos, asi que ponerle nombres no toco el camino del solape.
  const registro = creaRegistroHablantes();
  registro.registra('ana', [vectorDe(10)]);
  registro.registra('beto', [vectorDe(100)]);

  const solos = (angulo: number, n: number) => Array.from({ length: n }, () => [angulo]);
  const guion = [...solos(10, 5), ...solos(100, 10), ...Array.from({ length: 5 }, () => [] as number[])];

  const vivo = creaDiarizadorSolapeEnVivo({
    segmentacion: segmentadorFalso(guion),
    hablante: modeloAngulo(),
    registro,
    solape: 0.5,
    msMinimoLocal: 200,
    msMinimoTurno: 200,
  });

  const eventos = [...(await vivo.procesa(audioDeGuion(guion))), ...(await vivo.cierra())];
  const etiquetas = turnos(eventos).map((t) => t.turno.hablante);
  assert.ok(etiquetas.includes('ana'), `esperaba a ana entre ${JSON.stringify(etiquetas)}`);
  assert.ok(etiquetas.includes('beto'), `esperaba a beto entre ${JSON.stringify(etiquetas)}`);
  assert.ok(!etiquetas.some((e) => e?.startsWith('Hablante')), 'los dos estaban registrados');
});
