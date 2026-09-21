/** Lo que /api/ajustes devuelve: un espejo tipado de `estadoAjustes` de tools/dictado (la fuente es el CLI). */

export type Origen = 'argumento' | 'entorno' | 'ajustes' | 'defecto';
export type Grupo = 'motor' | 'tecla' | 'pegado' | 'audio' | 'texto' | 'sonidos' | 'historial' | 'sin-proveedor';
export type Tipo = 'booleano' | 'entero' | 'numero' | 'texto' | 'eleccion' | 'ganancia' | 'motor' | 'respaldo';
export type Valor = string | number | boolean;

export interface ValorResuelto {
  valor: Valor;
  origen: Origen;
}

export interface Campo {
  clave: string;
  grupo: Grupo;
  etiqueta: string;
  ayuda: string;
  tipo: Tipo;
  opciones?: string[];
  min?: number;
  max?: number;
  bandera?: string;
  variable?: string;
  enCaliente: boolean;
  sinProveedor?: string;
}

export interface GrupoInfo {
  id: Grupo;
  titulo: string;
  nota?: string;
}

export interface EntradaCatalogo {
  nombre: string;
  instalado: boolean;
  medido: boolean;
  wer?: number;
  latenciaP50Ms?: number;
  latenciaP95Ms?: number;
  latenciaCortasP50Ms?: number;
  cargaMs?: number;
  ramMb?: number;
  nota?: string;
}

export interface EstadoAjustes {
  ruta: string;
  existe: boolean;
  version: number;
  ajustes: Record<string, ValorResuelto>;
  avisos: string[];
  esquema: Campo[];
  grupos: GrupoInfo[];
  motoresInstalados: string[];
  catalogo: EntradaCatalogo[];
  medicion?: { fecha: string; maquina?: { cpu?: string; nucleos?: number; ramGb?: number; dispositivo?: string }; corpus?: { nombre?: string; tomas?: number; minutos?: number } };
}
