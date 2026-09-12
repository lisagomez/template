"""
Identificadores SINTETICOS con digito verificador calculado en Python, para cotejar la
implementacion TypeScript contra una independiente. Todo es inventado: nombres, fechas, entidades.

Escribe pruebas/fixtures/identificadores-sinteticos.json con 200 validos y 200 invalidos de cada
clase (la mutacion cambia SOLO el digito de control).
"""
import json
import random
import string
from pathlib import Path

AZAR = random.Random(9)
TABLA_RFC = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ'
TABLA_CURP = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
ENTIDADES = 'AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE'.split()
CONSONANTES = [c for c in string.ascii_uppercase if c not in 'AEIOU']


def fecha():
    return f'{AZAR.randint(0, 99):02d}{AZAR.randint(1, 12):02d}{AZAR.randint(1, 28):02d}'


def digito_rfc(cuerpo):
    relleno = cuerpo.rjust(12, ' ')
    suma = sum(TABLA_RFC.index(c) * (13 - i) for i, c in enumerate(relleno))
    resto = suma % 11
    return '0' if resto == 0 else 'A' if resto == 1 else str(11 - resto)


def rfc():
    letras = ''.join(AZAR.choice(string.ascii_uppercase) for _ in range(AZAR.choice([3, 4])))
    cuerpo = letras + fecha() + ''.join(AZAR.choice(string.ascii_uppercase + string.digits) for _ in range(2))
    return cuerpo + digito_rfc(cuerpo)


def digito_curp(cuerpo):
    suma = sum(TABLA_CURP.index(c) * (18 - i) for i, c in enumerate(cuerpo))
    return str((10 - suma % 10) % 10)


def curp():
    cuerpo = (AZAR.choice(string.ascii_uppercase) + AZAR.choice('AEIOUX') + ''.join(AZAR.choice(string.ascii_uppercase) for _ in range(2))
              + fecha() + AZAR.choice('HM') + AZAR.choice(ENTIDADES) + ''.join(AZAR.choice(CONSONANTES) for _ in range(3))
              + AZAR.choice(string.digits + string.ascii_uppercase))
    return cuerpo + digito_curp(cuerpo)


def digito_luhn(diez):
    suma = 0
    for i, ch in enumerate(reversed(diez)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        suma += d
    return str((10 - suma % 10) % 10)


def nss():
    diez = ''.join(AZAR.choice(string.digits) for _ in range(10))
    return diez + digito_luhn(diez)


def muta(valor, tabla):
    ultimo = valor[-1]
    candidatos = [c for c in tabla if c != ultimo and c != ' ']
    return valor[:-1] + AZAR.choice(candidatos)


salida = {}
for nombre, gen, tabla in [('rfc', rfc, TABLA_RFC), ('curp', curp, string.digits), ('nss', nss, string.digits)]:
    validos = [gen() for _ in range(200)]
    salida[nombre] = {'validos': validos, 'invalidos': [muta(v, tabla) for v in validos]}

destino = Path(__file__).resolve().parent.parent / 'pruebas' / 'fixtures' / 'identificadores-sinteticos.json'
destino.write_text(json.dumps({'_aviso': 'TODO INVENTADO: generado por medicion/genera-identificadores.py, semilla 9', **salida}, indent=1), encoding='utf-8')
print(f'{destino}: 200 validos y 200 invalidos por clase')
