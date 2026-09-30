/**
 * El cifrado del endpoint de datos de WhatsApp Flows, de ida y vuelta (verificado el 2026-09-30
 * contra developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint):
 *  - la petición trae `encrypted_flow_data`, `encrypted_aes_key` e `initial_vector` en base64;
 *  - la llave AES de 128 bits viene cifrada con RSA-OAEP, SHA-256 también para MGF1, con la llave
 *    pública que el negocio subió a su número;
 *  - los datos van en AES-128-GCM con ese IV, y la etiqueta de 16 bytes pegada al final;
 *  - la respuesta se cifra con la MISMA llave AES y el IV invertido (cada byte XOR 0xFF), y viaja
 *    en base64 como texto plano.
 * Aquí viven los dos lados: el del negocio (descifra la petición, cifra la respuesta) y el de
 * WhatsApp (lo que hace el simulador: cifra la petición y descifra la respuesta).
 */
import { constants, createCipheriv, createDecipheriv, privateDecrypt, publicEncrypt, randomBytes, type KeyLike } from 'node:crypto';

export interface PeticionCifrada {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

const invierte = (iv: Buffer) => Buffer.from(iv.map((b) => b ^ 0xff));

export function descifraPeticion(p: PeticionCifrada, llavePrivada: KeyLike): { datos: unknown; llaveAes: Buffer; iv: Buffer } {
  const llaveAes = privateDecrypt({ key: llavePrivada, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(p.encrypted_aes_key, 'base64'));
  const iv = Buffer.from(p.initial_vector, 'base64');
  const cifrado = Buffer.from(p.encrypted_flow_data, 'base64');
  const etiqueta = cifrado.subarray(cifrado.length - 16);
  const cuerpo = cifrado.subarray(0, cifrado.length - 16);
  const d = createDecipheriv('aes-128-gcm', llaveAes, iv);
  d.setAuthTag(etiqueta);
  const claro = Buffer.concat([d.update(cuerpo), d.final()]).toString('utf8');
  return { datos: JSON.parse(claro) as unknown, llaveAes, iv };
}

export function cifraRespuesta(respuesta: unknown, llaveAes: Buffer, iv: Buffer): string {
  const c = createCipheriv('aes-128-gcm', llaveAes, invierte(iv));
  const cuerpo = Buffer.concat([c.update(JSON.stringify(respuesta), 'utf8'), c.final()]);
  return Buffer.concat([cuerpo, c.getAuthTag()]).toString('base64');
}

/** Lado WhatsApp (simulador): cifra una petición como lo haría Meta. */
export function cifraPeticionComoMeta(datos: unknown, llavePublica: KeyLike): { peticion: PeticionCifrada; llaveAes: Buffer; iv: Buffer } {
  const llaveAes = randomBytes(16);
  const iv = randomBytes(16);
  const c = createCipheriv('aes-128-gcm', llaveAes, iv);
  const cuerpo = Buffer.concat([c.update(JSON.stringify(datos), 'utf8'), c.final()]);
  return {
    peticion: {
      encrypted_flow_data: Buffer.concat([cuerpo, c.getAuthTag()]).toString('base64'),
      encrypted_aes_key: publicEncrypt({ key: llavePublica, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, llaveAes).toString('base64'),
      initial_vector: iv.toString('base64'),
    },
    llaveAes, iv,
  };
}

/** Lado WhatsApp (simulador): descifra la respuesta del negocio. */
export function descifraRespuestaComoMeta(b64: string, llaveAes: Buffer, iv: Buffer): unknown {
  const todo = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-128-gcm', llaveAes, invierte(iv));
  d.setAuthTag(todo.subarray(todo.length - 16));
  return JSON.parse(Buffer.concat([d.update(todo.subarray(0, todo.length - 16)), d.final()]).toString('utf8')) as unknown;
}
