import { aprobar } from '../services/acciones';
import { ROL } from './textos';
import { Boton } from './boton';
import type { Rol } from '../../../../tools/sistema-integrado/dist/index.js';

/**
 * Aprobar o rechazar la VERSIÓN EXACTA que se está viendo: la huella viaja con el formulario y la base la compara
 * (si el objeto cambió entre que se revisó y se aprobó, se rechaza). Se elige con cuál de TUS roles se aprueba.
 */
export function FormAprobar({ org, tipo, objeto, huella, roles, volver, etiqueta }: {
  org: string; tipo: string; objeto: string; huella: string; roles: Rol[]; volver: string; etiqueta?: string;
}) {
  const propios = roles.filter((r) => r !== 'consultor');
  if (!propios.length) return <p className="text-xs text-gray-600" data-prueba="sin-rol">Tu rol (consultor) propone, no aprueba: lo aprueba la organización.</p>;
  return (
    <form action={aprobar.bind(null, org)} className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3" data-prueba={`aprobar-${tipo}`}>
      <input type="hidden" name="objeto_tipo" value={tipo} />
      <input type="hidden" name="objeto_id" value={objeto} />
      <input type="hidden" name="huella" value={huella} />
      <input type="hidden" name="volver" value={volver} />
      <label className="text-xs">Como
        <select name="rol" className="ml-1 rounded border-gray-300 text-sm" data-prueba="rol">{propios.map((r) => <option key={r} value={r}>{ROL[r]}</option>)}</select>
      </label>
      <input name="motivo" placeholder="Motivo (obligatorio si rechazas)" className="min-w-48 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
      <Boton name="decision" value="aprobado" data-prueba="aprobar" trabajando="Aprobando…">{etiqueta ?? 'Aprobar'}</Boton>
      <Boton name="decision" value="rechazado" variante="peligro" data-prueba="rechazar" trabajando="…">Rechazar</Boton>
    </form>
  );
}
