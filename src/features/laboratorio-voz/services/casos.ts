/**
 * El catalogo: 20 casos en 4 salas, escritos para la persona que prueba, no para quien
 * programa. El estado que se declara aqui es el de PARTIDA; el real lo calcula
 * `estado-casos.ts` mirando que hay en la maquina.
 */
import type { Caso, Sala } from '../types/index.ts';

export const SALAS: Sala[] = [
  { id: 'escribir', titulo: 'Sala 1 · Hablar y que se escriba', bajada: 'Tu voz se convierte en texto, aqui, en esta computadora.' },
  { id: 'quien', titulo: 'Sala 2 · Quien habla y que paso', bajada: 'Separar voces, entender la conversacion y devolver consejo.' },
  { id: 'habla', titulo: 'Sala 3 · La maquina habla', bajada: 'Texto que se vuelve voz, y bucles donde la maquina pregunta y tu respondes.' },
  { id: 'donde', titulo: 'Sala 4 · Donde se usa', bajada: 'Celular, reuniones virtuales, campo. Lo que ya se conecta y lo que no.' },
];

const STT = ['parakeet', 'silero', 'ffmpeg', 'runtime', 'tokenServidor'] as const;
const TTS = ['piper', 'runtime', 'tokenServidor'] as const;

export const CASOS: Caso[] = [
  {
    id: 1, slug: 'notas-de-voz', sala: 'escribir', titulo: 'Notas de voz a texto',
    queEs: 'Hablas y sale el texto. Sirve para una nota rapida, un mensaje o una idea que no quieres teclear.',
    estadoBase: 'listo', requiere: [...STT], panel: 'transcribir',
    pasos: ['Graba con el microfono o sube un audio (o usa la muestra).', 'Espera un momento.', 'Lee el texto y compara con lo que dijiste.'],
    esperado: 'El texto aparece en menos de un segundo por cada diez segundos de audio, con puntuacion.',
  },
  {
    id: 2, slug: 'documentos-dictados', sala: 'escribir', titulo: 'Transcripcion de documentos dictados',
    queEs: 'Un audio largo (una carta, un informe dictado) se convierte en texto con marcas de tiempo.',
    estadoBase: 'listo', requiere: [...STT], panel: 'segmentos',
    pasos: ['Sube un audio de varios minutos o graba un parrafo.', 'Elige «con tiempos».', 'Revisa cada tramo: tiempo de inicio, texto.'],
    esperado: 'Cada frase con su minuto y segundo; el texto completo abajo para copiar.',
  },
  {
    id: 3, slug: 'lectura-de-clases', sala: 'escribir', titulo: 'Lectura de clases',
    queEs: 'La grabacion de una clase se vuelve apuntes buscables, partidos en capitulos donde hubo pausas largas.',
    estadoBase: 'listo', requiere: [...STT], panel: 'segmentos',
    pasos: ['Sube la grabacion de la clase (o graba dos minutos explicando algo).', 'Espera: tarda cerca de un minuto por cada veinte de audio.', 'Busca una palabra en los apuntes y salta al tramo.'],
    esperado: 'Apuntes con tiempos, capitulos por pausas (eso es por reglas, no por inteligencia) y buscador.',
    notaHonesta: 'Los capitulos se cortan donde hubo silencio largo: es una regla, no entiende el tema.',
  },
  {
    id: 4, slug: 'comandos-de-voz', sala: 'escribir', titulo: 'Comandos de voz para organizar',
    queEs: 'Dictas con comandos («punto y aparte», «nueva linea») y pides acciones («agenda reunion con Ana el martes», «busca el contrato de Acme»). La accion se ENTIENDE por reglas y se muestra como vista previa; no se ejecuta.',
    estadoBase: 'reglas', requiere: [...STT], panel: 'comandos',
    pasos: ['Di o escribe una frase con un comando y una accion.', 'Mira el texto ya limpio a la izquierda.', 'Mira a la derecha lo que HARIA (evento, busqueda, correo) sin hacerlo.'],
    esperado: 'Los comandos de puntuacion se aplican; la accion se detecta con su fecha y su vista previa marcada «no ejecutado».',
    notaHonesta: 'Ejecutar de verdad contra el calendario, el correo o el CRM es una puerta humana: son acciones irreversibles y hoy no hay integracion.',
  },
  {
    id: 5, slug: 'recordatorios', sala: 'escribir', titulo: 'Recordatorios por voz',
    queEs: '«Recuerdame llamar a Ana el martes a las diez» se vuelve un recordatorio con fecha, guardado en este navegador.',
    estadoBase: 'reglas', requiere: [...STT], panel: 'comandos',
    pasos: ['Di o escribe un recordatorio con dia y hora.', 'Revisa la fecha que entendio.', 'Guardalo y verifica que quede en la lista.'],
    esperado: 'Fecha y hora correctas para «manana», «el martes», «en dos horas», «el 3 de octubre».',
  },
  {
    id: 6, slug: 'call-center', sala: 'quien', titulo: 'Asistente de call center',
    queEs: 'Una llamada con dos personas (agente y cliente) se separa por voz, se transcribe por turnos y sale un analisis: dolores, objeciones, senales de compra y la siguiente mejor pregunta.',
    estadoBase: 'listo', requiere: [...STT, 'embedding'], panel: 'reunion',
    pasos: ['Genera la llamada de muestra (dos voces, una por canal) o sube una grabacion.', 'Di quien es el agente y quien el cliente.', 'Lee el analisis: cada hallazgo cita la frase exacta.'],
    esperado: 'Turnos con quien habla, hallazgos con su evidencia y un puntaje con desglose. El analisis es por reglas: no adivina.',
  },
  {
    id: 7, slug: 'sentimiento', sala: 'quien', titulo: 'Analisis de sentimiento',
    queEs: 'Cada frase recibe un tono (positivo, neutro, negativo) contando palabras de un diccionario local en espanol. Se ve que palabras pesaron.',
    estadoBase: 'reglas', requiere: [], panel: 'sentimiento',
    pasos: ['Pega o dicta unas frases de un cliente.', 'Mira el tono por frase y el global.', 'Abre una frase para ver que palabras decidieron.'],
    esperado: 'Tonos razonables en frases claras; en ironia o sarcasmo se equivoca, y lo dice.',
    notaHonesta: 'Es un diccionario, no inteligencia: no entiende contexto ni ironia.',
  },
  {
    id: 8, slug: 'feedback-asesor', sala: 'quien', titulo: 'Respuesta y feedback al asesor',
    queEs: 'Tras una reunion de ventas, el asesor recibe un puntaje de 0 a 100 con desglose por dimension, los huecos y la pregunta que debio hacer.',
    estadoBase: 'listo', requiere: [...STT, 'embedding'], panel: 'reunion',
    pasos: ['Usa la reunion de muestra o la tuya.', 'Ve al puntaje y abre el desglose.', 'Lee los huecos y la pregunta sugerida para cada uno.'],
    esperado: 'Nunca un numero solo: siempre con su desglose y su porque.',
  },
  {
    id: 9, slug: 'reunion-grupal', sala: 'quien', titulo: 'Reunion grupal presencial',
    queEs: 'Un solo microfono, varias personas: se separa quien hablo cuando y se transcribe cada turno.',
    estadoBase: 'listo', requiere: [...STT, 'embedding'], panel: 'reunion',
    pasos: ['Sube una grabacion con varias voces (o genera la muestra con dos voces).', 'Indica cuantas personas hablan si lo sabes.', 'Revisa los turnos: quien y cuando.'],
    esperado: 'Turnos etiquetados «Hablante 1», «Hablante 2»...; con voces parecidas puede confundirse.',
    notaHonesta: 'No ve dos personas hablando a la vez: ese tramo sale como un solo turno.',
  },
  {
    id: 10, slug: 'competencias-orales', sala: 'quien', titulo: 'Evaluacion de competencias orales',
    queEs: 'Sobre tu propia grabacion: palabras por minuto, muletillas, pausas largas y cuanto del tiempo hablaste.',
    estadoBase: 'reglas', requiere: [...STT], panel: 'competencias',
    pasos: ['Graba un minuto presentandote o explicando algo.', 'Mira las metricas.', 'Compara con los rangos de referencia que se muestran.'],
    esperado: 'Numeros medidos sobre tu audio, con la lista de muletillas encontradas.',
    notaHonesta: 'Mide, no juzga: los rangos de referencia son orientativos.',
  },
  {
    id: 11, slug: 'role-playing', sala: 'quien', titulo: 'Role-playing con IA',
    queEs: 'Practicar una conversacion dificil con un personaje que responde. Necesita un modelo de lenguaje.',
    estadoBase: 'puerta', requiere: [], panel: 'puerta',
    razonPuerta: 'No hay ninguna llave de modelo configurada, y elegir y fijar un modelo es un cambio de comportamiento que exige aprobacion humana (control C1). Cuando el personaje hable con datos de terceros, ademas hace falta una evaluacion de impacto firmada (C4).',
    pasos: ['Lee lo que haria.', 'Mira por que esta cerrado.', 'Si quieres abrirlo, lo decide una persona, no esta pagina.'],
    esperado: 'Nada corre. El boton esta deshabilitado con la razon a la vista.',
  },
  {
    id: 12, slug: 'consultas-frecuentes', sala: 'quien', titulo: 'Asistente de consultas frecuentes',
    queEs: 'Tu lista de preguntas y respuestas; preguntas por voz y la maquina responde por voz con la mas parecida. Sin modelo: compara palabras.',
    estadoBase: 'reglas', requiere: [...STT, ...TTS], panel: 'faq',
    pasos: ['Edita las preguntas y respuestas (hay cinco de ejemplo).', 'Pregunta por voz o por escrito.', 'Escucha la respuesta y mira el parecido que calculo.'],
    esperado: 'Acierta cuando la pregunta comparte palabras con la lista; si no hay parecido suficiente, dice que no sabe.',
  },
  {
    id: 13, slug: 'asesoria-especializada', sala: 'quien', titulo: 'Asistente especializado en asesoria profesional',
    queEs: 'El mismo analisis de reunion con guias por tipo: descubrimiento, demostracion, negociacion, revision tecnica, cierre. Hoy el dominio es ventas.',
    estadoBase: 'listo', requiere: [...STT, 'embedding'], panel: 'reunion',
    pasos: ['Elige el tipo de reunion.', 'Analiza la muestra o la tuya.', 'Compara como cambia el puntaje segun la guia.'],
    esperado: 'Las dimensiones y sus pesos cambian con el tipo de reunion.',
    notaHonesta: 'Otros dominios (legal, medico, financiero) no tienen guia todavia: seria una puerta humana escribirla.',
  },
  {
    id: 14, slug: 'locucion-audiolibros', sala: 'habla', titulo: 'Locucion sintetica para audiolibros',
    queEs: 'Pegas un texto y sale la voz leyendolo, con la velocidad que elijas. Se puede descargar el audio.',
    estadoBase: 'listo', requiere: [...TTS], panel: 'locucion',
    pasos: ['Pega un parrafo (hay uno de ejemplo).', 'Elige voz y velocidad y pulsa generar.', 'Escucha y descarga el archivo.'],
    esperado: 'Voz clara en espanol; genera cerca de veinte segundos de audio por cada segundo de calculo.',
  },
  {
    id: 15, slug: 'postproduccion-podcast', sala: 'habla', titulo: 'Postproduccion de podcast',
    queEs: 'Subes un episodio y ves los silencios que se pueden recortar, los capitulos por pausas y la transcripcion con quien habla.',
    estadoBase: 'listo', requiere: [...STT, 'embedding'], panel: 'podcast',
    pasos: ['Sube el episodio (o usa la muestra).', 'Mira la lista de silencios y cuanto tiempo ahorrarian.', 'Revisa capitulos y transcripcion.'],
    esperado: 'Silencios con inicio, fin y duracion; total recortable; capitulos por reglas.',
    notaHonesta: 'Detecta y propone; no corta el archivo. Cortar es una edicion que decides tu.',
  },
  {
    id: 16, slug: 'voz-picking', sala: 'habla', titulo: 'Voz picking (almacen)',
    queEs: 'La maquina lee una linea de pedido («pasillo A doce, tres unidades»), tu confirmas la cantidad de viva voz, y pasa a la siguiente.',
    estadoBase: 'listo', requiere: [...STT, ...TTS], panel: 'picking',
    pasos: ['Pulsa empezar y escucha la linea.', 'Di la cantidad (o escribela si no tienes microfono).', 'Repite hasta terminar el pedido.'],
    esperado: 'Entiende numeros dichos en espanol; si no coincide, lo vuelve a pedir.',
  },
  {
    id: 17, slug: 'manos-libres-epi', sala: 'habla', titulo: 'Comunicacion con EPI / manos libres',
    queEs: 'Con casco, guantes o mascarilla no se teclea: se habla y el sistema cierra la frase solo, tras un segundo de silencio.',
    estadoBase: 'listo', requiere: [...STT], panel: 'transcribir',
    pasos: ['Graba con ruido de fondo si puedes (o sube una grabacion de campo).', 'Transcribe.', 'Cuenta los errores: eso es la medida real en tu entorno.'],
    esperado: 'Frases enteras sin partirse. La precision con ruido NO esta medida: se mide con tu grabacion.',
    notaHonesta: 'La cifra de 3,3 % de error es con audio limpio y leido. Con ruido de campo sera peor; cuanto, se mide aqui.',
  },
  {
    id: 18, slug: 'celular', sala: 'donde', titulo: 'Desde el celular',
    queEs: 'La app instalable en el telefono: hablas al celular y el texto va al cursor de tu computadora, a la pantalla del telefono, o a ambos.',
    estadoBase: 'listo', requiere: ['tokenServidor'], panel: 'celular',
    pasos: ['Abre la direccion en el telefono y empareja una vez.', 'Elige destino: a la PC, aqui o ambos.', 'Dicta y mira donde aparece el texto.'],
    esperado: 'El texto aparece donde elegiste, en uno o dos segundos.',
    notaHonesta: 'Ni iPhone ni Android dejan que una app web flote sobre otras apps: el boton flota dentro de la app instalada.',
  },
  {
    id: 19, slug: 'zoom-meet', sala: 'donde', titulo: 'Zoom y Google Meet',
    queEs: 'Un asistente que entre a la reunion en vivo. Hoy no existe: entrar como bot a una reunion es una superficie externa que exige un modelo de amenazas y una evaluacion de impacto sobre los demas participantes.',
    estadoBase: 'puerta', requiere: [], panel: 'puerta',
    razonPuerta: 'Un bot en una reunion recibe audio de terceros que no firmaron nada (C4) y es una entrada no autenticada hacia un agente con llaves (C3). Lo decide una persona con esos dos documentos.',
    pasos: ['Lee lo que si se puede hoy: grabar la reunion y subirla a la Sala 2.', 'Mira por que el bot en vivo esta cerrado.', 'Prueba la alternativa con una grabacion.'],
    esperado: 'Nada se conecta a Zoom ni a Meet. La grabacion subida se analiza igual que una reunion grupal.',
  },
  {
    id: 20, slug: 'virtual-y-campo', sala: 'donde', titulo: 'Virtual y en campo',
    queEs: 'Virtual: el microfono del navegador o una grabacion. En campo: el celular en manos libres. Ambos llegan al mismo motor de esta computadora.',
    estadoBase: 'listo', requiere: [...STT], panel: 'transcribir',
    pasos: ['Prueba con el microfono de esta computadora.', 'Prueba desde el celular (Sala 4, caso 18).', 'Compara la calidad entre los dos.'],
    esperado: 'Mismo texto por los dos caminos; el celular tarda un poco mas por la red.',
    notaHonesta: 'En campo hace falta red hacia esta computadora: sin red no hay transcripcion.',
  },
];

export const casoPorId = (id: number): Caso | undefined => CASOS.find((c) => c.id === id);
export const casosDeSala = (sala: string): Caso[] => CASOS.filter((c) => c.sala === sala);
