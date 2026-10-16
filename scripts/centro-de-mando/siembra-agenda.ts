/**
 * Siembra la agenda SINTÉTICA del laboratorio del centro de mando: un simulador de Google con
 * cinco pendientes (hoy y mañana, en la zona del laboratorio), sincronizado al espejo en archivo
 * que el HUD lee. Sin red, sin Google y sin datos de nadie: es el mismo camino de lectura que
 * tendría una agenda real (`Lector` sobre el espejo), con datos inventados.
 *
 *   node scripts/centro-de-mando/siembra-agenda.ts            (escribe ~/.centro-de-mando/agenda-espejo.json)
 *   CENTRO_MANDO_ESPEJO=/ruta/espejo.json node scripts/centro-de-mando/siembra-agenda.ts
 */
import { mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { sincroniza } from '../../tools/calendario/dist/index.js';
import { SimuladorGoogle } from '../../tools/calendario/dist/simulador/index.js';
import { AlmacenEnArchivo } from '../../tools/calendario/dist/almacenes/archivo.js';
import { partesDe } from '../../tools/bucle-voz/dist/index.js';

const ZONA = process.env['CENTRO_MANDO_ZONA'] ?? 'America/Mexico_City';
const ESPEJO = process.env['CENTRO_MANDO_ESPEJO'] ?? join(process.env['CENTRO_MANDO_DATOS'] ?? join(homedir(), '.centro-de-mando'), 'agenda-espejo.json');
const REF = { cuenta: 'laboratorio@centro-de-mando.local', calendario: 'agenda' };

/** Un instante de hoy (+dias) a la hora local `h:m` de la zona, como ISO. */
function aLas(dias: number, h: number, m: number): string {
  const ahora = Date.now();
  const p = partesDe(new Date(ahora), ZONA);
  const medianoche = ahora - (ahora % 60_000) - (p.hora * 60 + p.minuto) * 60_000;
  return new Date(medianoche + dias * 86_400_000 + (h * 60 + m) * 60_000).toISOString();
}

const PENDIENTES: [number, number, number, number, string][] = [
  [0, 9, 0, 45, 'Revisión de inventario'],
  [0, 12, 30, 30, 'Llamada con el proveedor de empaques'],
  [0, 17, 0, 30, 'Cierre de caja'],
  [1, 10, 0, 60, 'Junta con el contador'],
  [1, 16, 0, 60, 'Entrega del pedido de la cafetería'],
];

const simulador = new SimuladorGoogle();
simulador.agregaCalendario({ cuenta: REF.cuenta, id: REF.calendario, nombre: 'Agenda del laboratorio', color: null, zona: ZONA, rol: 'propietario', principal: true, visible: true });
for (const [dias, h, m, duracion, titulo] of PENDIENTES) {
  const inicio = aLas(dias, h, m);
  simulador.siembra(REF, { titulo, inicio, fin: new Date(Date.parse(inicio) + duracion * 60_000).toISOString(), zona: ZONA });
}
await mkdir(dirname(ESPEJO), { recursive: true });
await rm(ESPEJO, { force: true });
const almacen = await AlmacenEnArchivo.abre(ESPEJO);
const r = await sincroniza({ proveedor: simulador, almacen }, REF);
console.log(`agenda sintética sembrada en ${ESPEJO}: ${PENDIENTES.length} pendientes (${JSON.stringify(r).slice(0, 120)})`);
