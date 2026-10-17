/**
 * Registro del paciente y sus consentimientos. El padecimiento solo se guarda con consentimiento expreso;
 * retirar un consentimiento es tan facil como darlo y tiene efecto: el de salud BORRA el texto, el de
 * recordatorios o Telegram cancela lo pendiente, el del newsletter es una baja.
 */
import type { Paciente } from '../almacen.js';
import { preparaRegistro, VERSION_AVISO, type ErroresCampo } from '../cuestionario.js';
import type { CanalAdquisicion, TipoConsentimiento } from '../eventos.js';
import { vigentes, type Contexto } from './contexto.js';
import { cancelaAvisos } from './avisos.js';

export interface EntradaAlta {
  clinica: string;
  usuario: string;
  entrada: unknown;
  visitante: string | null;
  via: 'escrito' | 'voz';
  canal: CanalAdquisicion;
  segundos: number | null;
}

export type ResultadoAlta =
  | { ok: true; paciente: Paciente; repetido: boolean; descartado: { padecimiento: boolean } }
  | { ok: false; errores: ErroresCampo };

export async function registra(ctx: Contexto, a: EntradaAlta): Promise<ResultadoAlta> {
  ctx.clinica(a.clinica);
  const prep = preparaRegistro(a.entrada);
  if (!prep.ok) return prep;
  const previo = await ctx.almacen.paciente(a.clinica, a.usuario);
  if (previo) return { ok: true, paciente: previo, repetido: true, descartado: { padecimiento: false } };
  const ahora = ctx.reloj();
  const p = prep.preparado;
  const paciente: Paciente = {
    seudonimo: ctx.seudonimos.paciente(a.clinica, a.usuario), clinica: a.clinica, usuario: a.usuario, datos: p.datos, categorias: p.categorias,
    canalAdquisicion: p.convenio ? 'convenio' : a.canal, telegram: { chatId: null, vinculadoEn: null }, creado: ahora,
  };
  await ctx.almacen.guardaPaciente(paciente);
  for (const c of p.consentimientos) {
    await ctx.almacen.agregaConsentimiento({ clinica: a.clinica, paciente: paciente.seudonimo, tipo: c.tipo, otorgado: c.otorgado, version: c.version, en: ahora });
  }
  const base = { clinica: a.clinica, sujeto: paciente.seudonimo } as const;
  await ctx.emite({ ...base, tipo: 'paciente_registrado', visitante: a.visitante, via: a.via, menor: p.menor, convenio: p.convenio, categorias: p.categorias, canal_adquisicion: paciente.canalAdquisicion, segundos_registro: a.segundos }, `alta|${paciente.seudonimo}`);
  for (const c of p.consentimientos.filter((x) => x.otorgado)) {
    await ctx.emite({ ...base, tipo: 'consentimiento_otorgado', consentimiento: c.tipo, version_aviso: VERSION_AVISO }, `consentimiento|${paciente.seudonimo}|${c.tipo}|alta`);
  }
  return { ok: true, paciente, repetido: false, descartado: p.descartado };
}

/** Otorga o retira un consentimiento. Idempotente: si ya estaba asi, no hace nada ni emite. */
export async function cambiaConsentimiento(ctx: Contexto, clinica: string, usuario: string, tipo: Exclude<TipoConsentimiento, 'aviso_privacidad' | 'tutor'>, otorgado: boolean, via: 'portal' | 'un_clic' | 'enlace' = 'portal') {
  const p = await ctx.exigePaciente(clinica, usuario);
  const actual = (await vigentes(ctx, clinica, p.seudonimo))[tipo] === true;
  if (actual === otorgado) return { cambiado: false };
  const ahora = ctx.reloj();
  await ctx.almacen.agregaConsentimiento({ clinica, paciente: p.seudonimo, tipo, otorgado, version: VERSION_AVISO, en: ahora });
  const n = (await ctx.almacen.consentimientos(clinica, p.seudonimo)).length;
  const sujeto = p.seudonimo;
  await ctx.emite({ clinica, sujeto, tipo: otorgado ? 'consentimiento_otorgado' : 'consentimiento_retirado', consentimiento: tipo, version_aviso: VERSION_AVISO }, `consentimiento|${sujeto}|${tipo}|${n}`);
  if (!otorgado) await efectosDelRetiro(ctx, p, tipo, via);
  return { cambiado: true };
}

async function efectosDelRetiro(ctx: Contexto, p: Paciente, tipo: TipoConsentimiento, via: 'portal' | 'un_clic' | 'enlace') {
  if (tipo === 'datos_salud' && p.datos.padecimiento !== undefined) {
    const resto = { ...p.datos };
    delete resto.padecimiento;
    await ctx.almacen.guardaPaciente({ ...p, datos: resto });
  }
  if (tipo === 'newsletter') {
    await ctx.emite({ clinica: p.clinica, sujeto: p.seudonimo, tipo: 'newsletter_baja', via }, `baja|${p.seudonimo}|${ctx.reloj()}`);
    await cancelaAvisos(ctx, p.clinica, p.seudonimo, (a) => a.clase === 'newsletter', 'baja');
  }
  if (tipo === 'recordatorios') await cancelaAvisos(ctx, p.clinica, p.seudonimo, (a) => a.clase !== 'newsletter', 'consentimiento_retirado');
  if (tipo === 'telegram') {
    await ctx.almacen.guardaPaciente({ ...p, telegram: { chatId: null, vinculadoEn: null } });
    await cancelaAvisos(ctx, p.clinica, p.seudonimo, (a) => a.canal === 'telegram', 'consentimiento_retirado');
  }
}
