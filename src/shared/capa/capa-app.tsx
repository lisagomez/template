'use client';

/**
 * La capa montada en la app: compone la composición del layout con los enchufes registrados y pinta la ventana
 * alrededor de la pantalla del módulo. Las intenciones de navegación («llévame a las etiquetas») se resuelven aquí
 * mismo: llevan a la pantalla que declara el enchufe. La lógica de cada módulo no se toca.
 *
 * Si la composición no cuadra con los enchufes, no se esconde: la pantalla se pinta igual y arriba se dice qué
 * falla (y queda en la consola, que es lo que mira el recorrido).
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlmacenEnMemoria, compone, type Almacen, type Composicion, type IntencionRuteable, type Manejadores, type ModuloDeVoz } from '../../../tools/capa/dist/index.js';
import { AlmacenNavegador, CapaProveedor, Ventana, type ComponentesDeModulo } from '../../../tools/capa/dist/react/index.js';
import { ENCHUFES } from './enchufes';

const legible = (ruta: string) => {
  const ultimo = ruta.split('/').filter((s) => s && !s.startsWith('[')).at(-1) ?? 'inicio';
  return ultimo.replace(/-/g, ' ');
};

/** Hasta antes del primer segmento dinámico: a `/sgi/[org]/riesgos` se llega desde `/sgi`. */
const alcanzable = (ruta: string) => `/${ruta.split('/').filter(Boolean).slice(0, Math.max(1, ruta.split('/').filter(Boolean).findIndex((s) => s.startsWith('[')))).join('/')}`;

/** Las intenciones que solo llevan a una pantalla (`efecto: lee` con `pantalla`) se resuelven navegando. */
export function manejadoresDeNavegacion(intenciones: readonly IntencionRuteable[], navega: (ruta: string) => void): Manejadores {
  const deNavegacion = intenciones.filter((i) => i.pantalla && i.efecto === 'lee' && !i.irreversible);
  return Object.fromEntries(deNavegacion.map((i) => [i.id, async () => {
    const destino = i.pantalla!.includes('[') ? alcanzable(i.pantalla!) : i.pantalla!;
    setTimeout(() => navega(destino), 0);
    const nota = destino === i.pantalla ? '' : ` (eliges cuál desde ${destino})`;
    return { texto: `Te llevo a ${legible(i.pantalla!)}${nota}.`, ir: destino };
  }]));
}

export interface PropsCapaApp {
  composicion: unknown;
  inquilino?: string;
  manejadores?: Manejadores;
  componentes?: Readonly<Record<string, ComponentesDeModulo>>;
  voz?: ModuloDeVoz;
  almacen?: Almacen;
  extra?: ReactNode;
  children: ReactNode;
}

function almacenDe(c: Composicion): Almacen {
  return c.memoria.almacen === 'navegador' ? new AlmacenNavegador(`capa:${c.producto}:`) : new AlmacenEnMemoria();
}

export function CapaApp({ composicion, inquilino = 'laboratorio', manejadores, componentes, voz, almacen, extra, children }: PropsCapaApp) {
  const ruta = usePathname() ?? '/';
  const router = useRouter();
  const resultado = useMemo(() => compone(composicion, ENCHUFES), [composicion]);
  const producto = resultado.ok ? resultado.producto : null;
  const elAlmacen = useMemo(() => almacen ?? (producto ? almacenDe(producto.composicion) : new AlmacenEnMemoria()), [almacen, producto]);
  const todos = useMemo(
    () => (producto ? { ...manejadoresDeNavegacion(producto.intenciones, (r) => router.push(r)), ...manejadores } : {}),
    [producto, manejadores, router],
  );
  useEffect(() => {
    if (!resultado.ok) console.error(`[capa] la composición no cuadra con los enchufes: ${resultado.problemas.join(' · ')}`);
  }, [resultado]);
  if (!producto) {
    return (
      <div data-capa-error="composicion">
        <p role="alert" style={{ padding: 12, background: '#fee2e2', color: '#7f1d1d' }}>La capa no pudo componer este producto: {resultado.ok ? '' : resultado.problemas.join(' · ')}</p>
        {children}
      </div>
    );
  }
  return (
    <CapaProveedor producto={producto} inquilino={inquilino} manejadores={todos} componentes={componentes} voz={voz} almacen={elAlmacen} ruta={ruta} navega={(r) => router.push(r)}>
      <Ventana extra={extra}>{children}</Ventana>
    </CapaProveedor>
  );
}
