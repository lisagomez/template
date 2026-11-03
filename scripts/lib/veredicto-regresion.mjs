/**
 * El cierre de `npm run regresion`: lo que cada capa puede afirmar, y nada más.
 *
 * La capa A corre sus contratos aquí mismo: su verde es un resultado y se dice «promovible». La capa B
 * (`--trampa`) NO ejecuta ningún caso, porque cada uno va en una sesión fría; aquí solo se comprueba
 * que el corpus esté completo. Hasta el 2026-11-03 cerraba con el mismo «N/N en verde — promovible» que
 * la capa A, y al ir a firmar un CDC el laboratorio lo leyó como la capa B corrida. La frase ya había
 * engañado el 2026-08-31 (`lib/corpus.mjs`): entonces se arregló el rezago del corpus y la frase quedó.
 */
export function veredicto({ trampa, ok, fallos }) {
  const total = ok + fallos;
  if (trampa && fallos === 0) {
    return {
      codigo: 0,
      tono: 'aviso',
      lineas: [
        `C2 capa B (casos-trampa): corpus completo, ${ok}/${total} comprobaciones de forma en verde.`,
        'Ningún caso se ejecutó: esto NO es la capa B corrida ni hace promovible el cambio.',
        'Cada caso va en una sesión fría; su resultado, o «capa A basta», lo escribe el laboratorio en la firma.',
      ],
    };
  }
  if (trampa) {
    return {
      codigo: 1,
      tono: 'rojo',
      lineas: [
        `C2 capa B (casos-trampa): corpus incompleto, ${fallos} de ${total} comprobaciones fallaron.`,
        'Con el corpus incompleto la capa B no se puede correr: NO promovible.',
      ],
    };
  }
  if (fallos === 0) return { codigo: 0, tono: 'verde', lineas: [`C2 capa A (contratos): ${ok}/${total} en verde — promovible.`] };
  return {
    codigo: 1,
    tono: 'rojo',
    lineas: [
      `C2 capa A (contratos): ${fallos} de ${total} fallaron — NO promovible.`,
      'Un skill perdio una regla que no se negocia. Sin excepciones ni "se ve bien".',
    ],
  };
}

// --- La prueba de la prueba ------------------------------------------------------------------
// Cada siembra: el estado de una corrida, el código que tiene que salir, lo que el cierre tiene que
// decir, lo que no puede decir (o `null`) y, si importa, su tono. Las corre `verify:gobernanza` en
// cada pasada.

export const SIEMBRAS_VEREDICTO = [
  ['capa B con el corpus completo no dice «promovible»', { trampa: true, ok: 23, fallos: 0 }, 0, /Ningún caso se ejecutó/, /en verde — promovible/],
  ['capa B con el corpus completo no sale en verde', { trampa: true, ok: 23, fallos: 0 }, 0, /corpus completo/, null, 'aviso'],
  ['capa B con el corpus incompleto sale con 1', { trampa: true, ok: 20, fallos: 3 }, 1, /NO promovible/, /Ningún caso se ejecutó/],
  ['control: capa A en verde es promovible', { trampa: false, ok: 172, fallos: 0 }, 0, /172\/172 en verde — promovible/, /Ningún caso/],
  ['control: capa A con un fallo no lo es', { trampa: false, ok: 171, fallos: 1 }, 1, /NO promovible/, /en verde — promovible/],
];

/** Corre las siembras; devuelve las que el cierre no dice como debe. */
export function pruebaVeredicto() {
  return SIEMBRAS_VEREDICTO.filter(([, estado, codigo, debe, noDebe, tono]) => {
    const v = veredicto(estado);
    const texto = v.lineas.join('\n');
    return v.codigo !== codigo || !debe.test(texto) || (noDebe !== null && noDebe.test(texto)) || (tono && v.tono !== tono);
  }).map(([nombre]) => nombre);
}
