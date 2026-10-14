/**
 * Lo que el laboratorio le dice al usuario a propósito: una regla de quién puede qué, o un plan que no aplica. Es lo
 * único cuyo mensaje sale por la ruta; cualquier otro error es interno y se queda en el log (PRP-010 H-25).
 */
export class Rechazo extends Error {}
