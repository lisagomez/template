/**
 * El resumen de Ágora para la agenda: SOLO conteos y enlaces, los que declara la composición. Ningún monto (un monto es
 * dato financiero) ni texto libre: lo arma la base con la sesión de quien mira y lo valida la capa antes de mostrarlo.
 * En este goal no sale de la máquina: se pinta en el inicio, nada más.
 */
import { lineaDeAgenda, validaResumen, type Resumen } from '../../../../tools/capa/dist/index.js';
import { esperaTuClic } from '../../../../tools/agora/dist/index.js';
import composicion from '../../../../productos/composiciones/agora.json' with { type: 'json' };
import { conSesion } from './datos';

export async function resumenDeAgora() {
  return conSesion(async (s): Promise<{ resumen: Resumen; linea: string }> => {
    const espera = await esperaTuClic(s);
    const cuenta = async (sql: string) => Number((await s.consulta<{ n: string }>(sql))[0]!.n);
    const crudo = {
      resumen: 1, producto: composicion.producto, generado: new Date().toISOString(),
      conteos: {
        'pendientes-de-clic': espera.filter((x) => x.tipo !== 'aviso').length,
        'alertas-de-presupuesto': await cuenta(`select count(*) n from agora.aviso where not atendido and tipo in ('presupuesto_desviacion', 'tope_80', 'tope_100')`),
        'agentes-suspendidos': await cuenta(`select count(*) n from agora.agente where estado = 'suspendido'`),
        'polizas-por-aceptar': await cuenta(`select count(*) n from agora.poliza where estado = 'propuesta'`),
      },
      enlaces: { agora: '/agora' },
    };
    const r = validaResumen(crudo, composicion.resumen);
    if (!r.ok) throw new Error(`el resumen no pasa la capa: ${r.motivos.join('; ')}`);
    return { resumen: r.resumen, linea: lineaDeAgenda(r.resumen) };
  });
}
