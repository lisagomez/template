"""Conteo DIRECTO de las cifras de la propuesta: SQL propio sobre los 7 CSV crudos, sin pasar por dbt ni por los marts.

Es el comparador independiente de la tabla de cifras (spec §DEFINICION DE HECHO). No se reutiliza nada del
proyecto dbt: ni staging, ni int_lineas_enriquecidas, ni la clasificación de clientes. Si una cifra de MetricFlow
y este conteo coinciden, la coincidencia no puede venir de compartir un error de modelado.

Reglas de negocio que se escriben aquí de nuevo, desde la propuesta (no desde los modelos):
- venta neta de una línea = cantidad × precio_unitario × (1 − descuento_pct); solo pedidos 'Completado';
- periodo comparable = enero a septiembre de cada año;
- base inicial = clientes con compra en enero de 2025 (primer mes de datos): no son nuevos ni cohorte.

Uso:  python directo.py <dir con los CSV>   → JSON {id: valor} en stdout
"""
import json
import sys

import duckdb

R = sys.argv[1]
c = duckdb.connect()
for t in ["pedidos", "lineas_pedido", "clientes", "tiendas", "productos", "campanas", "inventario"]:
    c.execute(f"create view {t} as select * from read_csv_auto('{R}/{t}.csv', header = true)")
uno = lambda s: c.execute(s).fetchone()[0]  # noqa: E731
filas = lambda s: c.execute(s).fetchall()  # noqa: E731

c.execute("""create view l as
  select p.pedido_id, cast(p.fecha as date) f, p.tienda_id, p.cliente_id, p.canal, p.campana_id, p.estatus,
         x.producto_id, x.cantidad * x.precio_unitario * (1 - x.descuento_pct) vn, x.cantidad * x.costo_unitario co
  from pedidos p join lineas_pedido x on x.pedido_id = p.pedido_id""")
c.execute("create view ok as select * from l where estatus = 'Completado'")
c.execute("create view ok9 as select *, year(f) a from ok where month(f) <= 9")
d = {}

# ---------- Foto ene–sep ----------
for a in (2025, 2026):
    d[f"ventas_{a}"] = uno(f"select sum(vn) from ok9 where a = {a}")
    d[f"margen_{a}"] = uno(f"select 100 * (sum(vn) - sum(co)) / sum(vn) from ok9 where a = {a}")
    d[f"pedidos_{a}"] = uno(f"select count(distinct pedido_id) from ok9 where a = {a}")
    d[f"ticket_{a}"] = d[f"ventas_{a}"] / d[f"pedidos_{a}"]
    d[f"activos_{a}"] = uno(f"select count(distinct cliente_id) from ok9 where a = {a}")
    d[f"frecuencia_{a}"] = d[f"pedidos_{a}"] / d[f"activos_{a}"]
    d[f"ecommerce_pct_{a}"] = uno(f"select 100 * sum(vn) filter (where canal = 'E-commerce') / sum(vn) from ok9 where a = {a}")
pct = lambda x, y: 100 * (x / y - 1)  # noqa: E731
d["ventas_var"] = pct(d["ventas_2026"], d["ventas_2025"])
d["margen_pp"] = d["margen_2026"] - d["margen_2025"]
d["pedidos_var"] = pct(d["pedidos_2026"], d["pedidos_2025"])
d["ticket_var"] = pct(d["ticket_2026"], d["ticket_2025"])
d["activos_var"] = pct(d["activos_2026"], d["activos_2025"])
d["frecuencia_var"] = pct(d["frecuencia_2026"], d["frecuencia_2025"])
# Comparables: abiertas antes del 1-ene del año anterior al corte (2025-01-01), recalculado aquí desde tiendas.csv.
comp = "select tienda_id from tiendas where cast(fecha_apertura as date) < date '2025-01-01'"
d["comparables_n"] = uno(f"select count(*) from ({comp})")
v = {a: uno(f"select sum(vn) from ok9 where a = {a} and tienda_id in ({comp})") for a in (2025, 2026)}
d["comparables_var"] = pct(v[2026], v[2025])
d["bajo_reorden"] = uno("select count(*) from inventario where existencias < punto_reorden")
d["combinaciones"] = uno("select count(*) from inventario")

# ---------- Catálogo ----------
d["devolucion_2026"] = uno("select 100.0 * count(*) filter (where estatus = 'Devuelto') / count(*) from pedidos where year(cast(fecha as date)) = 2026 and month(cast(fecha as date)) <= 9")
d["devolucion_total"] = uno("select 100.0 * count(*) filter (where estatus = 'Devuelto') / count(*) from pedidos")
# ROAS incremental: ventas de la ventana menos baseline (promedio diario de los días −21 a −8 × días de campaña).
for cid, nombre in filas("select campana_id, nombre from campanas"):
    inicio, fin, inversion = c.execute(f"select cast(inicio as date), cast(fin as date), inversion_mxn from campanas where campana_id = '{cid}'").fetchone()
    ventana = uno(f"select sum(vn) from ok where f between date '{inicio}' and date '{fin}'")
    diario = uno(f"select avg(s) from (select f, sum(vn) s from ok where f between date '{inicio}' - 21 and date '{inicio}' - 8 group by f)")
    dias = (fin - inicio).days + 1
    d[f"roas_{cid}"] = (ventana - diario * dias) / inversion
# Clientes por mes de compra (cliente-mes), primera compra y estado, reconstruidos desde pedidos.
c.execute("create view cm as select cliente_id, date_trunc('month', f) mes, count(distinct pedido_id) ped, sum(vn) vn from ok group by 1, 2")
c.execute("create view pri as select cliente_id, min(mes) cohorte from cm group by 1")
base = "date '2025-01-01'"
d["base_inicial"] = uno(f"select count(*) from pri where cohorte = {base}")
d["nuevos_2026"] = uno("select count(*) from pri where cohorte between date '2026-01-01' and date '2026-09-01'")
d["recurrentes_2026"] = d["activos_2026"] - d["nuevos_2026"]
# Reactivados y perdidos, sumados mes a mes (ene–sep 2026).
c.execute("""create view est as select a.cliente_id, a.mes,
  exists (select 1 from cm b where b.cliente_id = a.cliente_id and b.mes = a.mes - interval 1 month) compro_antes,
  (select cohorte from pri where pri.cliente_id = a.cliente_id) cohorte from cm a""")
d["reactivados_2026"] = uno("select count(*) from est where mes between date '2026-01-01' and date '2026-09-01' and not compro_antes and mes <> cohorte")
d["perdidos_2026"] = uno("""select count(*) from cm a where a.mes between date '2025-12-01' and date '2026-08-01'
  and not exists (select 1 from cm b where b.cliente_id = a.cliente_id and b.mes = a.mes + interval 1 month)""")
# Retención M+3: de la cohorte (sin base inicial), cuántos compran en alguno de los 3 meses siguientes; solo
# cohortes con 3 meses completos observados (cohorte + 3 ≤ septiembre 2026). Por origen de adquisición.
c.execute("create view org as select cliente_id, case when campana_adquisicion is null then 'Orgánico' else 'Campaña' end origen from clientes")
c.execute(f"""create view ret as select p.cliente_id, o.origen,
  exists (select 1 from cm b where b.cliente_id = p.cliente_id and b.mes between p.cohorte + interval 1 month and p.cohorte + interval 3 month) volvio
  from pri p join org o using (cliente_id) where p.cohorte > {base} and p.cohorte + interval 3 month <= date '2026-09-01'""")
d["retencion_m3"] = uno("select 100.0 * count(*) filter (where volvio) / count(*) from ret")
for o, k in (("Campaña", "campana"), ("Orgánico", "organico")):
    d[f"retencion_m3_{k}"] = uno(f"select 100.0 * count(*) filter (where volvio) / count(*) from ret where origen = '{o}'")
    # Valor en los primeros 6 meses (mes de alta + 5), cohortes con 6 meses observados.
    d[f"valor_6m_{k}"] = uno(f"""select sum(cm.vn) / count(distinct p.cliente_id) from pri p join org o using (cliente_id)
      left join cm on cm.cliente_id = p.cliente_id and cm.mes between p.cohorte and p.cohorte + interval 5 month
      where o.origen = '{o}' and p.cohorte > {base} and p.cohorte + interval 5 month <= date '2026-09-01'""")
    # Segundo intento honesto: solo cohortes con seis meses COMPLETOS después del mes de alta (alta ≤ marzo 2026).
    d[f"valor_6m_{k}_v2"] = uno(f"""select sum(cm.vn) / count(distinct p.cliente_id) from pri p join org o using (cliente_id)
      left join cm on cm.cliente_id = p.cliente_id and cm.mes between p.cohorte and p.cohorte + interval 5 month
      where o.origen = '{o}' and p.cohorte > {base} and p.cohorte <= date '2026-03-01'""")
d["retencion_m3_cohortes_2026"] = uno("select 100.0 * count(*) filter (where volvio) / count(*) from ret r join pri using (cliente_id) where pri.cohorte >= date '2026-01-01'")
d["nuevos_campana_pct_2026"] = uno("""select 100.0 * count(*) filter (where o.origen = 'Campaña') / count(*) from pri p join org o using (cliente_id)
  where p.cohorte between date '2026-01-01' and date '2026-09-01'""")
d["nuevos_campana_pct_total"] = uno(f"select 100.0 * count(*) filter (where o.origen = 'Campaña') / count(*) from pri p join org o using (cliente_id) where p.cohorte > {base}")

# ---------- Growth por área ----------
# Establecidos: primera compra antes de abril de 2025. Meses con compra en abr–sep de cada año, por tienda preferida,
# promediados sobre quienes compraron al menos una vez en la ventana; días entre compras = brecha media entre una
# compra de la ventana y la anterior del mismo cliente.
c.execute("create view tp as select cliente_id, tienda_preferida from clientes")
for tid in ("MER-01", "OAX-01"):
    w = {}
    for a in (2025, 2026):
        w[a] = uno(f"""select avg(n) from (select cm.cliente_id, count(*) n from cm join pri using (cliente_id) join tp using (cliente_id)
          where pri.cohorte < date '2025-04-01' and tp.tienda_preferida = '{tid}'
            and cm.mes between date '{a}-04-01' and date '{a}-09-01' group by 1)""")
        d[f"dias_entre_{tid}_{a}"] = uno(f"""select avg(g) from (select f, f - lag(f) over (partition by cliente_id order by f) g
          from (select distinct x.cliente_id, x.f from ok x join pri using (cliente_id) join tp using (cliente_id)
                where pri.cohorte < date '2025-04-01' and tp.tienda_preferida = '{tid}'))
          where g is not null and f between date '{a}-04-01' and date '{a}-09-30'""")
    d[f"meses_compra_var_{tid}"] = pct(w[2026], w[2025])
for nombre in ("Tampico", "Polanco", "Mérida", "Oaxaca"):
    tid = uno(f"select tienda_id from tiendas where nombre = '{nombre}'")
    v = {a: uno(f"select sum(vn) from ok9 where a = {a} and tienda_id = '{tid}'") for a in (2025, 2026)}
    d[f"crec_{tid}"] = pct(v[2026], v[2025])
    d[f"bajo_reorden_{tid}"] = uno(f"select count(*) from inventario where tienda_id = '{tid}' and existencias < punto_reorden")

# ---------- Hallazgos ----------
for reg in ("Occidente", "Centro", "Sureste"):
    v = {a: uno(f"select sum(vn) from ok9 join tiendas t using (tienda_id) where a = {a} and t.region = '{reg}'") for a in (2025, 2026)}
    d[f"crec_region_{reg}"] = pct(v[2026], v[2025])
d["mayoreo_pedidos_pct"] = uno("select 100.0 * count(distinct pedido_id) filter (where canal = 'Mayoreo') / count(distinct pedido_id) from ok9 where a = 2026")
d["mayoreo_ventas_pct"] = uno("select 100 * sum(vn) filter (where canal = 'Mayoreo') / sum(vn) from ok9 where a = 2026")
v = {a: uno(f"select sum(vn) from ok9 where a = {a} and canal = 'E-commerce'") for a in (2025, 2026)}
d["ecommerce_var"] = pct(v[2026], v[2025])
for cat in ("Cuidado personal", "Limpieza", "Lácteos", "Frescos"):
    d[f"margen_cat_{cat}"] = uno(f"select 100 * (sum(vn) - sum(co)) / sum(vn) from ok9 join productos p using (producto_id) where a = 2026 and p.categoria = '{cat}'")
d["julio_dias_campana_pct"] = uno("""select 100.0 * count(*) filter (where exists (select 1 from campanas k where d.dia between cast(k.inicio as date) and cast(k.fin as date))) / count(*)
  from (select unnest(range(date '2026-07-01', date '2026-08-01', interval 1 day))::date dia) d""")
m = {mes: uno(f"select 100 * (sum(vn) - sum(co)) / sum(vn) from ok where date_trunc('month', f) = date '{mes}'") for mes in ("2026-06-01", "2026-07-01", "2025-07-01")}
v = {a: uno(f"select sum(vn) from ok where date_trunc('month', f) = date '{a}-07-01'") for a in (2025, 2026)}
d["ventas_var_julio"] = pct(v[2026], v[2025])
d["julio_margen_vs_junio_pp"] = m["2026-07-01"] - m["2026-06-01"]
d["julio_margen_vs_julio25_pp"] = m["2026-07-01"] - m["2025-07-01"]

print(json.dumps({k: (float(x) if x is not None else None) for k, x in d.items()}, ensure_ascii=False))
