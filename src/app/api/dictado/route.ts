/**
 * Puente HTTP → sensor-icono del dictado. El navegador no puede abrir TCP; este route SI, y
 * habla el mismo protocolo de una palabra que el icono de la barra y el boton flotante
 * (`tools/dictado/src/node/icono.ts`): al conectar llega `estado <nombre>`, y `alternar\n`
 * enciende o apaga. Solo 127.0.0.1: si el pipeline no corre, el estado es `desconectado`
 * (dato valido, no error). Nada de secretos: el protocolo no lleva ninguno.
 */
import { connect } from 'node:net';
import { NextResponse } from 'next/server';

const PUERTO = Number(process.env['DICTADO_ICONO_PUERTO'] ?? 47_124);
const ESTADOS = new Set(['inactivo', 'escuchando', 'transcribiendo', 'pegando']);

/** Conecta, lee el estado del saludo, opcionalmente manda `alternar` y espera el estado nuevo. */
function hablaConElDictado(alternar: boolean): Promise<string> {
  return new Promise((resuelve) => {
    const socket = connect(PUERTO, '127.0.0.1');
    let resto = '';
    let estados = 0;
    let ultimo = 'desconectado';
    const cierra = () => {
      socket.destroy();
      resuelve(ultimo);
    };
    // El saludo llega enseguida; tras `alternar`, el estado nuevo tambien. 700 ms de tope
    // cubre ambos sin dejar colgado al navegador si algo se atora.
    const tope = setTimeout(cierra, 700);
    socket.setEncoding('utf8');
    socket.on('data', (d: string) => {
      resto += d;
      let corte = resto.indexOf('\n');
      while (corte !== -1) {
        const linea = resto.slice(0, corte).trim();
        resto = resto.slice(corte + 1);
        corte = resto.indexOf('\n');
        const nombre = linea.startsWith('estado ') ? linea.slice(7) : '';
        if (!ESTADOS.has(nombre)) continue;
        ultimo = nombre;
        estados++;
        if (estados === 1 && alternar) socket.write('alternar\n');
        else if (!alternar || estados >= 2) {
          clearTimeout(tope);
          cierra();
        }
      }
    });
    socket.on('error', () => {
      clearTimeout(tope);
      cierra();
    });
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ estado: await hablaConElDictado(false) });
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ estado: await hablaConElDictado(true) });
}
