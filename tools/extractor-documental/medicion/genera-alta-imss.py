"""
Hojas SINTETICAS de alta del IMSS, en las dos formas medidas el 2026-09-11 sobre expedientes
reales (solo la FORMA: la tabla «Tipo | NSS | Nombre ...» con el valor debajo, y el formulario
«No. de Afiliacion al Seguro Social» con el valor en la linea siguiente). Todo inventado; el NSS
lleva digito Luhn valido para que el validador lo acepte. Sirve para medir la zona del NSS sin
tocar un documento real.

Uso: python3 medicion/genera-alta-imss.py [carpeta destino]   (por defecto corpus/)
"""
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

DESTINO = Path(sys.argv[1] if len(sys.argv) > 1 else 'corpus')
DESTINO.mkdir(parents=True, exist_ok=True)
AZAR = random.Random(20260912)
FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
NEGRITA = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def luhn(diez):
    suma = 0
    for i, ch in enumerate(reversed(diez)):
        d = int(ch)
        if i % 2 == 0:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        suma += d
    return str((10 - suma % 10) % 10)


def nss():
    diez = ''.join(AZAR.choice('0123456789') for _ in range(10))
    return diez + luhn(diez)


def escanea(img):
    img = img.rotate(AZAR.uniform(-1.2, 1.2), expand=False, fillcolor=255).filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    for _ in range(int(img.width * img.height * 0.004)):
        px[AZAR.randrange(img.width), AZAR.randrange(img.height)] = AZAR.randrange(0, 90)
    return img


def tabla(n):
    """Forma A: tabla con encabezado y el valor en la linea de abajo."""
    valor = nss()
    img = Image.new('L', (1700, 2200), 255)
    d = ImageDraw.Draw(img)
    normal, negrita, chica = ImageFont.truetype(FUENTE, 28), ImageFont.truetype(NEGRITA, 34), ImageFont.truetype(FUENTE, 24)
    d.text((120, 140), 'INSTITUTO MEXICANO DEL SEGURO SOCIAL (SINTETICO)', font=negrita, fill=0)
    d.text((120, 220), 'Comprobante de movimientos afiliatorios del trabajador', font=normal, fill=0)
    d.text((120, 300), 'En atencion del articulo 9 del reglamento de la ley del Seguro Social en materia de Afiliacion,', font=chica, fill=0)
    y = 520
    cabecera = ['Tipo', 'NSS', 'Nombre', 'Reg. Pat.', 'Sal.', 'Tipo', 'Sem.', 'Fecha', 'C. Baja']
    xs = [120, 220, 520, 900, 1100, 1250, 1350, 1450, 1620]
    for x, t in zip(xs, cabecera):
        d.text((x, y), t, font=negrita, fill=0)
    d.line((110, y + 44, 1690, y + 44), fill=0, width=2)
    fila = ['1', valor, f'TRABAJADOR SINTETICO {n}', '9999999999', '$ 250.00', '1', '000', '01/01/2026', '0']
    for x, t in zip(xs, fila):
        d.text((x, y + 60), t, font=normal, fill=0)
    return escanea(img), valor, 'tabla'


def formulario(n):
    """Forma B: etiquetas en una linea y valores en la siguiente (el NSS partido 2+9)."""
    valor = nss()
    img = Image.new('L', (1700, 2200), 255)
    d = ImageDraw.Draw(img)
    normal, negrita, chica = ImageFont.truetype(FUENTE, 26), ImageFont.truetype(NEGRITA, 34), ImageFont.truetype(FUENTE, 22)
    d.text((120, 140), 'AVISO DE INSCRIPCION DEL TRABAJADOR (SINTETICO)', font=negrita, fill=0)
    y = 700
    etiquetas = [(120, 'No. Registro Pat.'), (480, 'No. de Afiliacion al Seguro Social'), (1020, 'No. de Credito Infonavit'), (1400, 'No. de Folio')]
    for x, t in etiquetas:
        d.text((x, y), t, font=chica, fill=0)
    valores = [(120, 'A1234567890'), (480, f'{valor[:2]} {valor[2:]}'), (1020, '0000000000'), (1400, f'{n:05d}')]
    for x, t in valores:
        d.text((x, y + 40), t, font=normal, fill=0)
    d.rectangle((110, y - 10, 1690, y + 90), outline=0, width=2)
    return escanea(img), valor, 'formulario'


for n, gen in [(1, tabla), (2, tabla), (3, formulario), (4, formulario)]:
    img, valor, forma = gen(n)
    nombre = f'alta-imss-{n}'
    img.save(DESTINO / f'{nombre}.png')
    (DESTINO / f'{nombre}.json').write_text(json.dumps({'_aviso': 'SINTETICO: generado por medicion/genera-alta-imss.py', 'tipo': 'alta_imss', 'forma': forma, 'campos': {'nss': valor}}, indent=1), encoding='utf-8')
    print(f'  {nombre}.png ({forma})')
