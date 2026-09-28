'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { crearCuenta, entrar, type EstadoDeCuenta } from '../services/acciones';

const INICIAL: EstadoDeCuenta = { error: null };
const CAMPO = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 text-base shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600';

export function FormularioCuenta({ modo, siguiente }: { modo: 'entrar' | 'crear'; siguiente: string }) {
  const [estado, accion, enviando] = useActionState(modo === 'entrar' ? entrar : crearCuenta, INICIAL);
  const otra = modo === 'entrar'
    ? { texto: '¿No tienes cuenta?', enlace: 'Crear una', ruta: '/signup' }
    : { texto: '¿Ya tienes cuenta?', enlace: 'Entrar', ruta: '/login' };
  return (
    <form action={accion} className="space-y-4" data-prueba={`formulario-${modo}`}>
      <input type="hidden" name="siguiente" value={siguiente} />
      {modo === 'crear' && (
        <label className="block text-sm font-medium">Tu nombre
          <input name="nombre" autoComplete="name" maxLength={80} className={CAMPO} />
        </label>
      )}
      <label className="block text-sm font-medium">Correo
        <input name="correo" type="email" required autoComplete="email" className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">Contraseña
        <input name="contrasena" type="password" required minLength={8} maxLength={72}
          autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} className={CAMPO} />
      </label>
      {estado.error && <p role="alert" className="text-sm text-red-700" data-prueba="error-cuenta">{estado.error}</p>}
      <button type="submit" disabled={enviando} data-prueba={`enviar-${modo}`}
        className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
      </button>
      <p className="text-center text-sm text-gray-600">
        {otra.texto}{' '}
        <Link href={`${otra.ruta}?siguiente=${encodeURIComponent(siguiente)}`} className="font-medium text-emerald-700 underline">{otra.enlace}</Link>
      </p>
    </form>
  );
}
