'use client';

/**
 * El registro con cuestionario. Valida con el MISMO esquema que el servidor, enseña los errores en cada campo y
 * enfoca el primero; guarda un borrador seguro en el dispositivo; y crea la cuenta solo si todo es válido.
 */
import { useEffect, useRef, useState } from 'react';
import { validaRegistro, type AccionGuia } from '../../../../../tools/clinica-dental/dist/index.js';
import { registrar } from '../../services/servidor/acciones';
import { empuja } from '../../services/cliente/datalayer';
import { canal, registraEvento, visitante } from '../../services/cliente/visitante';
import { usePreferencias } from '../../store/preferencias';
import { Aviso, Campo, clasesBoton } from '../ui';
import { aEntrada, borraBorrador, esMenor, FORMA_VACIA, guardaBorrador, idDeCampo, leeBorrador, llenaDesdeGuia, type FormaRegistro } from './forma';
import { GuiaVoz } from './guia-voz';
import { Avisos, DatosPersonales, Intereses, Padecimiento, Seccion, Tutor } from './secciones';

export function FormularioRegistro({ clinica, conSesion, yaRegistrado }: { clinica: string; conSesion: boolean; yaRegistrado: boolean }) {
  const [f, setF] = useState<FormaRegistro>(FORMA_VACIA);
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ descartado: boolean } | null>(null);
  const inicio = useRef<number | null>(null);
  const via = useRef<'escrito' | 'voz'>('escrito');
  const forma = useRef(f);
  const clave = useRef('');
  useEffect(() => { clave.current = contrasena; }, [contrasena]);
  const voz = usePreferencias((s) => s.voz);
  useEffect(() => { forma.current = f; }, [f]);
  // El borrador vive en el dispositivo: se lee tras hidratar (el servidor no lo ve) y lo escribe la promesa.
  useEffect(() => { void Promise.resolve(clinica).then((c) => setF((x) => ({ ...x, ...leeBorrador(c) }))); }, [clinica]);

  const empezo = (como: 'escrito' | 'voz') => {
    if (inicio.current !== null) return;
    inicio.current = Date.now();
    via.current = como;
    void registraEvento({ tipo: 'registro_iniciado', clinica, via: como });
  };
  const cambia = (g: (x: FormaRegistro) => FormaRegistro) => {
    empezo('escrito');
    setF((x) => {
      const y = g(x);
      guardaBorrador(clinica, y);
      return y;
    });
  };

  async function envia() {
    const entrada = aEntrada(forma.current);
    const v = validaRegistro(entrada);
    const errs: Record<string, string> = v.ok ? {} : { ...v.errores };
    if (!conSesion && clave.current.length < 8) errs['contrasena'] = 'La contraseña lleva al menos 8 caracteres';
    setErrores(errs);
    const primero = Object.keys(errs)[0];
    if (primero) {
      document.getElementById(idDeCampo(primero === 'tutor' ? 'tutor-nombre' : primero === 'categorias' ? 'cat-general' : primero))?.focus();
      return;
    }
    setEnviando(true);
    const segundos = inicio.current === null ? null : Math.round((Date.now() - inicio.current) / 1000);
    const r = await registrar(clinica, entrada, conSesion ? 'sesion-existente' : clave.current, { visitante: visitante(), via: via.current, canal: canal(), segundos });
    setEnviando(false);
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    borraBorrador(clinica);
    empuja(r.dataLayer);
    setHecho({ descartado: r.descartadoPadecimiento });
  }

  const alAccionGuia = (a: AccionGuia) => {
    if (a.tipo === 'llena') setF((x) => llenaDesdeGuia(x, a.campo, a.valor));
    if (a.tipo === 'enfoca') document.getElementById(idDeCampo(a.campo))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (a.tipo === 'enviar') void envia();
  };

  if (hecho) {
    return (
      <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold">¡Listo, ya estás registrado!</h2>
        {hecho.descartado ? <Aviso>Como no diste el consentimiento de salud, <strong>no guardamos</strong> la descripción de tu padecimiento.</Aviso> : null}
        {/* Navegación completa a propósito: el encabezado vuelve con la sesión recién creada. */}
        <a href={`/clinica/${clinica}/agenda`} className={clasesBoton}>Elegir día y hora</a>
      </div>
    );
  }
  if (yaRegistrado) {
    return (
      <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="text-2xl font-bold">Ya estás registrado en esta clínica</h2>
        <div className="flex flex-wrap gap-3"><a href={`/clinica/${clinica}/mis-citas`} className={clasesBoton}>Ver mis citas</a><a href={`/clinica/${clinica}/agenda`} className={clasesBoton}>Agendar</a></div>
      </div>
    );
  }
  return (
    <form className="space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); void envia(); }}>
      {voz ? <GuiaVoz alAccion={alAccionGuia} alIniciar={() => empezo('voz')} /> : null}
      {Object.keys(errores).length ? <Aviso tono="error">Revisa {Object.keys(errores).length === 1 ? 'el campo marcado' : 'los campos marcados'}.{errores['formulario'] ? ` ${errores['formulario']}` : ''}</Aviso> : null}
      <DatosPersonales f={f} e={errores} cambia={cambia} />
      <Intereses f={f} e={errores} cambia={cambia} />
      <Padecimiento f={f} e={errores} cambia={cambia} />
      {esMenor(f) ? <Tutor t={f.tutor} e={errores} cambia={cambia} /> : null}
      <Avisos f={f} e={errores} cambia={cambia} clinica={clinica} />
      {conSesion ? null : (
        <Seccion titulo="Tu contraseña" descripcion="Para entrar a ver y cambiar tus citas. Escríbela tú: no la digas en voz alta.">
          <Campo id="contrasena" etiqueta="Contraseña" type="password" autoComplete="new-password" ayuda="Al menos 8 caracteres." value={contrasena} onChange={(e) => setContrasena(e.target.value)} error={errores['contrasena']} />
        </Seccion>
      )}
      <button type="submit" className={`${clasesBoton} w-full sm:w-auto`} disabled={enviando}>{enviando ? 'Registrando…' : 'Registrarme'}</button>
      <p className="text-sm text-slate-600">Lo que escribes (salvo el padecimiento y la contraseña) se guarda en este dispositivo por 24 horas por si cierras la pestaña.</p>
    </form>
  );
}
