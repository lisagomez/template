-- Aviso del linter de seguridad de Supabase, leído el 2026-09-29 con el conector en solo lectura:
-- `handle_new_user()` es SECURITY DEFINER y la podían ejecutar `anon` y `authenticated` por
-- /rest/v1/rpc/handle_new_user (lints 0028 y 0029).
--
-- Es una función de disparador: solo tiene que correr desde `on_auth_user_created`. Postgres comprueba
-- EXECUTE al CREAR el disparador, no al dispararlo, así que retirar el permiso no rompe el alta de
-- cuentas (probado en un Postgres desechable: el alta sigue creando el perfil y la llamada directa
-- da «permission denied»).
--
-- Se retira también a PUBLIC: `anon` y `authenticated` lo heredan de ahí (`=X/postgres`), y
-- quitárselo solo a ellos deja el aviso igual. Idempotente: revocar dos veces no falla.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
