# Cobro del estudio pymes: esquemas de precio por modelo de negocio

> **Investigación del 2026-10-02** para la decisión pendiente del contrato
> ([`src/features/estudio-pymes/BUSINESS_LOGIC.md`](../src/features/estudio-pymes/BUSINESS_LOGIC.md), §7).
> **No fija precios**: da, por cada forma de vender el estudio, cómo se cobra, contra qué compite y
> qué hay que construir o firmar antes. Las cifras de terceros llevan su fuente al pie; las que solo
> aparecen en fuentes secundarias van marcadas **(secundaria)** y se verifican en el sitio oficial
> antes de fijar nada. Los precios en dólares se quedan en dólares: no se convierte con un tipo de
> cambio inventado.

## 0. El veredicto, primero

1. **Hoy no se puede cobrar con ningún modelo.** El estudio no tiene cuentas y la aprobación vive en la
   pestaña del navegador. Una suscripción exige cuentas, que son la **fase 9 del PRP-006, bloqueada**
   (C4 y C7), y su fila en la tabla de respaldo del contrato.
2. **Servirlo cuesta casi nada**: todo corre en el navegador del dueño y sin modelo de lenguaje. El
   precio se fija **por valor**, contra lo que la pyme paga hoy por el mismo trabajo, no sumando un
   margen al costo. Si un día se activa el redactor con LLM, el esquema pasa a ser híbrido (§3.1).
3. **Recomendación:** medir la disposición a pagar en el piloto **sin cobrar**; después, una
   **suscripción por negocio** en pesos y con CFDI, con la consultora del piloto como **referidora con
   comisión recurrente**. La reventa, la marca blanca y la licencia del paquete van al final, cuando
   haya demanda probada (§5).

## 1. Contra qué compite el precio

| Lo que la pyme usa hoy | Precio | Qué hace frente al estudio |
|---|---|---|
| Hacerlo el dueño mismo | sus horas: es lo que mide el piloto (contrato §1) | todo, a mano |
| Canva Pro | ~175 MXN al mes o ~2,100 MXN al año **(secundaria)** [1] | diseño de piezas; no sabe qué publicar ni lee ventas |
| Metricool | gratis con 1 marca; desde US$20 al mes en anual o US$25 en mensual (hasta 5 marcas), sin IVA **(secundaria)** [2] | programa y mide; no hace el brief ni las piezas |
| Facturación de una pyme (Alegra) | desde 99 MXN al mes **(secundaria)** [3] | otra cosa: sirve de ancla de lo que una pyme paga por software de nicho |
| Community manager freelance | solo gestión de cuentas: 3,500 a 12,000 MXN al mes; 2 a 4 redes con calendario y atención: 8,000 a 25,000 MXN; la hora, 150 a 400 MXN **(secundaria)** [4] | todo, y además publica y atiende |
| Agencia | fee desde ~8,000 MXN al mes, más la pauta **(secundaria)** [5] | estrategia, producción y anuncios |
| Contenido «hecho por ti» (EE. UU.) | US$99 a US$279 al mes por 10 a 30 publicaciones, con revisión humana [6] | lo mismo que el estudio, pero **publica** |
| Reseñas (Birdeye, Podium) | US$299 a US$449 y US$399 a US$599 al mes por ubicación; Birdeye no publica precios **(secundaria)** [7] | gestión de reseñas para cadenas; fuera del alcance de una pyme chica |

**Lectura:** el estudio hace la parte de pensar y producir del community manager (qué publicar, el
calendario, las piezas, los borradores de respuesta), pero **no publica ni atiende**, a propósito. Su
banda natural queda **por encima de una herramienta suelta** (Canva, Metricool) y **por debajo del
community manager más barato**. Dónde cae dentro de esa banda lo dice el piloto (§5), no esta tabla.

## 2. Lo que cuesta servirlo

| Componente | Hoy | Fuente |
|---|---|---|
| Por pieza | **$0**: plantillas, todo en el navegador | SDD de generación de contenido, §7 |
| Servidor | servir la página; el render de la promo toma ~17,5 a 19,5 s de CPU por video, y en producción está bloqueado (fase 10) | SDD, §10 |
| Redactor con LLM | apagado; con un proveedor **simulado**, US$0.002584 por redacción. Sin medir con uno real | `BITACORA-CDC.md`, 2026-09-27 |
| Cobro | la comisión del procesador (§4) | — |
| Soporte humano | el costo real, sin medir; el modelo acompañado lo cobra aparte | — |

## 3. Los modelos, uno por uno

### 3.1 Suscripción directa al dueño (autoservicio)

- **Quién paga:** el dueño. **Unidad de cobro:** el negocio, no el usuario (una pyme es un dueño) ni la
  pieza (cobrar por pieza castiga justo el uso que se quiere).
- **Esquema:** dos niveles por herramientas. Un nivel **básico** con marca, ventas, brief, calendario,
  piezas y carruseles, y uno **completo** que suma reseñas, visibilidad, anuncios y el brief del lunes.
  Pago mensual o anual con descuento: Metricool anuncia hasta 24 % [2]. Una prueba de un mes o un
  nivel gratis acotado (un brief), porque el primer valor es verlo con sus propias ventas.
- **Si se activa el LLM:** base fija más **créditos de redacción**. Es el esquema que domina en el
  software con IA en 2026: suscripción con uso medido encima, y créditos para no cambiarle el precio al
  cliente cada vez que cambia el costo del modelo [8]. El cobro por resultado se descarta como base
  para pymes [8].
- **Banda de referencia:** entre Canva Pro (~175 MXN) y el community manager más barato (3,500 MXN)
  **[supuesto: la banda; el precio sale del piloto]**.
- **Qué exige antes:** cuentas y persistencia (fase 9, con C4, C7 y su fila de respaldo), CFDI y
  pasarela (§4).
- **Riesgo:** que se cancele si el dueño no termina publicando. El estudio no publica, y eso no cambia.

### 3.2 Acompañado: alta más mensualidad

- **Para quién:** el dueño que no lo usaría solo. **Esquema:** una cuota de arranque (marca, voz, el
  primer mes armado con él) y una mensualidad con una sesión de revisión al mes. **No incluye
  publicar**: está fuera por diseño (PRP-006, fase 11).
- **Banda de referencia:** dentro de la del community manager de solo gestión (3,500 a 12,000 MXN [4]),
  y en la parte baja, porque no publica ni atiende **[supuesto]**.
- **Qué exige antes:** horas humanas por cliente, así que no escala. Lo puede dar la consultora (§3.3).
- **Riesgo (C4):** si quien acompaña **opera** el estudio, los archivos de la pyme y de sus clientes
  pasan por él. Es justo lo que el plan del piloto prohíbe, y fuera del piloto pide su propia AISIA.

### 3.3 Por la consultora: el canal

Tres variantes, de menos a más trabajo:

| Variante | Cómo se cobra | Referencia de mercado | Qué exige |
|---|---|---|---|
| **Referido** | la pyme paga directo; la consultora recibe una comisión recurrente | lo más común en software: 20 a 30 % recurrente, a menudo por un plazo fijo (12 meses) [9] | solo atribuir de dónde vino cada cliente. No cambia el flujo de datos |
| **Reventa** | la consultora compra con descuento y pone su precio; un solo CFDI a la consultora | márgenes de reventa del 30 al 60 % sobre un precio mayorista fijo por cuenta [10] | un panel con los clientes de la consultora y sus permisos (fase 9 y más). La consultora vería datos de cuenta de sus clientes (C4) |
| **Marca blanca** | licencia por consultora más un cargo por cliente activo | GoHighLevel: US$297 al mes con marca blanca y US$497 al mes para revenderlo como propio, con recobro de uso [11]; mayoristas de US$14 a US$70 por cuenta [10] | varios inquilinos con marca, dominio y correos propios: mucho por construir. Si la consultora mete su IA sobre los datos, AISIA propia |

**La consultora del piloto encaja hoy como referida.** Las otras dos la vuelven parte del flujo de
datos o piden construir mucho, y conviene esperar a que más de una consultora las pida.

### 3.4 Licencia del paquete a agencias con desarrolladores

- **Qué se vende:** `@tu-scope/pymes-marketing` para que una agencia arme su propia app.
- **Esquema:** anual por producto o por desarrollador. Referencias: US$290 a US$3,490 al año por número
  de productos en producción; US$180 a US$588 al año por desarrollador; US$999 al año por un equipo
  chico [12].
- **Qué exige antes:** publicar el paquete, que es **gate humano**; darle una licencia propia (hoy es
  `UNLICENSED`) respetando la Apache-2.0 del código adaptado del plugin (`NOTICE`); y pasar la puerta de
  `docs/CREAR-UNA-HERRAMIENTA.md`: sin reuso real 3 o más veces, empaquetar solo añade una versión que
  mantener.
- **Riesgo:** soporte a terceros. El flujo de datos lo decide quien compra, y el C4 es suyo.
- **Recomendación:** solo bajo pedido.

## 4. Cómo se cobra en México: pasarela y CFDI

| Opción | Comisión | ¿Le da CFDI a la pyme? |
|---|---|---|
| Stripe México | tarjeta nacional 3.6 % + 3 MXN; internacional 4.4 % + 3 MXN; OXXO ~3.9 %; SPEI 1.8 %; suscripciones incluidas **(secundaria)** [13] | sí: el CFDI lo emite el laboratorio |
| Mercado Pago (suscripciones) | entre 3 y 4 % con tarjeta; sin tarifa oficial verificada **(secundaria)** [14] | sí: el CFDI lo emite el laboratorio |
| Polar (el golden path de `/add-payments`) | desde mayo de 2026, 5 % + US$0.50 sin cuota; hay planes con cuota y comisión menor **(secundaria)** [15] | **no**: Polar es quien vende (comerciante registrado) |

**Lo fiscal, que decide más que la comisión:**
- El CFDI exige RFC mexicano y certificado del SAT. Un proveedor extranjero sin establecimiento en
  México **no puede emitirlo** [16].
- Pagar a un proveedor extranjero **sigue siendo deducible** si su comprobante cumple los requisitos
  (artículo 24 de la LISR y regla 2.7.1.16 de la RMF), pero **acreditar el IVA puede complicarse** si el
  proveedor no está inscrito en el SAT [16].
- Quien tributa en **RESICO como persona física** paga el ISR sobre sus ingresos, de 1 a 2.5 %, **sin
  deducir gastos** [17]. A esa pyme el CFDI de su suscripción le pesa menos; a una persona moral o a una
  persona física en régimen general, sí.

**Consecuencia:** para vender a pymes mexicanas lo natural es una **pasarela local con CFDI emitido por
el laboratorio**. Pero el golden path de cobro es Polar (`/add-payments`). Usar otra pasarela cambia ese
skill, y eso es un **CDC (C1)** que decide el laboratorio. Antes de elegir hay que confirmar con el
contador el régimen del laboratorio.

## 5. Recomendación y orden

1. **Durante el piloto no se cobra.** Al cerrar, cada dueño contesta cuatro preguntas de disposición a
   pagar (método Van Westendorp): a qué precio le parecería **tan barato** que dudaría de la calidad,
   **una ganga**, **caro pero lo pagaría** y **tan caro** que no lo pagaría. Con 1 o 2 pymes es
   anecdótico, y se dice así; sirve para ubicar la banda de §3.1, no para fijar el precio.
2. **Primer cobro: suscripción por negocio**, dos niveles, mensual o anual, en pesos y con CFDI. La
   consultora entra como **referidora** con comisión recurrente por un plazo fijo. Exige la fase 9
   firmada y decidir la pasarela (§4).
3. **El acompañado como complemento**, que la consultora puede dar bajo las reglas del piloto.
4. **Reventa y marca blanca** cuando más de una consultora lo pida. **Licencia del paquete**, solo
   bajo pedido.
5. **Con el LLM activo:** base más créditos de redacción, con su costo real medido antes (CDC).

## 6. Lo que esta investigación no resuelve

- **El precio exacto**: sale del piloto y de la disposición a pagar.
- **La otra pregunta del cobro**, con qué pasarela cobraría la pyme a **sus** clientes: no es de precio
  y sigue pendiente (contrato §7). Para bienes físicos y servicios presenciales, Polar no aplica.
- **Las tarifas oficiales**: las de Stripe, Mercado Pago, Polar y Canva vienen de fuentes secundarias.
- **Lo fiscal del laboratorio**: el régimen y si conviene inscribirse para emitir CFDI por suscripción,
  con contador.

## Fuentes (consultadas el 2026-10-02)

1. Canva Pro en México: [imanzanamx](https://imanzanamx.com/blog/canva-pro-que-incluye-precio-y-vale-la-pena/), [melium10](https://www.melium10.com/herramientas-gratis/convertidor-precios-saas-pesos/canva-precio-pesos-mexicanos)
2. Metricool: [SocialPilot](https://www.socialpilot.co/insights/metricool-pricing), [upload-post (precios verificados el 17/09/2026)](https://www.upload-post.com/metricool-pricing/)
3. Alegra: [Milenio](https://www.milenio.com/negocios/alegra-plataforma-de-facturacion-impactar-a-pymes-en-mexico)
4. Community manager en México: [Cronoshare](https://www.cronoshare.com.mx/salarios/community-manager), [Crehana](https://www.crehana.com/blog/marketing-digital/community-manager-sueldo/)
5. Agencias en México: [Dinametra](https://www.dinametra.com/blog/agencia-de-marketing-digital-precios), [Shortway](https://shortway.com.mx/cuanto-cuesta/marketing-para-pymes)
6. 99DollarSocial: [comparativa del propio servicio](https://www.99dollarsocial.com/compare-99dollarsocial-vs-buffer)
7. Birdeye y Podium: [CostBench](https://www.costbench.com/compare/birdeye-vs-podium/)
8. Precios de software con IA: [Monetizely](https://www.getmonetizely.com/articles/the-beginners-cheat-sheet-to-ai-pricing-models-in-2026-60532), [Fungies](https://fungies.io/ai-saas-pricing-models-2026/)
9. Comisiones de afiliados y referidos: [Track360](https://www.track360.io/blog/saas-affiliate-commission-rates-benchmark-2026)
10. Marca blanca y reventa: [99DollarSocial, guía de reventa](https://www.99dollarsocial.com/blog/resellers-guide-to-social-media-management-pricing-structure), [Enrich Labs](https://www.enrichlabs.ai/blog/white-label-social-media-management-complete-guide-2026)
11. GoHighLevel: [Webdew](https://www.webdew.com/blog/gohighlevel-saas-mode), [Ecosire](https://ecosire.com/blog/gohighlevel-pricing-worth-it-2026)
12. Licencias de paquetes: [regex101](https://docs.regex101.com/regex-parser/pricing), [MUI](https://v8.mui.com/pricing/), [WebF](https://openwebf.com/pricing)
13. Stripe México: [Guía de Software](https://www.guiadesoftware.com/blog/stripe-vs-mercado-pago), [lanzamiento de Stripe en México](https://stripe.com/newsroom/news/stripe-launches-mexico)
14. Mercado Pago: [documentación de suscripciones](https://www.mercadopago.com.mx/developers/es/docs/subscriptions/overview), [Emprendedor](https://emprendedor.com/suscripciones-mexico-problema-cobro-pagos-recurrentes/)
15. Polar: [reseña de Dodo Payments](https://dodopayments.com/blogs/polar-sh-review), [documentación de Polar](https://docs.polar.sh/docs/merchant-of-record/tax)
16. Proveedores extranjeros y CFDI: [Facturando](https://www.facturando.mx/blog/2026/09/28/servicios-digitales-extranjeros-cfdi-iva/), [Siempre al Día](https://siemprealdia.co/mexico/fiscal/deduccion-de-pagos-al-extranjero-requistios-sat/)
17. RESICO: [Siempre al Día](https://siemprealdia.co/mexico/fiscal/regimen-simplificado-de-confianza-resico/), [Pluxee](https://www.pluxee.mx/blog/resico-que-es-quien-aplica-y-como-funciona/)
