"""
Tesseract como motor local del extractor, con OCR POR ZONAS para los identificadores.

Habla el protocolo de `motores/proceso-local.ts`: recibe la ruta de un `peticion.json`
(`{imagen, tipoMime, esquemaDeAnotacion}`) y escribe por stdout
`{paginas:[{indice, markdown, confianza, campos:[{clave, valor, confianza, region}]}]}`.

POR QUE ZONAS. Medido el 2026-09-11 sobre expedientes reales: Tesseract lee la prosa bien y
pierde justo los identificadores (RFC del empleado legible en 1 de 4). Localizar la etiqueta
(RFC, CURP, NSS), recortar el valor, ampliarlo x3 y leerlo como UNA palabra (--psm 8) ataca ese
fallo donde esta. Medido sobre 4 facturas sinteticas: psm 8 con escala 3 lee 7 de 7 RFC exactos;
psm 7, 4 de 7. La lista blanca de caracteres se pasa igual, pero el motor LSTM la ignora (medido:
mismos resultados con y sin ella), y el motor legacy que si la respeta no viene en estos datos de
idioma. La confianza por palabra que Tesseract da en esas zonas es 0: aqui la confianza real la
ponen el digito verificador y el cotejo contra un QR, fuera de este script.

LO QUE NO HACE. No inventa confianza: la de pagina es la media de Tesseract por palabra (que
nadie calibra), y la de cada zona es la MINIMA de sus palabras. No valida el identificador: eso
es de `identificadores-mx.ts`, fuera del motor. Y por stderr solo salen lineas con el prefijo
`extractor:` y sin ningun valor: es lo unico que el adaptador deja pasar a un error.

Dependencias: pytesseract y Pillow. El binario y los datos de idioma los apunta el entorno
(`LD_LIBRARY_PATH`, `TESSDATA_PREFIX`, `TESSERACT_CMD`).
"""
import json
import os
import re
import sys
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps

if os.environ.get('TESSERACT_CMD'):
    pytesseract.pytesseract.tesseract_cmd = os.environ['TESSERACT_CMD']

IDIOMA = os.environ.get('EXTRACTOR_IDIOMA', 'spa')
ZONA_ESCALA = int(os.environ.get('EXTRACTOR_ZONA_ESCALA', '3'))
ZONA_PSM = os.environ.get('EXTRACTOR_ZONA_PSM', '8')
ZONA_BINARIZA = os.environ.get('EXTRACTOR_ZONA_BINARIZA', '1') == '1'
OEM_ZONA = os.environ.get('EXTRACTOR_OEM_ZONA', '1')
# psm 6 (bloque uniforme) para la pagina; sin diccionarios, para que no «corrija» un RFC a una palabra.
CONFIG_PAGINA = f'--psm 6 --oem 1 -l {IDIOMA} -c load_system_dawg=0 -c load_freq_dawg=0'

ALFANUMERICO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&Ñ'
ZONAS_MX = [
    {'clave': 'rfc', 'etiqueta': r'\bR\.?\s?F\.?\s?C\.?', 'listaBlanca': ALFANUMERICO, 'forma': r'^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$'},
    {'clave': 'curp', 'etiqueta': r'\bC\.?\s?U\.?\s?R\.?\s?P\.?', 'listaBlanca': ALFANUMERICO, 'forma': r'^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$'},
    {'clave': 'nss', 'etiqueta': r'\bN\.?\s?S\.?\s?S\.?|SEGURO\s+SOCIAL|AFILIACI[OÓ]N', 'listaBlanca': '0123456789', 'forma': r'^\d{11}$'},
]


def aviso(texto):
    """Solo forma. NUNCA un valor leido."""
    sys.stderr.write(f'extractor: {texto}\n')


def otsu(img):
    h = img.histogram()
    total, suma = sum(h), sum(i * h[i] for i in range(256))
    sb = wb = 0
    mejor, umbral = 0.0, 0
    for i in range(256):
        wb += h[i]
        if wb == 0:
            continue
        wf = total - wb
        if wf == 0:
            break
        sb += i * h[i]
        entre = wb * wf * (sb / wb - (suma - sb) / wf) ** 2
        if entre > mejor:
            mejor, umbral = entre, i
    return img.point(lambda p: 255 if p > umbral else 0)


def tokens_de(img, config):
    d = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)
    salida = []
    for i, texto in enumerate(d['text']):
        if not texto.strip():
            continue
        conf = float(d['conf'][i])
        if conf < 0:
            continue
        salida.append({
            'texto': texto, 'conf': conf,
            'bloque': d['block_num'][i], 'parrafo': d['par_num'][i], 'linea': d['line_num'][i],
            'x': d['left'][i], 'y': d['top'][i], 'w': d['width'][i], 'h': d['height'][i],
        })
    return salida


def lineas_de(tokens):
    """Agrupa por (bloque, parrafo, linea) en orden de lectura."""
    lineas = {}
    for t in tokens:
        lineas.setdefault((t['bloque'], t['parrafo'], t['linea']), []).append(t)
    return [sorted(v, key=lambda t: t['x']) for _, v in sorted(lineas.items())]


def markdown_de(lineas):
    partes, parrafo_previo = [], None
    for linea in lineas:
        clave = (linea[0]['bloque'], linea[0]['parrafo'])
        if parrafo_previo is not None and clave != parrafo_previo:
            partes.append('')
        partes.append(' '.join(t['texto'] for t in linea))
        parrafo_previo = clave
    return '\n'.join(partes)


def caja_de(tokens):
    x0 = min(t['x'] for t in tokens)
    y0 = min(t['y'] for t in tokens)
    x1 = max(t['x'] + t['w'] for t in tokens)
    y1 = max(t['y'] + t['h'] for t in tokens)
    return x0, y0, x1, y1


def zona_tras_etiqueta(lineas, indice_linea, fin_etiqueta_x):
    """Los tokens a la derecha de la etiqueta en su linea; si no hay, la linea siguiente entera."""
    derecha = [t for t in lineas[indice_linea] if t['x'] >= fin_etiqueta_x]
    if derecha:
        return derecha
    if indice_linea + 1 < len(lineas):
        return lineas[indice_linea + 1]
    return []


def lee_zona(img, caja, zona):
    x0, y0, x1, y1 = caja
    margen = max(4, (y1 - y0) // 3)
    recorte = img.crop((max(0, x0 - margen), max(0, y0 - margen), min(img.width, x1 + margen), min(img.height, y1 + margen)))
    ampliado = recorte.resize((recorte.width * ZONA_ESCALA, recorte.height * ZONA_ESCALA), Image.LANCZOS)
    if ZONA_BINARIZA:
        ampliado = otsu(ampliado)
    lista = '' if os.environ.get('EXTRACTOR_SIN_LISTA_BLANCA') else f" -c tessedit_char_whitelist={zona['listaBlanca']}"
    config = f"--psm {ZONA_PSM} --oem {OEM_ZONA} -l {IDIOMA} -c load_system_dawg=0 -c load_freq_dawg=0{lista}"
    palabras = [(t['texto'], t['conf']) for t in tokens_de(ampliado, config)]
    if not palabras:
        return None
    valor = ''.join(p for p, _ in palabras).upper()
    if 'forma' in zona:
        # La zona puede arrastrar la cola de la etiqueta («EMISOR:») antes del valor: se busca la
        # forma dentro de lo leido. Un valor que no la tiene en ningun sitio no es el identificador.
        m = re.search(zona['forma'].strip('^$'), valor)
        if m is None:
            return None
        valor = m.group(0)
    return valor, min(c for _, c in palabras) / 100


def campos_por_zonas(img, lineas, zonas):
    campos, sin_valor = [], 0
    for indice, linea in enumerate(lineas):
        texto = ' '.join(t['texto'] for t in linea).upper()
        for zona in zonas:
            m = re.search(zona['etiqueta'], texto)
            if m is None:
                continue
            # Que token cierra la etiqueta: se acumulan largos para mapear el offset a un token.
            acumulado, fin_x = 0, linea[-1]['x'] + linea[-1]['w']
            for t in linea:
                acumulado += len(t['texto']) + 1
                if acumulado > m.end():
                    fin_x = t['x'] + t['w']
                    break
            tokens_zona = zona_tras_etiqueta(lineas, indice, fin_x)
            if not tokens_zona:
                sin_valor += 1
                continue
            leido = lee_zona(img, caja_de(tokens_zona), zona)
            if leido is None:
                sin_valor += 1
                continue
            x0, y0, x1, y1 = caja_de(tokens_zona)
            campos.append({
                'clave': zona['clave'], 'valor': leido[0], 'confianza': round(leido[1], 3),
                'region': {'pagina': 0, 'x': x0 / img.width, 'y': y0 / img.height, 'ancho': (x1 - x0) / img.width, 'alto': (y1 - y0) / img.height},
            })
    return campos, sin_valor


def principal():
    peticion = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    if peticion.get('tipoMime') == 'application/pdf':
        aviso('este motor lee imagenes; el PDF lo trocea el lote antes de llegar aqui')
        sys.exit(2)
    esquema = peticion.get('esquemaDeAnotacion') or {}
    zonas = esquema.get('zonas') if isinstance(esquema, dict) and esquema.get('zonas') else None
    if zonas is None:
        zonas = ZONAS_MX
        aviso('zonas por defecto (ZONAS_MX: rfc, curp, nss)')

    img = ImageOps.grayscale(Image.open(peticion['imagen']))
    tokens = tokens_de(img, CONFIG_PAGINA)
    lineas = lineas_de(tokens)
    campos, sin_valor = campos_por_zonas(img, lineas, zonas)
    if sin_valor:
        aviso(f'{sin_valor} zona(s) con etiqueta pero sin valor con la forma esperada')
    pagina = {'indice': 0, 'markdown': markdown_de(lineas), 'campos': campos}
    if tokens:
        pagina['confianza'] = round(sum(t['conf'] for t in tokens) / len(tokens) / 100, 3)
    sys.stdout.write(json.dumps({'paginas': [pagina]}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        principal()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - el tipo basta; el mensaje podria llevar rutas o texto del documento
        aviso(f'fallo del motor: {type(error).__name__}')
        sys.exit(2)
