-- Tomado de supabase/supabase@3fc8af3, docker/volumes/db/roles.sql (Apache-2.0).
-- Lo corre la imagen de Postgres de Supabase al inicializar la base del despacho (spec 015).
-- SIN la línea de `supabase_functions_admin`: ese rol lo crea webhooks.sql, que el despacho no monta (no hay
-- edge functions). Con ella el script se cortaba ahí, storage se quedaba sin contraseña y las migraciones
-- de la imagen no corrían (auth fallaba con «must be owner of function uid»). Medido el 2026-10-07.
-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
