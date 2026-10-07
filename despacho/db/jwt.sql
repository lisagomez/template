-- Tomado de supabase/supabase@3fc8af3, docker/volumes/db/jwt.sql (Apache-2.0).
-- Lo corre la imagen de Postgres de Supabase al inicializar la base del despacho (spec 015).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
