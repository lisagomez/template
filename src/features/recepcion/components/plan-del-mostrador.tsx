'use client';

/**
 * La ranura de plan de Recepción, llenada por tools/calendario: las citas de hoy y de mañana leídas de su espejo
 * (la misma agenda que contesta «¿qué tengo hoy?» y que cambia al apartar o cancelar). Usa las clases de la capa
 * porque se pinta dentro de su panel.
 */
import { citasDelDia, horaDe } from '../services/agenda.ts';
import { useFotoDeAgenda } from '../hooks/use-agenda';

export function PlanDelMostrador() {
  const foto = useFotoDeAgenda();
  if (foto.ahora === 0) return <div className="capa-aviso" data-capa-calendario="tools/calendario">Leyendo la agenda…</div>;
  const grupos = [['Hoy', citasDelDia(foto, 0)], ['Mañana', citasDelDia(foto, 1)]] as const;
  return (
    <div data-capa-calendario="tools/calendario">
      {grupos.map(([nombre, xs]) => (
        <div key={nombre} data-recepcion-dia={nombre}>
          <div className="capa-aviso">{nombre}</div>
          {xs.length
            ? xs.map((i) => <div key={i.id} className="capa-dato" data-recepcion-cita={i.titulo}><span>{i.titulo}</span><b>{horaDe(i.inicioMs)}</b></div>)
            : <div className="capa-aviso">Sin citas.</div>}
        </div>
      ))}
    </div>
  );
}
