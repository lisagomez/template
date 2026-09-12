"""
Fixtures SINTETICOS de codigos para las pruebas del lector y del analizador. Todo inventado, con
identificadores cuyo digito verificador SI cuadra (mismo generador que genera-identificadores.py).

Las formas reproducen las MEDIDAS el 2026-09-11 sobre constancias reales (solo la forma, nunca
los valores): QR del SAT `D1..D3=<idCIF>_<RFC>`, QR de CURP con campos separados por `|`, y el
Code128 con el RFC en claro.
"""
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw
from qrcode.image.pil import PilImage

AQUI = Path(__file__).resolve().parent
DESTINO = AQUI.parent / 'pruebas' / 'fixtures' / 'qr'
DESTINO.mkdir(parents=True, exist_ok=True)

RFC = 'SAT970701NN3'                     # el del propio SAT: publico y con digito valido
CURP = 'GOAJ040229HDFNRNA6'              # inventada; digito calculado con la tabla de RENAPO
CSF_CORTA = f'https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=12345678901_{RFC}'
CSF_LARGA = f'https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=1&D2=1&D3=||2026/01/15|{RFC}|SERVICIO DE ADMINISTRACION TRIBUTARIA|_c2VsbG9TaW50ZXRpY28='
CURP_PIPES = f'{CURP}||GOMEZ|ALVAREZ|JUAN PABLO|HOMBRE|29/02/2004|DISTRITO FEDERAL|01|'
CURP_ETIQUETAS = f'||Número de Validación Legal: 12345678901 |Nombre: JUAN PABLO GOMEZ ALVAREZ |CURP: {CURP}||'
OTRO = 'https://app.cfe.mx/Aplicaciones/CCFE/Login.aspx'


def qr(texto, tamano=6):
    q = qrcode.QRCode(box_size=tamano, border=4)
    q.add_data(texto)
    q.make(fit=True)
    return q.make_image(image_factory=PilImage).convert('L')


def guarda(nombre, imagen):
    imagen.save(DESTINO / f'{nombre}.png')
    print(f'  {nombre}.png {imagen.width}x{imagen.height}')


guarda('csf-corta', qr(CSF_CORTA))
guarda('csf-larga', qr(CSF_LARGA, 4))
guarda('curp-pipes', qr(CURP_PIPES))
guarda('curp-etiquetas', qr(CURP_ETIQUETAS))
guarda('otro-tipo', qr(OTRO))

sin = Image.new('L', (300, 120), 255)
ImageDraw.Draw(sin).text((10, 50), 'Pagina sin ningun codigo. Solo texto.', fill=0)
guarda('sin-qr', sin)

a, b = qr(CSF_CORTA, 4), qr(CURP_PIPES, 4)
dos = Image.new('L', (a.width + b.width + 40, max(a.height, b.height)), 255)
dos.paste(a, (0, 0))
dos.paste(b, (a.width + 40, 0))
guarda('dos-qr', dos)

(DESTINO / 'LEEME.md').write_text(
    '# Fixtures sinteticos de codigos\n\nGenerados por `medicion/genera-qr-fixtures.py`. Todo es inventado: el RFC es el publico del\n'
    'SAT y la CURP se fabrico con digito valido. Reproducen la FORMA medida de los QR reales, no su contenido.\n',
    encoding='utf-8',
)
