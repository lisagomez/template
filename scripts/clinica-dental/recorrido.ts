/**
 * EL RECORRIDO DEL LABORATORIO: la app real, en Chromium, con los 8 pacientes sintéticos declarados. Llena el
 * libro de eventos desde la UI (nada por detrás salvo las palancas del laboratorio: reloj, Telegram del lado del
 * paciente, asistencia simulada) y deja capturas, axe, el dataLayer de cada pestaña y la guardia de red.
 *
 *   node scripts/clinica-dental/recorrido.ts
 *
 * Requiere: el Supabase local del laboratorio arriba, el demonio de dictado (voz) y el reel generado.
 * Escribe docs/goals/clinica-dental-medicion/recorrido.json y las capturas de docs/goals/clinica-dental-capturas/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cierra, registro } from './navegador.ts';
import { fechaDe, PACIENTES } from './flujos.ts';
import { DATOS } from './rutas.ts';
import { laboratorio, reiniciaLaboratorio } from './servidor.ts';
import {
  alternativa, bajaUnClic, buzon, cancelaDesdeMisCitas, capas, choque, citaDe, cierraPagina, latenciasGuia, nuevaPagina, p, registroEscrito, registroPorVoz,
  reprogramaDesdeMisCitas, vinculaSiToca,
} from './recorrido-pasos.ts';
import { asistenteEnLaUi, capturasDelLaboratorio, latenciasChat, misCitasCapturas } from './recorrido-vistas.ts';

const MEDICION = join(process.cwd(), 'docs/goals/clinica-dental-medicion');
const pasos: { paciente: string; paso: string; resultado: unknown }[] = [];
const anota = (paciente: string, paso: string, resultado: unknown) => {
  pasos.push({ paciente, paso, resultado });
  console.log(`  · ${paciente.padEnd(26)} ${paso.padEnd(22)} ${JSON.stringify(resultado).slice(0, 110)}`);
};

async function registraYAgenda(id: string): Promise<void> {
  const s = p(id);
  const { ctx, p: pag, vista } = await nuevaPagina(s, { voz: s.via === 'voz' });
  anota(id, 'registro', s.via === 'voz' ? await registroPorVoz(s, pag, vista, true) : await registroEscrito(s, pag, vista));
  anota(id, 'cita', await citaDe(s, pag, vista));
  await cierraPagina(ctx, pag);
}

/** La guía de voz también en celular: una visitante la recorre hasta las preguntas de salud, SIN enviar. */
async function guiaDeVozEnCelular(): Promise<void> {
  const s = p('registro-por-voz');
  const { ctx, p: pag, vista } = await nuevaPagina(s, { voz: true, vista: 'celular' });
  anota('visitante-celular', 'guía de voz', await registroPorVoz(s, pag, vista, false));
  await cierraPagina(ctx, pag);
}

async function choqueDeHueco(): Promise<void> {
  const a = p('baja-newsletter');
  const b = p('choque-de-hueco');
  const A = await nuevaPagina(a);
  const B = await nuevaPagina(b);
  anota(a.id, 'registro', await registroEscrito(a, A.p, A.vista));
  anota(b.id, 'registro', await registroEscrito(b, B.p, B.vista));
  const r = await choque(a, A.p, b, B.p);
  anota('choque', 'mismo hueco a la vez', r);
  for (const [s, pag, res] of [[a, A.p, r.a], [b, B.p, r.b]] as const) {
    if (res === 'ocupado') anota(s.id, 'alternativa', await alternativa(s, pag, a.cita.alternativa ?? b.cita.alternativa ?? '14:00'));
    else await vinculaSiToca(s, pag);
  }
  await cierraPagina(A.ctx, A.p);
  await cierraPagina(B.ctx, B.p);
}

/** El reloj avanza en pasos de 3 h por 10 días: salen los recordatorios de 24 h y 2 h; luego, la asistencia. */
async function avanzaElTiempo(): Promise<void> {
  let enviados = 0;
  for (let d = 1; d <= 10; d++) {
    for (const h of ['07:00', '10:00', '13:00', '16:00', '19:00', '22:00']) {
      const r = await laboratorio({ accion: 'fija', iso: new Date(`${fechaDe(d)}T${h}:00-06:00`).toISOString() });
      enviados += Number((r['despacho'] as { entregados?: number } | null)?.entregados ?? 0);
    }
  }
  anota('reloj', 'diez días', { avisosEntregados: enviados });
  const estado = JSON.parse(readFileSync(join(DATOS, 'portal.json'), 'utf8')) as { pacientes: { seudonimo: string; clinica: string; datos: { correo: string } }[]; citas: { id: string; clinica: string; paciente: string; estado: string }[] };
  for (const c of estado.citas.filter((x) => x.estado === 'confirmada')) {
    const correo = estado.pacientes.find((x) => x.seudonimo === c.paciente && x.clinica === c.clinica)?.datos.correo;
    const s = PACIENTES.find((x) => x.registro.correo === correo);
    await laboratorio({ accion: 'asistencia', clinica: c.clinica, cita: c.id, asistio: s?.asiste ?? true });
  }
  anota('reloj', 'asistencia simulada', { citas: estado.citas.filter((x) => x.estado === 'confirmada').length });
}

async function soloVoz(): Promise<void> {
  const s = { ...p('registro-por-voz'), registro: { ...p('registro-por-voz').registro, correo: `voz-${Date.now()}@pacientes.example` } };
  const { ctx, p: pag, vista } = await nuevaPagina(s, { voz: true });
  console.log(await registroPorVoz(s, pag, vista, true));
  await ctx.close();
  await cierra();
}

async function principal(): Promise<void> {
  if (process.argv.includes('--solo-voz')) return soloVoz();
  const t0 = Date.now();
  // --continua: depuración, sigue sobre el estado del servidor actual a partir de la baja (no es una corrida oficial).
  if (!process.argv.includes('--continua') && !process.argv.includes('--desde-pantallas')) {
    console.log('▸ laboratorio desde cero (estado, cuentas del Supabase local, servidor)');
    await reiniciaLaboratorio();
    console.log('▸ registro y cita de cada paciente sintético');
    for (const id of ['adulto-convenio', 'menor-con-tutor', 'sin-consentimiento-salud', 'telegram-sin-vincular', 'registro-por-voz', 'correo-que-rebota']) await registraYAgenda(id);
    await guiaDeVozEnCelular();
    await choqueDeHueco();
  }
  if (!process.argv.includes('--desde-pantallas')) await despuesDeAgendar();
  console.log('▸ pantallas: mis citas, chatbot por texto y por voz, urgencia');
  await misCitasCapturas(anota);
  await asistenteEnLaUi(anota);
  console.log('▸ el tiempo pasa: recordatorios y asistencia');
  await avanzaElTiempo();
  console.log('▸ laboratorio: el recordatorio y el newsletter desde el buzón, Telegram con el reel');
  await capturasDelLaboratorio(anota);
  const libro = await laboratorio({ accion: 'sella' });
  // Los hashes van como `sha256:<hex>`: 64 hex sueltos tienen forma de llave para `audita:secretos`.
  const ancla = (h: unknown) => (typeof h === 'string' && /^[0-9a-f]{64}$/.test(h) ? `sha256:${h}` : h);
  anota('libro', 'sello y verificación', (libro['libro'] as Record<string, unknown>[]).map((l) => ({ ...l, cabeza: ancla(l['cabeza']), raiz: ancla(l['raiz']) })));
  await cierra();
  const salida = { cuando: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000), pasos, guardiaDeRed: { externas: registro.externas }, erroresDeConsola: registro.errores, axe: registro.axe, dataLayer: capas, latenciasGuia, latenciasChat };
  writeFileSync(join(MEDICION, 'recorrido.json'), `${JSON.stringify(salida, null, 1)}\n`);
  const serias = registro.axe.reduce((n, a) => n + a.serias.length, 0);
  console.log(`▸ listo en ${salida.segundos} s · peticiones externas ${registro.externas.length} · errores de consola ${registro.errores.length} · axe serias/críticas ${serias}`);
}

async function despuesDeAgendar(): Promise<void> {
  console.log('▸ después de agendar: baja de un clic, newsletter, reprogramar, cancelar');
  const baja = await bajaUnClic(p('baja-newsletter'));
  anota('baja-newsletter', 'baja de un clic (POST)', baja);
  const antes = buzon().filter((e) => e.masivo && e.para === p('baja-newsletter').registro.correo).length;
  await laboratorio({ accion: 'newsletter', clinica: 'colibri', edicion: 'newsletter-2026-11' });
  await laboratorio({ accion: 'newsletter', clinica: 'maguey', edicion: 'newsletter-2026-11' });
  anota('baja-newsletter', 'newsletters tras la baja', buzon().filter((e) => e.masivo && e.para === p('baja-newsletter').registro.correo).length - antes);
  anota('menor-con-tutor', 'reprograma', await reprogramaDesdeMisCitas(p('menor-con-tutor'), fechaDe(8), '17:00'));
  anota('correo-que-rebota', 'cancela', await cancelaDesdeMisCitas(p('correo-que-rebota')));
}

principal().catch(async (e) => {
  console.error(`✗ ${e instanceof Error ? e.stack : String(e)}`);
  await cierra();
  process.exit(1);
});
