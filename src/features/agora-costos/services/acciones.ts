'use server';

/**
 * Leer un CFDI para registrar su ejercido: se lee el XML (es el documento fiscal; el PDF solo es su impresión) con el
 * lector del extractor documental. El sello NO se verifica: leer bien no es autenticar. Un UUID repetido lo rechaza
 * la base al registrar.
 */
import { z } from 'zod';
import { analizaXml, atributo, hijo, CFDI_40, TIMBRE_11 } from '../../../../tools/extractor-documental/dist/xml/index.js';

export async function leeCfdi(xml: string): Promise<{ ok: true; uuid: string; total: number; rfc: string; emisor: string; fecha: string } | { ok: false; motivo: string }> {
  const texto = z.string().min(20).max(500_000).parse(xml);
  try {
    const doc = analizaXml(texto);
    const r = doc.raiz;
    if (r.espacio !== CFDI_40 || r.nombreLocal !== 'Comprobante') return { ok: false, motivo: 'no es un CFDI 4.0 (la raíz no es cfdi:Comprobante)' };
    const emisor = hijo(r, CFDI_40, 'Emisor');
    const complemento = hijo(r, CFDI_40, 'Complemento');
    const timbre = complemento ? hijo(complemento, TIMBRE_11, 'TimbreFiscalDigital') : null;
    const uuid = timbre ? atributo(timbre, 'UUID') : null;
    if (!uuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) return { ok: false, motivo: 'el CFDI no trae un UUID de timbre válido' };
    return { ok: true, uuid: uuid.toLowerCase(), total: Number(atributo(r, 'Total') ?? 0), rfc: atributo(emisor ?? r, 'Rfc') ?? '', emisor: atributo(emisor ?? r, 'Nombre') ?? '', fecha: (atributo(r, 'Fecha') ?? '').slice(0, 10) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'XML ilegible' };
  }
}
