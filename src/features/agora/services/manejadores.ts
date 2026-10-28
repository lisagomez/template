/**
 * Los manejadores de las intenciones de Ágora en la ventana. Los que solo llevan a una pantalla los pone la capa
 * (`manejadoresDeNavegacion`); estos resuelven contra la base por las acciones del servidor. Ninguno aprueba: el
 * que lo parece («apruébalo») explica que aprobar es un clic sobre la huella y lleva a donde está ese clic.
 */
import type { Manejadores } from '../../../../tools/capa/dist/index.js';
import type { DatosDeAgora } from '../types';
import { intencionAbre, intencionAgente, intencionCambio, intencionCierre, intencionDisponible, intencionEscribe, intencionSegregacion, type Respuesta } from './intenciones';

interface Opciones { datos: () => DatosDeAgora; parametro: (k: string) => string | null; navega: (r: string) => void; refresca: () => void }

export function manejadoresDeAgora(o: Opciones): Manejadores {
  const lleva = (r: Respuesta) => {
    if (r.ir) setTimeout(() => o.navega(r.ir!), 0);
    else o.refresca();
    return { texto: r.texto, ...(r.ir ? { ir: r.ir } : {}) };
  };
  return {
    'agora.espera': async () => {
      const d = o.datos();
      if (d.apagada) return { texto: `Ágora está apagada aquí: ${d.motivo}` };
      const decidir = d.espera.filter((x) => x.tipo !== 'aviso');
      const avisos = d.espera.filter((x) => x.tipo === 'aviso');
      if (!decidir.length && !avisos.length) return { texto: 'Nada espera tu clic ahora.' };
      const primeras = decidir.slice(0, 3).map((x) => `«${x.titulo}»`).join('; ');
      return { texto: `Te esperan ${decidir.length} decisión(es)${primeras ? `: ${primeras}` : ''}${avisos.length ? `, y ${avisos.length} alerta(s)` : ''}. Están en «Espera tu clic», a un lado.` };
    },
    'agora.aprobar': async () => {
      const d = o.datos();
      const primera = d.apagada ? null : d.espera.find((x) => x.tipo === 'propuesta');
      return { texto: 'No apruebo nada, ni por voz ni por escrito: aprobar es TU clic sobre la huella de la propuesta, en su hilo o en «Espera tu clic».'
        + (primera ? ` La primera que te espera es «${primera.titulo}».` : ''), ...(primera ? { ir: primera.ir } : {}) };
    },
    'agora-tablero.abre': async ({ texto }) => lleva(await intencionAbre(texto, 'tablero', 'tabla')),
    'agora-tablero.abre-kanban': async ({ texto }) => lleva(await intencionAbre(texto, 'tablero', 'kanban')),
    'agora-tablero.abre-gantt': async ({ texto }) => lleva(await intencionAbre(texto, 'tablero', 'gantt')),
    'agora-buzon.abre': async ({ texto }) => lleva(await intencionAbre(texto, 'buzon')),
    'agora-tablero.cambia': async ({ texto }) => lleva(await intencionCambio(texto, o.parametro('ws'), o.parametro('cat'))),
    'agora-buzon.escribe': async ({ texto }) => lleva(await intencionEscribe(texto, o.parametro('cat'))),
    'agora-costos.disponible': async ({ texto }) => lleva(await intencionDisponible(texto)),
    'agora-contabilidad.cierra-periodo': async ({ texto }) => lleva(await intencionCierre(texto)),
    'agora-agentes.suspende': async ({ texto }) => lleva(await intencionAgente(texto, 'suspende')),
    'agora-agentes.revoca': async ({ texto }) => lleva(await intencionAgente(texto, 'revoca')),
    'agora-agentes.avisa-tercero': async ({ texto }) => lleva(await intencionAgente(texto, 'avisa')),
    'agora.quita-segregacion': async ({ texto }) => lleva(await intencionSegregacion(texto)),
  };
}
