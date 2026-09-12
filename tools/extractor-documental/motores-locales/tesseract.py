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
from PIL import Image, ImageDraw, ImageOps

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
# `plantillas`: una por largo admitido, con L (letra), D (digito) o A (cualquiera) en cada posicion.
# Es la lista blanca que el motor LSTM ignora, aplicada por software Y por posicion: donde la forma
# exige digito, una O leida es un 0; donde exige letra, un 0 leido es una O. `enTodaLaPagina`: si
# la etiqueta no da valor, se busca la forma en todos los tokens de la pagina (la constancia de
# RENAPO imprime la CURP grande y sola en su linea, sin etiqueta al lado; medido).
ZONAS_MX = [
    {'clave': 'rfc', 'etiqueta': r'\bR\.?\s?F\.?\s?C\.?', 'listaBlanca': ALFANUMERICO, 'forma': r'^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$',
     'plantillas': ['LLLDDDDDDAAA', 'LLLLDDDDDDAAA']},
    {'clave': 'curp', 'etiqueta': r'\bC\.?\s?U\.?\s?R\.?\s?P\b|CLAVE\s+[UÚ]NICA(?:\s+DE\s+REGISTRO(?:\s+DE\s+POBLACI[OÓ]N)?)?(?:\s*\(CURP\))?:?',
     'listaBlanca': ALFANUMERICO, 'forma': r'^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$', 'plantillas': ['LLLLDDDDDDLLLLLLAD'], 'enTodaLaPagina': True},
    # El NSS vive en FORMULARIOS, no en prosa: como columna de una tabla («Tipo | NSS | Nombre», valor
    # en la linea de abajo) o bajo «No. de Afiliacion al Seguro Social». Por eso su etiqueta no incluye
    # el «Seguro Social» suelto (aparece en el texto legal) y por eso las zonas tambien miran DEBAJO.
    {'clave': 'nss', 'etiqueta': r'\bN\.?\s?S\.?\s?S\b|(?:N[OÚU]M?(?:ERO)?\.?\s*(?:DE\s+)?)?(?:SEGURIDAD\s+SOCIAL|AFILIACI[OÓ]N:?(?:\s+AL\s+SEGURO\s+SOCIAL)?)', 'listaBlanca': '0123456789', 'forma': r'^\d{11}$',
     'plantillas': ['DDDDDDDDDDD']},
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
            'texto': texto.strip(), 'conf': conf,
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


def candidatos_de_zona(img, lineas, indice_linea, inicio_x, fin_x):
    """
    Donde puede estar el valor de una etiqueta, como CAJAS y en orden: (1) a su derecha en la misma
    linea; (2) DEBAJO, en la columna que va de la etiqueta al siguiente encabezado de esa linea
    —geometrica, sin fiarse de que la pasada de pagina haya leido bien la fila: en una tabla del
    IMSS la fila de valores salio como basura y el valor estaba ahi (medido)—; (3) la linea
    siguiente entera. Gana el primero cuya lectura tiene la forma esperada.
    """
    linea = lineas[indice_linea]
    etiqueta = [t for t in linea if t['x'] + t['w'] > inicio_x and t['x'] < fin_x] or linea
    y_abajo = max(t['y'] + t['h'] for t in etiqueta)
    alto = max(t['h'] for t in etiqueta)
    candidatos = []
    derecha = [t for t in linea if t['x'] >= fin_x]
    if derecha:
        candidatos.append((caja_de(derecha), 'derecha'))
    margen = max(24, int(0.1 * (fin_x - inicio_x)))
    x0 = max(0, inicio_x - margen)
    a_la_derecha = [t['x'] for t in linea if t['x'] > fin_x + 8]
    x1 = min(img.width, (min(a_la_derecha) - 8) if a_la_derecha else img.width)
    y1 = min(img.height, y_abajo + int(2.4 * alto))
    if indice_linea + 1 < len(lineas):
        siguiente = lineas[indice_linea + 1]
        por_tokens = [t for t in siguiente if t['x'] + t['w'] >= inicio_x - margen and t['x'] <= fin_x + margen]
        if por_tokens:
            candidatos.append((caja_de(por_tokens), 'tokens_abajo'))
        en_columna = [t for t in siguiente if t['x'] + t['w'] > x0 and t['x'] < x1]
        if en_columna:
            y1 = max(y1, min(img.height, max(t['y'] + t['h'] for t in en_columna) + 4))
    if x1 > x0 + 10:
        candidatos.append(((x0, y_abajo + 2, x1, y1), 'geometrica'))
    if indice_linea + 1 < len(lineas):
        candidatos.append((caja_de(lineas[indice_linea + 1]), 'linea'))
    return candidatos


def sin_rayas(img_binaria):
    """
    Quita las lineas horizontales de un formulario (bordes de tabla, subrayados): una fila con mas
    del 60 % de pixeles oscuros no es texto. Con la raya dentro del recorte, Tesseract no leia la
    fila de valores de una tabla del IMSS (medido en sinteticas).
    """
    ancho, alto = img_binaria.size
    medias = img_binaria.resize((1, alto), Image.BOX).load()
    dibujo = ImageDraw.Draw(img_binaria)
    for y in range(alto):
        if medias[0, y] < 0.4 * 255:
            dibujo.line((0, y, ancho, y), fill=255)
    return img_binaria


# Cuanto aire lleva el recorte, segun de donde salio la caja. Medido sobre facturas y altas
# sinteticas y reales: una caja de tokens a la DERECHA de la etiqueta va ajustada a los glifos y
# necesita un tercio del alto en todas direcciones (asi salieron 7 de 7 RFC); una caja de tokens
# DEBAJO de la etiqueta no puede llevar aire arriba, porque mete la etiqueta; y una caja
# GEOMETRICA ya trae sus bordes: cualquier aire lateral mete la columna vecina (con 20 px, el
# NSS salia con un «71» pegado de la columna de al lado).
MARGENES = {'derecha': (lambda h: max(6, h // 3), lambda h: max(4, h // 3)), 'tokens_abajo': (lambda h: max(6, h // 3), lambda h: 3),
            'geometrica': (lambda h: 0, lambda h: 0), 'linea': (lambda h: max(6, h // 3), lambda h: 3)}


def lee_zona(img, caja, zona, origen='derecha'):
    x0, y0, x1, y1 = caja
    mx, my = MARGENES[origen]
    margen_x, margen_y = mx(y1 - y0), my(y1 - y0)
    recorte = img.crop((max(0, x0 - margen_x), max(0, y0 - margen_y), min(img.width, x1 + margen_x), min(img.height, y1 + margen_y)))
    if recorte.width < 12 or recorte.height < 12:
        return None
    ampliado = recorte.resize((recorte.width * ZONA_ESCALA, recorte.height * ZONA_ESCALA), Image.LANCZOS)
    if ZONA_BINARIZA:
        ampliado = sin_rayas(otsu(ampliado))
    lista = '' if os.environ.get('EXTRACTOR_SIN_LISTA_BLANCA') else f" -c tessedit_char_whitelist={zona['listaBlanca']}"
    # psm 8 (una palabra) lee mejor un identificador suelto (medido); si la zona trae varios
    # tokens («34 407093409»), psm 7 (una linea) es el que los junta.
    for psm in (ZONA_PSM, '7'):
        config = f"--psm {psm} --oem {OEM_ZONA} -l {IDIOMA} -c load_system_dawg=0 -c load_freq_dawg=0{lista}"
        try:
            palabras = [(t['texto'].upper(), t['conf']) for t in tokens_de(ampliado, config)]
        except pytesseract.TesseractError:
            # Un recorte degenerado no tumba la pagina: esa zona queda sin valor y se declara.
            continue
        if not palabras:
            continue
        if 'forma' not in zona:
            return ''.join(p for p, _ in palabras), min(c for _, c in palabras) / 100
        encontrado = valor_con_forma(palabras, zona['forma'], zona.get('plantillas', ()))
        if encontrado is not None:
            return encontrado
    return None


A_DIGITO = {'O': '0', 'Q': '0', 'D': '0', 'I': '1', 'L': '1', '|': '1', 'Z': '2', 'E': '3', 'A': '4', 'S': '5', 'G': '6', 'T': '7', 'B': '8'}
A_LETRA = {'0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B'}


def segun_plantilla(valor, plantillas):
    """
    Deshace las confusiones letra/digito POSICION a posicion segun la plantilla del largo del valor.
    Sin plantilla de ese largo, el valor va tal cual. Solo toca lo que la forma obliga: en una
    posicion «A» no se cambia nada, porque ahi una O y un 0 son ambos legitimos.
    """
    plantilla = next((p for p in plantillas if len(p) == len(valor)), None)
    if plantilla is None:
        return valor
    salida = []
    for ch, clase in zip(valor, plantilla):
        if clase == 'D':
            salida.append(A_DIGITO.get(ch, ch))
        elif clase == 'L':
            salida.append(A_LETRA.get(ch, ch))
        else:
            salida.append(ch)
    return ''.join(salida)


def clases_mal(valor, plantilla):
    """Cuantas posiciones no son de la clase que la plantilla exige (L letra, D digito, A cualquiera)."""
    mal = 0
    for ch, clase in zip(valor, plantilla):
        if clase == 'D' and not ch.isdigit():
            mal += 1
        elif clase == 'L' and not ch.isalpha():
            mal += 1
    return mal


def valor_con_forma(palabras, forma, plantillas=()):
    """
    El primer grupo de 1 a 4 tokens CONTIGUOS que, pegados y pasados por la plantilla, casan la
    forma entera. Asi la cola de la etiqueta («EMISOR:») no estorba, un valor partido
    («34 407093409») se junta, y no se recorta un identificador de en medio de otra cosa.

    Si ninguna casa entera, vale una del largo de alguna plantilla con UNA sola posicion de clase
    equivocada (una letra donde va un digito que la tabla de confusiones no conoce). Sale tal cual:
    la corrige o la rechaza el digito verificador aguas abajo, y si no puede, llega a revision con
    su region en vez de perderse.
    """
    relajado = None
    for ancho in range(1, 5):
        for i in range(0, len(palabras) - ancho + 1):
            trozo = palabras[i:i + ancho]
            crudo = ''.join(p for p, _ in trozo)
            valor = segun_plantilla(crudo, plantillas)
            if re.fullmatch(forma, valor):
                return valor, min(c for _, c in trozo) / 100
            plantilla = next((pl for pl in plantillas if len(pl) == len(valor)), None)
            if relajado is None and plantilla is not None and re.fullmatch(r'[A-ZÑ&0-9]+', valor) and clases_mal(valor, plantilla) == 1:
                relajado = (valor, min(c for _, c in trozo) / 100)
    return relajado


def por_forma_en_la_pagina(img, lineas, zona, ya_vistos):
    """
    Cuando la etiqueta no dio valor: cada linea de la pagina, por ventanas de tokens y con la
    plantilla. La CURP tiene 18 posiciones con clase fija y un digito verificador aguas abajo:
    encontrar una por su forma sola es evidencia suficiente para proponerla, no para validarla.
    """
    campos = []
    for linea in lineas:
        palabras = [(t['texto'].upper(), t['conf']) for t in linea]
        for ancho in range(1, 3):
            for i in range(0, len(palabras) - ancho + 1):
                trozo = linea[i:i + ancho]
                valor = segun_plantilla(''.join(p for p, _ in palabras[i:i + ancho]), zona.get('plantillas', ()))
                if re.fullmatch(zona['forma'], valor) and valor not in ya_vistos:
                    ya_vistos.add(valor)
                    # Se relee la zona ampliada, que es mas fiable que la pasada de pagina.
                    releido = lee_zona(img, caja_de(trozo), zona, 'derecha')
                    x0, y0, x1, y1 = caja_de(trozo)
                    campos.append({
                        'clave': zona['clave'], 'valor': releido[0] if releido else valor,
                        'confianza': round(releido[1] if releido else min(c for _, c in palabras[i:i + ancho]) / 100, 3),
                        'region': {'pagina': 0, 'x': x0 / img.width, 'y': y0 / img.height, 'ancho': (x1 - x0) / img.width, 'alto': (y1 - y0) / img.height},
                    })
    return campos


def campos_por_zonas(img, lineas, zonas):
    campos, sin_valor = [], 0
    for zona in zonas:
        if not zona.get('enTodaLaPagina'):
            continue
        vistos = set()
        campos.extend(por_forma_en_la_pagina(img, lineas, zona, vistos))
    for indice, linea in enumerate(lineas):
        texto = ' '.join(t['texto'] for t in linea).upper()
        for zona in zonas:
            m = re.search(zona['etiqueta'], texto)
            if m is None:
                continue
            # Que tokens abren y cierran la etiqueta: se acumulan largos para mapear offsets a tokens.
            acumulado, inicio_x, fin_x = 0, linea[0]['x'], linea[-1]['x'] + linea[-1]['w']
            for t in linea:
                if acumulado <= m.start() < acumulado + len(t['texto']) + 1:
                    inicio_x = t['x']
                acumulado += len(t['texto']) + 1
                if acumulado > m.end():
                    fin_x = t['x'] + t['w']
                    break
            leido, caja = None, None
            for candidato, origen in candidatos_de_zona(img, lineas, indice, inicio_x, fin_x):
                leido = lee_zona(img, candidato, zona, origen)
                if leido is not None:
                    caja = candidato
                    break
            if leido is None:
                sin_valor += 1
                continue
            x0, y0, x1, y1 = caja
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
    # Las lecturas por zona van tambien al markdown, en una seccion marcada: son transcripciones
    # del mismo motor sobre un recorte ampliado, y el cotejo contra la transcripcion (regla de la
    # spec 008, pensada para modelos que inventan) debe verlas. Sin esto, una CURP que la zona leia
    # bien y la pasada de pagina leia mal se descartaba antes de llegar al digito verificador (medido).
    markdown = markdown_de(lineas)
    if campos:
        markdown += '\n\n[lecturas por zona]\n' + '\n'.join(f"{c['clave']}: {c['valor']}" for c in campos)
    pagina = {'indice': 0, 'markdown': markdown, 'campos': campos}
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
