"""Genera datos dummy para 'Distribuidora Golfo Norte' (empresa ficticia)."""
import numpy as np, pandas as pd, json, os
rng = np.random.default_rng(42)
OUT = "data/raw"
os.makedirs(OUT, exist_ok=True)

# ---- Tiendas (ciudades reales de México, coordenadas aproximadas) ----
ciudades = [
    ("VER-01","Veracruz Centro","Veracruz","Golfo",19.1738,-96.1342,1.25),
    ("VER-02","Boca del Río","Veracruz","Golfo",19.1046,-96.1035,1.30),
    ("VER-03","Xalapa","Veracruz","Golfo",19.5438,-96.9102,1.05),
    ("VER-04","Coatzacoalcos","Veracruz","Golfo",18.1345,-94.4590,0.90),
    ("VER-05","Poza Rica","Veracruz","Golfo",20.5332,-97.4594,0.80),
    ("TAB-01","Villahermosa","Tabasco","Golfo",17.9895,-92.9475,1.10),
    ("TAM-01","Tampico","Tamaulipas","Golfo",22.2331,-97.8611,1.00),
    ("CDMX-01","Polanco","Ciudad de México","Centro",19.4326,-99.1915,1.60),
    ("CDMX-02","Coyoacán","Ciudad de México","Centro",19.3467,-99.1617,1.40),
    ("PUE-01","Puebla Angelópolis","Puebla","Centro",19.0414,-98.2063,1.15),
    ("QRO-01","Querétaro","Querétaro","Centro",20.5888,-100.3899,1.10),
    ("MTY-01","San Pedro","Nuevo León","Norte",25.6573,-100.4028,1.45),
    ("MTY-02","Monterrey Centro","Nuevo León","Norte",25.6866,-100.3161,1.20),
    ("CHI-01","Chihuahua","Chihuahua","Norte",28.6320,-106.0691,0.85),
    ("SAL-01","Saltillo","Coahuila","Norte",25.4383,-100.9737,0.90),
    ("GDL-01","Guadalajara Providencia","Jalisco","Occidente",20.6767,-103.3475,1.35),
    ("GDL-02","Zapopan","Jalisco","Occidente",20.7214,-103.3918,1.15),
    ("MOR-01","Morelia","Michoacán","Occidente",19.7060,-101.1950,0.85),
    ("MER-01","Mérida","Yucatán","Sureste",20.9674,-89.5926,1.10),
    ("CUN-01","Cancún","Quintana Roo","Sureste",21.1619,-86.8515,1.20),
    ("OAX-01","Oaxaca","Oaxaca","Sureste",17.0732,-96.7266,0.70),
]
tiendas = pd.DataFrame(ciudades, columns=["tienda_id","nombre","estado","region","lat","lon","factor"])
tiendas["fecha_apertura"] = pd.to_datetime("2018-01-01") + pd.to_timedelta(rng.integers(0, 2200, len(tiendas)), unit="D")
tiendas["m2"] = rng.integers(350, 1400, len(tiendas))
tiendas.loc[tiendas.tienda_id=="CUN-01","fecha_apertura"] = pd.Timestamp("2025-03-15")
tiendas.loc[tiendas.tienda_id=="QRO-01","fecha_apertura"] = pd.Timestamp("2025-06-01")

# ---- Productos ----
cats = {
    "Abarrotes":   (["Arroz 1kg","Frijol negro 1kg","Aceite 1L","Azúcar 2kg","Café molido 400g","Atún lata","Pasta 500g","Harina maíz 1kg"], (25,140), 0.22),
    "Bebidas":     (["Agua 6L","Refresco cola 3L","Jugo naranja 1L","Cerveza 6-pack","Agua mineral 2L","Bebida isotónica"], (18,190), 0.28),
    "Lácteos":     (["Leche entera 1L","Yogur natural","Queso fresco 400g","Crema 450ml","Mantequilla 90g"], (20,95), 0.18),
    "Limpieza":    (["Detergente 3kg","Cloro 2L","Jabón trastes","Papel higiénico 12","Suavizante 3L"], (30,210), 0.34),
    "Cuidado personal": (["Shampoo 750ml","Pasta dental","Desodorante","Jabón tocador 3","Crema corporal"], (28,160), 0.38),
    "Frescos":     (["Plátano kg","Jitomate kg","Pollo kg","Tortilla kg","Aguacate kg","Huevo 30"], (22,150), 0.15),
}
rows=[]; pid=1
for cat,(items,(lo,hi),margen) in cats.items():
    for it in items:
        precio = round(rng.uniform(lo,hi),2)
        rows.append((f"P{pid:03d}", it, cat, precio, round(precio*(1-margen-rng.uniform(-0.04,0.04)),2)))
        pid+=1
productos = pd.DataFrame(rows, columns=["producto_id","nombre","categoria","precio_lista","costo_unitario"])

# ---- Clientes ----
N_CLI = 6000
clientes = pd.DataFrame({
    "cliente_id":[f"C{i:05d}" for i in range(1,N_CLI+1)],
    "segmento": rng.choice(["Hogar","Negocio","Mayorista"], N_CLI, p=[0.78,0.18,0.04]),
    "tienda_preferida": rng.choice(tiendas.tienda_id, N_CLI, p=(tiendas.factor/tiendas.factor.sum()).values),
    "fecha_alta": pd.to_datetime("2023-01-01")+pd.to_timedelta(rng.integers(0,1350,N_CLI),unit="D"),
})

# ---- Campañas ----
campanas = pd.DataFrame([
    ("CMP-01","Buen Fin 2025","Meta Ads","2025-11-14","2025-11-17",420000),
    ("CMP-02","Regreso a clases","Google Ads","2025-08-04","2025-08-24",180000),
    ("CMP-03","Navidad 2025","Meta Ads","2025-12-10","2025-12-24",350000),
    ("CMP-04","Hot Sale 2026","Google Ads","2026-05-25","2026-06-02",310000),
    ("CMP-05","Verano Bebidas","TikTok Ads","2026-07-01","2026-07-31",220000),
    ("CMP-06","Fiestas Patrias","Meta Ads","2026-09-08","2026-09-16",160000),
], columns=["campana_id","nombre","plataforma","inicio","fin","inversion_mxn"])

# ---- Pedidos y líneas (ene-2025 a sep-2026) ----
dias = pd.date_range("2025-01-01","2026-09-30",freq="D")
season = {1:0.85,2:0.82,3:0.92,4:0.95,5:1.05,6:1.0,7:1.08,8:1.02,9:0.97,10:1.0,11:1.22,12:1.38}
canales = ["Tienda","E-commerce","Mayoreo"]
orders=[]; lines=[]; oid=1
camp_days = {}
for _,c in campanas.iterrows():
    for d in pd.date_range(c.inicio,c.fin): camp_days[d]=c.campana_id
prod_w = np.ones(len(productos)); prod_w[productos.categoria=="Bebidas"]*=1.6; prod_w[productos.categoria=="Frescos"]*=1.4
prod_w/=prod_w.sum()
P_ID=productos.producto_id.values; P_PR=productos.precio_lista.values; P_CO=productos.costo_unitario.values
cli_by_store = clientes.groupby("tienda_preferida").cliente_id.apply(list).to_dict()
for d in dias:
    trend = 1 + 0.12*((d - dias[0]).days/365)
    dow = 1.25 if d.dayofweek>=5 else 1.0
    camp = camp_days.get(d)
    boost = 1.35 if camp else 1.0
    for t in tiendas.itertuples():
        if d < t.fecha_apertura: continue
        lam = 9*t.factor*season[d.month]*trend*dow*boost
        n = rng.poisson(lam)
        for _ in range(n):
            # e-commerce crece más rápido
            p_ecom = 0.12 + 0.10*((d-dias[0]).days/len(dias))
            canal = rng.choice(canales, p=[0.96-p_ecom, p_ecom, 0.04])
            cli = rng.choice(cli_by_store.get(t.tienda_id, clientes.cliente_id.tolist()))
            nlin = rng.integers(1,6) if canal!="Mayoreo" else rng.integers(4,10)
            pids = rng.choice(len(productos), nlin, replace=False, p=prod_w)
            desc = 0.10 if camp else (0.03 if rng.random()<0.2 else 0.0)
            orders.append((f"O{oid:07d}", d.date(), t.tienda_id, cli, canal, camp))
            for pi in pids:
                qty = int(rng.integers(1,4) * (rng.integers(5,20) if canal=="Mayoreo" else 1))
                lines.append((f"O{oid:07d}", P_ID[pi], qty, P_PR[pi], desc, P_CO[pi]))
            oid+=1
pedidos = pd.DataFrame(orders, columns=["pedido_id","fecha","tienda_id","cliente_id","canal","campana_id"])
lineas = pd.DataFrame(lines, columns=["pedido_id","producto_id","cantidad","precio_unitario","descuento_pct","costo_unitario"])
# devoluciones ~2.5%
pedidos["estatus"] = np.where(rng.random(len(pedidos))<0.025,"Devuelto","Completado")

# ---- Inventario snapshot (30-sep-2026) ----
inv=[]
for _,t in tiendas.iterrows():
    for _,p in productos.iterrows():
        inv.append((t.tienda_id,p.producto_id,int(rng.integers(0,260)),int(rng.integers(20,60))))
inventario = pd.DataFrame(inv, columns=["tienda_id","producto_id","existencias","punto_reorden"])
inventario["fecha_corte"]="2026-09-30"

for name,df in [("tiendas",tiendas.drop(columns="factor")),("productos",productos),("clientes",clientes),
                ("campanas",campanas),("pedidos",pedidos),("lineas_pedido",lineas),("inventario",inventario)]:
    df.to_csv(f"{OUT}/{name}.csv", index=False)
    print(name, len(df))
