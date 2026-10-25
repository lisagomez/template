"""MetricFlow caliente detrás del puerto semántico del Estudio.

Por qué existe: `mf query` por CLI paga ~3 s de arranque por consulta (medido el 2026-10-20 sobre golfo_norte:
3.0 s de pared para una consulta que MetricFlow resuelve en 0.10 s). Con el motor vivo en un proceso, la consulta
cuesta lo que cuesta el SQL. Es un adaptador, no el núcleo: el núcleo (TypeScript) habla con él por el puerto
`PuertoSemantico` y no sabe que existe Python.

Protocolo: una petición JSON por línea en stdin, una respuesta JSON por línea en stdout. Nada sale a la red: el
motor de MetricFlow solo registra en el log de Python (sin manejador remoto), y dbt corre con
DBT_SEND_ANONYMOUS_USAGE_STATS=false y DO_NOT_TRACK=1, que pone quien lanza este proceso.

    {"id": 1, "op": "catalogo"}
    {"id": 2, "op": "valores", "metricas": ["ventas_netas"], "dimension": "tienda__region"}
    {"id": 3, "op": "consulta", "metricas": [...], "agrupar": [...], "donde": [...], "orden": [...], "limite": 500}

`donde` llega YA construido por el adaptador de TypeScript desde filtros estructurados y validados contra el
catálogo (dimensión conocida, valores del dominio, comillas escapadas). Este proceso no acepta SQL: solo la
plantilla de filtros de MetricFlow, que MetricFlow compila.

Uso:  servidor_mf.py <dir del proyecto dbt> <dir de profiles.yml>
"""
import datetime
import decimal
import hashlib
import json
import logging
import os
import pathlib
import sys
import time

logging.disable(logging.CRITICAL)

from dbt_metricflow.cli.cli_configuration import CLIConfiguration  # noqa: E402
from metricflow.engine.metricflow_engine import MetricFlowQueryRequest  # noqa: E402

PROYECTO = pathlib.Path(sys.argv[1]).resolve()
PERFILES = pathlib.Path(sys.argv[2]).resolve()
MAX_FILAS = 5000


def _valor(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()[:10]
    if isinstance(v, decimal.Decimal):
        return float(v)
    return v


def _meta_de_manifiesto():
    """`meta` (dueño, unidad) vive en target/manifest.json, no en el semantic manifest: se toma de ahí."""
    ruta = PROYECTO / "target" / "manifest.json"
    if not ruta.exists():
        return {}
    m = json.loads(ruta.read_text())
    salida = {}
    for nodo in m.get("metrics", {}).values():
        meta = dict(nodo.get("meta") or {})
        meta.update((nodo.get("config") or {}).get("meta") or {})
        salida[nodo["name"]] = meta
    return salida


def _entrada(x):
    return {
        "nombre": x.name,
        "alias": getattr(x, "alias", None),
        "desfase": str(x.offset_window) if getattr(x, "offset_window", None) else None,
    }


def _medidas():
    """Agregación y no-aditividad de cada medida, del semantic manifest (la especificación abierta de MetricFlow)."""
    ruta = PROYECTO / "target" / "semantic_manifest.json"
    if not ruta.exists():
        return {}
    salida = {}
    for modelo in json.loads(ruta.read_text()).get("semantic_models", []):
        for medida in modelo.get("measures", []):
            nad = medida.get("non_additive_dimension")
            salida[medida["name"]] = {"agg": medida.get("agg"), "no_aditiva": nad["name"] if nad else None}
    return salida


def _catalogo(mf):
    meta = _meta_de_manifiesto()
    medidas = _medidas()
    metricas = []
    for m in mf.list_metrics(include_dimensions=True):
        tp = m.type_params
        medida = tp.measure.name if getattr(tp, "measure", None) else None
        dims = []
        for d in m.dimensions:
            tipo = str(d.type.value if hasattr(d.type, "value") else d.type).lower()
            dims.append({"nombre": d.dunder_name, "tipo": "tiempo" if tipo == "time" else "categorica", "etiqueta": d.label})
        metricas.append({
            "nombre": m.name,
            "etiqueta": m.label,
            "descripcion": m.description or "",
            "tipo": str(m.type.value if hasattr(m.type, "value") else m.type).lower(),
            "expr": getattr(tp, "expr", None),
            "medida": medida,
            "numerador": tp.numerator.name if getattr(tp, "numerator", None) else None,
            "denominador": tp.denominator.name if getattr(tp, "denominator", None) else None,
            "entradas": [_entrada(x) for x in (tp.metrics or [])],
            "filtro": [w.where_sql_template for w in m.filter.where_filters] if m.filter else [],
            "meta": meta.get(m.name, {}),
            "agregacion": medidas.get(medida, {}).get("agg") if medida else None,
            "noAditivaEn": medidas.get(medida, {}).get("no_aditiva") if medida else None,
            "dimensiones": sorted(dims, key=lambda d: d["nombre"]),
        })
    huella = PROYECTO / "target" / "semantic_manifest.json"
    version = hashlib.sha256(huella.read_bytes()).hexdigest()[:16] if huella.exists() else "sin-manifiesto"
    return {"version": version, "metricas": sorted(metricas, key=lambda m: m["nombre"])}


def _consulta(mf, p):
    limite = min(int(p.get("limite") or MAX_FILAS), MAX_FILAS)
    req = MetricFlowQueryRequest.create(
        metric_names=p["metricas"],
        group_by_names=p.get("agrupar") or None,
        where_constraints=p.get("donde") or None,
        order_by_names=p.get("orden") or None,
        limit=limite + 1,
    )
    t = time.perf_counter()
    r = mf.query(req)
    ms = (time.perf_counter() - t) * 1000
    tabla = r.result_df
    filas = [[_valor(v) for v in fila] for fila in tabla.rows]
    if not p.get("orden"):
        # Sin ORDER BY el motor no garantiza orden: se ordena por las columnas de agrupación para que la misma
        # consulta dé siempre las mismas filas en el mismo orden (caché, versiones y paridad del CLI).
        n = len(p.get("agrupar") or [])
        filas.sort(key=lambda f: [("" if x is None else str(x)) for x in f[:n]])
    sql = mf.explain(req).sql_statement.sql if p.get("explicar", True) else None
    return {
        "columnas": list(tabla.column_names),
        "filas": filas[:limite],
        "truncada": len(filas) > limite,
        "sql": sql,
        "ms": round(ms, 1),
    }


def principal():
    t = time.perf_counter()
    cfg = CLIConfiguration()
    cfg.setup(dbt_profiles_path=PERFILES, dbt_project_path=PROYECTO, configure_file_logging=False)
    mf = cfg.mf
    mf.list_metrics(include_dimensions=False)
    print(json.dumps({"listo": True, "ms": round((time.perf_counter() - t) * 1000)}), flush=True)
    for linea in sys.stdin:
        if not linea.strip():
            continue
        p = {}
        try:
            p = json.loads(linea)
            op = p.get("op")
            if op == "catalogo":
                res = _catalogo(mf)
            elif op == "valores":
                res = {"valores": mf.get_dimension_values(metric_names=p["metricas"], get_group_by_values=p["dimension"])}
            elif op == "consulta":
                res = _consulta(mf, p)
            else:
                raise ValueError(f"operación desconocida: {op!r}")
            print(json.dumps({"id": p.get("id"), "ok": True, **res}, default=str), flush=True)
        except Exception as e:  # el error vuelve al adaptador, que lo convierte en falla de la capa
            mensaje = f"{type(e).__name__}: {e}".replace(os.environ.get("HOME", "~"), "~")[:2000]
            print(json.dumps({"id": p.get("id"), "ok": False, "error": mensaje}), flush=True)


if __name__ == "__main__":
    principal()
