#!/usr/bin/env npx tsx
/**
 * Generacion de imagenes via OpenRouter (Gemini image).
 * Uso: npx tsx generate-image.ts --prompt "descripcion" [--image entrada.png] [--output salida.png] [--aspect 16:9] [--model id|auto]
 *
 * Tres decisiones de la casa, en codigo y no solo en papel:
 *
 * 1. **El modelo va PINEADO (C1).** El default es un id exacto, y `openrouter/auto` o
 *    cualquier alias flotante (`:latest`, `-latest`) se RECHAZA aqui: un alias que se
 *    auto-actualiza cambia el comportamiento sin diff ni aprobacion, y ademas no garantiza
 *    un modelo capaz de emitir imagen.
 * 2. **`--model auto` existe, pero acotado**: usa el fallback routing de OpenRouter
 *    (`models: [...]`) sobre CANDIDATOS pineados en orden de preferencia. OpenRouter elige
 *    el primero disponible — seleccion automatica dentro de una lista declarada, no un
 *    alias abierto. El script reporta cual respondio.
 * 3. **La deriva truena en voz alta.** El 2026-09-10 este script llevaba un modelo que
 *    OpenRouter ya habia retirado y el error era un 400 mudo. Ahora, ante "modelo no
 *    valido", se consulta el catalogo publico y se listan los modelos de imagen vigentes:
 *    el que llegue aqui sale con el arreglo en la mano, no con un numero.
 *
 * La clave viaja solo en el header Authorization; ni ella ni el cuerpo completo de la
 * respuesta se imprimen jamas (la respuesta lleva la imagen y el razonamiento dentro).
 */

import fs from "fs";
import path from "path";

// --- Modelos: pineados, con el porque -----------------------------------------------------
// Verificados contra https://openrouter.ai/api/v1/models el 2026-09-12. Cambiarlos es CDC.
const MODELO_DEFAULT = "google/gemini-3.1-flash-image";
const CANDIDATOS_AUTO = [
  "google/gemini-3.1-flash-image", // rapido y barato; el caballo de batalla
  "google/gemini-3-pro-image", // mas detalle cuando el flash no alcanza
  "google/gemini-2.5-flash-image", // generacion anterior, aun publicada: ultimo recurso
];
const ALIAS_FLOTANTE = /^(openrouter\/auto|auto-router)$|:latest$|-latest$/i;

// --- CLI -----------------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

const prompt = getArg("prompt");
const inputImage = getArg("image");
const outputPath = getArg("output");
const aspect = getArg("aspect") || "1:1";
const modeloPedido = getArg("model") || MODELO_DEFAULT;
const modoAuto = modeloPedido === "auto";

if (!prompt) {
  console.error("Uso: npx tsx generate-image.ts --prompt 'descripcion'");
  console.error("Opciones:");
  console.error("  --prompt    Descripcion de la imagen (OBLIGATORIO)");
  console.error("  --image     Imagen de entrada (para editar)");
  console.error("  --output    Ruta de salida (default: generated/img-{ts}.png)");
  console.error("  --aspect    Proporcion: 1:1, 16:9, 9:16, 4:3 (default: 1:1)");
  console.error(`  --model     Id EXACTO de OpenRouter (default: ${MODELO_DEFAULT})`);
  console.error("              o 'auto': OpenRouter elige entre los candidatos pineados");
  process.exit(1);
}

if (!modoAuto && ALIAS_FLOTANTE.test(modeloPedido)) {
  console.error(`ERROR: "${modeloPedido}" es un alias auto-actualizable y aqui el modelo va pineado (C1).`);
  console.error("Un alias flotante cambia el comportamiento sin diff ni aprobacion, y no garantiza salida de imagen.");
  console.error(`Usa un id exacto (default: ${MODELO_DEFAULT}) o --model auto, que deja a OpenRouter`);
  console.error(`elegir SOLO entre los candidatos pineados: ${CANDIDATOS_AUTO.join(", ")}`);
  process.exit(1);
}

// --- Clave: presencia, nunca el valor -------------------------------------------------------
function loadEnvKey(): string {
  for (const envPath of [".env.local", ".env"]) {
    const fullPath = path.resolve(process.cwd(), envPath);
    if (fs.existsSync(fullPath)) {
      const match = fs.readFileSync(fullPath, "utf-8").match(/OPENROUTER_API_KEY=(.+)/);
      if (match) return match[1].trim();
    }
  }
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  console.error("ERROR: OPENROUTER_API_KEY no esta en .env.local, .env ni en el entorno.");
  console.error("Corre /ai setup-base para configurar OpenRouter primero.");
  process.exit(1);
}

const apiKey = loadEnvKey();

// --- Deriva en voz alta ----------------------------------------------------------------------
/** Lista los modelos de imagen vigentes (catalogo publico, sin clave) para que un modelo
 *  retirado deje un error accionable y no un 400 mudo. */
async function listaModelosDeImagen(): Promise<string[]> {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    if (!r.ok) return [];
    const data = (await r.json()) as { data?: Array<{ id: string; architecture?: { output_modalities?: string[] } }> };
    return (data.data ?? [])
      .filter((m) => m.architecture?.output_modalities?.includes("image"))
      .map((m) => m.id)
      .sort();
  } catch {
    return [];
  }
}

async function explicaModeloInvalido(cuerpo: string): Promise<void> {
  console.error(`El modelo pedido ya no existe en OpenRouter: ${cuerpo.slice(0, 200)}`);
  const vigentes = await listaModelosDeImagen();
  if (vigentes.length > 0) {
    console.error("\nModelos con salida de imagen vigentes hoy:");
    for (const id of vigentes) console.error(`  - ${id}`);
    console.error("\nActualizar el pineo de este script es un CDC: diff + regresion + bitacora.");
  } else {
    console.error("No se pudo consultar el catalogo publico; revisa https://openrouter.ai/models");
  }
}

// --- Generacion ------------------------------------------------------------------------------
type ParteContenido = { type: string; text?: string; image_url?: { url: string } };

function extraeDataUri(url: string): string | null {
  const m = url.match(/^data:image\/\w+;base64,(.+)$/s);
  return m ? m[1] : null;
}

/** El formato actual entrega la imagen en `message.images`; los antiguos, en las partes de
 *  `content` o en un string data-URI. Se aceptan los tres: la API ya cambio una vez sin avisar. */
function extraeImagen(message: {
  images?: Array<{ image_url?: { url: string } }>;
  content?: ParteContenido[] | string;
}): { imagen: string | null; texto: string | null } {
  let imagen: string | null = null;
  let texto: string | null = null;

  for (const im of message.images ?? []) {
    if (im?.image_url?.url) {
      imagen = extraeDataUri(im.image_url.url) ?? imagen;
      if (imagen) break;
    }
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!imagen && part.type === "image_url" && part.image_url?.url) {
        imagen = extraeDataUri(part.image_url.url) ?? part.image_url.url;
      } else if (part.type === "text" && part.text) {
        texto = part.text;
      }
    }
  } else if (typeof message.content === "string") {
    if (message.content.startsWith("data:image")) imagen = extraeDataUri(message.content);
    else if (message.content.trim()) texto = message.content;
  }
  return { imagen, texto };
}

async function generateImage() {
  const content: ParteContenido[] = [];

  if (inputImage) {
    const imgPath = path.resolve(inputImage);
    if (!fs.existsSync(imgPath)) {
      console.error(`ERROR: no existe la imagen de entrada: ${imgPath}`);
      process.exit(1);
    }
    const ext = path.extname(imgPath).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${fs.readFileSync(imgPath).toString("base64")}` },
    });
  }

  content.push({
    type: "text",
    text: `${prompt}\n\nGenerate the image with aspect ratio: ${aspect}. Return ONLY the image, no text.`,
  });

  console.error(modoAuto
    ? `Generando imagen (auto acotado: OpenRouter elige entre ${CANDIDATOS_AUTO.length} candidatos pineados)...`
    : `Generando imagen con ${modeloPedido}...`);
  console.error(`Aspect: ${aspect}`);

  // En modo auto, `models` es la lista de fallback de OpenRouter: prueba en orden y responde
  // el primero disponible. Es SU seleccion automatica, acotada a candidatos pineados.
  const cuerpo: Record<string, unknown> = {
    model: modoAuto ? CANDIDATOS_AUTO[0] : modeloPedido,
    modalities: ["image", "text"],
    messages: [{ role: "user", content }],
  };
  if (modoAuto) cuerpo.models = CANDIDATOS_AUTO;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://saas-factory.dev",
      "X-Title": "SaaS Factory Image Generation",
    },
    body: JSON.stringify(cuerpo),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`ERROR: OpenRouter respondio ${response.status}`);
    if (/not a valid model/i.test(errorText)) await explicaModeloInvalido(errorText);
    else console.error(errorText.slice(0, 500));
    process.exit(1);
  }

  const data = (await response.json()) as {
    model?: string;
    choices: Array<{ message: Parameters<typeof extraeImagen>[0] }>;
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    console.error("ERROR: la respuesta no trae ningun mensaje (claves: " + Object.keys(data ?? {}).join(", ") + ")");
    process.exit(1);
  }

  const { imagen, texto } = extraeImagen(message);
  if (!imagen) {
    // Nunca se vuelca la respuesta completa: lleva el contenido (y a veces el razonamiento) dentro.
    console.error("ERROR: la respuesta no trae imagen. Claves del mensaje: " + Object.keys(message).join(", "));
    if (texto) console.error(`El modelo dijo: ${texto.slice(0, 300)}`);
    process.exit(1);
  }

  const timestamp = Date.now();
  const outDir = outputPath ? path.dirname(path.resolve(outputPath)) : path.resolve("generated");
  const outFile = outputPath ? path.resolve(outputPath) : path.join(outDir, `img-${timestamp}.png`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const buffer = Buffer.from(imagen, "base64");
  fs.writeFileSync(outFile, buffer);

  // Salida legible por maquina
  console.log(`IMAGE:${outFile}`);
  if (data.model) console.log(`MODEL:${data.model}`);
  if (texto) console.log(`TEXT:${texto}`);

  console.error(`\nImagen guardada en: ${outFile}`);
  console.error(`Tamano: ${(buffer.length / 1024).toFixed(1)} KB · modelo que respondio: ${data.model ?? "no declarado"}`);
}

generateImage().catch((err) => {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
});
