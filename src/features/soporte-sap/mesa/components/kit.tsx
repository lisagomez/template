/**
 * El kit del experto, en una página: cómo entrar, qué probar, qué significa cada paso y lo que la herramienta NO hace.
 * Va en la misma mesa, detrás de la misma puerta.
 */
import Link from 'next/link'
import { Celda } from './ui'
import { RAIZ_DE_LA_MESA } from './marco'

const PASOS: ReadonlyArray<[string, string]> = [
  ['Recibe tu caso', 'Lo levanta un cliente sintético, en tu nombre: así el caso corre como correría uno real.'],
  ['Lee la evidencia', 'Si elegiste una muestra, la lee como lo haría con la de un cliente: OCR en una captura, el XML de un CFDI, la capa de texto de un PDF.'],
  ['Entiende el caso', 'Saca el módulo, la transacción, el mensaje y la prioridad de lo que escribiste.'],
  ['Busca en lo que sabe', 'Busca una regla en su conocimiento. Si no hay, dice «no lo sé»: no inventa.'],
  ['Arma el plan · otro agente lo revisa', 'Con regla, prepara los pasos con los datos de tu caso, y un segundo agente los comprueba.'],
  ['Llega a la sala · decides tú', 'Nada se aplica sin una persona. Tú apruebas, rechazas o lo mandas a revisión con tu motivo.'],
  ['El simulador lo aplica', 'Se aplica en un SAP simulado del laboratorio: ves el antes y el después.'],
  ['Lo protege · sandbox o cuarentena', 'Sin regla, el caso se anonimiza. Si puede, entra al sandbox para que le enseñes; si es de RR. HH. o nómina, queda en cuarentena y nadie lo aprende.'],
]
const NO_HACE = [
  'No se conecta a tu SAP ni a ningún otro: todo pasa en un simulador (D6).',
  'No aprueba nada sola: decide una persona, con su sesión.',
  'No usa un modelo de IA: el agente es determinista, y por eso dice «no lo sé» cuando no tiene una regla.',
  'No guarda archivos: la evidencia son tres muestras sintéticas.',
  'Lo que le enseñes no se vuelve regla solo: queda como propuesta, y la firma el laboratorio.',
]

export function Kit() {
  return (
    <div className="grid gap-4 lg:grid-cols-12" data-prueba="kit">
      <div className="space-y-4 lg:col-span-7">
        <Celda titulo="Cómo se usa la mesa, en cinco minutos">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-800">
            <li><b>Entra con tu correo.</b> Te llega un código de un solo uso; no hay contraseña que recordar.</li>
            <li><b>Cuéntale un caso tuyo</b>, como a un colega: sistema, módulo, transacción, mensaje y qué pasa. Sin nombres de clientes ni de personas. Si no sabes por dónde empezar, usa uno de los ejemplos.</li>
            <li><b>Mira cómo trabaja</b>, paso a paso. En cada paso, di si estuvo bien o mal y qué esperabas.</li>
            <li><b>Decide o enséñale.</b> Si propone una solución, apruébala, recházala o mándala a revisión. Si dice «no lo sé», enséñale cómo se resuelve.</li>
            <li><b>Da tu veredicto</b> del caso: lo resolvió, en parte, se equivocó o debió decir «no lo sé». Si se equivocó, cuéntale la solución correcta.</li>
          </ol>
          <Link href={RAIZ_DE_LA_MESA} className="mt-4 inline-flex rounded-full bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Ir a la mesa →</Link>
        </Celda>
        <Celda titulo="Qué significa cada paso">
          <dl className="space-y-3">{PASOS.map(([t, d]) => <div key={t}><dt className="text-sm font-bold text-neutral-900">{t}</dt><dd className="text-sm text-neutral-700">{d}</dd></div>)}</dl>
        </Celda>
      </div>
      <div className="space-y-4 lg:col-span-5">
        <Celda titulo="Qué probar" nota="Lo que más le sirve al laboratorio.">
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-800">
            <li>Casos que ves seguido: ¿los reconoce? ¿la solución es la que tú darías?</li>
            <li>Casos raros o mal descritos: ¿dice «no lo sé» en vez de inventar?</li>
            <li>Un caso que te sepas de memoria, para enseñárselo.</li>
            <li>Una muestra de evidencia: ¿lee bien la captura, el CFDI o el PDF?</li>
          </ul>
        </Celda>
        <Celda titulo="Lo que la herramienta NO hace" prueba="no-hace"><ul className="list-disc space-y-1 pl-5 text-sm text-neutral-800">{NO_HACE.map((x) => <li key={x}>{x}</li>)}</ul></Celda>
        <Celda titulo="Tus datos">
          <p className="text-sm text-neutral-700">Lo que escribes y tu retroalimentación se guardan para que el laboratorio mejore al agente. Viven en Cloudflare, en Estados Unidos, junto con tu correo; solo el laboratorio los lee y puede borrarlos. Si un texto tiene forma de dato personal, la mesa no lo acepta.</p>
        </Celda>
      </div>
    </div>
  )
}
