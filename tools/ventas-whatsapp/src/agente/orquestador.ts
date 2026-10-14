/**
 * El orquestador: el agente que atiende WhatsApp. No hace el trabajo de los dominios, lo pide por
 * A2A (con `tenant`, `contextId` y `messageId`). Su trabajo es decidir qué pedir, cuidar las
 * barreras, pasar al dueño cuando toca y responder con POCOS mensajes ricos (botones, carrusel,
 * Flows): desde el 1/oct/2026 cada respuesta cuesta.
 *
 * Los disparadores del traspaso NO dependen del modelo: queja y petición de una persona se
 * detectan antes de llamarlo; monto sobre umbral lo decide `pedidos`; dos fallos de comprensión y
 * el presupuesto los cuenta este archivo. Un modelo que «no quiere» pasar al humano no lo evita.
 */
import type { GeneradorIds, Reloj } from '../comun/base.js';
import type { AlmacenInquilino } from '../almacen/almacen.js';
import type { MensajeEntrante } from '../meta/webhook.js';
import type { MensajeSaliente } from '../meta/mensajes.js';
import { mesDeFacturacion, type TarjetaDeTarifas } from '../meta/tarifas.js';
import type { Contacto, Conversacion, Inquilino, MotivoTraspaso } from '../modelo.js';
import { artefacto, type BusA2A, type Tarea } from './a2a-modelo.js';
import { esQueja, pideHumano, revisaEntrada, revisaSalida, VOCABULARIO_COMERCIO, type Respaldo } from './barreras.js';
import { HERRAMIENTAS, formatoPrecio, intencion, textoDeProductos, type LlamadaHerramienta, type MensajeModelo, type ModeloLenguaje, type ResultadoModelo } from './modelos.js';
import { buscaFaq } from '../dominios/soporte.js';
import { compacta } from './optimizacion.js';
import { firmaTokenFlow, leeTokenFlow, type TipoFlow } from '../flows/token.js';
import { pliega, DIA } from '../comun/base.js';

export const PROMPT_VENTAS_V1 = 'ventas-v1';

export function instrucciones(i: Inquilino): string {
  return [
    `Eres el asistente de ventas de ${i.nombre}, ${i.giro} en ${i.ciudad}. Versión ${PROMPT_VENTAS_V1}.`,
    `Solo hablas de ${i.nombre}: su catálogo, pedidos, reservaciones, horarios y políticas. Cualquier otro tema lo declinas con amabilidad.`,
    'Precios y existencias SOLO de las herramientas; nunca los inventes ni los estimes.',
    `Si el cliente se queja o pide una persona, usa escalar_a_humano: lo atiende ${i.dueno.nombre}.`,
    'Respuestas cortas, en español de México, tuteando. No pidas datos de tarjeta: el pago va por la liga.',
  ].join('\n');
}

export interface OpcionesOrquestador {
  modelo: ModeloLenguaje;
  bus: BusA2A;
  reloj: Reloj;
  ids: GeneradorIds;
  secretoTokens: string;
  tarjeta: TarjetaDeTarifas;
  /** Dominios de las ligas que el agente puede mandar (el procesador). */
  dominiosLiga: string[];
  optimizacion?: Partial<Optimizacion>;
}

/**
 * Las tres palancas de costo del turno. Todas encendidas por omisión; el laboratorio las apaga
 * para medir cuánto ahorran (y para probar la barrera de salida contra el modelo adversarial).
 */
export interface Optimizacion {
  /** Saludo, catálogo, producto, FAQ, reserva y despedida se atienden SIN modelo. */
  enrutador: boolean;
  /** Si la herramienta ya da la respuesta, no se vuelve a llamar al modelo para redactarla. */
  sinSegundaLlamada: boolean;
  /** Varios mensajes de un turno se juntan en uno cuando caben (cada mensaje cuesta). */
  compacta: boolean;
}

export const OPTIMIZACION_POR_OMISION: Optimizacion = { enrutador: true, sinSegundaLlamada: true, compacta: true };

export interface Turno {
  inquilino: Inquilino;
  datos: AlmacenInquilino;
  conversacion: Conversacion;
  contacto: Contacto;
  mensaje: MensajeEntrante;
  /** Texto ya limpio: sin etiqueta de origen y con datos sensibles ocultos. */
  texto: string;
  /** Ráfaga en el número (frontera): se atiende con el enrutador y los traspasos, sin modelo. */
  protegido?: boolean;
}

export interface Bitacora { tipo: string; detalle: string }

export interface ResultadoTurno {
  salientes: MensajeSaliente[];
  conversacion: Conversacion;
  contacto: Contacto;
  bitacora: Bitacora[];
}

const MENSAJE_TRASPASO: Record<MotivoTraspaso, (dueno: string) => string> = {
  queja: (d) => `Lamento mucho lo que pasó. Te comunico con ${d}, que lo revisa personalmente y te responde por aquí.`,
  monto: (d) => `Tu pedido necesita la confirmación de ${d}. Te escribe en unos minutos por aquí mismo.`,
  comprension: (d) => `Para no hacerte perder tiempo, te comunico con ${d}. Te responde por aquí.`,
  presupuesto: (d) => `Te comunico con ${d} para seguir atendiéndote. Te responde por aquí.`,
  inquilino_sin_presupuesto: (d) => `Te comunico con ${d} para seguir atendiéndote. Te responde por aquí.`,
  solicitud: (d) => `Claro, te comunico con ${d}. Te responde por aquí en cuanto pueda.`,
  modelo_no_disponible: (d) => `Te comunico con ${d} para seguir atendiéndote. Te responde por aquí.`,
};

const botonesMenu = (i: Inquilino): Array<{ id: string; titulo: string }> => i.giro === 'restaurante'
  ? [{ id: 'menu', titulo: 'Ver menú' }, { id: 'reservar', titulo: 'Reservar mesa' }, { id: 'humano', titulo: 'Hablar con alguien' }]
  : [{ id: 'menu', titulo: 'Ver catálogo' }, { id: 'politicas', titulo: 'Envíos y pagos' }, { id: 'humano', titulo: 'Hablar con alguien' }];

type ProductoVista = { retailerId: string; nombre: string; precioCentavos: number; existencias: number; categoria: string; descripcion?: string };

export function creaOrquestador(o: OpcionesOrquestador) {
  return {
    async atiende(t: Turno): Promise<ResultadoTurno> {
      const s = new Sesion(o, t);
      await s.corre();
      return s.resultado();
    },
  };
}

class Sesion {
  private readonly o: OpcionesOrquestador;
  private readonly t: Turno;
  private conv: Conversacion;
  private contacto: Contacto;
  private readonly salientes: MensajeSaliente[] = [];
  private readonly bitacora: Bitacora[] = [];
  private readonly ahora: number;
  private pasos = 0;

  constructor(o: OpcionesOrquestador, t: Turno) {
    this.o = o;
    this.t = t;
    this.conv = { ...t.conversacion };
    this.contacto = { ...t.contacto };
    this.ahora = o.reloj();
  }

  resultado(): ResultadoTurno {
    const salientes = this.opt.compacta ? compacta(this.salientes) : this.salientes;
    if (salientes.length < this.salientes.length) this.bitacora.push({ tipo: 'compactado', detalle: `${this.salientes.length} → ${salientes.length} mensajes` });
    return { salientes, conversacion: this.conv, contacto: this.contacto, bitacora: this.bitacora };
  }

  private get opt(): Optimizacion { return { ...OPTIMIZACION_POR_OMISION, ...this.o.optimizacion }; }

  private get i() { return this.t.inquilino; }
  private base() { return { tenant: this.i.id, contextId: this.conv.contextId }; }
  private id(sufijo: string) { return `${this.t.mensaje.wamid}:${this.pasos++}:${sufijo}`; }
  private pide(dominio: string, skill: string, datos: Record<string, unknown>): Promise<Tarea> {
    return this.o.bus.envia(dominio, { ...this.base(), skill, datos, messageId: this.id(skill) });
  }

  async corre(): Promise<void> {
    if (this.conv.estado === 'pausada_eco') {
      if (this.ahora < (this.conv.pausadaHasta ?? 0)) { this.bitacora.push({ tipo: 'silencio', detalle: 'el dueño contestó desde su celular' }); return; }
      this.conv.estado = 'agente';
    }
    if (this.conv.estado === 'humano') { this.bitacora.push({ tipo: 'silencio', detalle: 'la conversación la lleva el dueño' }); return; }
    const primerContacto = !this.contacto.avisoPrivacidadEn;
    const m = this.t.mensaje;
    if (m.pedido) await this.pedidoDeCarrito();
    else if (m.interactivo?.tipo === 'flow') await this.respuestaDeFlow(m.interactivo.respuesta);
    else if (m.interactivo) await this.boton(m.interactivo.id, m.interactivo.titulo);
    else await this.textoLibre(this.t.texto);
    if (primerContacto && this.salientes.length) {
      this.contacto.avisoPrivacidadEn = this.ahora;
      this.contacto.optIn ??= { fecha: this.ahora, fuente: 'el cliente inició la conversación (solo mensajes de servicio)' };
      this.salientes[0] = conAviso(this.salientes[0]!);
    }
    this.conv.turnos++;
    if (this.salientes.length && this.conv.primeraRespuestaEn === undefined) this.conv.primeraRespuestaEn = this.ahora;
  }

  private async traspasa(motivo: MotivoTraspaso, detalle: string): Promise<void> {
    await this.pide('soporte', 'abrir_caso', { conversacionId: this.conv.id, waId: this.conv.waId, motivo, detalle });
    this.conv.estado = 'humano';
    this.salientes.push({ tipo: 'texto', texto: MENSAJE_TRASPASO[motivo](this.i.dueno.nombre) });
    this.bitacora.push({ tipo: 'traspaso', detalle: `${motivo}: ${detalle}` });
  }

  private menu(cuerpo: string): void {
    this.salientes.push({ tipo: 'botones', cuerpo, botones: botonesMenu(this.i) });
  }

  private flow(tipo: TipoFlow, cuerpo: string, cta: string, pedidoId?: string): void {
    const flowId = this.i.canal.flows[tipo];
    if (!flowId) { this.menu('Ese formulario no está disponible por ahora.'); return; }
    const token = firmaTokenFlow(this.o.secretoTokens, { t: this.i.id, c: this.conv.id, w: this.conv.waId, f: tipo, ...(pedidoId ? { p: pedidoId } : {}), e: this.ahora + DIA });
    const pantalla = tipo === 'entrega' ? 'ENTREGA' : tipo === 'checkout' ? 'ENVIO' : tipo === 'reserva' ? 'DIA' : 'CALIFICA';
    this.salientes.push({ tipo: 'flow', cuerpo, cta, flowId, flowToken: token, pantalla });
  }

  private productos(lista: ProductoVista[], cuerpo: string): void {
    const con = lista.filter((p) => p.existencias > 0);
    const catalogo = this.i.canal.catalogoId;
    if (!con.length) { this.menu(cuerpo || 'No lo tenemos por ahora. ¿Te muestro lo que sí hay?'); return; }
    if (con.length === 1) { this.salientes.push({ tipo: 'producto', catalogo, retailerId: con[0]!.retailerId, cuerpo }); return; }
    if (con.length <= 10) { this.salientes.push({ tipo: 'carrusel', catalogo, cuerpo, retailerIds: con.map((p) => p.retailerId) }); return; }
    const porCategoria = new Map<string, string[]>();
    for (const p of con.slice(0, 30)) porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), p.retailerId]);
    this.salientes.push({ tipo: 'productos', catalogo, encabezado: this.i.nombre.slice(0, 60), cuerpo, secciones: [...porCategoria].slice(0, 10).map(([titulo, retailerIds]) => ({ titulo: titulo.slice(0, 24), retailerIds })) });
  }

  private async pedidoDeCarrito(): Promise<void> {
    const m = this.t.mensaje;
    const r = await this.pide('pedidos', 'crear_pedido', {
      origenWamid: m.wamid, conversacionId: this.conv.id, waId: this.conv.waId,
      items: (m.pedido?.items ?? []).map((i) => ({ retailerId: i.retailerId, cantidad: i.cantidad, precioCentavos: i.precioCentavos })),
    });
    await this.resultadoDePedido(r);
  }

  private async resultadoDePedido(r: Tarea): Promise<void> {
    this.conv.intencionCompra = true;
    const p = artefacto(r, 'pedido') as { id: string; items: Array<{ nombre: string; cantidad: number }>; subtotalCentavos: number; totalCentavos: number } | undefined;
    if (r.estado === 'TASK_STATE_REJECTED' && r.motivo === 'monto' && p) { await this.traspasa('monto', `pedido ${p.id} por ${formatoPrecio(p.totalCentavos)}`); return; }
    if (r.estado === 'TASK_STATE_REJECTED') {
      const sin = artefacto(r, 'sin_existencias') as { productos: string[] } | undefined;
      this.menu(sin ? `Se nos acabó: ${sin.productos.join(', ')}. ¿Te muestro otras opciones?` : 'No pude armar ese pedido con nuestro catálogo. ¿Lo vemos juntos?');
      return;
    }
    if (!p) return;
    this.conv.carritoId = p.id;
    const resumen = p.items.map((x) => `${x.cantidad} × ${x.nombre}`).join(', ');
    const tipo: TipoFlow = this.i.giro === 'tienda' ? 'checkout' : 'entrega';
    this.flow(tipo, `Tu pedido: ${resumen}. Subtotal ${formatoPrecio(p.subtotalCentavos)}. Completa la entrega y te doy el total.`, 'Datos de entrega', p.id);
  }

  private async respuestaDeFlow(respuesta: Record<string, unknown>): Promise<void> {
    const tok = leeTokenFlow(this.o.secretoTokens, String(respuesta.flow_token ?? ''), this.ahora);
    if (!tok || tok.t !== this.i.id || tok.c !== this.conv.id) {
      this.bitacora.push({ tipo: 'flow_rechazado', detalle: 'flow_token ajeno o vencido' });
      this.menu('Ese formulario ya venció. ¿Empezamos de nuevo?');
      return;
    }
    if ((tok.f === 'entrega' || tok.f === 'checkout') && tok.p) {
      const r = await this.pide('pedidos', 'liga_pago', { pedidoId: tok.p });
      const l = artefacto(r, 'liga') as { url: string; pedido: { totalCentavos: number } } | undefined;
      if (r.estado !== 'TASK_STATE_COMPLETED' || !l) { await this.traspasa('comprension', `no se pudo generar la liga: ${r.motivo ?? r.estado}`); return; }
      this.salientes.push({ tipo: 'cta_url', cuerpo: `Total ${formatoPrecio(l.pedido.totalCentavos)}. Paga seguro con la liga y te confirmo por aquí.`, textoBoton: 'Pagar', url: l.url });
      return;
    }
    if (tok.f === 'reserva') {
      this.salientes.push({ tipo: 'texto', texto: `¡Listo! Reservación confirmada: ${String(respuesta.resumen ?? 'tu mesa')}. Te esperamos.` });
      return;
    }
    if (tok.f === 'lead') {
      const r = await this.pide('ventas', 'calificar_lead', { conversacionId: this.conv.id, waId: this.conv.waId, respuestas: { presupuesto: String(respuesta.presupuesto ?? ''), cuando: String(respuesta.cuando ?? ''), zona: String(respuesta.zona ?? '') } });
      const lead = artefacto(r, 'lead') as { calificado: boolean } | undefined;
      this.menu(lead?.calificado ? '¡Gracias! Con eso te armo opciones a tu medida.' : '¡Gracias! Cuando quieras, aquí tienes el catálogo.');
    }
  }

  private async boton(id: string, titulo: string): Promise<void> {
    if (id === 'humano') { await this.traspasa('solicitud', 'tocó «Hablar con alguien»'); return; }
    if (id === 'reservar') { this.flow('reserva', 'Elige día, personas y hora; te confirmo al momento.', 'Reservar'); return; }
    if (id === 'lead') { this.flow('lead', 'Tres preguntas rápidas para recomendarte bien.', 'Contestar'); return; }
    if (id === 'menu') {
      const r = await this.pide('catalogo', 'listar', {});
      this.productos(((artefacto(r, 'productos') as { productos: ProductoVista[] } | undefined)?.productos) ?? [], `Esto tenemos hoy en ${this.i.nombre}:`);
      return;
    }
    if (id === 'politicas') {
      this.salientes.push({ tipo: 'lista', cuerpo: '¿Qué quieres saber?', boton: 'Ver temas', secciones: [{ titulo: 'Preguntas', filas: this.i.faqs.slice(0, 10).map((f) => ({ id: `faq:${f.id}`, titulo: f.pregunta.slice(0, 24) })) }] });
      return;
    }
    if (id.startsWith('faq:')) {
      const f = this.i.faqs.find((x) => `faq:${x.id}` === id);
      if (f) { this.salientes.push({ tipo: 'texto', texto: f.respuesta }); return; }
    }
    await this.textoLibre(titulo);
  }

  private async tokensDelMes(): Promise<number> {
    const mes = mesDeFacturacion(this.ahora, this.o.tarjeta);
    return (await this.t.datos.lista('usoIa')).filter((u) => mesDeFacturacion(u.instante, this.o.tarjeta) === mes).reduce((a, u) => a + (u.tokensEntrada ?? 0) + (u.tokensSalida ?? 0), 0);
  }

  private async registraUso(r: ResultadoModelo): Promise<void> {
    const uso = r.ok ? r.respuesta.uso : null;
    const precio = this.o.modelo.precio;
    const costo = uso && precio ? Math.round((uso.entrada * precio.entrada + uso.salida * precio.salida) / 1_000_000) : null;
    const id = this.o.ids('uso');
    await this.t.datos.guarda('usoIa', id, { id, instante: this.ahora, conversacionId: this.conv.id, modelo: this.o.modelo.id, tokensEntrada: uso?.entrada ?? null, tokensSalida: uso?.salida ?? null, costoMicros: costo, simulado: this.o.modelo.simulado });
    if (uso) this.conv.tokens += uso.entrada + uso.salida;
  }

  private async textoLibre(texto: string): Promise<void> {
    const pol = this.i.politicas;
    if (esQueja(texto)) { await this.traspasa('queja', texto.slice(0, 140)); return; }
    if (pideHumano(texto)) { await this.traspasa('solicitud', texto.slice(0, 140)); return; }
    if (this.conv.turnos >= pol.maxTurnosConversacion || this.conv.tokens >= pol.maxTokensConversacion) { await this.traspasa('presupuesto', `turnos ${this.conv.turnos}, tokens ${this.conv.tokens}`); return; }
    const v = revisaEntrada(texto, pol.temasRestringidos);
    if (v.tipo !== 'permitido') {
      this.bitacora.push({ tipo: 'bloqueo_entrada', detalle: `${v.tipo}: ${v.pista}` });
      this.menu(`Solo puedo ayudarte con lo de ${this.i.nombre}: ${this.i.giro === 'restaurante' ? 'menú, pedidos y reservaciones' : 'catálogo, pedidos y envíos'}.`);
      return;
    }
    if (pliega(texto).includes('privacidad')) {
      const f = this.i.faqs.find((x) => x.id === 'privacidad');
      if (f) { this.salientes.push({ tipo: 'texto', texto: f.respuesta }); return; }
    }
    if ((this.opt.enrutador || this.t.protegido) && await this.sinModelo(texto)) return;
    if (this.t.protegido) {
      this.bitacora.push({ tipo: 'sin_modelo_por_rafaga', detalle: texto.slice(0, 80) });
      this.menu('Ahorita tenemos muchos mensajes. Elige una opción y te atiendo, o escríbeme en un rato.');
      return;
    }
    // Sin presupuesto de IA, lo determinista sigue atendiendo: solo lo que necesita modelo pasa al dueño.
    if (await this.tokensDelMes() >= pol.presupuestoTokensMensual) { await this.traspasa('inquilino_sin_presupuesto', 'se agotó el presupuesto mensual de IA del negocio'); return; }
    await this.conModelo(texto);
  }

  /**
   * El enrutador determinista: lo que se entiende con reglas explicables se atiende con datos del
   * catálogo y de las FAQ, sin llamar al modelo (cero tokens, cero texto inventado). Devuelve `false`
   * si no está seguro: entonces decide el modelo.
   */
  private async sinModelo(texto: string): Promise<boolean> {
    const i = intencion(texto);
    const marca = (que: string) => this.bitacora.push({ tipo: 'sin_modelo', detalle: que });
    switch (i.tipo) {
      case 'saludo': this.menu(`¡Hola! Soy el asistente de ${this.i.nombre}. Puedo mostrarte ${this.i.giro === 'restaurante' ? 'el menú, tomar tu pedido o apartar tu mesa' : 'el catálogo, tomar tu pedido o resolver dudas de envío'}.`); marca('saludo'); return true;
      case 'despedida': this.salientes.push({ tipo: 'texto', texto: '¡Gracias por escribirnos! Aquí estamos cuando quieras.' }); marca('despedida'); return true;
      case 'reserva': if (this.i.canal.flows.reserva) { this.flow('reserva', 'Elige día, personas y hora; te confirmo al momento.', 'Reservar'); marca('reserva'); return true; } return false;
      case 'catalogo': {
        const r = await this.pide('catalogo', 'listar', {});
        const productos = ((artefacto(r, 'productos') as { productos: ProductoVista[] } | undefined)?.productos) ?? [];
        this.productos(productos, textoDeProductos(productos)); marca('catalogo'); return true;
      }
      case 'producto': {
        const r = await this.pide('ventas', 'recomendar', { consulta: i.consulta ?? texto });
        const productos = ((artefacto(r, 'productos') as { productos: ProductoVista[] } | undefined)?.productos) ?? [];
        if (!productos.length) return false;
        this.productos(productos, textoDeProductos(productos)); marca('producto'); return true;
      }
      case 'politica': {
        const f = buscaFaq(this.i.faqs, texto);
        if (!f) return false;
        this.salientes.push({ tipo: 'texto', texto: f.respuesta }); marca('politica'); return true;
      }
      default: return false;
    }
  }

  private async historial(): Promise<MensajeModelo[]> {
    const ms = (await this.t.datos.lista('mensajes')).filter((m) => m.conversacionId === this.conv.id && (m.direccion === 'entrante' || m.direccion === 'saliente'))
      .sort((a, b) => a.instante - b.instante).slice(-7, -1);
    return ms.map((m) => ({ rol: m.direccion === 'entrante' ? 'cliente' : 'agente', texto: m.resumen }));
  }

  private async conModelo(texto: string): Promise<void> {
    const peticion = { sistema: instrucciones(this.i), mensajes: [...await this.historial(), { rol: 'cliente' as const, texto }], herramientas: HERRAMIENTAS, negocio: { nombre: this.i.nombre, giro: this.i.giro, dueno: this.i.dueno.nombre } };
    const r1 = await this.o.modelo.decide(peticion);
    await this.registraUso(r1);
    if (!r1.ok) {
      this.bitacora.push({ tipo: 'modelo', detalle: 'noMedido' in r1 ? `no medido: ${r1.noMedido}` : r1.error });
      await this.traspasa('modelo_no_disponible', 'el modelo no respondió');
      return;
    }
    const resultados: Array<{ llamada: LlamadaHerramienta; tarea?: Tarea }> = [];
    for (const llamada of r1.respuesta.llamadas.slice(0, 3)) {
      if (llamada.herramienta === 'escalar_a_humano') { await this.traspasa('solicitud', String(llamada.argumentos.motivo ?? 'el agente escaló')); return; }
      resultados.push({ llamada, ...(await this.ejecuta(llamada)) });
    }
    let final = r1.respuesta;
    const bastaLaHerramienta = this.opt.sinSegundaLlamada && resultados.length > 0 && resultados.every((x) => x.tarea && ['buscar_producto', 'ver_catalogo', 'responder_politica'].includes(x.llamada.herramienta));
    if (bastaLaHerramienta) {
      // El texto sale de los datos de la herramienta (catálogo o FAQ): no se paga una segunda llamada para redactarlo.
      const t = resultados[0]!.tarea!;
      const productos = ((artefacto(t, 'productos') as { productos: ProductoVista[] } | undefined)?.productos);
      const pol = artefacto(t, 'politica') as { respuesta?: string } | undefined;
      final = { ...r1.respuesta, texto: productos ? textoDeProductos(productos) : pol?.respuesta ?? '', entendido: productos ? true : Boolean(pol?.respuesta) };
      this.bitacora.push({ tipo: 'sin_segunda_llamada', detalle: resultados[0]!.llamada.herramienta });
    } else if (resultados.some((x) => x.tarea)) {
      const conResultados = [...peticion.mensajes, ...resultados.filter((x) => x.tarea).map((x) => ({ rol: 'herramienta' as const, herramienta: x.llamada.herramienta, texto: '', datos: x.tarea!.artefactos[0]?.datos ?? { motivo: x.tarea!.motivo } }))];
      const r2 = await this.o.modelo.decide({ ...peticion, mensajes: conResultados });
      await this.registraUso(r2);
      if (r2.ok) final = r2.respuesta;
    }
    if (!final.entendido || !r1.respuesta.entendido) {
      this.conv.fallosComprension++;
      if (this.conv.fallosComprension >= 2) { await this.traspasa('comprension', 'dos mensajes seguidos sin entenderse'); return; }
      this.menu('No te entendí bien. ¿Me ayudas con una de estas opciones?');
      return;
    }
    this.conv.fallosComprension = 0;
    const cuerpo = await this.revisa(final.texto, resultados.map((x) => x.tarea).filter((x): x is Tarea => !!x));
    await this.pinta(cuerpo, resultados);
  }

  private async ejecuta(l: LlamadaHerramienta): Promise<{ tarea?: Tarea }> {
    switch (l.herramienta) {
      case 'buscar_producto': return { tarea: await this.pide('ventas', 'recomendar', { consulta: String(l.argumentos.consulta ?? '') }) };
      case 'ver_catalogo': return { tarea: await this.pide('catalogo', 'listar', l.argumentos.categoria ? { categoria: l.argumentos.categoria } : {}) };
      case 'responder_politica': return { tarea: await this.pide('soporte', 'responder_politica', { pregunta: String(l.argumentos.pregunta ?? '') }) };
      case 'crear_pedido': return { tarea: await this.pide('pedidos', 'crear_pedido', { origenWamid: `${this.t.mensaje.wamid}:chat`, conversacionId: this.conv.id, waId: this.conv.waId, items: l.argumentos.items }) };
      default: return {};
    }
  }

  /** La barrera de salida. Si el texto del modelo no pasa, sale una plantilla segura, no el texto. */
  private async revisa(texto: string, tareas: Tarea[]): Promise<string | null> {
    if (!texto) return null;
    const montos = new Set<number>();
    const existencias = new Set<number>();
    for (const t of tareas) for (const a of t.artefactos) {
      const lista = (a.datos.productos as ProductoVista[] | undefined) ?? [];
      for (const p of lista) { montos.add(p.precioCentavos); existencias.add(p.existencias); }
      for (const k of ['totalCentavos', 'subtotalCentavos', 'envioCentavos']) if (typeof a.datos[k] === 'number') montos.add(a.datos[k] as number);
    }
    for (const c of this.i.politicas.cobertura ?? []) montos.add(c.costoCentavos);
    for (const sv of this.i.politicas.citas?.servicios ?? []) montos.add(sv.precioCentavos);
    for (const f of this.i.faqs) for (const n of (f.respuesta.match(/\$\d[\d,]*(?:\.\d{2})?/g) ?? [])) montos.add(Math.round(Number(n.replace(/[$,]/g, '')) * 100));
    const catalogo = artefacto(await this.pide('catalogo', 'listar', {}), 'productos') as { productos: ProductoVista[] } | undefined;
    const vocabulario = new Set<string>([...VOCABULARIO_COMERCIO, ...pliega(`${this.i.nombre} ${this.i.ciudad} ${this.i.giro}`).split(/\W+/)]);
    for (const p of catalogo?.productos ?? []) for (const w of pliega(`${p.nombre} ${p.categoria} ${p.descripcion ?? ''}`).split(/[^a-z0-9ñ]+/)) if (w.length > 2) vocabulario.add(w);
    for (const f of this.i.faqs) for (const w of pliega(`${f.pregunta} ${f.respuesta}`).split(/[^a-z0-9ñ]+/)) if (w.length > 2) vocabulario.add(w);
    const respaldo: Respaldo = { montos, existencias, vocabulario, dominiosLiga: this.o.dominiosLiga };
    const v = revisaSalida(texto, respaldo);
    if (v.tipo === 'ok') return texto;
    this.bitacora.push({ tipo: 'bloqueo_salida', detalle: `${v.tipo}: ${v.pista}` });
    return null;
  }

  private async pinta(cuerpo: string | null, resultados: Array<{ llamada: LlamadaHerramienta; tarea?: Tarea }>): Promise<void> {
    for (const { llamada, tarea } of resultados) {
      if (llamada.herramienta === 'abrir_flow') {
        const tipo = String(llamada.argumentos.tipo ?? 'reserva') as TipoFlow;
        if (tipo === 'reserva') this.flow('reserva', cuerpo ?? 'Elige día, personas y hora; te confirmo al momento.', 'Reservar');
        else if (tipo === 'lead') this.flow('lead', cuerpo ?? 'Tres preguntas rápidas para recomendarte bien.', 'Contestar');
        else this.menu(cuerpo ?? '¿Qué te gustaría pedir?');
        return;
      }
      if (!tarea) continue;
      if (llamada.herramienta === 'crear_pedido') { await this.resultadoDePedido(tarea); return; }
      if (llamada.herramienta === 'responder_politica') {
        const pol = artefacto(tarea, 'politica') as { respuesta?: string } | undefined;
        this.salientes.push({ tipo: 'texto', texto: pol?.respuesta ?? cuerpo ?? 'Esa te la responde el encargado.' });
        return;
      }
      const productos = ((artefacto(tarea, 'productos') as { productos: ProductoVista[] } | undefined)?.productos) ?? [];
      this.productos(productos, cuerpo ?? (productos.length ? 'Esto es lo que tenemos:' : 'No lo tenemos por ahora. ¿Te muestro lo que sí hay?'));
      return;
    }
    if (cuerpo) this.menu(cuerpo);
    else this.menu(`Te ayudo con lo de ${this.i.nombre}: ${this.i.giro === 'restaurante' ? 'menú, pedidos y reservaciones' : 'catálogo, pedidos y envíos'}.`);
  }
}

/** El primer mensaje lleva el aviso de privacidad (sin gastar un mensaje aparte). */
function conAviso(m: MensajeSaliente): MensajeSaliente {
  const aviso = 'Aviso de privacidad: escribe PRIVACIDAD';
  if (m.tipo === 'botones' || m.tipo === 'lista') return { ...m, pie: aviso };
  if (m.tipo === 'texto') return { ...m, texto: `${m.texto}\n\n${aviso}.` };
  if (m.tipo === 'carrusel' || m.tipo === 'productos' || m.tipo === 'cta_url' || m.tipo === 'flow') return { ...m, cuerpo: `${m.cuerpo}\n\n${aviso}.` };
  return m;
}
