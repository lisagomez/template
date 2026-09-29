'use client';

/**
 * Marco comun de /etiquetas: navegacion, emparejamiento del dispositivo y avisos globales
 * (prefijo de demostracion, umbrales de ejemplo). Las pantallas reciben el estado ya cargado.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { empareja, type EstadoCliente } from '../services/cliente.ts';
import { useEtiquetas, type Etiquetas } from '../hooks/use-etiquetas.ts';

const RUTAS = [
  ['/etiquetas/escanear', 'Escanear'], ['/etiquetas/dia', 'Día'], ['/etiquetas', 'Etiqueta'], ['/etiquetas/leer', 'Leer'], ['/etiquetas/recibir', 'Recibir'], ['/etiquetas/mover', 'Mover'], ['/etiquetas/caducidades', 'Caducidades'],
  ['/etiquetas/conteo', 'Conteo'], ['/etiquetas/expediente', 'Expediente'], ['/etiquetas/riesgo', 'Riesgo'], ['/etiquetas/integridad', 'Integridad'], ['/etiquetas/catalogo', 'Catálogo'], ['/etiquetas/impresoras', 'Impresoras'], ['/etiquetas/rollos', 'Rollos'], ['/etiquetas/ajustes', 'Ajustes'],
] as const;

export const boton = 'rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800';
export const botonPrimario = 'rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40';
export const campo = 'w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900';
export const tarjeta = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950';

function Emparejar({ listo }: { listo: () => void }) {
  const [token, setToken] = useState('');
  const [operador, setOperador] = useState('');
  return (
    <form className={`${tarjeta} mx-auto mt-8 max-w-md space-y-3`} onSubmit={(e) => { e.preventDefault(); empareja(token, operador); listo(); }} data-prueba="emparejar">
      <h2 className="text-lg font-semibold">Emparejar este dispositivo</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">Escribe el código del sistema (te lo da quien administra la instalación) y tu nombre: queda en la traza de lo que asignes, imprimas o recibas. El código decide lo que este dispositivo puede hacer: el de recibo recibe, el de almacenista escanea y cuenta a ciegas, el de conteo solo cuenta.</p>
      <label className="block text-sm">Código del sistema<input className={campo} type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required minLength={16} /></label>
      <label className="block text-sm">Tu nombre<input className={campo} value={operador} onChange={(e) => setOperador(e.target.value)} required minLength={2} maxLength={60} /></label>
      <button className={botonPrimario} type="submit">Emparejar</button>
    </form>
  );
}

/**
 * Lo que ve cada rol en el menu: el que no usa, no aparece. Es una ayuda: el servidor rechaza igual
 * cualquier accion que no sea de su rol (`servidor/roles.ts`).
 */
const RUTAS_DEL_ROL: Record<EstadoCliente['rol'], readonly string[] | null> = {
  operacion: null, recibo: ['/etiquetas/escanear', '/etiquetas/recibir'], almacenista: ['/etiquetas/escanear', '/etiquetas/conteo'], conteo: ['/etiquetas/conteo'],
};
const ROTULO_ROL: Partial<Record<EstadoCliente['rol'], string>> = { conteo: 'Dispositivo de conteo', recibo: 'Recibo', almacenista: 'Almacenista' };

export function Marco({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: (e: Etiquetas) => ReactNode }) {
  const e = useEtiquetas();
  const ruta = usePathname();
  const router = useRouter();
  const cfg = e.estado?.configuracion;
  const demo = cfg?.prefijoEmpresa.startsWith('952');
  const rol = e.estado?.rol;
  const permitidas = rol ? RUTAS_DEL_ROL[rol] : null;
  const rutas = permitidas ? RUTAS.filter(([href]) => permitidas.includes(href)) : RUTAS;
  const bloqueada = Boolean(permitidas && !permitidas.includes(ruta));
  const inicio = permitidas?.[0] ?? '/etiquetas';
  // Recibo y almacenista entran DIRECTO a «Escanear»: la portada no es su pantalla.
  useEffect(() => { if (bloqueada && ruta === '/etiquetas' && (rol === 'recibo' || rol === 'almacenista')) router.replace(inicio); }, [bloqueada, ruta, rol, inicio, router]);
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <nav className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-2 pr-32 text-sm">
          <span className="mr-2 whitespace-nowrap font-bold">GS1 · Caducidades</span>
          {rol && ROTULO_ROL[rol] ? <span className="mr-1 whitespace-nowrap rounded bg-teal-700 px-2 py-0.5 text-xs font-bold text-white" data-prueba="rol" data-rol={rol}>{ROTULO_ROL[rol]}</span> : null}
          {rutas.map(([href, texto]) => (
            <a key={href} href={href} className={`whitespace-nowrap rounded-md px-2.5 py-1 ${ruta === href ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>{texto}</a>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">{titulo}</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600 dark:text-neutral-300">{descripcion}</p>
        </header>
        {demo ? <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-prueba="aviso-demo">Datos de demostración: el prefijo de empresa es 952, que GS1 reserva para ejemplos. Antes de imprimir etiquetas reales, pon el prefijo que te asignó GS1 México en Ajustes.</p> : null}
        {e.emparejado === false ? <Emparejar listo={e.alEmparejar} /> : null}
        {e.error ? <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">{e.error}</p> : null}
        {e.emparejado && !e.estado && !e.error ? <p className="text-sm text-neutral-500">Cargando…</p> : null}
        {e.estado && bloqueada ? (
          <p className={`${tarjeta} text-sm`} data-prueba="solo-conteo">{rol === 'conteo' ? <>Este dispositivo es de <b>conteo</b>: solo puede contar, y no ve cantidades del sistema.</> : <>Esta pantalla no es de tu rol ({ROTULO_ROL[rol!]?.toLowerCase()}).</>} <a className="font-semibold underline" href={inicio}>{rol === 'conteo' ? 'Ir al conteo' : 'Ir a Escanear'}</a></p>
        ) : null}
        {e.estado && !bloqueada ? children(e) : null}
      </main>
    </div>
  );
}
