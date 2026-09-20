/**
 * `dictado pega "<texto>"`: pega un texto donde este el cursor de Windows, con el MISMO
 * pegador del dictado (portapapeles restaurado despues, o `--pegar teclear`). Existe para que
 * otras superficies —el microfono remoto del celular, un script— entreguen texto al foco de la
 * PC sin montar el pipeline entero. Sin argumento, lee el texto de stdin (asi un texto con
 * comillas o saltos no pelea con la shell).
 */
import { creaPegadorWindows } from './pegado-windows.js';

async function textoDeStdin(): Promise<string> {
  let todo = '';
  process.stdin.setEncoding('utf8');
  for await (const trozo of process.stdin) todo += trozo;
  return todo;
}

export async function ordenPega(posicionales: readonly string[]): Promise<void> {
  const texto = (posicionales.length > 0 ? posicionales.join(' ') : await textoDeStdin()).trim();
  if (texto.length === 0) throw new Error('uso: dictado pega "<texto>" (o texto por stdin)');
  const pegador = creaPegadorWindows({ metodo: 'portapapeles' });
  await pegador.pega(texto);
  await pegador.cierra();
}
