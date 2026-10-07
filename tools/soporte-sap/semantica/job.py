"""
El job de PRODUCCIÓN de la capa semántica (perfil `semantica` del compose). Corre con el rol
`soporte_sap_metricas` (C7, declarado): lee a todos los tenants pero ninguna columna de texto, y solo
inserta en `ss_metrica`.

  1. `dbt build --target produccion` (entradas = tablas del producto, `laboratorio: false`);
  2. `mf validate-configs` y `mf query` por alcance (consultas.json, la misma definición que usa el
     laboratorio);
  3. inserta el corte en `public.ss_metrica` con su versión (`sha256:` de los resultados) y si cada
     métrica es visible al cliente (del catálogo). Una versión nueva es otra fila: nada se actualiza.

Sin telemetría. La contraseña llega por variable de entorno y nunca se imprime.
"""
import csv
import datetime
import hashlib
import json
import os
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
INICIO = os.environ.get('SS_PERIODO_DESDE', '2026-01-01')
HASTA = os.environ.get('SS_PERIODO_HASTA') or datetime.date.today().isoformat()


def corre(*args: str) -> str:
    r = subprocess.run(args, cwd=AQUI, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write((r.stdout + r.stderr)[-4000:])
        raise SystemExit(f'falló: {args[0]} {args[1] if len(args) > 1 else ""}')
    return r.stdout


def consultas() -> list[dict]:
    d = json.load(open(os.path.join(AQUI, 'consultas.json'), encoding='utf-8'))
    return [{**q, 'metricas': [m for x in q['metricas'] for m in (d['operacion'] if x == '@operacion' else [x])]} for q in d['consultas']]


def numero(v: str):
    return None if v in ('', 'None', 'nan') else round(float(v), 6)


def main() -> None:
    if os.environ.get('SS_DBT_TARGET') != 'produccion':
        raise SystemExit('el job corre con SS_DBT_TARGET=produccion (lo fija la imagen)')
    corre('dbt', 'build', '--vars', '{laboratorio: false}', '--no-use-colors')
    corre('mf', 'validate-configs')
    manifiesto = json.load(open(os.path.join(AQUI, 'target', 'semantic_manifest.json'), encoding='utf-8'))
    visible = {m['name']: bool((m.get('config') or {}).get('meta', {}).get('visible_al_cliente')) for m in manifiesto['metrics']}
    filas, huella = [], hashlib.sha256()
    with tempfile.TemporaryDirectory() as tmp:
        for n, q in enumerate(consultas()):
            salida = os.path.join(tmp, f'q{n}.csv')
            corre('mf', 'query', '--metrics', ','.join(q['metricas']), '--group-by', ','.join(['metric_time__month', *q['por']]),
                  '--start-time', INICIO, '--end-time', HASTA, '--csv', salida)
            contenido = open(salida, encoding='utf-8').read()
            huella.update(contenido.encode())
            for r in csv.DictReader(contenido.splitlines()):
                periodo = (r.get('metric_time__month') or '')[:7]
                if len(periodo) != 7:
                    continue
                for m in q['metricas']:
                    filas.append((m, f'{periodo}-01', q['alcance'], r.get('cliente__tamano') or None, r.get('consultora') or None, r.get('cliente') or None,
                                  r.get('cliente_mes__etapa') or None, numero(r.get(m, '')), visible.get(m, False)))
    version = 'sha256:' + huella.hexdigest()
    import psycopg2  # viene con dbt-postgres (requirements.lock)
    con = psycopg2.connect(host=os.environ['SS_PG_HOST'], port=int(os.environ.get('SS_PG_PORT', '5432')), user=os.environ['SS_PG_USER'],
                           password=os.environ['SS_PG_PASSWORD'], dbname=os.environ.get('SS_PG_DB', 'postgres'))
    with con, con.cursor() as cur:
        cur.execute('set role soporte_sap_metricas')
        # El cliente de una fila sale de su consultora (el disparador de tenencia lo comprueba en la base).
        cur.executemany(
            'insert into public.ss_metrica (version, metrica, periodo, alcance, tamano, consultora_id, cliente_id, etapa, valor, visible_al_cliente) '
            'values (%s, %s, %s, %s, %s, coalesce(%s::uuid, (select padre_id from public.ss_organizacion where id = %s::uuid)), %s::uuid, %s, %s, %s)',
            [(version, m, p, a, t, c, k, k, e, v, vis) for (m, p, a, t, c, k, e, v, vis) in filas],
        )
    print(f'corte {version[:19]}: {len(filas)} valores en ss_metrica')


if __name__ == '__main__':
    main()
