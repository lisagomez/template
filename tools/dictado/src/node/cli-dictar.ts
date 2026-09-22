/**
 * `dictado dictar`: el microfono de WSLg, el VAD de `voz`, un motor, el posproceso y el
 * pegador de Windows, atados a la maquina de estados del nucleo.
 *
 * Como se dispara, en orden de lo que exige:
 *  - **espacio en esta terminal**: alterna escuchar/parar (o, en manos libres, enciende/apaga).
 *    No instala nada, pero el texto se pega donde este el cursor de Windows: cambia de ventana
 *    despues de pulsar.
 *  - **`--tecla`**: lanza A LA VISTA `windows/tecla-global.ps1` con `powershell.exe` (interop,
 *    en esta misma terminal; te lo dice antes). Mantener la tecla = hablar; dos toques = manos libres. Es lo que sflow
 *    hacia con Ctrl+Shift, hecho desde el unico lado que ve el teclado global en WSL2.
 *
 * Motor, modo, pegado, ganancia, silencio y el resto salen de `config.valores` (ajustes.json con
 * precedencia argumento > entorno > ajustes > defecto). Mientras corre se vigila el archivo: lo
 * que es seguro (pegado, comandos, snippets, diccionario, ganancia, umbral, sonidos, retencion)
 * se toma en caliente y lo que exige recargar (motor, silencio, modo, tecla…) se avisa para la
 * siguiente sesion. Lo que fija una bandera o el entorno no lo mueve el archivo, y se dice.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campo, valoresDe, type Ajustes, type AjustesResueltos, type Clave } from '../ajustes.js';
import { creaDictado, type Estado, type Modo } from '../dictado.js';
import { creaEnvioPorSilencio } from '../envio.js';
import { fechaHaceDias } from '../historial.js';
import { creaPosproceso, type Posproceso } from '../posproceso.js';
import type { Motor, Pegador } from '../types.js';
import { capturaMicrofono, escribeWav, nivelDb, type Captura } from './audio.js';
import { ajustaGanancia, factorDe } from './ganancia.js';
import { vigilaArchivoAjustes } from './ajustes-archivo.js';
import type { Configuracion } from './cli-config.js';
import { cargaDatos } from './cli-datos.js';
import { creaDetector, creaMotor } from './cli-motores.js';
import { creaPegadorWindows } from './pegado-windows.js';
import { escuchaIcono, PUERTO_ICONO, type EscuchaIcono } from './icono.js';
import { creaBarras } from './barras.js';
import { creaConversacion } from './conversacion.js';
import { creaPildora, type EntradaPildora } from './pildora.js';
import { escuchaTecla, type EscuchaTecla } from './tecla.js';
import { creaSonidos } from './sonidos.js';
import { construyeTrayectoria, creaContadores, escribeTrayectoria } from './trayectoria.js';
import { avisoPico, conPuertaDeEnergia, conRespaldo, controlador, eleccionDeRespaldo, gris, lanzaIconoBarra, lanzaTeclaGlobal, pegadorDePantalla, pinta, teclasDeTerminal, verde } from './cli-dictar-piezas.js';

/** Donde queda la trayectoria de cada sesion (forma, sin contenido); `DICTADO_TRAYECTORIAS` la cambia. */
const CARPETA_CORPUS = process.env['DICTADO_TRAYECTORIAS'] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'corpus');
export async function ordenDictar(config: Configuracion, opciones: Record<string, string | boolean>): Promise<void> {
  /** Los ajustes ya resueltos (argumento > entorno > ajustes > defecto); `cambiaEnCaliente` los mueve mientras corre. */
  let ajustes: AjustesResueltos = config.ajustes;
  const v: Ajustes = valoresDe(ajustes);
  const modo: Modo = v.modo === 'manos-libres' ? 'manosLibres' : v.modo === 'pulsar' ? 'pulsar' : 'alternar';
  const idioma = v.idioma;
  let pegar: Ajustes['pegar'] = v.pegar;
  const silencioMs = v.silencioMs;
  /** `gananciaDb: auto`: se ajusta sola por el pico de cada escucha (ver ganancia.ts); un numero la fija. */
  let gananciaAuto = v.gananciaDb === 'auto';
  let gananciaDb = gananciaAuto ? 0 : (v.gananciaDb as number);
  /**
   * `micEnEspera: cerrado` (por defecto): en espera el microfono NO esta abierto; se abre al
   * escuchar (~100 ms medidos por PulseAudio de WSLg) y se cierra 1,5 s despues de parar. Con
   * `abierto` se queda capturando y descartando, como antes. Con `--entrada` siempre abierto.
   */
  const micEnEspera = v.micEnEspera;
  /** `--alterna-cada <ms>`: SOLO pruebas; alterna escuchar/parar cada N ms como si alguien tocara la tecla. */
  const alternaCadaMs = typeof opciones['alterna-cada'] === 'string' ? Number(opciones['alterna-cada']) : 0;
  /** Con `teclaAlternar` la tecla no se mantiene: un toque empieza, el siguiente termina. */
  const teclaAlterna = v.teclaAlternar;
  /** `--graba <carpeta>`: guarda el audio de cada escucha como WAV. SOLO diagnostico; por defecto nada se graba. */
  const graba = typeof opciones['graba'] === 'string' ? opciones['graba'] : undefined;
  /** `--entrada <audio>`: SOLO pruebas y calibracion; el archivo hace de microfono, a tiempo real. */
  const entrada = typeof opciones['entrada'] === 'string' ? opciones['entrada'] : undefined;
  /** `--empieza`: escucha desde el arranque (con `--entrada`, lo normal: nadie pulsa espacio). */
  const empiezaYa = opciones['empieza'] === true || entrada !== undefined;
  const conTrayectoria = opciones['sin-trayectoria'] !== true;
  const contadores = creaContadores();
  const inicioSesion = new Date();

  console.log(gris(config.describeRutas()));
  console.log(gris(config.describeCambiados()));
  for (const a of config.avisosAjustes) console.log(gris(`ajustes: aviso: ${a}`));
  const datos = cargaDatos(config, { corrigePorSimilitud: v.correccionPorSimilitud });
  /** Retencion del historial (`retencionDias`, 365 por defecto: la AISIA de Fase 0); 0 = no borrar. Se repite si cambia en caliente. */
  const purga = async (dias: number) => {
    if (!(dias > 0)) return;
    const borrados = await datos.historial.borra({ antesDe: fechaHaceDias(dias) });
    if (borrados > 0) console.log(gris(`historial: ${borrados} dictado(s) de hace mas de ${dias} dias borrados (retencionDias)`));
  };
  await purga(v.retencionDias);
  const principal = await creaMotor(v.motor, config, idioma);
  const eleccionRespaldo = eleccionDeRespaldo(config);
  let respaldo: Motor | undefined;
  if (eleccionRespaldo) {
    respaldo = await creaMotor(eleccionRespaldo, config, idioma);
    // Con `auto` el respaldo es una comodidad, no una promesa: si no arranca (sin faster-whisper
    // en ese Python), se sigue sin el y se dice. Pedido a mano, un fallo es un fallo.
    if (v.respaldo === 'auto') {
      try {
        await respaldo.calienta?.();
      } catch (e) {
        console.log(gris(`respaldo auto: ${eleccionRespaldo} no arranca (${e instanceof Error ? e.message.split('\n')[0] : String(e)}); sigo sin respaldo`));
        await respaldo.cierra?.().catch(() => undefined);
        respaldo = undefined;
      }
    }
  }
  const motor = respaldo ? conRespaldo(principal, respaldo, idioma, contadores) : principal;
  const detector = await creaDetector(config, { msSilencioParaCerrar: silencioMs });
  /** `umbralVozDb`: por debajo de este pico el turno se descarta sin motor. Cambia en caliente. */
  let umbralVozDb = v.umbralVozDb;
  const transcriptor = conPuertaDeEnergia(motor, detector.frecuenciaHz, () => umbralVozDb, contadores);
  /** El pegador se cambia en caliente (ajuste `pegar`): el envoltorio delega en el actual. */
  const creaPegador = (metodo: Ajustes['pegar']): Pegador => (metodo === 'ninguno' ? pegadorDePantalla() : creaPegadorWindows({ metodo: metodo === 'teclear' ? 'teclear' : 'portapapeles' }));
  let pegadorBase = creaPegador(pegar);
  const cierraPegador = async (p: Pegador) => {
    if ('cierra' in p && typeof p.cierra === 'function') await (p as { cierra(): Promise<void> }).cierra();
  };
  // En manos libres las frases se pegan una tras otra en la misma caja: sin separador se juntan.
  let msPegado = 0;
  const sonidos = creaSonidos({ alEmpezar: v.sonidoAlEmpezar, alTerminar: v.sonidoAlTerminar });
  const pegador: Pegador = {
    async pega(t) {
      const t0 = performance.now();
      await pegadorBase.pega(modo === 'manosLibres' ? t + ' ' : t);
      msPegado = performance.now() - t0;
      sonidos.termina();
    },
    ejecuta: (acciones) => pegadorBase.ejecuta?.(acciones) ?? Promise.resolve(),
  };
  /** El posproceso se rearma en caliente (comandos, snippets, diccionario): el envoltorio delega en el actual. */
  const armaPosproceso = (a: Ajustes): Posproceso => creaPosproceso({ ...(a.snippets ? { snippets: datos.snippets } : {}), ...(a.diccionario ? { diccionario: datos.diccionario } : {}), comandos: a.comandos, muletillas: a.muletillas });
  let posprocesoActual = armaPosproceso(v);
  let conPista = v.diccionario;
  const t0 = performance.now();
  await motor.calienta?.();
  console.log(gris(`motor ${motor.id} listo en ${(performance.now() - t0).toFixed(0)} ms · VAD Silero, cierre a ${silencioMs} ms · pegar=${pegar} · modo=${modo} · ganancia ${gananciaAuto ? 'auto' : `${gananciaDb} dB`} · mic en espera ${entrada ? 'abierto (entrada por archivo)' : micEnEspera}${respaldo ? ` · respaldo ${respaldo.id}` : ''} · conversacion ${v.conversacion && modo === 'manosLibres' ? `ON (envio a ${v.envioMs} ms)` : 'off'}`));

  /** El icono de la barra, si esta puesto, se pinta con los mismos eventos que la TUI. */
  let publicaIcono: (estado: Estado) => void = () => undefined;
  /** La pildora flotante: la maquina decide que se ve; el reloj de sus avisos va con setTimeout. */
  let publicaPildora: (entrada: EntradaPildora) => void = () => undefined;
  /** Las barras del visualizador: solo se calculan si hay un icono conectado y se esta escuchando. */
  let publicaBarras: (muestras: Float32Array) => void = () => undefined;
  /** Modo conversacion (PRP-003, RF-38): lo pegado se envia solo al callar `envioMs`. Exige manos libres. */
  const conversacionPosible = modo === 'manosLibres';
  if (v.conversacion && !conversacionPosible) console.log(gris('ajustes: conversacion exige modo manos-libres: se trata como apagada en esta sesion'));
  const envio = creaEnvioPorSilencio({ msEnvio: v.envioMs });
  const conversacion = creaConversacion({
    envio,
    alEnviar: async () => {
      await pegador.ejecuta?.(['enter']);
      contadores.enviosPorSilencio += 1;
    },
    estado: () => dictado.estado,
    log: (l) => console.log(l.startsWith('✗') ? l : verde(l)),
  });
  const dictado = creaDictado({
    detector,
    transcriptor,
    frecuenciaHz: detector.frecuenciaHz,
    modo,
    idioma,
    pista: () => (conPista ? datos.diccionario.comoPista() || undefined : undefined),
    posproceso: { procesa: (t) => posprocesoActual.procesa(t) },
    pegador,
    almacen: datos.historial,
    motorId: motor.id,
    alEvento: (e) => {
      if (e.tipo === 'estado') publicaIcono(e.estado);
      if (e.tipo === 'estado') publicaPildora({ tipo: 'estado', estado: e.estado });
      if (e.tipo === 'texto') publicaPildora({ tipo: 'hecho' });
      if (e.tipo === 'sinVoz' || e.tipo === 'soloMuletillas' || e.tipo === 'error') publicaPildora({ tipo: 'error' });
      if (e.tipo === 'estado' && e.estado === 'escuchando') {
        sonidos.empieza();
        picoEscucha = -Infinity;
        picoRawEscucha = -Infinity;
        trozosEscucha = [];
        abreMic();
      }
      if (e.tipo === 'estado' && e.estado === 'inactivo' && micCerradoEnEspera) {
        setTimeout(() => {
          if (dictado.estado === 'inactivo') cierraMic();
        }, 1_500).unref();
      }
      pinta(e);
      conversacion.alEvento(e);
      if (e.tipo === 'error') contadores.errores += 1;
      if (e.tipo === 'texto') {
        console.log(gris(`  pegado ${msPegado.toFixed(0)} ms`));
        contadores.turnos += 1;
        contadores.pegados += 1;
        contadores.latenciasMs.push(e.latenciaMs);
        contadores.msMotor.push(e.msMotor);
        contadores.msPegado.push(msPegado);
        contadores.duracionesMs.push(e.duracionMs);
      }
      if (e.tipo === 'sinVoz') contadores.sinVoz += 1;
      if (e.tipo === 'soloMuletillas') contadores.muletillas += 1;
      if (e.tipo === 'sinVoz' || e.tipo === 'texto') {
        if (Number.isFinite(picoEscucha)) contadores.picosDb.push(picoEscucha);
        console.log(gris(`  pico durante la escucha: ${picoEscucha.toFixed(1)} dBFS${avisoPico(picoEscucha)}`));
        if (gananciaAuto) {
          const ajuste = ajustaGanancia({ actualDb: gananciaDb, picoRawDb: picoRawEscucha, picoConGananciaDb: picoEscucha, huboTexto: e.tipo === 'texto' });
          if (ajuste.nuevaDb !== gananciaDb) {
            gananciaDb = ajuste.nuevaDb;
            console.log(gris(`  ganancia ajustada a ${gananciaDb > 0 ? '+' : ''}${gananciaDb} dB (${ajuste.motivo})`));
          } else if (ajuste.motivo === 'microfono-satura-solo') {
            console.log(gris('  el microfono satura por si solo: baja su nivel en Windows y quita sus «mejoras»'));
          }
        }
        if (graba && trozosEscucha.length > 0) {
          const largo = trozosEscucha.reduce((n, t) => n + t.length, 0);
          const todo = new Float32Array(largo);
          let pos = 0;
          for (const t of trozosEscucha) { todo.set(t, pos); pos += t.length; }
          const ruta = `${graba}/escucha-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
          void escribeWav(ruta, todo, detector.frecuenciaHz).then(() => console.log(gris(`  grabado ${ruta} (${(largo / detector.frecuenciaHz).toFixed(1)} s)`)));
        }
      }
    },
  });
  const control = controlador(dictado);
  conversacion.activa = v.conversacion && conversacionPosible;

  /**
   * El archivo de ajustes cambio (la pagina /ajustes o `dictado ajustes pon`): se vuelve a resolver
   * con la MISMA precedencia y se aplica lo que se puede. Lo que fija una bandera o el entorno no
   * se mueve (el archivo esta por debajo); lo que exige recargar espera a la siguiente sesion.
   */
  const cambiaEnCaliente = (nuevos: AjustesResueltos, avisos: string[]) => {
    for (const a of avisos) console.log(gris(`ajustes: aviso: ${a}`));
    const previos = ajustes;
    ajustes = nuevos;
    const nv = valoresDe(nuevos);
    for (const clave of Object.keys(nuevos) as Clave[]) {
      if (nuevos[clave].valor === previos[clave].valor) continue;
      const c = campo(clave);
      const desde = `${String(previos[clave].valor)} → ${String(nuevos[clave].valor)}`;
      if (nuevos[clave].origen !== 'ajustes' && previos[clave].origen !== 'ajustes') continue; // ni antes ni ahora venia del archivo
      if (!c?.enCaliente) {
        console.log(gris(`ajustes: ${clave} ${desde}: se aplica en la siguiente sesion (exige recargar)`));
        continue;
      }
      switch (clave) {
        case 'pegar': {
          const viejo = pegadorBase;
          pegar = nv.pegar;
          pegadorBase = creaPegador(pegar);
          void cierraPegador(viejo).catch(() => undefined);
          break;
        }
        case 'gananciaDb':
          gananciaAuto = nv.gananciaDb === 'auto';
          gananciaDb = gananciaAuto ? 0 : (nv.gananciaDb as number);
          break;
        case 'umbralVozDb':
          umbralVozDb = nv.umbralVozDb;
          break;
        case 'comandos':
        case 'muletillas':
        case 'snippets':
        case 'diccionario':
          posprocesoActual = armaPosproceso(nv);
          conPista = nv.diccionario;
          break;
        case 'sonidoAlEmpezar':
        case 'sonidoAlTerminar':
          sonidos.configura({ alEmpezar: nv.sonidoAlEmpezar, alTerminar: nv.sonidoAlTerminar });
          break;
        case 'retencionDias':
          void purga(nv.retencionDias);
          break;
        case 'conversacion':
          if (nv.conversacion && !conversacionPosible) console.log(gris('ajustes: conversacion exige modo manos-libres: sigue apagada'));
          conversacion.activa = nv.conversacion && conversacionPosible;
          break;
        case 'envioMs':
          envio.cambiaMs(nv.envioMs, performance.now());
          break;
        default:
          break;
      }
      console.log(verde(`ajustes: ${clave} ${desde}: aplicado en caliente`));
    }
  };
  let archivoPrevio = config.archivoAjustes.valores;
  const dejaDeVigilar = vigilaArchivoAjustes(config.datos, (archivo) => {
    const r = config.resuelveCon(archivo);
    // Lo que el archivo cambio pero una bandera o el entorno fijan por encima: no se mueve, y se dice.
    for (const clave of Object.keys(r.ajustes) as Clave[]) {
      const origen = r.ajustes[clave].origen;
      if ((origen === 'argumento' || origen === 'entorno') && archivo.valores[clave] !== archivoPrevio[clave]) {
        const c = campo(clave);
        console.log(gris(`ajustes: ${clave} cambio en el archivo, pero en esta sesion lo fija ${origen === 'entorno' ? c?.variable : `--${c?.bandera}`} (${String(r.ajustes[clave].valor)}): el archivo no manda`));
      }
    }
    archivoPrevio = archivo.valores;
    cambiaEnCaliente(r.ajustes, r.avisos);
  });

  let picoDb = -Infinity;
  let muestrasVistas = 0;
  /** Pico durante cada escucha: cuando sale «sin voz», la primera sospecha es el micrófono. */
  let picoEscucha = -Infinity;
  let picoRawEscucha = -Infinity;
  let trozosEscucha: Float32Array[] = [];
  const micCerradoEnEspera = micEnEspera === 'cerrado' && entrada === undefined;

  const alimenta = (crudo: Float32Array, msDesdeApertura: () => number, primera: { valor: boolean }) => {
    if (primera.valor) {
      primera.valor = false;
      console.log(gris(`microfono abierto en ${msDesdeApertura().toFixed(0)} ms`));
    }
    const picoRaw = nivelDb(crudo);
    const factor = factorDe(gananciaDb);
    const m = factor === 1 ? crudo : crudo.map((x) => Math.max(-1, Math.min(1, x * factor)));
    if (dictado.estado === 'escuchando') {
      picoRawEscucha = Math.max(picoRawEscucha, picoRaw);
      picoEscucha = Math.max(picoEscucha, factor === 1 ? picoRaw : nivelDb(m));
      if (graba) trozosEscucha.push(m);
      publicaBarras(m);
    }
    if (muestrasVistas < detector.frecuenciaHz * 2) {
      picoDb = Math.max(picoDb, picoRaw);
      muestrasVistas += m.length;
      if (muestrasVistas >= detector.frecuenciaHz * 2) {
        console.log(gris(`microfono vivo: pico ${picoDb.toFixed(1)} dBFS en los primeros 2 s${picoDb < -75 ? ' — MUY bajo: revisa el microfono de Windows' : ''}`));
      }
    }
    void dictado.alimenta(m);
  };

  /**
   * La captura se abre y se cierra con el estado: en espera no hay microfono abierto (salvo
   * `--mic-en-espera abierto` o entrada por archivo). Si la captura muere por su cuenta (ffmpeg
   * termino sin que lo pidieramos), el dictado se apaga entero: seguir «escuchando» seria mentir
   * (vivido el 2026-09-19).
   */
  let captura: Captura | undefined;
  let cierrePedido = false;
  let resolverFin: (e?: Error) => void = () => undefined;
  const finDeCaptura = new Promise<Error | undefined>((r) => (resolverFin = r));
  const abreMic = () => {
    if (captura) return;
    cierrePedido = false;
    const desde = performance.now();
    const primera = { valor: true };
    const c = capturaMicrofono({
      frecuenciaHz: detector.frecuenciaHz,
      gananciaDb: 0, // la ganancia se aplica aqui (puede cambiar en caliente), no en la captura
      ...(entrada ? { entrada } : {}),
      alRecibir: (m) => alimenta(m, () => performance.now() - desde, primera),
      alError: (e) => console.error(`ffmpeg: ${e}`),
    });
    captura = c;
    c.terminada.then(
      () => { if (captura === c) captura = undefined; if (!cierrePedido) resolverFin(undefined); },
      (e: Error) => { if (captura === c) captura = undefined; if (!cierrePedido) resolverFin(e); },
    );
  };
  const cierraMic = () => {
    if (!captura) return;
    cierrePedido = true;
    captura.detiene();
    console.log(gris('microfono cerrado (en espera no se captura nada)'));
  };
  if (!micCerradoEnEspera) abreMic();
  // Con el microfono cerrado en espera puede no quedar NINGUN handle vivo (sin tecla ni icono):
  // Node saldria en silencio. Un latido con referencia mantiene el proceso hasta `salir()`.
  const latido = setInterval(() => undefined, 60_000);

  let alternador: ReturnType<typeof setInterval> | undefined;
  let tecla: EscuchaTecla | undefined;
  let icono: EscuchaIcono | undefined;
  let cierraTeclaGlobal: (() => void) | undefined;
  let quitaTeclas: () => void = () => undefined;
  let saliendo = false;
  const salir = async () => {
    if (saliendo) return;
    saliendo = true;
    console.log(gris('\ncerrando…'));
    quitaTeclas();
    conversacion.cierra();
    dejaDeVigilar();
    clearInterval(latido);
    if (alternador) clearInterval(alternador);
    cierraTeclaGlobal?.();
    await tecla?.cierra();
    await icono?.cierra(); // el icono de la barra queda vivo y en gris: un click rearranca
    cierrePedido = true;
    captura?.detiene();
    resolverFin(undefined);
    await control.esperar();
    if (dictado.estado !== 'inactivo') await dictado.termina().catch(() => undefined);
    await motor.cierra?.();
    await cierraPegador(pegadorBase);
    await sonidos.cierra().catch(() => undefined);
    datos.guardaSnippets();
    if (conTrayectoria) {
      try {
        const ruta = escribeTrayectoria(CARPETA_CORPUS, construyeTrayectoria(contadores, { motorId: motor.id, modo, silencioMs, gananciaDb, umbralVozDb, ...(conversacion.activa ? { envioMs: envio.msEnvio } : {}), inicio: inicioSesion, fin: new Date() }));
        console.log(gris(`trayectoria de la sesion (forma, sin contenido): ${ruta}`));
      } catch (e) {
        console.error(`✗ no se pudo escribir la trayectoria: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Sin `process.exit` inmediato: con stdout en un pipe, lo ultimo escrito se perderia. Se
    // deja que el bucle se vacie, y si algo nativo lo mantiene vivo, se sale al segundo y medio.
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1_500).unref();
  };

  if (opciones['tecla'] !== undefined) {
    const vk = v.tecla;
    tecla = await escuchaTecla({
      alMantener: () => (teclaAlterna ? undefined : void control.empieza('pulsar')),
      alSoltar: () => (teclaAlterna ? void control.alterna('alternar') : void control.termina()),
      alManosLibres: (activo) => {
        if (teclaAlterna) return; // con toques que alternan, el doble toque no es un gesto aparte
        console.log(activo ? verde('manos libres: ON (un toque lo apaga)') : gris('manos libres: OFF'));
        void (activo ? control.empieza('manosLibres') : control.termina());
      },
      alConectar: () => console.log(verde('tecla global conectada')),
      alDesconectar: () => console.log(gris('tecla global desconectada')),
    });
    cierraTeclaGlobal = lanzaTeclaGlobal(tecla.puerto, vk, teclaAlterna);
  }
  if (opciones['icono'] !== undefined) {
    const puertoIcono = typeof opciones['icono-puerto'] === 'string' ? Number(opciones['icono-puerto']) : PUERTO_ICONO;
    icono = await escuchaIcono({
      puerto: puertoIcono,
      alAlternar: () => {
        console.log(dictado.estado === 'inactivo' ? verde('icono: dictado ON') : gris('icono: dictado OFF'));
        void control.alterna(modo);
      },
      alConectar: () => console.log(verde('icono conectado')),
      alDesconectar: () => console.log(gris('icono desconectado')),
    });
    publicaIcono = (estado) => icono?.publicaEstado(estado);
    const pildora = creaPildora();
    let temporizadorPildora: NodeJS.Timeout | undefined;
    publicaPildora = (entrada) => {
      const ahora = performance.now();
      const nuevo = pildora.aplica(entrada, ahora);
      if (nuevo) icono?.publicaPildora(nuevo);
      if (temporizadorPildora) clearTimeout(temporizadorPildora);
      const espera = pildora.vence(ahora);
      if (espera !== undefined) temporizadorPildora = setTimeout(() => publicaPildora({ tipo: 'tick' }), espera + 5);
    };
    const barras = creaBarras({ frecuenciaHz: detector.frecuenciaHz });
    publicaBarras = (muestras) => {
      if (!icono || icono.conectados === 0) return;
      for (const cuadro of barras.empuja(muestras)) icono.publicaBarras(cuadro);
    };
    if (opciones['icono-sin-ayudante'] !== true) lanzaIconoBarra(icono.puerto);
  }
  console.log(`\nESPACIO en esta terminal: ${modo === 'manosLibres' ? 'enciende/apaga manos libres' : 'empieza/termina el dictado'} · q: salir`);
  quitaTeclas = teclasDeTerminal(() => void control.alterna(modo), () => void salir());
  process.on('SIGINT', () => void salir());
  if (empiezaYa) {
    console.log(gris(entrada ? `entrada por archivo (${modo}): escuchando desde ya` : 'escuchando desde ya (--empieza)'));
    void control.empieza(modo);
  }
  if (alternaCadaMs > 0) {
    console.log(gris(`(prueba) alterno escuchar/parar cada ${alternaCadaMs} ms`));
    alternador = setInterval(() => void control.alterna(modo), alternaCadaMs);
  }
  /** `--prueba-error <ms>`: SOLO pruebas; a los N ms manda a la pildora un aviso de error, para verla sin provocar un fallo real. */
  const pruebaErrorMs = typeof opciones['prueba-error'] === 'string' ? Number(opciones['prueba-error']) : 0;
  if (pruebaErrorMs > 0) {
    console.log(gris(`(prueba) a los ${pruebaErrorMs} ms la pildora mostrara un error simulado`));
    setTimeout(() => { console.log(gris('(prueba) error simulado para la pildora')); publicaPildora({ tipo: 'error' }); }, pruebaErrorMs).unref();
  }
  // Si la captura TERMINA —con o sin error—, el dictado esta sordo: seguir «escuchando» seria
  // mentir (vivido el 2026-09-19: ffmpeg murio con «Error during demuxing» del pulse de WSLg y
  // el proceso quedo vivo y sordo). Se sale: el icono pasa a gris y un click lo rearranca todo.
  const muerte = await finDeCaptura;
  if (muerte) {
    contadores.muertesCaptura += 1;
    console.error(muerte.message);
  }
  if (!saliendo) console.log(gris(entrada ? 'la entrada por archivo termino: apago el dictado' : 'el microfono se cerro (ffmpeg termino): apago el dictado — un click al icono lo rearranca'));
  await salir();
}
