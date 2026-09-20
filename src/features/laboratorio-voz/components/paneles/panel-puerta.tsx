'use client';

/**
 * PUERTA HUMANA: se explica que haria, por que esta cerrado y quien lo abre. Nada corre, nada se
 * simula. Cuando hay una alternativa honesta (grabar la reunion y subirla), se ofrece.
 */
import type { Caso } from '../../types/index.ts';
import { Aviso, Boton } from '../ui.tsx';

const LO_QUE_HARIA: Record<string, { haria: string[]; abre: string[]; alternativa?: { texto: string; caso: number } }> = {
  'role-playing': {
    haria: ['Tú eliges un escenario: cliente enojado, entrevista de trabajo, negociación de precio.', 'Hablas; el personaje responde por voz y mantiene su papel.', 'Al final, un resumen de qué hiciste bien y qué mejorar.'],
    abre: ['Elegir y fijar un modelo de lenguaje (cambio de comportamiento: aprobación humana y registro, control C1).', 'Configurar la llave del proveedor, o pesos abiertos alojados por nosotros.', 'Si el personaje va a oír datos de terceros, una evaluación de impacto firmada (C4).'],
  },
  'zoom-meet': {
    haria: ['Un asistente entra a la reunión como participante.', 'Escucha, separa quién habla y saca el acta y las acciones en vivo.', 'Al terminar, manda el resumen a quien corresponda.'],
    abre: ['Modelo de amenazas de esa superficie: un bot en una reunión es una entrada no autenticada hacia un agente con llaves (C3).', 'Evaluación de impacto sobre los demás participantes, que no firmaron nada (C4).', 'Puerta humana para toda acción que el bot dispare (enviar, guardar, compartir).'],
    alternativa: { texto: 'Lo que sí se puede hoy: grabar la reunión con Zoom o Meet, y subir el archivo a la Sala 2. Se analiza igual que una reunión grupal.', caso: 9 },
  },
};

export function PanelPuerta({ caso }: { caso: Caso }) {
  const info = LO_QUE_HARIA[caso.slug];
  return (
    <div className="space-y-3" data-prueba="panel-puerta">
      <Aviso tipo="info">
        <strong>Por qué está cerrado: </strong>
        {caso.razonPuerta}
      </Aviso>
      {info ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lo que haría (vista previa, no corre)</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
              {info.haria.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quién lo abre y con qué</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
              {info.abre.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="primario" disabled title={caso.razonPuerta}>
          Probar (cerrado: lo decide una persona)
        </Boton>
        {info?.alternativa ? (
          <a href={`#caso-${info.alternativa.caso}`} className="text-sm underline">
            Ir a la alternativa (caso {info.alternativa.caso})
          </a>
        ) : null}
      </div>
      {info?.alternativa ? <Aviso tipo="ok">{info.alternativa.texto}</Aviso> : null}
    </div>
  );
}
