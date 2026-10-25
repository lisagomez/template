"""Reasigna cliente_id en pedidos con un modelo de ciclo de vida (adquisición, frecuencia, abandono).
Señales sembradas para que el agente de growth las detecte:
  1. Sureste (Mérida, Oaxaca) 2026: los clientes existentes regresan menos seguido.
  2. Clientes adquiridos en campañas con descuento abandonan más rápido.
  3. Clientes adquiridos por e-commerce retienen mejor y compran más.
"""
import numpy as np, pandas as pd, sys
D = sys.argv[1] if len(sys.argv) > 1 else "data/raw"
rng = np.random.default_rng(7)
ped = pd.read_csv(f"{D}/pedidos.csv", parse_dates=["fecha"])
tiendas = pd.read_csv(f"{D}/tiendas.csv")
camp = pd.read_csv(f"{D}/campanas.csv", parse_dates=["inicio", "fin"])
ped["mes"] = ped.fecha.dt.to_period("M")
meses = sorted(ped.mes.unique())

camp_mes = {}
for _, c in camp.iterrows():
    for m in pd.period_range(c.inicio, c.fin, freq="M"): camp_mes[m] = c.campana_id

clientes = []          # dicts
next_id = 1
asign = np.empty(len(ped), dtype=object)
F_BASE = 1.55          # pedidos por cliente activo por mes (B2C)
for tid in tiendas.tienda_id:
    pool = []          # índices a clientes activos de esta tienda
    sel_t = ped.tienda_id.values == tid
    for m in meses:
        idx = np.where(sel_t & (ped.mes.values == m))[0]
        if len(idx) == 0: continue
        weak = tid in ("MER-01", "OAX-01") and m.year == 2026
        # 1) abandono del mes
        keep = []
        for ci in pool:
            c = clientes[ci]
            s = c["superv"] - (0.05 if weak else 0)
            if rng.random() < s: keep.append(ci)
            else: c["baja"] = str(m)
        pool = keep
        # 2) adquisición
        f = F_BASE * (0.78 if weak else 1.0)
        objetivo = len(idx) / f
        en_camp = camp_mes.get(m)
        nuevos = int(max(objetivo - len(pool), 0.05 * objetivo) * (1.5 if en_camp else 1.0))
        canales_mes = ped.canal.values[idx]
        p_ecom = (canales_mes == "E-commerce").mean()
        nuevos_idx = []
        for _ in range(nuevos):
            seg = rng.choice(["Hogar", "Negocio", "Mayorista"], p=[0.85, 0.12, 0.03])
            ecom = rng.random() < p_ecom * 1.3
            superv = 0.90
            if en_camp: superv -= 0.08
            if ecom: superv += 0.04
            if seg != "Hogar": superv += 0.04
            w = rng.lognormal(0, 0.5) * (1.35 if ecom else 1.0) * (0.85 if en_camp else 1.0)
            clientes.append(dict(cliente_id=f"C{next_id:06d}", tienda_preferida=tid, segmento=seg, superv=min(superv, 0.985),
                                 w=w, campana_adquisicion=en_camp if en_camp else "", canal_pref="E-commerce" if ecom else "Tienda",
                                 baja=""))
            nuevos_idx.append(len(clientes) - 1); next_id += 1
        pool += nuevos_idx
        # 3) asignación de pedidos: cada nuevo recibe su primer pedido, el resto ponderado
        orden = rng.permutation(idx)
        b2b = np.array([clientes[ci]["segmento"] != "Hogar" for ci in pool])
        ecomc = np.array([clientes[ci]["canal_pref"] == "E-commerce" for ci in pool])
        w = np.array([clientes[ci]["w"] for ci in pool])
        if weak:  # los antiguos compran menos seguido, los nuevos sostienen la tienda
            antiguos = np.array([ci not in set(nuevos_idx) for ci in pool]); w = np.where(antiguos, w * 0.6, w)
        nuevos_set = list(range(len(pool) - len(nuevos_idx), len(pool)))
        k = 0
        for j in nuevos_set:
            if k >= len(orden): break
            # elegir un pedido de su canal si existe
            asign[orden[k]] = clientes[pool[j]]["cliente_id"]; k += 1
        resto = orden[k:]
        chs = ped.canal.values[resto]
        ids = np.array([clientes[ci]["cliente_id"] for ci in pool], dtype=object)
        for ch, ww in (("Mayoreo", np.where(b2b, w * 4, w * 0.02)), ("E-commerce", np.where(ecomc, w * 3, w)), ("Tienda", np.where(ecomc, w * 0.6, w))):
            sel = resto[chs == ch]
            if len(sel): asign[sel] = ids[rng.choice(len(pool), size=len(sel), p=ww / ww.sum())]
    print(tid, "clientes:", sum(1 for c in clientes if c["tienda_preferida"] == tid))

ped["cliente_id"] = asign
cl = pd.DataFrame(clientes)
first = ped.groupby("cliente_id").agg(fecha_alta=("fecha", "min")).reset_index()
canal1 = ped.sort_values("fecha").groupby("cliente_id").canal.first().rename("canal_adquisicion").reset_index()
cl = cl.merge(first, on="cliente_id").merge(canal1, on="cliente_id")
cl = cl[["cliente_id", "segmento", "tienda_preferida", "fecha_alta", "canal_adquisicion", "campana_adquisicion"]]
cl["fecha_alta"] = cl.fecha_alta.dt.date
ped.drop(columns="mes").to_csv(f"{D}/pedidos.csv", index=False)
cl.to_csv(f"{D}/clientes.csv", index=False)
print("clientes", len(cl), "pedidos", len(ped))
