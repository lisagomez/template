/**
 * La forma del registro en el navegador y su paso a la entrada que valida el nucleo (el MISMO esquema que el
 * servidor). El borrador del dispositivo guarda solo los campos seguros: nunca el padecimiento, la contraseña
 * ni los consentimientos (que se vuelven a marcar a conciencia).
 */
import { borradorSeguro, MAYORIA_DE_EDAD, type Categoria, type CampoGuia, type ValorCampo } from '../../../../../tools/clinica-dental/dist/index.js';

export interface FormaTutor { nombre: string; apellidoPaterno: string; apellidoMaterno: string; parentesco: '' | 'madre' | 'padre' | 'tutor_legal'; correo: string; celular: string; consiente: boolean }
export interface FormaRegistro {
  empresa: string; nombre: string; apellidoPaterno: string; apellidoMaterno: string; edad: string; correo: string; celular: string; padecimiento: string;
  categorias: Categoria[];
  consentimientos: { aviso_privacidad: boolean; datos_salud: boolean; recordatorios: boolean; newsletter: boolean; telegram: boolean };
  tutor: FormaTutor;
}

export const FORMA_VACIA: FormaRegistro = {
  empresa: '', nombre: '', apellidoPaterno: '', apellidoMaterno: '', edad: '', correo: '', celular: '', padecimiento: '', categorias: [],
  consentimientos: { aviso_privacidad: false, datos_salud: false, recordatorios: false, newsletter: false, telegram: false },
  tutor: { nombre: '', apellidoPaterno: '', apellidoMaterno: '', parentesco: '', correo: '', celular: '', consiente: false },
};

export const esMenor = (f: FormaRegistro) => f.edad.trim() !== '' && Number(f.edad) < MAYORIA_DE_EDAD;

/** Lo que se manda a validar: numeros como numeros, vacios fuera, tutor solo para menores. */
export function aEntrada(f: FormaRegistro): Record<string, unknown> {
  const { tutor, consentimientos, ...datos } = f;
  const t = { ...tutor, parentesco: tutor.parentesco || undefined };
  return {
    ...Object.fromEntries(Object.entries(datos).filter(([, v]) => (Array.isArray(v) ? true : v !== ''))),
    ...(f.edad.trim() !== '' ? { edad: Number(f.edad) } : {}),
    consentimientos,
    ...(esMenor(f) ? { tutor: Object.fromEntries(Object.entries(t).filter(([, v]) => v !== '' && v !== undefined)) } : {}),
  };
}

const CLAVE = 'clinica-registro-borrador';
const VIGENCIA_MS = 24 * 3_600_000;

export function leeBorrador(clinica: string): Partial<FormaRegistro> {
  try {
    const b = JSON.parse(localStorage.getItem(`${CLAVE}-${clinica}`) ?? 'null') as { en: number; datos: Partial<FormaRegistro> } | null;
    if (!b || Date.now() - b.en > VIGENCIA_MS) return {};
    return b.datos;
  } catch {
    return {};
  }
}

export function guardaBorrador(clinica: string, f: FormaRegistro): void {
  try {
    localStorage.setItem(`${CLAVE}-${clinica}`, JSON.stringify({ en: Date.now(), datos: borradorSeguro(f as unknown as Record<string, unknown>) }));
  } catch {
    /* sin almacenamiento: se pierde al cerrar, y ya */
  }
}

export function borraBorrador(clinica: string): void {
  try {
    localStorage.removeItem(`${CLAVE}-${clinica}`);
  } catch {
    /* nada */
  }
}

/** Lo que la guia de voz propone, puesto en la forma. */
export function llenaDesdeGuia(f: FormaRegistro, campo: CampoGuia, valor: ValorCampo): FormaRegistro {
  const texto = valor === null ? '' : Array.isArray(valor) ? '' : String(valor);
  if (campo === 'categorias') return { ...f, categorias: Array.isArray(valor) ? valor : [] };
  if (campo === 'celular' || campo === 'tutor.celular') {
    const local = texto.replace(/^\+52/, '');
    return campo === 'celular' ? { ...f, celular: local } : { ...f, tutor: { ...f.tutor, celular: local } };
  }
  if (campo.startsWith('tutor.')) return { ...f, tutor: { ...f.tutor, [campo.slice(6)]: texto } };
  return { ...f, [campo]: texto };
}

/** De la clave del error de Zod al id del control en la pagina (para enfocarlo). */
export const idDeCampo = (clave: string) => clave.replace(/\./g, '-');
