'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { entrar, recuperar, type EstadoEntrar, type EstadoRecuperar } from '../../services/servidor/acciones';
import { Aviso, Campo, clasesBoton } from '../ui';

export function FormularioEntrar({ clinica, siguiente }: { clinica: string; siguiente: string | null }) {
  const [estado, accion, enCurso] = useActionState<EstadoEntrar, FormData>(entrar.bind(null, clinica), { error: null });
  return (
    <form action={accion} className="space-y-4" noValidate>
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}
      <Campo id="correo" etiqueta="Correo" type="email" autoComplete="email" required />
      <Campo id="contrasena" etiqueta="Contraseña" type="password" autoComplete="current-password" required />
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <button type="submit" className={`${clasesBoton} w-full`} disabled={enCurso}>{enCurso ? 'Entrando…' : 'Entrar'}</button>
      <p className="flex flex-wrap justify-between gap-2 text-sm">
        <Link className="underline" href={`/clinica/${clinica}/recuperar`}>¿Olvidaste tu contraseña?</Link>
        <Link className="underline" href={`/clinica/${clinica}/registro`}>Crear cuenta y registrarme</Link>
      </p>
    </form>
  );
}

export function FormularioRecuperar({ clinica }: { clinica: string }) {
  const [estado, accion, enCurso] = useActionState<EstadoRecuperar, FormData>(recuperar.bind(null, clinica), { enviado: false, error: null });
  if (estado.enviado) return <Aviso tono="ok">Si ese correo tiene cuenta, te enviamos un enlace para cambiar tu contraseña. Revisa tu bandeja (en el laboratorio, el buzón local).</Aviso>;
  return (
    <form action={accion} className="space-y-4" noValidate>
      <Campo id="correo" etiqueta="Correo de tu cuenta" type="email" autoComplete="email" required />
      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
      <button type="submit" className={`${clasesBoton} w-full`} disabled={enCurso}>Enviar enlace</button>
    </form>
  );
}
