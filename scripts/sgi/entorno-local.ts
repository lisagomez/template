/**
 * Escribe el `.env.local` de ESTE worktree con la Supabase LOCAL (URL + llave anónima de desarrollo). No lleva
 * service_role (C7) ni la llave del LLM: esa se inyecta al arrancar sin escribirla en ningún archivo.
 * No imprime ningún valor. Uso: node scripts/sgi/entorno-local.ts
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { entornoLocal } from './local.ts';

const e = entornoLocal();
const previo = existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n').filter((l) => !/^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=/.test(l) && l.trim()) : [];
if (previo.some((l) => /^NEXT_PUBLIC_SUPABASE_URL=https:/.test(l))) throw new Error('.env.local ya apunta a una Supabase en la nube: no se pisa');
writeFileSync('.env.local', [...previo, `NEXT_PUBLIC_SUPABASE_URL=${e.url}`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${e.anon}`, ''].join('\n'));
chmodSync('.env.local', 0o600);
console.log(`.env.local del worktree → Supabase local (${e.url}); llave anónima: presente, largo ${e.anon.length}`);
