/**
 * `now.md` se regenera en CADA lado y nunca viaja: es una proyección de las fuentes que sí viajan (objetivos.md,
 * calendario.json, habitos.json). La edición cliente de Arbrain no trae `now-snapshot.py` (lo dice su skill
 * habit-system), así que el job la regenera al final de cada pasada, con las mismas secciones que la semilla.
 * No expande repeticiones (RRULE) ni lee calendarios conectados: es la vista mínima, declarada así.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const dos = (n) => String(n).padStart(2, '0');
const fecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const lee = (ruta) => { try { return readFileSync(ruta, 'utf8'); } catch { return ''; } };
const leeJson = (ruta) => { try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return null; } };

/** Hitos de mes, semana y día del bloque del mes en curso de objetivos.md (formato de su cabecera). */
export function hitos(texto, ahora) {
  const fuera = { mes: null, semana: null, hoy: [] };
  const bloques = texto.replace(/<!--[\s\S]*?-->/g, '').split(/^## /m);
  const mes = bloques.find((b) => b.startsWith(`${MESES[ahora.getMonth()]} ${ahora.getFullYear()}`));
  if (!mes) return fuera;
  fuera.mes = /^\*\*Mes:\*\*\s*(.+)$/m.exec(mes)?.[1]?.trim() ?? null;
  const dia = ahora.getDate();
  for (const s of mes.split(/^### /m).slice(1)) {
    const r = /^Semana\s+(\d+)-(\d+)/.exec(s);
    if (!r || dia < Number(r[1]) || dia > Number(r[2])) continue;
    fuera.semana = /^\*\*Foco:\*\*\s*(.+)$/m.exec(s)?.[1]?.trim() ?? null;
    for (const d of s.split(/^#### /m).slice(1)) {
      if (Number(/^\S+\s+(\d+)/.exec(d)?.[1]) !== dia) continue;
      fuera.hoy = d.split('\n').filter((l) => /^- \[[ x]\] /.test(l)).map((l) => l.trim());
    }
  }
  return fuera;
}

const hora = (iso) => (/T(\d{2}:\d{2})/.exec(iso)?.[1] ?? 'todo el día');

export function regeneraNow({ arbrain, lado, ahora = new Date() }) {
  const plan = join(arbrain, '.claude', 'plan');
  const cal = leeJson(join(plan, 'calendario.json')) ?? {};
  const hab = leeJson(join(plan, 'habitos.json')) ?? {};
  const h = hitos(lee(join(plan, 'objetivos.md')), ahora);
  const hoy = fecha(ahora);
  const lunes = new Date(ahora); lunes.setDate(ahora.getDate() - ((ahora.getDay() + 6) % 7));
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  const [ini, fin] = [fecha(lunes), fecha(domingo)];
  const eventos = (Array.isArray(cal.eventos) ? cal.eventos : []).filter((e) => typeof e?.inicio === 'string')
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const deHoy = eventos.filter((e) => e.inicio.slice(0, 10) === hoy);
  const deSemana = eventos.filter((e) => e.inicio.slice(0, 10) > hoy && e.inicio.slice(0, 10) <= fin);
  const tareas = (Array.isArray(cal.tareas) ? cal.tareas : []).filter((t) => t && !t.hecha && (t.fecha == null || String(t.fecha).slice(0, 10) <= fin));
  const catalogo = Array.isArray(hab.habitos) ? hab.habitos : Array.isArray(hab.catalogo) ? hab.catalogo : [];
  const registro = hab.registro ?? hab.registros ?? {};
  const habitos = catalogo.filter((x) => x && x.activo !== false)
    .map((x) => `- [${registro?.[hoy]?.[x.clave]?.hecho === true ? 'x' : ' '}] ${x.nombre ?? x.clave}`);
  const lista = (xs, vacio) => (xs.length ? xs.join('\n') : vacio);
  const texto = `# Ahora

> _Generado por el job del cerebro en **${lado}** el ${hoy} a las ${dos(ahora.getHours())}:${dos(ahora.getMinutes())}. No viaja entre
> instancias: cada lado lo regenera desde objetivos.md, calendario.json y habitos.json, que sí viajan._

## Hitos
- **Mes:** ${h.mes ?? '_(sin objetivo del mes)_'}
- **Semana:** ${h.semana ?? '_(sin foco de la semana)_'}
- **Hoy:** ${h.hoy.length ? `\n${h.hoy.map((l) => `  ${l}`).join('\n')}` : '_(sin checklist de hoy)_'}

## Hábitos de hoy
${lista(habitos, '_Sin hábitos activos._')}

## Hoy
${lista(deHoy.map((e) => `- ${hora(e.inicio)} ${e.titulo ?? e.id}`), '_Nada agendado._')}

## Esta semana (${ini} a ${fin})
${lista(deSemana.map((e) => `- ${e.inicio.slice(0, 10)} ${hora(e.inicio)} ${e.titulo ?? e.id}`), '_Nada agendado._')}

## Tareas
${lista(tareas.map((t) => `- [ ] ${t.titulo ?? t.id}${t.fecha ? ` (${String(t.fecha).slice(0, 10)})` : ''}`), '_Sin tareas abiertas._')}

---
> _Auto-generado por cerebro-sync (lado ${lado})._
`;
  writeFileSync(join(arbrain, '.claude', 'now.md'), texto);
  return { eventosHoy: deHoy.length, eventosSemana: deSemana.length, tareas: tareas.length };
}
