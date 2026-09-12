"""
Constancias SINTETICAS de CURP en las tres formas medidas el 2026-09-11 sobre hojas reales
(solo la FORMA): la constancia de RENAPO con la clave GRANDE y sola en su linea, bajo el titulo;
la clave en prosa tras «Clave Unica de Registro de Poblacion»; y la forma con etiqueta y dos
puntos «CLAVE UNICA DE REGISTRO DE POBLACION (CURP): <clave>». Todo inventado, con digito
verificador de RENAPO valido.

Uso: python3 medicion/genera-constancias-curp.py [carpeta destino]   (por defecto corpus/)
"""
import json
import random
import string
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

DESTINO = Path(sys.argv[1] if len(sys.argv) > 1 else 'corpus')
DESTINO.mkdir(parents=True, exist_ok=True)
AZAR = random.Random(20260913)
FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
NEGRITA = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
TABLA = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
ENTIDADES = 'AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE'.split()
CONSONANTES = [c for c in string.ascii_uppercase if c not in 'AEIOU']


def curp():
    cuerpo = (AZAR.choice(string.ascii_uppercase) + AZAR.choice('AEIOUX') + ''.join(AZAR.choice(string.ascii_uppercase) for _ in range(2))
              + f'{AZAR.randint(0, 99):02d}{AZAR.randint(1, 12):02d}{AZAR.randint(1, 28):02d}' + AZAR.choice('HM') + AZAR.choice(ENTIDADES)
              + ''.join(AZAR.choice(CONSONANTES) for _ in range(3)) + AZAR.choice(string.digits + string.ascii_uppercase))
    suma = sum(TABLA.index(c) * (18 - i) for i, c in enumerate(cuerpo))
    return cuerpo + str((10 - suma % 10) % 10)


def escanea(img):
    img = img.rotate(AZAR.uniform(-1.2, 1.2), expand=False, fillcolor=255).filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    for _ in range(int(img.width * img.height * 0.004)):
        px[AZAR.randrange(img.width), AZAR.randrange(img.height)] = AZAR.randrange(0, 90)
    return img


def renapo(n):
    valor = curp()
    img = Image.new('L', (1700, 2200), 255)
    d = ImageDraw.Draw(img)
    d.text((300, 160), 'CONSTANCIA DE LA CLAVE UNICA DE REGISTRO DE POBLACION (SINTETICA)', font=ImageFont.truetype(NEGRITA, 30), fill=0)
    d.rectangle((300, 300, 1400, 420), outline=0, width=3)
    d.text((340, 325), valor, font=ImageFont.truetype(NEGRITA, 56), fill=0)
    d.text((300, 480), 'Nombre', font=ImageFont.truetype(FUENTE, 24), fill=0)
    d.text((300, 520), f'PERSONA SINTETICA {n}', font=ImageFont.truetype(FUENTE, 28), fill=0)
    d.text((300, 700), 'Este documento es fiel del uso y contenido de la Clave Unica de Registro de Poblacion (CURP)', font=ImageFont.truetype(FUENTE, 22), fill=0)
    return escanea(img), valor, 'renapo'


def prosa(n):
    valor = curp()
    img = Image.new('L', (1700, 2200), 255)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FUENTE, 26)
    d.text((120, 200), 'ACTA SINTETICA', font=ImageFont.truetype(NEGRITA, 34), fill=0)
    d.text((120, 400), f'con Clave Unica de Registro de Poblacion {valor} y numero de folio 12A3456789, comparece', font=f, fill=0)
    d.text((120, 450), 'el dia de hoy ante la autoridad competente, con documento vigente para el tramite.', font=f, fill=0)
    return escanea(img), valor, 'prosa'


def etiqueta(n):
    valor = curp()
    img = Image.new('L', (1700, 2200), 255)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FUENTE, 26)
    d.text((120, 200), 'CERTIFICADO SINTETICO', font=ImageFont.truetype(NEGRITA, 34), fill=0)
    d.text((120, 500), f'CLAVE UNICA DE REGISTRO DE POBLACION (CURP): {valor}', font=f, fill=0)
    d.text((120, 550), 'Y RECIBE LA PRESENTE CONSTANCIA DE ESTUDIOS AL HABER CUMPLIDO CON LOS REQUISITOS,', font=f, fill=0)
    return escanea(img), valor, 'etiqueta'


for n, gen in [(1, renapo), (2, renapo), (3, prosa), (4, etiqueta)]:
    img, valor, forma = gen(n)
    nombre = f'constancia-curp-{n}'
    img.save(DESTINO / f'{nombre}.png')
    (DESTINO / f'{nombre}.json').write_text(json.dumps({'_aviso': 'SINTETICO: generado por medicion/genera-constancias-curp.py', 'tipo': 'curp', 'forma': forma, 'campos': {'curp': valor}}, indent=1), encoding='utf-8')
    print(f'  {nombre}.png ({forma})')
