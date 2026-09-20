/**
 * Golden set del asesor: cinco reuniones de guion con el puntaje que una persona ESPERA por
 * diseño de cada guion (rango ±10) y los huecos o riesgos que deben salir. Regresion estilo C2:
 * si un playbook cambia y una fila se sale del rango, se revisa el cambio, no la prueba.
 *
 * Los rangos los propuso el agente a partir de lo que cada guion cubre y deja fuera; quedan
 * PENDIENTES de veredicto humano (quien decide ajusta el rango y firma en la bitacora).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarReunion, participantesDesdeHablantes, playbookPorTipo, transcripcionDesdeTurnos, type Reunion, type TipoReunion } from '../dist/index.js';

const seg = (lineas: Array<[string, string]>) => lineas.map(([hablante, texto], i) => ({ inicioMs: i * 8000, finMs: i * 8000 + 7000, hablante, texto }));

interface Golden {
  nombre: string;
  tipo: TipoReunion;
  /** Rango esperado del puntaje total (veredicto humano pendiente). */
  esperado: [number, number];
  huecosEsperados?: string[];
  riesgosEsperados?: string[];
  lineas: Array<[string, string]>;
}

const GOLDEN: Golden[] = [
  {
    nombre: 'discovery completo: dolor, impacto, urgencia, decisor, presupuesto, competencia y siguiente paso',
    tipo: 'discovery', esperado: [58, 78], huecosEsperados: [],
    lineas: [
      ['Ana', '¿Qué es lo que más se les complica hoy en la operación?'],
      ['Luis', 'Las cotizaciones: cada quien las hace a su manera y perdemos como veinte horas al mes en retrabajo.'],
      ['Ana', '¿Y qué pasa si eso sigue así seis meses más?'],
      ['Luis', 'Se nos van clientes por responder tarde; el impacto es directo en ventas.'],
      ['Ana', '¿Para cuándo necesitan tenerlo resuelto?'],
      ['Luis', 'Antes de fin de año, porque en enero arranca la temporada alta y es urgente.'],
      ['Ana', '¿Cómo se decide una compra así en su empresa: quién autoriza?'],
      ['Luis', 'Lo autoriza el director de operaciones, Pedro, y compras revisa el contrato; yo soy el usuario principal.'],
      ['Ana', '¿Tienen una partida o rango de presupuesto contemplado?'],
      ['Luis', 'Sí, tenemos presupuesto de unos cien mil pesos aprobado para este trimestre.'],
      ['Ana', '¿Qué usan hoy y han visto otras herramientas?'],
      ['Luis', 'Usamos Excel y correo; vimos a un competidor, Cotizapp, pero era muy caro.'],
      ['Ana', '¿Le parece si le mando la propuesta el jueves y agendamos la demo con Pedro?'],
      ['Luis', 'Sí, quedamos en que me mandas la propuesta el jueves y la demo la semana que viene.'],
    ],
  },
  {
    nombre: 'discovery superficial: el asesor presenta y no pregunta nada',
    tipo: 'discovery', esperado: [0, 20], riesgosEsperados: ['discovery_incompleto'],
    lineas: [
      ['Ana', 'Le cuento lo que hacemos: somos una plataforma de cotizaciones muy completa.'],
      ['Luis', 'Ajá.'],
      ['Ana', 'Tenemos módulos de todo tipo y muchos clientes contentos.'],
      ['Luis', 'Ok, lo veo y le aviso.'],
      ['Ana', 'Perfecto, cualquier cosa me dice.'],
    ],
  },
  {
    nombre: 'demo con una objecion de precio que el asesor no responde',
    tipo: 'demo', esperado: [10, 30], riesgosEsperados: ['objecion_sin_respuesta'],
    lineas: [
      ['Ana', 'Como ven, el flujo de cotización se arma en tres pasos.'],
      ['Luis', 'Se ve bien, pero la verdad se me hace caro y no sé si tengamos presupuesto.'],
      ['Ana', 'Sigamos con el módulo de reportes.'],
      ['Luis', 'Nos duele mucho el retrabajo, eso sí.'],
      ['Ana', '¿Le mando la grabación?'],
      ['Luis', 'Sí, mándamela.'],
    ],
  },
  {
    nombre: 'negociacion con decisor, presupuesto y urgencia, pero sin dolor ni impacto explicitos',
    tipo: 'negociacion', esperado: [35, 55],
    lineas: [
      ['Ana', '¿Quién firma finalmente el contrato?'],
      ['Luis', 'Lo firma el director financiero, Carla, y ya tiene el presupuesto de ochenta mil aprobado.'],
      ['Ana', '¿Qué les preocupa de la propuesta?'],
      ['Luis', 'El plazo de implementación: necesitamos arrancar en noviembre, es urgente.'],
      ['Ana', 'Podemos arrancar el diez de noviembre; ¿le parece si cerramos el viernes con Carla?'],
      ['Luis', 'Quedamos en que revisamos el contrato el viernes y firmamos.'],
    ],
  },
  {
    nombre: 'cierre sin proximos pasos: nadie queda en nada',
    tipo: 'cierre', esperado: [0, 15], riesgosEsperados: ['sin_presupuesto', 'discovery_incompleto'],
    lineas: [
      ['Ana', 'Bueno, ya vieron todo.'],
      ['Luis', 'Sí, gracias, lo pensamos.'],
      ['Ana', 'Vale.'],
    ],
  },
];

for (const g of GOLDEN) {
  test(`golden: ${g.nombre} → puntaje en [${g.esperado[0]}, ${g.esperado[1]}]`, () => {
    const participantes = participantesDesdeHablantes(['Ana', 'Luis'], { Ana: { rol: 'Asesor', lado: 'interno' }, Luis: { rol: 'Cliente', lado: 'cliente' } });
    const id = `golden-${g.tipo}-${g.nombre.length}`;
    const reunion: Reunion = { id, titulo: g.nombre, cuenta: 'Golden', tipoReunion: g.tipo, participantes, asesor: 'Ana', fecha: '2026-09-20T12:00:00.000Z' };
    const a = analizarReunion(reunion, transcripcionDesdeTurnos(seg(g.lineas), { reunionId: id }), playbookPorTipo(g.tipo));
    assert.ok(a.score.total >= g.esperado[0] && a.score.total <= g.esperado[1], `puntaje ${a.score.total} fuera de [${g.esperado[0]}, ${g.esperado[1]}]`);
    for (const r of g.riesgosEsperados ?? []) assert.ok(a.riesgos.some((x) => x.tipo === r), `falta el riesgo ${r}`);
    if (g.huecosEsperados && g.huecosEsperados.length === 0) assert.ok(a.score.huecos.length <= 3, `un discovery completo no deberia dejar mas de 3 huecos: ${a.score.huecos.map((h) => h.dimension).join(', ')}`);
  });
}
