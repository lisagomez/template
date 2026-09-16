#!/usr/bin/env node
/**
 * `dictado`: el CLI. Reparte a las ordenes; cada una vive en su archivo.
 */
import { AYUDA, leeConfiguracion, parseaArgumentos } from './cli-config.js';
import { ordenDictar } from './cli-dictar.js';
import { ordenArchivo, ordenLote } from './cli-lote.js';
import { ordenDiccionario, ordenHistorial, ordenSnippets } from './cli-datos.js';
import { motoresDisponibles } from './cli-motores.js';

async function principal(): Promise<void> {
  const { orden, posicionales, opciones } = parseaArgumentos(process.argv.slice(2));
  const config = leeConfiguracion(opciones);
  switch (orden) {
    case 'dictar':
      return ordenDictar(config, opciones);
    case 'archivo':
      return ordenArchivo(config, posicionales, opciones);
    case 'lote':
      return ordenLote(config, posicionales, opciones);
    case 'historial':
      return ordenHistorial(config, posicionales, opciones);
    case 'diccionario':
      return ordenDiccionario(config, posicionales);
    case 'snippets':
      return ordenSnippets(config, posicionales);
    case 'motores':
      console.log(motoresDisponibles(config).join('\n') || `(ninguno en ${config.modelos})`);
      return;
    case 'config':
      console.log(config.describe());
      return;
    default:
      console.log(AYUDA);
  }
}

principal().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
