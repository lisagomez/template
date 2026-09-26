-- Resumen de ROLES del ERP comparable entre instalaciones: los roles de grupo con
-- sus atributos, y los logins normalizados por FUNCIÓN (no por nombre, que es un
-- parámetro de instalación). Las membresías automáticas que crea el servidor al
-- hacer CREATE ROLE (admin sin SET, PG 16+) no son decisiones del ERP: se omiten.
-- El «puente» es el dueño del esquema erp (quien instala), sea quien sea el que consulta.
select 'grupo ' || rolname || ' login=' || rolcanlogin || ' bypassrls=' || rolbypassrls
       || ' super=' || rolsuper || ' inherit=' || rolinherit
  from pg_roles where rolname in ('rol_admin', 'rol_exe_fin', 'rol_swm')
union all
select distinct 'login ' || case
         when bool_or(r.rolname = 'rol_exe_fin') over w then 'ejecutor'
         when bool_or(r.rolname = 'rol_swm') over w then 'lector'
         else 'otro' end
       || ' -> ' || string_agg(r.rolname, ',') over (partition by m.oid order by r.rolname
                      rows between unbounded preceding and unbounded following)
       || ' bypassrls=' || m.rolbypassrls || ' super=' || m.rolsuper
  from pg_auth_members am
  join pg_roles r on r.oid = am.roleid and r.rolname in ('rol_admin', 'rol_exe_fin', 'rol_swm')
  join pg_roles m on m.oid = am.member and m.rolcanlogin and m.oid <> (select nspowner from pg_namespace where nspname = 'erp')
 where am.set_option
window w as (partition by m.oid)
union all
select 'puente ' || coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), '(ninguno)')
  from pg_auth_members am
  join pg_roles r on r.oid = am.roleid and r.rolname in ('rol_admin', 'rol_exe_fin', 'rol_swm')
 where am.member = (select nspowner from pg_namespace where nspname = 'erp') and am.set_option
order by 1;
