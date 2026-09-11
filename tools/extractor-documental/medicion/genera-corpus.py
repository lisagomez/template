"""
Genera un corpus SINTETICO para medir el extractor: escaneos con verdad conocida.

TODO LO QUE SALE DE AQUI ES INVENTADO. Los nombres, RFC, folios e importes se fabrican con un
generador determinista; no corresponden a ninguna persona ni empresa. Existe porque medir
CER, campos correctos y correlacion confianza-error exige una referencia exacta, y esa referencia
no puede salir de un documento real: un documento real lleva datos de terceros y no entra ni al
repositorio ni a un transcript.

Cada documento sale en dos formas:
  - `<nombre>.png`      la "hoja escaneada": texto renderizado, con ruido y una rotacion leve
  - `<nombre>.json`     la verdad: el texto completo y los campos, para medir contra ella
Y una de las facturas ademas como `<nombre>.pdf` con el JPEG dentro, que es como sale de un escaner.

Uso: python3 medicion/genera-corpus.py [carpeta destino]   (por defecto corpus/)
"""
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

DESTINO = Path(sys.argv[1] if len(sys.argv) > 1 else 'corpus')
DESTINO.mkdir(parents=True, exist_ok=True)
AZAR = random.Random(20260911)

FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FUENTE_NEGRITA = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

EMISORES = [
    ('AAA010101AAA', 'Ferreteria Sintetica SA de CV', '601'),
    ('BBB020202BB2', 'Transportes Ficticios SC', '612'),
]
RECEPTOR = ('XAXX010101000', 'Publico en General')


def rfc_falso():
    letras = ''.join(AZAR.choice('ABCDEFGHJKLMNPQRSTUVWXYZ') for _ in range(4))
    return f"{letras}{AZAR.randint(10, 99):02d}{AZAR.randint(1, 12):02d}{AZAR.randint(1, 28):02d}{AZAR.choice('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789')}{AZAR.randint(0, 9)}{AZAR.randint(0, 9)}"


def factura(n, emisor):
    rfc, nombre, regimen = emisor
    folio = f"F-{1800 + n}"
    uuid = '-'.join(''.join(AZAR.choice('0123456789abcdef') for _ in range(k)) for k in (8, 4, 4, 4, 12))
    conceptos = [(AZAR.choice(['Tornillo 1/4', 'Pintura vinilica 4L', 'Cable calibre 12', 'Flete local', 'Cinta aislante']),
                  AZAR.randint(1, 20), AZAR.choice([12.50, 89.00, 145.90, 320.00, 1250.00])) for _ in range(AZAR.randint(2, 4))]
    subtotal = round(sum(c * p for _, c, p in conceptos), 2)
    iva = round(subtotal * 0.16, 2)
    total = round(subtotal + iva, 2)
    fecha = f"2026-{AZAR.randint(1, 8):02d}-{AZAR.randint(1, 28):02d}"
    lineas = [
        ('FACTURA', True), (f"Folio: {folio}", False), (f"Fecha: {fecha}", False), ('', False),
        (f"Emisor: {nombre}", False), (f"RFC emisor: {rfc}", False), (f"Regimen fiscal: {regimen}", False), ('', False),
        (f"Receptor: {RECEPTOR[1]}", False), (f"RFC receptor: {RECEPTOR[0]}", False), ('', False),
        ('Cant.  Descripcion                 Importe', True),
    ]
    for d, c, p in conceptos:
        lineas.append((f"{c:<6} {d:<28} {c * p:>10.2f}", False))
    lineas += [('', False), (f"Subtotal: {subtotal:.2f}", False), (f"IVA 16%: {iva:.2f}", False), (f"Total: {total:.2f}", True),
               ('', False), (f"Folio fiscal: {uuid}", False)]
    campos = {'folio': folio, 'fecha': fecha, 'nombre_emisor': nombre, 'rfc_emisor': rfc, 'regimen_fiscal': regimen,
              'rfc_receptor': RECEPTOR[0], 'subtotal': f"{subtotal:.2f}", 'iva': f"{iva:.2f}", 'total': f"{total:.2f}", 'uuid': uuid}
    return lineas, campos


def minuta(n):
    fecha = f"2026-0{AZAR.randint(1, 8)}-{AZAR.randint(1, 28):02d}"
    asistentes = AZAR.randint(3, 7)
    responsable = AZAR.choice(['Coordinacion de compras', 'Area de mantenimiento', 'Direccion de obra'])
    lineas = [
        ('MINUTA DE REUNION', True), (f"Fecha: {fecha}", False), (f"Asistentes: {asistentes}", False), (f"Responsable: {responsable}", False),
        ('', False), ('Acuerdos:', True),
        (f"1. Solicitar cotizacion a {EMISORES[n % 2][1]} (RFC {EMISORES[n % 2][0]})", False),
        (f"2. Revisar la factura F-{1800 + n} antes del {fecha}", False),
        ('3. Proxima reunion en quince dias', False),
    ]
    campos = {'fecha': fecha, 'asistentes': str(asistentes), 'responsable': responsable, 'rfc_emisor': EMISORES[n % 2][0]}
    return lineas, campos


def dibuja(lineas):
    ancho, alto = 1240, 1754  # A4 a 150 ppp
    hoja = Image.new('L', (ancho, alto), 255)
    lapiz = ImageDraw.Draw(hoja)
    normal = ImageFont.truetype(FUENTE, 30)
    negrita = ImageFont.truetype(FUENTE_NEGRITA, 34)
    y = 120
    for texto, fuerte in lineas:
        lapiz.text((110, y), texto, font=negrita if fuerte else normal, fill=0)
        y += 52 if fuerte else 46
    # Lo que hace que parezca un escaneo y no una captura: rotacion leve, desenfoque y grano.
    hoja = hoja.rotate(AZAR.uniform(-0.8, 0.8), resample=Image.BICUBIC, fillcolor=255)
    hoja = hoja.filter(ImageFilter.GaussianBlur(0.6))
    pixeles = hoja.load()
    for _ in range(ancho * alto // 40):
        x, yy = AZAR.randrange(ancho), AZAR.randrange(alto)
        pixeles[x, yy] = max(0, pixeles[x, yy] - AZAR.randint(20, 90))
    return hoja


def guarda(nombre, tipo, lineas, campos, como_pdf=False):
    hoja = dibuja(lineas)
    hoja.save(DESTINO / f"{nombre}.png")
    texto = '\n'.join(t for t, _ in lineas)
    (DESTINO / f"{nombre}.json").write_text(json.dumps({'sintetico': True, 'tipoDocumento': tipo, 'texto': texto, 'campos': campos}, ensure_ascii=False, indent=2), encoding='utf-8')
    if como_pdf:
        # Un JPEG dentro de un PDF, sin capa de texto: exactamente lo que deja un escaner.
        hoja.convert('RGB').save(DESTINO / f"{nombre}.pdf", 'PDF', resolution=150.0, quality=85)


def pdf_con_texto(nombre, tipo, lineas, campos):
    """Un PDF GENERADO POR SOFTWARE: capa de texto real, sin comprimir. Lo que produce un sistema de facturacion."""
    def escapa(t):
        return t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    cuerpo = ['BT', '/F1 11 Tf', '14 TL', '72 760 Td']
    for texto, _ in lineas:
        cuerpo.append(f"({escapa(texto)}) Tj T*")
    cuerpo.append('ET')
    contenido = '\n'.join(cuerpo).encode('latin-1')
    objetos = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(contenido)).encode() + b" >>\nstream\n" + contenido + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    salida = bytearray(b"%PDF-1.4\n")
    posiciones = []
    for i, obj in enumerate(objetos, start=1):
        posiciones.append(len(salida))
        salida += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(salida)
    salida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for pos in posiciones:
        salida += f"{pos:010d} 00000 n \n".encode()
    salida += f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    (DESTINO / f"{nombre}.pdf").write_bytes(bytes(salida))
    texto = '\n'.join(t for t, _ in lineas)
    (DESTINO / f"{nombre}.json").write_text(json.dumps({'sintetico': True, 'tipoDocumento': tipo, 'texto': texto, 'campos': campos}, ensure_ascii=False, indent=2), encoding='utf-8')


for i in range(4):
    lineas, campos = factura(i, EMISORES[i % 2])
    guarda(f"factura-escaneada-{i + 1}", 'factura', lineas, campos, como_pdf=(i == 0))
for i in range(4, 10):
    lineas, campos = factura(i, EMISORES[i % 2])
    pdf_con_texto(f"factura-digital-{i - 3}", 'factura', lineas, campos)
for i in range(2):
    lineas, campos = minuta(i)
    guarda(f"minuta-escaneada-{i + 1}", 'minuta', lineas, campos)

print('generados en', DESTINO, ':', sorted(p.name for p in DESTINO.iterdir()))
