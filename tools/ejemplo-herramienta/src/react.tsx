'use client';

/**
 * Punto de entrada de React, SEPARADO del nucleo.
 *
 * Dos cosas que lo hacen compatible con un proyecto Next.js ajeno:
 *   1. La directiva `'use client'` va la PRIMERA del archivo y `tsc` la conserva en la
 *      salida. Si se pierde, el consumidor recibe un componente que Next intenta
 *      renderizar en el servidor y revienta con un error que no menciona a este paquete.
 *   2. React es `peerDependency` **opcional**: quien solo use el nucleo no lo instala, y
 *      quien lo use aporta SU version — nunca se empaqueta una copia. Dos Reacts en el
 *      mismo arbol es el bug de los hooks que nadie encuentra.
 */
import { aSlug } from './index.js';

export function VistaPreviaSlug({ texto }: { texto: string }) {
  const { slug, recortado } = aSlug(texto);
  return (
    <code data-recortado={recortado ? 'si' : 'no'}>{slug || '—'}</code>
  );
}
