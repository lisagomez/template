/**
 * Un Supabase MINIMO para Postgres en proceso (PGlite): roles, `auth.users`, `auth.uid()` y los
 * privilegios por defecto que Supabase da a las funciones de `public`. Es una IMITACION, solo con lo
 * que las migraciones tocan.
 *
 * Lo comparten `prueba:migraciones`, que aplica todas las migraciones y mira sus invariantes, y
 * `prueba:buzon`, que prueba el COMPORTAMIENTO del RLS del buzón actuando como cada rol. Para actuar
 * como un usuario: `set role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', false);`.
 */
export const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, supabase_auth_admin;
grant insert, select on auth.users to supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;
