"""
Documentos SINTETICOS de expediente de contratacion para las cuatro clases del proyecto de ejemplo
que no tenian documento de prueba: contrato individual de trabajo, credencial del INE, constancia
de situacion fiscal y carta de recomendacion. Con ellos, las nueve tarjetas de la seccion «por caso
de uso» de la demo tienen algo que soltar.

Todo inventado: nombres, domicilios, empresas. Los identificadores llevan digito verificador
VALIDO (RFC con la tabla del anexo del SAT, CURP con su modulo 10) porque un checksum mal no mide
nada contra un flujo que valida por checksum — es la leccion de genera-corpus.py (2026-09-13).
El generico XAXX010101000 no aparece aqui: en estos documentos siempre hay una persona concreta.

Uso: python3 medicion/genera-expediente.py [carpeta destino]   (por defecto corpus/)
"""
import json
import random
import string
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

DESTINO = Path(sys.argv[1] if len(sys.argv) > 1 else 'corpus')
DESTINO.mkdir(parents=True, exist_ok=True)
AZAR = random.Random(20260914)
FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
NEGRITA = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# La misma tabla que `src/identificadores-mx.ts` y que genera-corpus.py.
TABLA_RFC = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ'
TABLA_CURP = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
ENTIDADES = 'AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE'.split()
CONSONANTES = [c for c in string.ascii_uppercase if c not in 'AEIOU']

NOMBRES = ['MARIA FERNANDA', 'JOSE LUIS', 'ANA PAULA', 'CARLOS ALBERTO', 'LUCIA', 'DIEGO ARMANDO']
APELLIDOS = ['SINTETICO', 'FICTICIO', 'DE PRUEBA', 'INVENTADO', 'EJEMPLO', 'MODELO']
EMPRESAS = [('Ferreteria Sintetica SA de CV', 'AAA010101AA'), ('Transportes Ficticios SC', 'BBB020202BB')]


def rfc_persona(nombre, apellidos, fecha):
    """Cuatro letras que no salen del nombre a proposito (no hay persona detras), fecha y homoclave al azar."""
    letras = ''.join(AZAR.choice('ABCDEFGHJKLMNPQRSTUVWXYZ') for _ in range(4))
    cuerpo = f'{letras}{fecha}{AZAR.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789")}{AZAR.randint(0, 9)}'
    return con_digito_rfc(cuerpo)


def con_digito_rfc(sin_digito):
    relleno = sin_digito.rjust(12, ' ')
    suma = sum(TABLA_RFC.index(c) * (13 - i) for i, c in enumerate(relleno))
    resto = suma % 11
    return sin_digito + ('0' if resto == 0 else 'A' if resto == 1 else str(11 - resto))


def curp(fecha):
    cuerpo = (AZAR.choice(string.ascii_uppercase) + AZAR.choice('AEIOUX') + ''.join(AZAR.choice(string.ascii_uppercase) for _ in range(2))
              + fecha + AZAR.choice('HM') + AZAR.choice(ENTIDADES)
              + ''.join(AZAR.choice(CONSONANTES) for _ in range(3)) + AZAR.choice(string.digits + string.ascii_uppercase))
    suma = sum(TABLA_CURP.index(c) * (18 - i) for i, c in enumerate(cuerpo))
    return cuerpo + str((10 - suma % 10) % 10)


def persona():
    fecha = f'{AZAR.randint(70, 99):02d}{AZAR.randint(1, 12):02d}{AZAR.randint(1, 28):02d}'
    nombre = AZAR.choice(NOMBRES)
    apellidos = f'{AZAR.choice(APELLIDOS)} {AZAR.choice(APELLIDOS)}'
    return {'nombre': f'{nombre} {apellidos}', 'curp': curp(fecha), 'rfc': rfc_persona(nombre, apellidos, fecha)}


def escanea(img):
    img = img.rotate(AZAR.uniform(-1.2, 1.2), expand=False, fillcolor=255).filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    for _ in range(int(img.width * img.height * 0.004)):
        px[AZAR.randrange(img.width), AZAR.randrange(img.height)] = AZAR.randrange(0, 90)
    return img


def hoja():
    img = Image.new('L', (1700, 2200), 255)
    d = ImageDraw.Draw(img)
    fuentes = {
        'titulo': ImageFont.truetype(NEGRITA, 44), 'negrita': ImageFont.truetype(NEGRITA, 30),
        'normal': ImageFont.truetype(FUENTE, 28), 'chica': ImageFont.truetype(FUENTE, 22),
    }
    return img, d, fuentes


def parrafo(d, xy, texto, fuente, ancho=1460, interlineado=40):
    """Envuelve a mano: PIL no parte lineas. Devuelve la y siguiente."""
    x, y = xy
    linea = ''
    for palabra in texto.split(' '):
        candidata = f'{linea} {palabra}'.strip()
        if d.textlength(candidata, font=fuente) > ancho:
            d.text((x, y), linea, font=fuente, fill=0)
            y += interlineado
            linea = palabra
        else:
            linea = candidata
    if linea:
        d.text((x, y), linea, font=fuente, fill=0)
        y += interlineado
    return y


def contrato(n):
    p = persona()
    empresa, rfc_empresa = AZAR.choice(EMPRESAS)
    img, d, f = hoja()
    d.text((120, 140), 'CONTRATO INDIVIDUAL DE TRABAJO', font=f['titulo'], fill=0)
    d.text((120, 210), '(DOCUMENTO SINTETICO PARA PRUEBAS)', font=f['chica'], fill=0)
    y = parrafo(d, (120, 320), f'Que celebran por una parte {empresa}, con RFC {con_digito_rfc(rfc_empresa)}, en lo sucesivo '
                f'"EL PATRON", y por la otra {p["nombre"]}, con CURP {p["curp"]} y RFC {p["rfc"]}, en lo sucesivo '
                f'"EL TRABAJADOR", al tenor de las siguientes clausulas:', f['normal'])
    clausulas = [
        'PRIMERA. EL TRABAJADOR se obliga a prestar sus servicios personales bajo la direccion de EL PATRON en el puesto de Auxiliar Administrativo.',
        'SEGUNDA. La duracion del presente contrato es por tiempo indeterminado, con un periodo de prueba de treinta dias.',
        'TERCERA. La jornada de trabajo sera de cuarenta y ocho horas semanales, distribuidas de lunes a sabado.',
        f'CUARTA. EL TRABAJADOR percibira un salario diario de ${AZAR.randint(280, 620)}.00 pesos, pagadero semanalmente.',
        'QUINTA. Ambas partes se someten a la Ley Federal del Trabajo para todo lo no previsto en este contrato.',
    ]
    y += 30
    for c in clausulas:
        y = parrafo(d, (120, y), c, f['normal']) + 24
    y += 120
    d.text((160, y), '__________________________', font=f['normal'], fill=0)
    d.text((1000, y), '__________________________', font=f['normal'], fill=0)
    d.text((220, y + 45), 'EL PATRON', font=f['negrita'], fill=0)
    d.text((1040, y + 45), 'EL TRABAJADOR', font=f['negrita'], fill=0)
    return img, 'contrato', {'curp': p['curp'], 'rfc': p['rfc']}


def ine(n):
    p = persona()
    img, d, f = hoja()
    # Una credencial es apaisada; se dibuja centrada en la hoja como si fuera una fotocopia.
    d.rectangle((150, 500, 1550, 1400), outline=0, width=6)
    d.text((200, 560), 'INSTITUTO NACIONAL ELECTORAL', font=f['titulo'], fill=0)
    d.text((200, 630), 'CREDENCIAL PARA VOTAR  (SINTETICA)', font=f['negrita'], fill=0)
    d.rectangle((200, 720, 560, 1180), outline=0, width=4)
    d.text((280, 930), 'FOTO', font=f['negrita'], fill=120)
    apellidos = p['nombre'].split(' ', 2)
    d.text((620, 740), 'NOMBRE', font=f['chica'], fill=0)
    d.text((620, 770), p['nombre'], font=f['negrita'], fill=0)
    d.text((620, 850), 'DOMICILIO', font=f['chica'], fill=0)
    d.text((620, 880), f'CALLE FICTICIA {AZAR.randint(1, 999)} COL. DE PRUEBA', font=f['normal'], fill=0)
    d.text((620, 920), f'{AZAR.randint(10000, 99999)} MUNICIPIO SINTETICO, {AZAR.choice(ENTIDADES)}', font=f['normal'], fill=0)
    d.text((620, 1010), f'CLAVE DE ELECTOR  {"".join(AZAR.choice(string.ascii_uppercase) for _ in range(6))}{AZAR.randint(10000000, 99999999)}{AZAR.randint(100, 999)}', font=f['normal'], fill=0)
    d.text((620, 1060), f'CURP  {p["curp"]}', font=f['normal'], fill=0)
    d.text((620, 1110), f'AÑO DE REGISTRO  {AZAR.randint(2008, 2022)}   SEXO  {p["curp"][10]}', font=f['normal'], fill=0)
    d.text((620, 1160), f'VIGENCIA  {AZAR.randint(2027, 2034)}', font=f['normal'], fill=0)
    d.text((200, 1250), f'SECCION  {AZAR.randint(1000, 9999)}    EMISION  {AZAR.randint(2017, 2024)}', font=f['chica'], fill=0)
    return img, 'ine', {'curp': p['curp']}


def constancia_fiscal(n):
    p = persona()
    img, d, f = hoja()
    d.text((120, 140), 'SERVICIO DE ADMINISTRACION TRIBUTARIA (SINTETICO)', font=f['negrita'], fill=0)
    d.text((120, 240), 'CONSTANCIA DE SITUACION FISCAL', font=f['titulo'], fill=0)
    d.text((120, 330), f'Lugar y fecha de emision: CIUDAD FICTICIA, {AZAR.randint(1, 28):02d} DE MARZO DE 2026', font=f['chica'], fill=0)
    d.text((120, 430), 'Datos de identificacion del contribuyente', font=f['negrita'], fill=0)
    d.line((120, 470, 1580, 470), fill=0, width=3)
    filas = [
        ('RFC:', p['rfc']), ('CURP:', p['curp']), ('Nombre:', p['nombre'].split(' ')[0]),
        ('Apellidos:', ' '.join(p['nombre'].split(' ')[1:])),
        ('Fecha inicio de operaciones:', f'{AZAR.randint(1, 28):02d} DE ENERO DE {AZAR.randint(2010, 2024)}'),
        ('Estatus en el padron:', 'ACTIVO'),
    ]
    y = 510
    for etiqueta, valor in filas:
        d.text((140, y), etiqueta, font=f['normal'], fill=0)
        d.text((720, y), valor, font=f['negrita'], fill=0)
        y += 56
    y += 40
    d.text((120, y), 'Datos del domicilio registrado', font=f['negrita'], fill=0)
    d.line((120, y + 40, 1580, y + 40), fill=0, width=3)
    y += 80
    for etiqueta, valor in [('Codigo postal:', str(AZAR.randint(10000, 99999))), ('Nombre de vialidad:', 'CALLE FICTICIA'),
                            ('Numero exterior:', str(AZAR.randint(1, 999))), ('Nombre de la colonia:', 'COLONIA DE PRUEBA')]:
        d.text((140, y), etiqueta, font=f['normal'], fill=0)
        d.text((720, y), valor, font=f['negrita'], fill=0)
        y += 56
    y += 40
    d.text((120, y), 'Regimenes', font=f['negrita'], fill=0)
    d.line((120, y + 40, 1580, y + 40), fill=0, width=3)
    d.text((140, y + 80), 'Regimen de Sueldos y Salarios e Ingresos Asimilados a Salarios', font=f['normal'], fill=0)
    d.text((120, 2050), 'Cadena original y sello digital: OMITIDOS EN EL DOCUMENTO SINTETICO', font=f['chica'], fill=0)
    return img, 'constancia_fiscal', {'rfc': p['rfc'], 'curp': p['curp']}


def carta_recomendacion(n):
    p = persona()
    quien = persona()
    empresa, rfc_empresa = AZAR.choice(EMPRESAS)
    img, d, f = hoja()
    d.text((120, 140), empresa.upper(), font=f['negrita'], fill=0)
    d.text((120, 190), f'(RFC {con_digito_rfc(rfc_empresa)}) — DOCUMENTO SINTETICO', font=f['chica'], fill=0)
    d.text((120, 300), 'CARTA DE RECOMENDACION', font=f['titulo'], fill=0)
    d.text((120, 400), f'Ciudad Ficticia, a {AZAR.randint(1, 28)} de febrero de 2026', font=f['normal'], fill=0)
    d.text((120, 480), 'A QUIEN CORRESPONDA:', font=f['negrita'], fill=0)
    y = parrafo(d, (120, 560), f'Por medio de la presente me permito recomendar ampliamente a {p["nombre"]}, quien colaboro '
                f'en esta empresa del {AZAR.randint(2018, 2021)} al {AZAR.randint(2022, 2025)} en el area de administracion, '
                'desempeñando sus funciones con responsabilidad, puntualidad y honestidad.', f['normal'])
    y = parrafo(d, (120, y + 30), 'Durante su estancia demostro capacidad para trabajar en equipo y resolver problemas, por lo que '
                'no tengo inconveniente en recomendarle para cualquier puesto que decida solicitar.', f['normal'])
    y = parrafo(d, (120, y + 30), 'Sin otro particular, quedo a sus ordenes para cualquier aclaracion.', f['normal'])
    y += 160
    d.text((120, y), 'ATENTAMENTE', font=f['negrita'], fill=0)
    d.text((120, y + 120), '__________________________', font=f['normal'], fill=0)
    d.text((120, y + 170), quien['nombre'], font=f['negrita'], fill=0)
    d.text((120, y + 210), 'Gerente de Recursos Humanos', font=f['normal'], fill=0)
    d.text((120, y + 250), f'Tel. 55 {AZAR.randint(1000, 9999)} {AZAR.randint(1000, 9999)}', font=f['chica'], fill=0)
    return img, 'carta_recomendacion', {}


def guarda(nombre, img, tipo, campos):
    escanea(img).save(DESTINO / f'{nombre}.png')
    (DESTINO / f'{nombre}.json').write_text(json.dumps({
        '_aviso': 'SINTETICO: generado por medicion/genera-expediente.py',
        'tipo': tipo, 'campos': campos,
    }, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'  {nombre}.png  ({tipo}: {", ".join(f"{k}={v}" for k, v in campos.items()) or "sin campos esperados"})')


if __name__ == '__main__':
    for n in (1, 2):
        for generador, prefijo in [(contrato, 'contrato'), (ine, 'ine'), (constancia_fiscal, 'constancia-fiscal'), (carta_recomendacion, 'carta-recomendacion')]:
            img, tipo, campos = generador(n)
            guarda(f'{prefijo}-{n}', img, tipo, campos)
