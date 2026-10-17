'use client';

/** Las secciones del cuestionario. Cada control con etiqueta, ayuda y error ligados; nada viene marcado. */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CATEGORIAS, LARGO_PADECIMIENTO, NOMBRE_CATEGORIA, type Categoria } from '../../../../../tools/clinica-dental/dist/index.js';
import { Campo, clasesEntrada } from '../ui';
import type { FormaRegistro, FormaTutor } from './forma';

type Errores = Record<string, string>;
type Cambia = (f: (x: FormaRegistro) => FormaRegistro) => void;

export function Seccion({ titulo, children, descripcion }: { titulo: string; children: ReactNode; descripcion?: string }) {
  return (
    <fieldset className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
      <legend className="px-1 text-lg font-semibold">{titulo}</legend>
      {descripcion ? <p className="-mt-2 text-sm text-slate-600">{descripcion}</p> : null}
      {children}
    </fieldset>
  );
}

export function Casilla({ id, checked, onChange, children, error }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg p-1 text-sm">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--c1)]" />
        <span>{children}</span>
      </label>
      {error ? <p id={`${id}-error`} className="ml-9 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

export function DatosPersonales({ f, e, cambia }: { f: FormaRegistro; e: Errores; cambia: Cambia }) {
  const campo = (k: keyof FormaRegistro) => ({ value: f[k] as string, onChange: (ev: { target: { value: string } }) => cambia((x) => ({ ...x, [k]: ev.target.value })), error: e[k] });
  return (
    <Seccion titulo="Tus datos">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre(s)" autoComplete="given-name" required {...campo('nombre')} />
        <Campo id="apellidoPaterno" etiqueta="Apellido paterno" autoComplete="family-name" required {...campo('apellidoPaterno')} />
        <Campo id="apellidoMaterno" etiqueta="Apellido materno" opcional ayuda="Si no tienes, déjalo vacío." {...campo('apellidoMaterno')} />
        <Campo id="edad" etiqueta="Edad" inputMode="numeric" ayuda="En años." required {...campo('edad')} />
        <Campo id="correo" etiqueta="Correo" type="email" autoComplete="email" required {...campo('correo')} />
        <Campo id="celular" etiqueta="Celular" type="tel" inputMode="tel" autoComplete="tel-national" ayuda="10 dígitos, México (+52)." required {...campo('celular')} />
        <Campo id="empresa" etiqueta="Empresa con convenio" opcional ayuda="Solo si vienes por un convenio de tu trabajo." {...campo('empresa')} />
      </div>
    </Seccion>
  );
}

export function Intereses({ f, e, cambia }: { f: FormaRegistro; e: Errores; cambia: Cambia }) {
  const alterna = (k: Categoria, v: boolean) => cambia((x) => ({ ...x, categorias: v ? [...new Set([...x.categorias, k])] : x.categorias.filter((y) => y !== k) }));
  return (
    <Seccion titulo="¿Qué te interesa?" descripcion="Elige una o varias.">
      <div id="categorias" className="grid gap-2 sm:grid-cols-2">
        {CATEGORIAS.map((k) => <Casilla key={k} id={`cat-${k}`} checked={f.categorias.includes(k)} onChange={(v) => alterna(k, v)}>{NOMBRE_CATEGORIA[k]}</Casilla>)}
      </div>
      {e['categorias'] ? <p role="alert" className="text-sm font-medium text-red-700">{e['categorias']}</p> : null}
    </Seccion>
  );
}

export function Padecimiento({ f, e, cambia }: { f: FormaRegistro; e: Errores; cambia: Cambia }) {
  return (
    <Seccion titulo="Tu padecimiento (opcional)" descripcion="Es un dato de salud. Solo lo guardamos si das tu consentimiento expreso aquí abajo; si no, se descarta y tu registro sigue igual.">
      <div>
        <label htmlFor="padecimiento" className="block text-sm font-medium">Describe brevemente qué te molesta</label>
        <textarea id="padecimiento" rows={3} maxLength={LARGO_PADECIMIENTO} value={f.padecimiento} onChange={(ev) => cambia((x) => ({ ...x, padecimiento: ev.target.value }))} className={clasesEntrada} aria-describedby="padecimiento-ayuda" />
        <p id="padecimiento-ayuda" className="mt-1 text-xs text-slate-600">{f.padecimiento.length}/{LARGO_PADECIMIENTO}. No se guarda en este dispositivo mientras escribes.</p>
      </div>
      <Casilla id="consentimientos-datos_salud" checked={f.consentimientos.datos_salud} onChange={(v) => cambia((x) => ({ ...x, consentimientos: { ...x.consentimientos, datos_salud: v } }))} error={e['consentimientos.datos_salud']}>
        <strong>Doy mi consentimiento expreso</strong> para que la clínica trate la descripción de mi padecimiento (dato personal sensible) solo para preparar mi atención. Lo puedo retirar cuando quiera desde «Mis citas», y entonces se borra.
      </Casilla>
      {f.padecimiento.trim() && !f.consentimientos.datos_salud ? <p role="status" className="text-sm text-amber-800">Sin esta casilla, la descripción no se guardará.</p> : null}
    </Seccion>
  );
}

export function Tutor({ t, e, cambia }: { t: FormaTutor; e: Errores; cambia: Cambia }) {
  const campo = (k: keyof FormaTutor) => ({ value: t[k] as string, onChange: (ev: { target: { value: string } }) => cambia((x) => ({ ...x, tutor: { ...x.tutor, [k]: ev.target.value } })), error: e[`tutor.${k}`] });
  return (
    <Seccion titulo="Madre, padre o tutor" descripcion="Como eres menor de 18 años, necesitamos los datos y el consentimiento de quien ejerce la patria potestad o la tutela.">
      {e['tutor'] ? <p role="alert" className="text-sm font-medium text-red-700">{e['tutor']}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="tutor-nombre" etiqueta="Nombre(s)" {...campo('nombre')} />
        <Campo id="tutor-apellidoPaterno" etiqueta="Apellido paterno" {...campo('apellidoPaterno')} />
        <div>
          <label htmlFor="tutor-parentesco" className="block text-sm font-medium">Parentesco</label>
          <select id="tutor-parentesco" className={clasesEntrada} value={t.parentesco} onChange={(ev) => cambia((x) => ({ ...x, tutor: { ...x.tutor, parentesco: ev.target.value as FormaTutor['parentesco'] } }))} aria-invalid={e['tutor.parentesco'] ? true : undefined}>
            <option value="">Elige…</option><option value="madre">Madre</option><option value="padre">Padre</option><option value="tutor_legal">Tutor legal</option>
          </select>
          {e['tutor.parentesco'] ? <p className="mt-1 text-sm font-medium text-red-700">{e['tutor.parentesco']}</p> : null}
        </div>
        <Campo id="tutor-correo" etiqueta="Correo" type="email" {...campo('correo')} />
        <Campo id="tutor-celular" etiqueta="Celular" type="tel" {...campo('celular')} />
      </div>
      <Casilla id="tutor-consiente" checked={t.consiente} onChange={(v) => cambia((x) => ({ ...x, tutor: { ...x.tutor, consiente: v } }))} error={e['tutor.consiente']}>
        Soy la madre, el padre o el tutor legal y <strong>doy mi consentimiento</strong> para el registro y la atención del menor.
      </Casilla>
    </Seccion>
  );
}

export function Avisos({ f, e, cambia, clinica }: { f: FormaRegistro; e: Errores; cambia: Cambia; clinica: string }) {
  const k = (t: keyof FormaRegistro['consentimientos']) => ({ checked: f.consentimientos[t], onChange: (v: boolean) => cambia((x) => ({ ...x, consentimientos: { ...x.consentimientos, [t]: v } })), error: e[`consentimientos.${t}`] });
  return (
    <Seccion titulo="Avisos y privacidad" descripcion="Cada uno por separado. Ninguno viene marcado.">
      <Casilla id="consentimientos-recordatorios" {...k('recordatorios')}>Quiero <strong>recordatorios de mis citas</strong> (correo o Telegram, lo eliges al agendar).</Casilla>
      <Casilla id="consentimientos-telegram" {...k('telegram')}>También por <strong>Telegram</strong>. El bot no puede escribirte primero: al agendar te daremos un enlace para iniciar el chat.</Casilla>
      <Casilla id="consentimientos-newsletter" {...k('newsletter')}>Quiero el <strong>newsletter</strong> con novedades y promociones (aparte de los recordatorios; te das de baja con un clic).</Casilla>
      <Casilla id="consentimientos-aviso_privacidad" {...k('aviso_privacidad')}>
        Leí el <Link className="underline" href={`/clinica/${clinica}/privacidad`} target="_blank">aviso de privacidad</Link> (borrador del laboratorio). <span className="text-slate-600">Obligatorio.</span>
      </Casilla>
    </Seccion>
  );
}
