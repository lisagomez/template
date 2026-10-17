/**
 * La guia de voz del registro, sin microfono: lo que dice, lo que propone y que NUNCA envia sin un «si,
 * envialo» explicito. La guia por voz de verdad (microfono falso, ASR y TTS locales) la mide
 * `scripts/clinica-dental/mide-voz.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celularDicho, correoDicho, edadDicha, inicioGuia, nombreDicho, procesaGuia, siONo, type AccionGuia, type EstadoGuia } from '../dist/index.js';

function conversa(frases: string[]) {
  let r = inicioGuia();
  const dicho: string[] = [r.decir];
  const acciones: AccionGuia[] = [...r.acciones];
  for (const f of frases) {
    r = procesaGuia(r.estado, f);
    dicho.push(r.decir);
    acciones.push(...r.acciones);
  }
  return { estado: r.estado as EstadoGuia, dicho, acciones, enviado: acciones.some((a) => a.tipo === 'enviar') };
}

const ADULTO = ['me llamo Nayeli', 'sí', 'Tecuexe', 'sí', 'Huitzilihuitl', 'sí', 'veintinueve', 'sí', 'nayeli punto tecuexe arroba pacientes punto example', 'sí', '55 0000 1007', 'sí', 'ninguna', 'sí', 'general y ortodoncia', 'sí', 'omitir', 'sí'];

test('interpreta lo dictado: nombres, edad en palabras, correo con «arroba» y «punto», celular', () => {
  assert.equal(nombreDicho('me llamo ana sofía'), 'Ana Sofía');
  assert.equal(edadDicha('tengo treinta y cuatro años'), 34);
  assert.equal(edadDicha('dieciséis'), 16);
  assert.equal(correoDicho('ana punto lópez arroba ejemplo punto com'), 'ana.lopez@ejemplo.com');
  assert.equal(correoDicho('Mi correo es ana.lopez@ejemplo.com.'), 'ana.lopez@ejemplo.com');
  assert.equal(correoDicho('no sé'), null);
  assert.equal(celularDicho('cinco cinco cero cero cero cero uno cero cero siete'), '+525500001007');
  assert.equal(celularDicho('55 0000 1007'), '+525500001007');
  assert.equal(siONo('Sí, envíalo'), 'enviar');
  assert.equal(siONo('sí'), 'si');
  assert.equal(siONo('See.'), 'si', 'el «sí» que el ASR oye en inglés');
  assert.equal(siONo('no, está mal'), 'no');
});

test('recorrido completo: cada campo se PROPONE, se confirma y se llena; al final, el resumen', () => {
  const c = conversa(ADULTO);
  assert.equal(c.estado.fase, 'resumen');
  assert.equal(c.enviado, false, 'llegar al resumen NO envía');
  const llenos = c.acciones.filter((a): a is Extract<AccionGuia, { tipo: 'llena' }> => a.tipo === 'llena');
  assert.deepEqual(Object.fromEntries(llenos.map((a) => [a.campo, a.valor])), {
    nombre: 'Nayeli', apellidoPaterno: 'Tecuexe', apellidoMaterno: 'Huitzilihuitl', edad: 29, correo: 'nayeli.tecuexe@pacientes.example', celular: '+525500001007', empresa: null, categorias: ['general', 'ortodoncia'], padecimiento: null,
  });
  assert.match(c.dicho.at(-1)!, /no la digas en voz alta/);
  assert.match(c.dicho.at(-1)!, /sí, envíalo/);
  assert.ok(!c.acciones.some((a) => a.tipo === 'llena' && /tutor/.test(a.campo)), 'a un adulto no se le pide tutor');
});

test('NUNCA envía sin «sí, envíalo»: un «sí» suelto, «ok» o silencio en el resumen no envían', () => {
  for (const f of ['sí', 'ok', 'claro', 'envía', '', 'perfecto']) assert.equal(conversa([...ADULTO, f]).enviado, false, `«${f}» envió`);
  const c = conversa([...ADULTO, 'sí, envíalo']);
  assert.equal(c.enviado, true);
  assert.equal(c.estado.fase, 'enviado');
});

test('corregir: «no» a una propuesta la borra y vuelve a preguntar; «corrige el correo» salta a ese campo', () => {
  const c = conversa(['Nayeli', 'no', 'Nayely', 'sí']);
  const llenos = c.acciones.filter((a) => a.tipo === 'llena');
  assert.deepEqual(llenos.map((a) => (a.tipo === 'llena' ? a.valor : '')), ['Nayeli', null, 'Nayely']);
  const d = conversa([...ADULTO, 'corrige el correo']);
  assert.equal(d.estado.fase, 'pregunta');
  assert.match(d.dicho.at(-1)!, /Dime tu correo/);
});

test('«para» pausa, «continúa» reanuda; «repite» y «atrás» funcionan', () => {
  const c = conversa(['Nayeli', 'sí', 'para']);
  assert.equal(c.estado.fase, 'pausa');
  assert.ok(c.acciones.some((a) => a.tipo === 'pausa'));
  const d = conversa(['Nayeli', 'sí', 'para', 'hola', 'continúa']);
  assert.match(d.dicho.at(-2)!, /Sigo en pausa/);
  assert.match(d.dicho.at(-1)!, /apellido paterno/);
  assert.match(conversa(['Nayeli', 'sí', 'repite']).dicho.at(-1)!, /apellido paterno/);
  assert.match(conversa(['Nayeli', 'sí', 'atrás']).dicho.at(-1)!, /tu nombre/);
});

test('menor de edad: la guía pide los datos del tutor', () => {
  const menor = ['Itzayana', 'sí', 'Cuauhtlehuanitzin', 'sí', 'no tengo', 'sí', 'quince', 'sí', 'itzayana punto cuauhtle arroba pacientes punto example', 'sí', '55 0000 1002', 'sí', 'ninguna', 'sí', 'brackets', 'sí', 'omitir', 'sí'];
  const c = conversa(menor);
  assert.match(c.dicho.at(-1)!, /menor de edad/);
  const t = conversa([...menor, 'Citlalmina', 'sí', 'Cuauhtlehuanitzin', 'sí', 'es mi mamá', 'sí', 'citlalmina punto tutora arroba pacientes punto example', 'sí', '55 0000 1012', 'sí']);
  assert.equal(t.estado.fase, 'resumen');
  assert.ok(t.acciones.some((a) => a.tipo === 'llena' && a.campo === 'tutor.parentesco' && a.valor === 'madre'));
});

test('el padecimiento dictado se muestra para confirmar antes de llenarse, y la guía avisa que es dato de salud', () => {
  const sinPad = ADULTO.slice(0, 16);
  const c = conversa([...sinPad, 'me duele una muela al morder']);
  assert.match(c.dicho.at(-2)!, /dato de salud/);
  assert.match(c.dicho.at(-1)!, /Entendí: me duele una muela al morder\. ¿Es correcto\? Di «sí, correcto» o «no»\./);
});

test('«lo escribo» salta el campo sin llenarlo (la persona lo teclea) y sigue con el siguiente', () => {
  const c = conversa(['Nayeli', 'sí', 'Tecuexe', 'sí', 'no tengo', 'sí', 'veintinueve', 'sí', 'lo escribo']);
  assert.match(c.dicho.at(-1)!, /escríbelo en pantalla\. Dime tu celular/);
  assert.ok(!c.acciones.some((a) => a.tipo === 'llena' && a.campo === 'correo'));
});

test('lo que no entiende lo dice y vuelve a preguntar (no inventa)', () => {
  const c = conversa(['Nayeli', 'sí', 'Tecuexe', 'sí', 'no tengo', 'sí', 'muchos', 'sí']);
  assert.match(c.dicho.at(-2)!, /No te entendí el edad|No te entendí la edad|No te entendí/);
});
