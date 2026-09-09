/**
 * Declaraciones de los peer OPCIONALES que este paquete no instala.
 *
 * Por que existe este archivo: `zxing-wasm` es peerDependency opcional, asi que en el arbol de
 * quien solo use el nucleo NO esta — y `tsc` no puede resolverlo al construir la herramienta. Sin
 * esto el build falla por una dependencia que, por diseño, la mayoria de consumidores no tendra.
 *
 * Se declara SOLO lo que se usa, y eso es deliberado: es el contrato del que dependemos, escrito.
 * Declarar el modulo entero como `unknown` compilaria igual y no diria nada; asi, el dia que la
 * API real cambie, el sitio donde mirar esta nombrado.
 */
declare module 'zxing-wasm' {
  export function readBarcodes(
    imagen: unknown,
    opciones?: unknown,
  ): Promise<readonly { text: string }[]>
}
