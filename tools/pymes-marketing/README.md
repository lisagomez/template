# @tu-scope/pymes-marketing

El **estudio de contenido y marketing** de una pyme mexicana, en seis herramientas que se instalan
juntas y se importan por separado. TypeScript puro, **cero dependencias**, sin red: el redactor
(plantillas o un LLM) y cualquier almacén se **inyectan**. **Nada se publica ni se envía**: toda
salida es un borrador que el dueño aprueba y sube él mismo.

Adaptado de la familia de marketing del plugin `small-business` de Anthropic (v1.35.1, Apache-2.0):
ver `NOTICE` y `LICENSE-APACHE-2.0`.

| Subpath | Qué hace | Fuente adaptada |
|---|---|---|
| `.` | Núcleo: «sin datos» (ausente ≠ cero), dinero MXN en centavos, fechas día/mes, temporada comercial de México, texto de terceros (C3), datos personales (C4), CSV tolerante, perfil de voz y el redactor inyectable | `shared/*` |
| `./marca` | Marca desde una liga (HTML del sitio) o una frase («verde bosque y crema»); nunca pide hex; contraste AA; se confirma con un «sí» | `brand-style` |
| `./ventas` | Ventas desde CFDI 4.0 (la lectura de `@tu-scope/extractor-documental/xml`) y CSV de la caja; notas de crédito que restan; resumen de 90 días, 30 contra 30 | (núcleo de `content-strategy` y `growth-pulse`) |
| `./contenido` | Brief de 30 días (empujar, mantener, reposicionar, temporada, ofertas), calendario vivo con reuso por canal y la pieza con imagen generada por código (SVG) | `content-strategy`, `social-content-engine`, `canva-creator` |
| `./resenas` | Temas con citas textuales, borradores de respuesta (<60 palabras, uno por uno), retenidas y escaladas, clientes callados por su propio ritmo | `review-reputation` |
| `./visibilidad` | Auditoría de buscadores y asistentes de IA (solo lectura), arreglos como archivos (robots.txt, llms.txt, JSON-LD) con «POR CONFIRMAR» | `seo-ai-visibility` |
| `./pulso` | Anuncios desde la exportación (veredicto contra el promedio propio, impacto mensual en MXN), pulso de crecimiento con umbrales, brief del lunes que funde todo | `ad-manager`, `growth-pulse`, `marketing-monday` |
| `./redactor-openai-compat` | Redactor con LLM por cualquier API compatible con OpenAI; devuelve el uso (o `null`) para la contabilidad del proyecto | — |

## Uso

```ts
import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '@tu-scope/extractor-documental/xml';
import { redactorDePlantillas, construyeVoz } from '@tu-scope/pymes-marketing';
import { capturaDeDescripcion, confirmaMarca } from '@tu-scope/pymes-marketing/marca';
import { ventasDesdeCfdi, resumeVentas } from '@tu-scope/pymes-marketing/ventas';
import { estrategiaDe30Dias, calendarioDe30Dias } from '@tu-scope/pymes-marketing/contenido';

const registro = registroDeEsquemas([lectorDeTimbre11]);
const ventas = ventasDesdeCfdi(xmls.map((x) => leeCfdi40(x, registro)), { rfcPropio: 'EKU9003173C9' });
const brief = estrategiaDe30Dias(resumeVentas(ventas), '2026-10-19');
const marca = confirmaMarca(capturaDeDescripcion('verde bosque y crema', 'La Espiga')); // tras la vista previa
const calendario = await calendarioDe30Dias(brief, marca, redactorDePlantillas(), { voz: construyeVoz(muestras) });
```

## Lo que NO hace (a propósito)

- No publica, no programa, no envía, no responde reseñas, no cambia presupuestos: aprobar deja la
  pieza lista para que el dueño la suba. Publicar el paquete en npm también es firma humana.
- No se conecta a Canva, Meta, Google, TikTok, HubSpot ni WhatsApp: la entrada es local.
- No inventa: precios solo confirmados (con impuestos), «qué cambió» solo si el dueño lo dice,
  temporadas genéricas marcadas «¿coincide con tu negocio?», huecos «POR CONFIRMAR».
- No elige modelo: el proyecto pasa uno pineado por su routing y registra el uso.

## Pruebas

`npm run build && npm run prueba` (41 casos). El laboratorio del sitio (`/laboratorio-pymes`) corre
casos de extremo a extremo con CFDI sintéticos y el lector real del extractor.
