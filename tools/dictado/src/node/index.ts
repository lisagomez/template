/**
 * Punto de entrada de Node: lo que toca microfono, archivos, procesos y Windows.
 *
 * Los runtimes pesados NO se importan aqui: `onnxruntime-node` y `sherpa-onnx-node` son peers
 * opcionales y llegan importados por el consumidor (`ort`, `sherpa`); `@tu-scope/voz` si se
 * importa, porque el VAD es la razon de ser de este entry point.
 */
export { creaDetectorSilero, DEFECTOS_DICTADO, type OpcionesDetectorSilero } from './vad.js';
export { capturaMicrofono, floatAPcm16, leeAudio, nivelDb, type AudioCargado, type Captura, type OpcionesCaptura } from './audio.js';
export { creaMotorSherpa, type ModuloSherpa, type OpcionesMotorSherpa, type ReconocedorSherpa } from './motores/sherpa.js';
export { creaMotorPorProceso, type MotorPorProceso, type OpcionesMotorProceso } from './motores/proceso.js';
export { creaPegadorWindows, type OpcionesPegadorWindows, type PegadorWindows } from './pegado-windows.js';
export { creaAlmacenJsonl } from './almacen-jsonl.js';
export { creaGestosDeTecla, escuchaTecla, type EscuchaTecla, type OpcionesTecla } from './tecla.js';
export { escuchaIcono, PUERTO_ICONO, type EscuchaIcono, type OpcionesIcono } from './icono.js';
export { creaPildora, DEFECTOS_PILDORA, type EntradaPildora, type OpcionesPildora, type Pildora, type Visual } from './pildora.js';
export { creaBarras, DEFECTOS_BARRAS, lineaDeBarras, type Barras, type OpcionesBarras } from './barras.js';
export { abreAltavozPulse, abreAltavozWindows, creaVozSintetica, habla, type Altavoz, type ModuloSherpaTts, type OpcionesSintesis, type OpcionesVozSintetica, type ResultadoHabla, type VozSintetica } from './habla.js';
export { construyeTrayectoria, creaContadores, escribeTrayectoria, idDeTrayectoria, type ContadoresSesion, type ContextoSesion } from './trayectoria.js';
export { ajustaGanancia, factorDe, VENTANA_SANA_DB, type Ajuste, type EntradaAjuste } from './ganancia.js';
