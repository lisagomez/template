#!/usr/bin/env node
/**
 * Hook `Stop` de Claude Code (PRP-003, RF-42 y RF-43): lee por stdin el JSON del arnes, saca el
 * primer parrafo hablable de `last_assistant_message` (`paraVoz`) y se lo manda al `dictar` en
 * marcha por el socket local SIN esperar a que suene. Sale 0 siempre y no escribe nada en
 * stdout: un hook que bloquea o «decide» por el arnes no es este. Sin dictado, con la
 * conversacion apagada o sin prosa que decir, no hace nada.
 *
 * Lo lanza `habla-respuesta.sh`, que antes comprueba el puerto en unos milisegundos para no
 * arrancar node cuando no hay a quien hablarle (RF-43: < 100 ms).
 */
import { paraVoz } from '../dist/index.js';
import { pideDi, PUERTO_CONVERSACION } from '../dist/node/conversacion-socket.js';

let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (entrada += d));
process.stdin.on('end', async () => {
  try {
    const hook = JSON.parse(entrada);
    if (hook.agent_id) return; // un subagente no habla: solo la respuesta principal
    const texto = paraVoz(typeof hook.last_assistant_message === 'string' ? hook.last_assistant_message : '');
    if (!texto) return;
    const puerto = Number(process.env.DICTADO_CONVERSACION_PUERTO) || PUERTO_CONVERSACION;
    await pideDi(texto, { puerto, soloEncendido: true, sinEsperar: true, msConexion: 300 });
  } catch {
    // nunca bloquea ni protesta: el arnes no es quien tiene que enterarse
  }
});
