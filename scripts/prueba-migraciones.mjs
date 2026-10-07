#!/usr/bin/env node
/**
 * Gate de las migraciones de `supabase/migrations/`. Corre dentro de `npm run validate`.
 *
 * Por que existe: la migracion de `project_settings` (2026-08-26) llevaba un error de sintaxis y
 * nadie lo vio en un mes, porque NINGUN gate aplicaba las migraciones; la tabla no existia en
 * ninguna base. Y `handle_new_user()` salio ejecutable por la API publica sin que nada lo cazara
 * antes que el linter de Supabase, ya en produccion (ambos, 2026-09-29).
 *
 * Que hace, sin Docker ni red: levanta Postgres 17 en proceso (PGlite, WebAssembly), le pone un
 * Supabase MINIMO (roles, `auth.users`, `auth.uid()` y los privilegios por defecto que da Supabase
 * a las funciones de `public`) y comprueba:
 *
 *   1. Cada migracion se aplica, en orden de nombre.
 *   2. Aplicadas OTRA vez, ninguna falla: se aplican a mano en el SQL Editor y sin historial, asi
 *      que repetir una tiene que ser inocuo (todas se declaran idempotentes en su cabecera).
 *   3. Toda tabla de `public` tiene RLS (Reglas de Codigo: SIEMPRE RLS).
 *   4. Ninguna funcion SECURITY DEFINER de `public` la ejecutan `anon` ni `authenticated`
 *      (lints 0028/0029: se llamarian por /rest/v1/rpc con privilegios del dueno).
 *   5. Toda funcion de `public` fija su search_path (lint 0011).
 *
 * El Supabase de aqui es una IMITACION: solo lo que las migraciones tocan. Si una migracion nueva
 * usa algo que no esta (storage, extensiones, otro esquema), este gate falla con ese error y lo
 * que toca es ampliar SUPABASE_MINIMO, no saltarse la migracion.
 *
 * Uso:  node scripts/prueba-migraciones.mjs            (el gate)
 *       node scripts/prueba-migraciones.mjs --prueba   (siembra un defecto de cada clase y exige
 *                                                       que caigan todos)
 * Exit: 0 en verde · 1 en rojo.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_MINIMO } from './lib/supabase-minimo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase/migrations';
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;


const INVARIANTES = [
  ['toda tabla de public tiene RLS',
    `select relname as n from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity`],
  ['ninguna funcion SECURITY DEFINER de public la ejecutan anon ni authenticated',
    `select proname as n from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
       and (has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE'))`],
  ['toda funcion de public fija su search_path',
    `select proname as n from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f'
       and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%')`],
];

const primeraLinea = (e) => String(e?.message ?? e).split('\n')[0];

/** Aplica las migraciones dos veces y mira las invariantes. Devuelve los fallos, vacio = verde. */
async function verifica(migraciones) {
  const db = new PGlite();
  const fallos = [];
  try {
    await db.exec(SUPABASE_MINIMO);
    for (const pasada of ['se aplica', 'se aplica otra vez (idempotente)']) {
      for (const [nombre, sql] of migraciones) {
        try {
          await db.exec(sql);
        } catch (e) {
          fallos.push(`${nombre} no ${pasada.replace('se ', '')}: ${primeraLinea(e)}`);
        }
      }
      if (fallos.length) return fallos;
    }
    for (const [regla, consulta] of INVARIANTES) {
      const { rows } = await db.query(consulta);
      if (rows.length) fallos.push(`${regla}: falla en ${rows.map((r) => r.n).join(', ')}`);
    }
    return fallos;
  } finally {
    await db.close();
  }
}

function migracionesEnDisco() {
  return readdirSync(join(raiz, DIR)).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => [f, readFileSync(join(raiz, DIR, f), 'utf8')]);
}

async function prueba(reales) {
  // Linea base: si el set real ya estuviera en rojo, cada siembra "caeria" por ese error y la
  // prueba no probaria nada (misma leccion que verifica-gates, 2026-09-25).
  const base = await verifica(reales);
  if (base.length) {
    console.log(rojo(`la linea base ya esta en rojo (${base.length}): la prueba no probaria nada`));
    for (const f of base) console.log(gris(`    ${f}`));
    process.exit(1);
  }
  const casos = [
    ['sintaxis invalida (la de project_settings, agosto)',
      'create table public.x (id int, constraint x_uno unique ((true)));'],
    ['no idempotente', 'create table public.x (id int); alter table public.x enable row level security;'],
    ['tabla sin RLS', 'create table if not exists public.x (id int);'],
    ['SECURITY DEFINER ejecutable por la API publica',
      `create or replace function public.x() returns int language sql security definer set search_path = '' as $$ select 1 $$;`],
    ['funcion sin search_path', 'create or replace function public.x() returns int language sql as $$ select 1 $$;'],
  ];
  let cazadas = 0;
  for (const [nombre, sql] of casos) {
    const fallos = await verifica([...reales, ['99999999999999_siembra.sql', sql]]);
    if (fallos.length) {
      cazadas += 1;
      console.log(`${verde('CAZADA')} ${nombre}`);
      console.log(gris(`       ↳ ${fallos[0].slice(0, 150)}`));
    } else {
      console.log(`${rojo('VIVA  ')} ${nombre} — el gate no la vio`);
    }
  }
  console.log(`\nprueba de la prueba: ${cazadas} de ${casos.length} siembras cazadas`);
  process.exit(cazadas === casos.length ? 0 : 1);
}

// --- Entrada -----------------------------------------------------------------
const reales = migracionesEnDisco();
if (process.argv.includes('--prueba')) await prueba(reales);

const fallos = await verifica(reales);
if (fallos.length) {
  for (const f of fallos) console.log(`${rojo('✗')} ${f}`);
  console.log(rojo(`\nMigraciones en rojo: ${fallos.length} fallo(s) sobre ${reales.length} migraciones.`));
  process.exit(1);
}
console.log(`${verde('✓')} ${reales.length} migraciones: se aplican, son idempotentes, RLS en todo public, ` +
  'sin SECURITY DEFINER expuesta y con search_path fijo.');
