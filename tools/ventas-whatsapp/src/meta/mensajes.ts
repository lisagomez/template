/**
 * Los mensajes que salen, en la forma interna y en la de la Graph API (`POST /{phone_number_id}/
 * messages`), con los límites de Meta. La misma validación la usan la app (antes de enviar) y el
 * simulador (que rechaza como Meta).
 *
 * Límites verificados el 2026-09-30 (developers.facebook.com/documentation/business-messaging/
 * whatsapp/messages/*): botones de respuesta ≤ 3 con título ≤ 20; lista ≤ 10 secciones y ≤ 10
 * filas en total, título de fila ≤ 24, descripción ≤ 72, botón ≤ 20, título de sección ≤ 24;
 * cuerpo interactivo ≤ 1024 (lista ≤ 4096); encabezado y pie ≤ 60; carrusel de productos de 2 a 10
 * tarjetas del mismo catálogo; Flow con `flow_message_version: "3"` y CTA ≤ 30 (recomendado);
 * texto libre ≤ 4096. Lista de productos ≤ 30 productos y ≤ 10 secciones.
 */
import { esObjeto, texto } from '../comun/base.js';

export type CategoriaPlantilla = 'utility' | 'marketing' | 'authentication';

/**
 * Botón de respuesta rápida de una plantilla: el texto lo fija la plantilla aprobada; lo que viaja al mandarla es
 * el `payload`, y vuelve tal cual en el webhook (`type: button`, `button.payload`) cuando la persona lo toca.
 */
export interface BotonPlantilla { payload: string }

export type MensajeSaliente =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'botones'; cuerpo: string; botones: Array<{ id: string; titulo: string }>; encabezado?: string; pie?: string }
  | { tipo: 'lista'; cuerpo: string; boton: string; secciones: Array<{ titulo: string; filas: Array<{ id: string; titulo: string; descripcion?: string }> }>; encabezado?: string; pie?: string }
  | { tipo: 'producto'; catalogo: string; retailerId: string; cuerpo?: string }
  | { tipo: 'productos'; catalogo: string; encabezado: string; cuerpo: string; secciones: Array<{ titulo: string; retailerIds: string[] }> }
  | { tipo: 'carrusel'; catalogo: string; cuerpo: string; retailerIds: string[] }
  | { tipo: 'cta_url'; cuerpo: string; textoBoton: string; url: string }
  | { tipo: 'flow'; cuerpo: string; cta: string; flowId: string; flowToken: string; pantalla: string; datos?: Record<string, unknown>; encabezado?: string }
  | { tipo: 'plantilla'; nombre: string; idioma: string; parametros: string[]; botones?: BotonPlantilla[] };

const largo = (s: string | undefined, max: number, que: string, fallas: string[]) => {
  if (s !== undefined && [...s].length > max) fallas.push(`${que} excede ${max} caracteres`);
};

/** Las violaciones de los límites de Meta. Vacío = válido. */
export function validaMensaje(m: MensajeSaliente): string[] {
  const f: string[] = [];
  switch (m.tipo) {
    case 'texto':
      if (!m.texto.trim()) f.push('texto vacío');
      largo(m.texto, 4096, 'texto', f);
      break;
    case 'botones':
      if (m.botones.length < 1 || m.botones.length > 3) f.push('de 1 a 3 botones');
      for (const b of m.botones) { largo(b.titulo, 20, `botón «${b.titulo}»`, f); largo(b.id, 256, 'id de botón', f); }
      if (new Set(m.botones.map((b) => b.id)).size !== m.botones.length) f.push('ids de botón repetidos');
      largo(m.cuerpo, 1024, 'cuerpo', f); largo(m.encabezado, 60, 'encabezado', f); largo(m.pie, 60, 'pie', f);
      break;
    case 'lista': {
      const filas = m.secciones.flatMap((s) => s.filas);
      if (m.secciones.length < 1 || m.secciones.length > 10) f.push('de 1 a 10 secciones');
      if (filas.length < 1 || filas.length > 10) f.push('de 1 a 10 filas en total');
      for (const s of m.secciones) largo(s.titulo, 24, 'título de sección', f);
      for (const r of filas) { largo(r.titulo, 24, `fila «${r.titulo}»`, f); largo(r.descripcion, 72, 'descripción de fila', f); largo(r.id, 200, 'id de fila', f); }
      largo(m.boton, 20, 'botón de la lista', f); largo(m.cuerpo, 4096, 'cuerpo', f); largo(m.encabezado, 60, 'encabezado', f); largo(m.pie, 60, 'pie', f);
      break;
    }
    case 'producto':
      if (!m.catalogo || !m.retailerId) f.push('producto sin catálogo o sin id');
      break;
    case 'productos': {
      const total = m.secciones.reduce((a, s) => a + s.retailerIds.length, 0);
      if (m.secciones.length < 1 || m.secciones.length > 10) f.push('de 1 a 10 secciones de productos');
      if (total < 1 || total > 30) f.push('de 1 a 30 productos');
      largo(m.encabezado, 60, 'encabezado', f); largo(m.cuerpo, 1024, 'cuerpo', f);
      break;
    }
    case 'carrusel':
      if (m.retailerIds.length < 2 || m.retailerIds.length > 10) f.push('el carrusel lleva de 2 a 10 tarjetas');
      largo(m.cuerpo, 1024, 'cuerpo', f);
      break;
    case 'cta_url':
      largo(m.textoBoton, 20, 'texto del botón', f); largo(m.cuerpo, 1024, 'cuerpo', f);
      if (!/^https:\/\//.test(m.url)) f.push('la liga debe ser https');
      break;
    case 'flow':
      largo(m.cta, 30, 'CTA del Flow', f); largo(m.cuerpo, 1024, 'cuerpo', f); largo(m.encabezado, 60, 'encabezado', f);
      if (!m.flowToken) f.push('Flow sin flow_token');
      break;
    case 'plantilla':
      if (!m.nombre) f.push('plantilla sin nombre');
      if ((m.botones?.length ?? 0) > 10) f.push('de 0 a 10 botones de plantilla');
      for (const b of m.botones ?? []) if (!b.payload || [...b.payload].length > 256) f.push('payload de botón de plantilla vacío o de más de 256 caracteres');
      break;
  }
  return f;
}

/** Forma interna → cuerpo JSON de `POST /{phone_number_id}/messages`. */
export function aCuerpoGraph(para: string, m: MensajeSaliente): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: para };
  const envoltura = (inter: Record<string, unknown>) => ({ ...base, type: 'interactive', interactive: inter });
  const cabeza = (t?: string) => (t ? { header: { type: 'text', text: t } } : {});
  const pie = (t?: string) => (t ? { footer: { text: t } } : {});
  switch (m.tipo) {
    case 'texto': return { ...base, type: 'text', text: { body: m.texto, preview_url: false } };
    case 'botones': return envoltura({
      type: 'button', ...cabeza(m.encabezado), body: { text: m.cuerpo }, ...pie(m.pie),
      action: { buttons: m.botones.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo } })) },
    });
    case 'lista': return envoltura({
      type: 'list', ...cabeza(m.encabezado), body: { text: m.cuerpo }, ...pie(m.pie),
      action: { button: m.boton, sections: m.secciones.map((s) => ({ title: s.titulo, rows: s.filas.map((r) => ({ id: r.id, title: r.titulo, ...(r.descripcion ? { description: r.descripcion } : {}) })) })) },
    });
    case 'producto': return envoltura({
      type: 'product', ...(m.cuerpo ? { body: { text: m.cuerpo } } : {}),
      action: { catalog_id: m.catalogo, product_retailer_id: m.retailerId },
    });
    case 'productos': return envoltura({
      type: 'product_list', header: { type: 'text', text: m.encabezado }, body: { text: m.cuerpo },
      action: { catalog_id: m.catalogo, sections: m.secciones.map((s) => ({ title: s.titulo, product_items: s.retailerIds.map((r) => ({ product_retailer_id: r })) })) },
    });
    case 'carrusel': return envoltura({
      type: 'carousel', body: { text: m.cuerpo },
      action: { cards: m.retailerIds.map((r, i) => ({ card_index: i, type: 'product', action: { product_retailer_id: r, catalog_id: m.catalogo } })) },
    });
    case 'cta_url': return envoltura({
      type: 'cta_url', body: { text: m.cuerpo },
      action: { name: 'cta_url', parameters: { display_text: m.textoBoton, url: m.url } },
    });
    case 'flow': return envoltura({
      type: 'flow', ...cabeza(m.encabezado), body: { text: m.cuerpo },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3', flow_token: m.flowToken, flow_id: m.flowId, flow_cta: m.cta, flow_action: 'data_exchange',
          flow_action_payload: { screen: m.pantalla, ...(m.datos ? { data: m.datos } : {}) },
        },
      },
    });
    case 'plantilla': return {
      ...base, type: 'template',
      template: {
        name: m.nombre, language: { code: m.idioma },
        components: [
          ...(m.parametros.length ? [{ type: 'body', parameters: m.parametros.map((p) => ({ type: 'text', text: p })) }] : []),
          ...(m.botones ?? []).map((b, i) => ({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: b.payload }] })),
        ],
      },
    };
  }
}

/** Lo que hace el lado de Meta (el simulador): cuerpo Graph → forma interna, o por qué no. */
export function desdeCuerpoGraph(c: unknown): { ok: true; para: string; mensaje: MensajeSaliente } | { ok: false; error: string } {
  if (!esObjeto(c) || c.messaging_product !== 'whatsapp') return { ok: false, error: '(#100) messaging_product debe ser whatsapp' };
  const para = texto(c.to);
  if (!para) return { ok: false, error: '(#100) falta el destinatario' };
  const t = texto(c.type);
  const mal = { ok: false as const, error: `(#100) mensaje ${t ?? '?'} mal formado` };
  if (t === 'text' && esObjeto(c.text)) return { ok: true, para, mensaje: { tipo: 'texto', texto: texto(c.text.body) ?? '' } };
  if (t === 'template' && esObjeto(c.template)) {
    const tp = c.template;
    const comps = Array.isArray(tp.components) ? tp.components : [];
    const cuerpo = comps.find((x) => esObjeto(x) && x.type === 'body');
    const parametros = esObjeto(cuerpo) && Array.isArray(cuerpo.parameters) ? cuerpo.parameters.map((p) => (esObjeto(p) ? texto(p.text) ?? '' : '')) : [];
    const botones = comps.filter((x) => esObjeto(x) && x.type === 'button' && x.sub_type === 'quick_reply').map((x) => {
      const p = esObjeto(x) && Array.isArray(x.parameters) ? x.parameters[0] : undefined;
      return { payload: esObjeto(p) ? texto(p.payload) ?? '' : '' };
    });
    return { ok: true, para, mensaje: { tipo: 'plantilla', nombre: texto(tp.name) ?? '', idioma: esObjeto(tp.language) ? texto(tp.language.code) ?? '' : '', parametros, ...(botones.length ? { botones } : {}) } };
  }
  if (t !== 'interactive' || !esObjeto(c.interactive)) return mal;
  const i = c.interactive;
  const cuerpo = esObjeto(i.body) ? texto(i.body.text) ?? '' : '';
  const encabezado = esObjeto(i.header) ? texto(i.header.text) : undefined;
  const pie = esObjeto(i.footer) ? texto(i.footer.text) : undefined;
  const accion = esObjeto(i.action) ? i.action : null;
  if (!accion) return mal;
  const extra = { ...(encabezado ? { encabezado } : {}), ...(pie ? { pie } : {}) };
  switch (i.type) {
    case 'button': {
      const botones = (Array.isArray(accion.buttons) ? accion.buttons : []).map((b) => (esObjeto(b) && esObjeto(b.reply) ? { id: texto(b.reply.id) ?? '', titulo: texto(b.reply.title) ?? '' } : { id: '', titulo: '' }));
      return { ok: true, para, mensaje: { tipo: 'botones', cuerpo, botones, ...extra } };
    }
    case 'list': {
      const secciones = (Array.isArray(accion.sections) ? accion.sections : []).filter(esObjeto).map((s) => ({
        titulo: texto(s.title) ?? '',
        filas: (Array.isArray(s.rows) ? s.rows : []).filter(esObjeto).map((r) => {
          const d = texto(r.description);
          return { id: texto(r.id) ?? '', titulo: texto(r.title) ?? '', ...(d ? { descripcion: d } : {}) };
        }),
      }));
      return { ok: true, para, mensaje: { tipo: 'lista', cuerpo, boton: texto(accion.button) ?? '', secciones, ...extra } };
    }
    case 'product':
      return { ok: true, para, mensaje: { tipo: 'producto', catalogo: texto(accion.catalog_id) ?? '', retailerId: texto(accion.product_retailer_id) ?? '', ...(cuerpo ? { cuerpo } : {}) } };
    case 'product_list': {
      const secciones = (Array.isArray(accion.sections) ? accion.sections : []).filter(esObjeto).map((s) => ({
        titulo: texto(s.title) ?? '',
        retailerIds: (Array.isArray(s.product_items) ? s.product_items : []).filter(esObjeto).map((p) => texto(p.product_retailer_id) ?? ''),
      }));
      return { ok: true, para, mensaje: { tipo: 'productos', catalogo: texto(accion.catalog_id) ?? '', encabezado: encabezado ?? '', cuerpo, secciones } };
    }
    case 'carousel': {
      const tarjetas = (Array.isArray(accion.cards) ? accion.cards : []).filter(esObjeto);
      const catalogos = new Set(tarjetas.map((k) => (esObjeto(k.action) ? texto(k.action.catalog_id) : undefined)));
      if (catalogos.size > 1) return { ok: false, error: '(#100) todas las tarjetas deben ser del mismo catálogo' };
      const retailerIds = tarjetas.map((k) => (esObjeto(k.action) ? texto(k.action.product_retailer_id) ?? '' : ''));
      return { ok: true, para, mensaje: { tipo: 'carrusel', catalogo: [...catalogos][0] ?? '', cuerpo, retailerIds } };
    }
    case 'cta_url': {
      const p = esObjeto(accion.parameters) ? accion.parameters : {};
      return { ok: true, para, mensaje: { tipo: 'cta_url', cuerpo, textoBoton: texto(p.display_text) ?? '', url: texto(p.url) ?? '' } };
    }
    case 'flow': {
      const p = esObjeto(accion.parameters) ? accion.parameters : {};
      if (p.flow_message_version !== '3') return { ok: false, error: '(#100) flow_message_version debe ser "3"' };
      const carga = esObjeto(p.flow_action_payload) ? p.flow_action_payload : {};
      const datos = esObjeto(carga.data) ? carga.data : undefined;
      return {
        ok: true, para,
        mensaje: {
          tipo: 'flow', cuerpo, cta: texto(p.flow_cta) ?? '', flowId: texto(p.flow_id) ?? '', flowToken: texto(p.flow_token) ?? '',
          pantalla: texto(carga.screen) ?? '', ...(datos ? { datos } : {}), ...(encabezado ? { encabezado } : {}),
        },
      };
    }
    default:
      return mal;
  }
}

/** Resumen legible de un mensaje saliente, para transcripciones y la bandeja. */
export function resumeMensaje(m: MensajeSaliente): string {
  switch (m.tipo) {
    case 'texto': return m.texto;
    case 'botones': return `${m.cuerpo} [${m.botones.map((b) => b.titulo).join(' | ')}]`;
    case 'lista': return `${m.cuerpo} [lista «${m.boton}»: ${m.secciones.flatMap((s) => s.filas.map((r) => r.titulo)).join(', ')}]`;
    case 'producto': return `${m.cuerpo ?? ''} [producto ${m.retailerId}]`.trim();
    case 'productos': return `${m.cuerpo} [catálogo: ${m.secciones.flatMap((s) => s.retailerIds).join(', ')}]`;
    case 'carrusel': return `${m.cuerpo} [carrusel: ${m.retailerIds.join(', ')}]`;
    case 'cta_url': return `${m.cuerpo} [${m.textoBoton} → ${m.url}]`;
    case 'flow': return `${m.cuerpo} [Flow «${m.cta}» → ${m.pantalla}]`;
    case 'plantilla': return `[plantilla ${m.nombre}: ${m.parametros.join(' · ')}]`;
  }
}
