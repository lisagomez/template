#!/usr/bin/env python3
"""GRAFO → PLAN — el compilador de topología a orquestación (cierra el hueco del metagrafo, 21 jul).

EL HUECO QUE CIERRA: el GRAFO DEL SISTEMA decía QUIÉN conecta con QUIÉN, pero derivar la
orquestación (qué corre en paralelo, en qué orden, con qué gates) era juicio del ejecutor leyendo
el spec. Este script lo vuelve DETERMINISTA: mapa y máquina, una sola pluma.

QUÉ HACE: lee un grafo en el schema conectoma (nodos = artefactos, aristas = transformaciones
tipadas script/agente/manual/mixta, lazos = comparadores sobre nodos/aristas) y deriva el PLAN:

  - FASES por orden topológico (capa de un artefacto = 1 + máx capa de sus insumos).
  - Dentro de una fase, transformaciones hacia ARTEFACTOS DISTINTOS = PARALELIZABLES
    (la regla de oro: dos agentes coexisten si escriben nodos disjuntos y se hablan por aristas).
  - Varias aristas al MISMO artefacto = convergencia (se marca: van al mismo worker/merge).
  - Los LAZOS se montan como GATES: al cerrar la fase que produce su nodo/arista anclada.
  - Tipos → ejecutores: script = correr determinista · agente = spawnear subagente (Sonnet) ·
    manual = checkpoint de Daniel · mixta = agente con scripts.

USO:
  python3 grafo2plan.py GRAFO.json [-o plan.md] [--json plan.json]
  # GRAFO.json = schema conectoma (arbrain/public/conectoma/README.md) o un GRAFO DEL SISTEMA
  #              exportado del spec con el mismo shape.

Validado contra el grafo real de edicion-de-video: deriva solo que el carril de CORTE y el de
DISEÑO corren en paralelo y convergen en timeline.json — exactamente lo que pasó en producción.
"""
import json, sys, argparse
from collections import defaultdict

EJECUTOR = {
    "script": "▸ correr script (determinista)",
    "agente": "◆ spawnear subagente (Sonnet)",
    "manual": "⏸ checkpoint de Daniel",
    "mixta": "◆ subagente con scripts",
}


def compilar(G):
    nodos = {n["id"]: n for n in G["nodos"]}
    aristas = G["aristas"]
    lazos = G.get("lazos", [])

    entradas = defaultdict(list)   # nodo <- aristas que lo producen
    for a in aristas:
        if a["from"] not in nodos or a["to"] not in nodos:
            sys.exit(f"✗ arista '{a['id']}' referencia nodos inexistentes")
        entradas[a["to"]].append(a)

    # capa de cada nodo = 1 + max(capa de sus fuentes); raíces = 0. Con guard de ciclos.
    capa, visitando = {}, set()

    def capa_de(nid):
        if nid in capa:
            return capa[nid]
        if nid in visitando:
            sys.exit(f"✗ CICLO detectado pasando por '{nid}' — un plan exige DAG (los ciclos van como LAZOS, no aristas)")
        visitando.add(nid)
        c = 0 if not entradas[nid] else 1 + max(capa_de(a["from"]) for a in entradas[nid])
        visitando.discard(nid)
        capa[nid] = c
        return c

    for nid in nodos:
        capa_de(nid)

    # fase de una TRANSFORMACIÓN = capa de su artefacto destino
    fases = defaultdict(list)
    for a in aristas:
        fases[capa[a["to"]]].append(a)

    # lazos anclados: gate se corre al cerrar la fase que produce su ancla
    gates = defaultdict(list)
    ar_by_id = {a["id"]: a for a in aristas}
    for l in lazos:
        kind, ref = str(l.get("sobre", "")).split(":") if ":" in str(l.get("sobre", "")) else (None, None)
        if kind == "nodo" and ref in capa:
            gates[capa[ref]].append(l)
        elif kind == "arista" and ref in ar_by_id:
            gates[capa[ar_by_id[ref]["to"]]].append(l)

    plan = []
    for f in sorted(k for k in fases if k > 0):
        ts = fases[f]
        destinos = defaultdict(list)
        for a in ts:
            destinos[a["to"]].append(a)
        grupos = []
        for dest, arls in destinos.items():
            grupos.append({
                "produce": dest,
                "produce_label": nodos[dest]["label"],
                "transformaciones": [
                    {"id": a["id"], "label": a["label"], "tipo": a["tipo"],
                     "desde": nodos[a["from"]]["label"], "ejecutor": EJECUTOR.get(a["tipo"], a["tipo"])}
                    for a in arls
                ],
                "convergencia": len(arls) > 1,
            })
        plan.append({
            "fase": f,
            "paralelizable": len(grupos) > 1,
            "grupos": grupos,
            "gates": [{"id": l["id"], "label": l["label"], "estado": l.get("estado", ""),
                       "referencia": l.get("referencia", "")} for l in gates.get(f, [])],
        })
    return plan


def render_md(G, plan):
    out = [f"# Plan de orquestación — {G['titulo']}",
           f"\n> Derivado DETERMINISTA del grafo `{G['slug']}` por grafo2plan.py — no es juicio, es topología.",
           "> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;",
           "> los gates de la fase se corren ANTES de avanzar a la siguiente.\n"]
    for p in plan:
        par = " · ⚡ GRUPOS EN PARALELO" if p["paralelizable"] else ""
        out.append(f"## Fase {p['fase']}{par}")
        for g in p["grupos"]:
            conv = " ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)" if g["convergencia"] else ""
            out.append(f"\n**→ produce `{g['produce_label']}`**{conv}")
            for t in g["transformaciones"]:
                out.append(f"- {t['ejecutor']} · **{t['label']}** (desde {t['desde']})")
        if p["gates"]:
            out.append("\n**Gates al cerrar la fase:**")
            for l in p["gates"]:
                ref = f" — referencia: {l['referencia']}" if l["referencia"] else ""
                out.append(f"- ↻ {l['label']} [{l['estado']}]{ref}")
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("grafo")
    ap.add_argument("-o", "--out", help="escribir el plan.md aquí (default: stdout)")
    ap.add_argument("--json", help="escribir el plan como JSON aquí")
    args = ap.parse_args()

    G = json.load(open(args.grafo))
    plan = compilar(G)
    md = render_md(G, plan)
    if args.out:
        open(args.out, "w").write(md)
        print(f"✓ plan → {args.out} ({len(plan)} fases, "
              f"{sum(1 for p in plan if p['paralelizable'])} con paralelismo)")
    else:
        print(md)
    if args.json:
        json.dump({"slug": G["slug"], "fases": plan}, open(args.json, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
