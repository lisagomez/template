import { proponer, fotografiar } from '../services/acciones';
import { Boton } from './boton';

/** Pedirle una propuesta a un agente (queda como propuesta) o fotografiar una matriz para aprobarla. */
export function PedirAgente({ org, que, volver, children }: { org: string; que: string; volver: string; children: React.ReactNode }) {
  return (
    <form action={proponer.bind(null, org)}>
      <input type="hidden" name="que" value={que} /><input type="hidden" name="volver" value={volver} />
      <Boton data-prueba={`agente-${que}`} trabajando="El agente está proponiendo (30-90 s)…">{children}</Boton>
    </form>
  );
}
export function Fotografiar({ org, foto, children }: { org: string; foto: string; children: React.ReactNode }) {
  return (
    <form action={fotografiar.bind(null, org)}>
      <input type="hidden" name="foto" value={foto} />
      <Boton variante="secundario" data-prueba={`foto-${foto}`} trabajando="Preparando versión…">{children}</Boton>
    </form>
  );
}
