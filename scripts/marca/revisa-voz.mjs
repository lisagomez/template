#!/usr/bin/env node
/**
 * Revisor de voz: la parte COMPROBABLE del humanizer (blader/humanizer, commit 225a6f39) y de la voz de
 * Turno 25 (guía v1.0 §06: cercana, concreta, de tú, sin emoji), vuelta gate. Reescribir con la voz es
 * juicio y se queda en el skill `humanizer`; aquí solo se señala, con la regla de origen.
 *
 * Alcance: las superficies de la marca que este repo ya escribe en su voz (`ALCANCE`). Ampliarlo es la agenda:
 * un archivo entra cuando su copy se pasa por el humanizer.
 *
 * Uso:  node scripts/marca/revisa-voz.mjs            el gate
 *       node scripts/marca/revisa-voz.mjs --prueba   cada siembra debe caer
 * Exit: 0 conforme · 1 algún hallazgo, o una siembra que no se cazó.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HUM = 'blader/humanizer@225a6f39';
export const ALCANCE = [
  '.claude/design-systems/turno-25/turno-25.md',
  'tools/banco-motores/README.md',
  'src/features/banco/README.md',
  'src/features/banco/components/banco.tsx',
  'src/features/banco/components/bloques.tsx',
  'src/features/banco/services/servidor/funciones.ts',
  'src/shared/components/bloque-etiquetado.tsx',
  'src/features/auth/components/formulario-cuenta.tsx',
  'src/app/(auth)/login/page.tsx',
  'src/app/(auth)/signup/page.tsx',
];

const CATALOGO = ['de clase mundial', 'disruptiv', 'sinergia', 'potenciar', 'potencia tu', 'vanguardia', 'revolucionari', 'sin precedentes', 'holístic', 'en el panorama actual', 'apalancar', 'next level', 'game changer', '360°', 'soluciones integrales', 'llevar al siguiente nivel'];

export const REGLAS = [
  { id: 'contraste-escenificado', patron: /\bno (?:es|son) (?:solo |sólo )?[^.,;\n]{1,60}, (?:es|son|sino)\b|\bno (?:solo|sólo) [^.\n]{1,80}\bsino (?:también )?/gi, origen: `${HUM} §1 «Not X but Y»` },
  { id: 'palabra-de-catalogo', patron: new RegExp(`(?:${CATALOGO.join('|')})`, 'gi'), origen: `${HUM} §12 y §16 (palabras de IA y de ventas) + columna «No» de la voz Turno 25` },
  { id: 'resto-de-chat', patron: /¡claro!|espero que (?:esto|te) (?:te )?ayude|como modelo de lenguaje|no dudes en|¡excelente pregunta/gi, origen: `${HUM} §22 restos de chat` },
  { id: 'emoji', patron: /\p{Extended_Pictographic}/gu, origen: 'voz Turno 25 §06: sin emoji' },
  { id: 'usted', patron: /\busted(?:es)?\b/gi, origen: 'voz Turno 25 §06: de tú' },
  { id: 'exclamacion-doble', patron: /¡¡|!!/g, origen: 'voz Turno 25 §06, columna «No»: «¡¡Contáctanos YA!!»' },
  { id: 'error-crudo', patron: /\bError \d{3}\b/g, origen: 'voz Turno 25 §06: «Necesitamos acceso de solo lectura…», no «Error 403»' },
  { id: 'guiones-en-cadena', patron: /^[^\n`|]*—[^\n`|]*—[^\n`|]*—[^\n`|]*$/gm, origen: `${HUM} §8 guiones como conector universal (tres o más en una línea)` },
];

/** Del Markdown, la prosa (sin bloques de código ni código en línea); del código, todo (el copy vive en literales). */
export function prosaDe(ruta, texto) {
  if (!ruta.endsWith('.md')) return texto;
  return texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

export function hallazgosDe(texto) {
  const out = [];
  for (const r of REGLAS) for (const m of texto.matchAll(r.patron)) out.push({ regla: r.id, cita: m[0].slice(0, 70), origen: r.origen });
  return out;
}

function prueba() {
  const SIEMBRAS = {
    'contraste-escenificado': 'Esto no es solo un banco, es una plataforma.',
    'palabra-de-catalogo': 'Una solución de clase mundial y disruptiva.',
    'resto-de-chat': '¡Claro! Espero que esto te ayude.',
    emoji: 'Listo para despegar \u{1F680}',
    usted: 'Si usted desea continuar, pulse aquí.',
    'exclamacion-doble': '¡¡Contáctanos YA!!',
    'error-crudo': 'Error 403: permisos insuficientes.',
    'guiones-en-cadena': 'Rápido — simple — seguro — y barato.',
  };
  let mal = 0;
  for (const [regla, texto] of Object.entries(SIEMBRAS)) {
    const ok = hallazgosDe(texto).some((h) => h.regla === regla);
    if (!ok) mal++;
    console.log(`${ok ? '✓' : '✗'} siembra «${regla}»: ${texto}`);
  }
  const limpio = 'Recuperas 36 horas al mes en facturación. Agenda un diagnóstico.';
  const falsos = hallazgosDe(limpio);
  if (falsos.length) mal++;
  console.log(`${falsos.length ? '✗' : '✓'} la columna «Sí» de la guía no da falsos positivos`);
  return mal;
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  if (process.argv.includes('--prueba')) process.exit(prueba() ? 1 : 0);
  let mal = 0;
  for (const ruta of ALCANCE) {
    if (!existsSync(join(RAIZ, ruta))) { console.log(`✗ ${ruta}: está en el alcance y no existe`); mal++; continue; }
    for (const h of hallazgosDe(prosaDe(ruta, readFileSync(join(RAIZ, ruta), 'utf8')))) {
      console.log(`✗ ${ruta}: «${h.cita}» — ${h.regla} (${h.origen})`);
      mal++;
    }
  }
  console.log(mal ? `✗ ${mal} hallazgo(s) de voz` : `✓ voz conforme en ${ALCANCE.length} superficies de la marca`);
  process.exit(mal ? 1 : 0);
}
