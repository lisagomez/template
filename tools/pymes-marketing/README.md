# @tu-scope/pymes-marketing (0.3.1)

El **estudio de contenido y marketing** de una pyme mexicana, en seis herramientas que se instalan
juntas y se importan por separado. TypeScript puro, **cero dependencias**, sin red: el redactor
(plantillas o un LLM) y cualquier almacén se **inyectan**. **Nada se publica ni se envía**: toda
salida es un borrador que el dueño aprueba y sube él mismo.

## Qué hace

Adaptado de la familia de marketing del plugin `small-business` de Anthropic (v1.35.1, Apache-2.0):
ver `NOTICE` y `LICENSE-APACHE-2.0`.

| Subpath | Qué hace | Fuente adaptada |
|---|---|---|
| `.` | Núcleo: «sin datos» (ausente ≠ cero), dinero MXN en centavos, fechas día/mes, temporada comercial de México, texto de terceros (C3), datos personales (C4), CSV tolerante, perfil de voz y el redactor inyectable | `shared/*` |
| `./marca` | Marca desde una liga (HTML del sitio) o una frase («verde bosque y crema»); nunca pide hex; contraste AA; se confirma con un «sí» | `brand-style` |
| `./ventas` | Ventas desde CFDI 4.0 (la lectura de `@tu-scope/extractor-documental/xml`) y CSV de la caja; notas de crédito que restan; resumen de 90 días, 30 contra 30 | (núcleo de `content-strategy` y `growth-pulse`) |
| `./contenido` | Brief de 30 días, calendario vivo con reuso por canal, pieza SVG en zona segura por formato (4:5, 1:1, 1.91:1, 9:16), revisión visual automática y carruseles | `content-strategy`, `social-content-engine`, `canva-creator` |
| `./resenas` | Temas con citas textuales, borradores de respuesta (<60 palabras, uno por uno), retenidas y escaladas, clientes callados por su propio ritmo | `review-reputation` |
| `./visibilidad` | Auditoría de buscadores y asistentes de IA (solo lectura), arreglos como archivos (robots.txt, llms.txt, JSON-LD) con «POR CONFIRMAR» | `seo-ai-visibility` |
| `./pulso` | Anuncios desde la exportación (veredicto contra el promedio propio, impacto mensual en MXN), pulso de crecimiento con umbrales, brief del lunes que funde todo | `ad-manager`, `growth-pulse`, `marketing-monday` |
| `./video` | Promo 9:16 por código SIN personas: escena declarativa, cuadro SVG de cualquier instante, efectos de sonido sintetizados (WAV), revisión de la escena, hoja de cuadros y tarjetas animadas de las temporadas firmadas (0.3.0). El render a MP4 (navegador sin ventana + ffmpeg) vive fuera del paquete | oficio de god-animation y edicion-de-video (idea, no código) |
| `./rasterizar` | SVG → PNG con el canvas del propio navegador, sin dependencias | — |
| `./aprobacion` | Aprobar el archivo exacto (huella SHA-256), pedir cambio con nota, revocar al editar, CSV del mes | lo rescatado de la sala de revisión |
| `./redactor-openai-compat` | Redactor con LLM por cualquier API compatible con OpenAI; devuelve el uso (o `null`) para la contabilidad del proyecto | — |

### Lo que NO hace (a propósito)

- No publica, no programa, no envía, no responde reseñas, no cambia presupuestos: aprobar deja la
  pieza lista para que el dueño la suba. Publicar el paquete en npm también es firma humana.
- No se conecta a Canva, Meta, Google, TikTok, HubSpot ni WhatsApp: la entrada es local.
- No inventa: precios solo confirmados (con impuestos), «qué cambió» solo si el dueño lo dice,
  temporadas genéricas marcadas «¿coincide con tu negocio?», huecos «POR CONFIRMAR».
- No elige modelo: el proyecto pasa uno pineado por su routing y registra el uso.

## Casos de uso

- **El dueño de una pyme mexicana sin equipo de marketing**: con sus facturas CFDI 4.0 o el CSV de su caja obtiene el
  resumen de 90 días, qué empujar y el brief de 30 días con la temporada comercial de México (`./ventas`, `./contenido`).
- **Quiere su marca sin saber de colores**: da la liga de su sitio o una frase («verde bosque y crema») y la confirma con
  un «sí» tras la vista previa; nunca se le piden hex (`./marca`).
- **Tiene reseñas que contestar**: temas con citas textuales y borradores de respuesta uno por uno, con lo delicado
  retenido o escalado (`./resenas`).
- **Quiere saber si lo encuentran**: auditoría de buscadores y asistentes de IA, y los arreglos como archivos con
  «POR CONFIRMAR» (`./visibilidad`).
- **Paga anuncios**: veredicto de cada anuncio contra su propio promedio e impacto en MXN, y el brief del lunes
  (`./pulso`).
- **Quiere una promo sin grabar a nadie**: escena 9:16 por código, cuadros SVG y sonido WAV (`./video`).
- **Aprueba lo exacto**: la huella SHA-256 del archivo; si cambia, la aprobación se revoca (`./aprobacion`). La app que
  lo usa entero: `src/features/estudio-pymes/` (`/estudio`).

## Requerimientos de infraestructura

- **Runtime**: Node `>=20` (`engines`). Cero dependencias.
- **Dependencias del sistema**: ninguna para el núcleo. `./rasterizar` corre solo en el navegador (su canvas) y el MP4
  de la promo se renderiza fuera del paquete (navegador sin ventana + ffmpeg).
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: ninguno por defecto. Con `./redactor-openai-compat`, la API compatible con OpenAI que el
  proyecto inyecte, con su modelo pineado por su routing.
- **Variables de entorno**: ninguna. El redactor con LLM recibe la llave y `fetch` inyectados: nunca lee el entorno.
- **Almacenamiento**: ninguno propio: cualquier almacén se inyecta.
- **Salida del perímetro (C4)**: sin red por defecto. Con el redactor con LLM, los textos del negocio van al proveedor
  que el proyecto elija: es decisión C4 del proyecto, no de este paquete.

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

## Pruebas

`npm run build && npm run prueba` (50 casos). El laboratorio del sitio (`/laboratorio-pymes`) corre
casos de extremo a extremo con CFDI sintéticos y el lector real del extractor.

## Generación de contenido (0.2.0)

```ts
import { carruselDeTemporada, revisaPieza } from '@tu-scope/pymes-marketing/contenido';
import { escenaDePromo, cuadroSvg, sonidoDeEscena, wavDe } from '@tu-scope/pymes-marketing/video';
import { aprueba, vigencia, csvDelMes } from '@tu-scope/pymes-marketing/aprobacion';
import { svgAPng } from '@tu-scope/pymes-marketing/rasterizar'; // solo en el navegador

const escena = escenaDePromo(marca, { titular: 'Día de Muertos', precio: '$45.00', semilla: 'promo' });
const cuadro = cuadroSvg(escena, 2.5);            // el instante exacto, determinista
const a = await aprueba('promo', mp4Bytes, 1, new Date().toISOString());
await vigencia(a, mp4Nuevo);                       // 'revocada' si el archivo cambió
```

Diseño completo: `docs/SDD-generacion-de-contenido.md`. Plan: `.claude/PRPs/PRP-006-generacion-de-contenido.md`.
