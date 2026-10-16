/**
 * Qué hace cada orden de CONTROL del propio bucle, como plan puro: el bucle lo aplica solo
 * cuando el turno se confirma (una orden preparada en la pausa no cambia nada si la persona
 * sigue hablando).
 *
 * La ESCRITURA nunca se ejecuta: se describe, se deja en borrador y se pide «confirmo»; y aun
 * confirmada, este bucle solo lee. Es la restricción del laboratorio: nada que escriba fuera de
 * él ni notifique a terceros.
 */

export interface EstadoControl {
  velocidad: number;
  pendiente: string | undefined;
  hayUltima: boolean;
}

export interface PlanControl {
  texto?: string;
  velocidad?: number;
  /** `null` borra lo pendiente. */
  pendiente?: string | null;
  calla?: true;
  repite?: true;
  despues?: 'reposo';
}

export const VELOCIDADES = { minima: 0.7, maxima: 1.45, paso: 0.15 } as const;

const redondea = (v: number) => Math.round(v * 100) / 100;

export function planControl(orden: string, textoOido: string, e: EstadoControl): PlanControl {
  switch (orden) {
    case 'para':
      return { calla: true };
    case 'repite':
      return e.hayUltima ? { repite: true } : { texto: 'Todavía no he dicho nada.' };
    case 'mas-despacio': {
      const v = redondea(Math.max(VELOCIDADES.minima, e.velocidad - VELOCIDADES.paso));
      return v === e.velocidad ? { texto: 'Ya voy lo más despacio que puedo.' } : { velocidad: v, texto: 'De acuerdo, más despacio.' };
    }
    case 'mas-rapido': {
      const v = redondea(Math.min(VELOCIDADES.maxima, e.velocidad + VELOCIDADES.paso));
      return v === e.velocidad ? { texto: 'Ya voy lo más rápido que puedo.' } : { velocidad: v, texto: 'De acuerdo, más rápido.' };
    }
    case 'duerme':
      return { texto: 'Hasta luego.', despues: 'reposo' };
    case 'confirma':
      return e.pendiente
        ? { texto: 'Confirmado, pero este centro de mando solo lee: no tengo permiso de escritura. Lo dejo como borrador.', pendiente: null }
        : { texto: 'No hay nada pendiente de confirmar.' };
    case 'olvida':
      return e.pendiente ? { texto: 'Descartado.', pendiente: null } : { texto: 'No había nada pendiente.' };
    case 'escritura':
      return {
        texto: `Eso escribiría fuera del laboratorio: «${textoOido.trim()}». No lo ejecuto: queda en borrador, sin tocar nada. Si de verdad lo quieres, di «confirmo».`,
        pendiente: textoOido.trim(),
      };
    case 'escucha':
      return { texto: 'Dime.' };
    default:
      return { texto: 'No conozco esa orden.' };
  }
}
