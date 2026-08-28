/**
 * El runtime de ONNX, descrito estructuralmente.
 *
 * Este paquete NO importa `onnxruntime-web` ni `onnxruntime-node`: los describe y deja que
 * el consumidor le pase el suyo ya importado. Con eso se consiguen tres cosas que un import
 * directo rompe: el build de la herramienta no necesita 200 MB de runtime instalados, el
 * empaquetador puede probar la integracion en un proyecto limpio, y el consumidor decide la
 * version exacta en lugar de heredar la nuestra.
 */

export interface TensorOnnx {
  readonly dims: readonly number[];
  readonly data: unknown;
}

export interface SesionOnnx {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(entradas: Record<string, TensorOnnx>): Promise<Record<string, TensorOnnx>>;
  release?(): Promise<void>;
}

export interface RuntimeOnnx {
  Tensor: new (tipo: string, datos: Float32Array | BigInt64Array, dims: readonly number[]) => TensorOnnx;
  InferenceSession: {
    create(origen: string | ArrayBuffer | Uint8Array, opciones?: unknown): Promise<SesionOnnx>;
  };
}

/** Los datos de un tensor de salida, como Float32Array. */
export function datosFloat(tensor: TensorOnnx | undefined, nombre: string): Float32Array {
  const datos = tensor?.data;
  if (!(datos instanceof Float32Array)) {
    throw new Error(`la salida "${nombre}" del modelo no es Float32Array; ¿es el modelo que esperabas?`);
  }
  return datos;
}
