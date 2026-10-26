/**
 * El banco del navegador para medir el HUD sin micrófono ni altavoz:
 *
 *  - **micrófono falso**: `getUserMedia` devuelve un flujo de un AudioContext propio, con ruido de
 *    fondo a ~−54 dBFS (para que el detector calibre) y la voz que inyecta la medición. Se sabe al
 *    milisegundo dónde empieza y acaba la voz: es la VERDAD de terreno del fin del habla;
 *  - **toma de salida**: cada `<audio>` que suena se engancha por `captureStream()` a un worklet que
 *    anota cuándo SUBE el audio por encima de −45 dBFS y cuándo BAJA. Es «el primer audio que suena»
 *    medido desde fuera del HUD, no lo que el HUD dice de sí mismo;
 *  - **eco residual** (opcional): lo que suena vuelve al micrófono atenuado, como unos altavoces sin
 *    cancelación de eco perfecta. Sirve para probar que la máquina no se interrumpe sola;
 *  - **ruido de sala** (opcional): un trozo en bucle a un nivel dado, encima del ruido de fondo. Se pone
 *    ANTES de encender, como en una sala de verdad: el detector de energía calibra con él.
 *
 * Los dos lados usan el MISMO AudioContext: la diferencia entre la verdad y la toma no depende de
 * cómo se mapea el reloj. La toma pasa por `captureStream`, que añade unos ms: la latencia medida
 * es, si acaso, un poco MAYOR que la real.
 */

export interface EventoToma {
  tipo: 'sube' | 'baja';
  t: number;
}

export interface MicrofonoFalso {
  /** Inyecta PCM16LE (base64) a `hz`; devuelve el instante (reloj de la página) de la primera muestra. */
  dice(base64: string, hz: number): Promise<number>;
  eco(db: number | null): void;
  /** Ruido de sala en bucle: PCM16LE (base64) a potencia 1, sonando a `db` dBFS. `null` lo quita. */
  ruido(base64: string | null, hz: number, db: number): Promise<void>;
  eventos: EventoToma[];
  sonando(): boolean;
}

/** Se pasa a `page.addInitScript`: corre en la página antes que cualquier otro script. */
export function instalaMicrofonoFalso(): void {
  const PROCESADOR = `class Toma extends AudioWorkletProcessor{constructor(){super();this.s=false;this.q=0}process(i){let e=0,n=128;for(const entrada of i){const c=entrada&&entrada[0];if(!c)continue;n=c.length;for(let k=0;k<c.length;k++)e+=c[k]*c[k]}const db=10*Math.log10(e/n+1e-12);if(db>-45){if(!this.s){this.s=true;this.port.postMessage({tipo:'sube',t:currentTime})}this.q=0}else if(this.s){this.q+=n/sampleRate;if(this.q>0.08){this.s=false;this.port.postMessage({tipo:'baja',t:currentTime-this.q})}}return true}}registerProcessor('toma',Toma);`;
  let ctx: AudioContext | undefined;
  let destino: MediaStreamAudioDestinationNode | undefined;
  let mezcla: GainNode | undefined;
  let eco: GainNode | undefined;
  let toma: AudioWorkletNode | undefined;
  let ruidoSala: AudioBufferSourceNode | undefined;
  let listo: Promise<void> | undefined;
  const eventos: EventoToma[] = [];
  const aReloj = (t: number) => {
    const ts = (ctx as AudioContext).getOutputTimestamp();
    return (ts.performanceTime ?? performance.now()) + (t - (ts.contextTime ?? 0)) * 1000;
  };
  const asegura = (): Promise<void> => {
    listo ??= (async () => {
      const c = new AudioContext({ sampleRate: 48_000 });
      ctx = c;
      destino = c.createMediaStreamDestination();
      mezcla = c.createGain();
      mezcla.connect(destino);
      eco = c.createGain();
      eco.gain.value = 0;
      eco.connect(mezcla);
      const ruido = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = ruido.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.0035;
      const fuente = c.createBufferSource();
      fuente.buffer = ruido;
      fuente.loop = true;
      fuente.connect(mezcla);
      fuente.start();
      await c.audioWorklet.addModule(URL.createObjectURL(new Blob([PROCESADOR], { type: 'application/javascript' })));
      toma = new AudioWorkletNode(c, 'toma');
      toma.port.onmessage = (m: MessageEvent<{ tipo: 'sube' | 'baja'; t: number }>) => void eventos.push({ tipo: m.data.tipo, t: aReloj(m.data.t) });
      const mudo = c.createGain();
      mudo.gain.value = 0;
      toma.connect(mudo).connect(c.destination);
    })();
    return listo;
  };
  const engancha = (el: HTMLMediaElement & { captureStream?: () => MediaStream }) => {
    if (!ctx || !toma || !eco || !el.captureStream) return;
    const flujo = el.captureStream();
    const conecta = (pista: MediaStreamTrack) => {
      const s = (ctx as AudioContext).createMediaStreamSource(new MediaStream([pista]));
      s.connect(toma as AudioWorkletNode);
      s.connect(eco as GainNode);
    };
    flujo.getAudioTracks().forEach(conecta);
    flujo.addEventListener('addtrack', (e) => e.track.kind === 'audio' && conecta(e.track));
  };
  const enganchados = new WeakSet<HTMLMediaElement>();
  const reproduce = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!enganchados.has(this)) {
      enganchados.add(this);
      void asegura().then(() => engancha(this));
    }
    return reproduce.call(this);
  };
  // Cada `getUserMedia` da pistas NUEVAS (clones), como un micrófono de verdad: detenerlas al apagar no mata las del
  // siguiente encendido, y su `readyState` dice si quien las pidió las cerró (la prueba del botón de la capa).
  navigator.mediaDevices.getUserMedia = async () => {
    await asegura();
    return new MediaStream((destino as MediaStreamAudioDestinationNode).stream.getTracks().map((p) => p.clone()));
  };
  const microfono: MicrofonoFalso = {
    eventos,
    async dice(base64, hz) {
      await asegura();
      const c = ctx as AudioContext;
      const bytes = Uint8Array.from(atob(base64), (x) => x.charCodeAt(0));
      const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      const buf = c.createBuffer(1, pcm.length, hz);
      const canal = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) canal[i] = (pcm[i] ?? 0) / 32768;
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(mezcla as GainNode);
      const t0 = c.currentTime + 0.03;
      s.start(t0);
      return aReloj(t0);
    },
    eco(db) {
      if (eco) eco.gain.value = db === null ? 0 : 10 ** (db / 20);
    },
    async ruido(base64, hz, db) {
      await asegura();
      const c = ctx as AudioContext;
      ruidoSala?.stop();
      ruidoSala = undefined;
      if (base64 === null) return;
      const bytes = Uint8Array.from(atob(base64), (x) => x.charCodeAt(0));
      const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      const buf = c.createBuffer(1, pcm.length, hz);
      const canal = buf.getChannelData(0);
      // El PCM viaja a rms 0,1 (20 dB de margen para los golpes en 16 bits); se devuelve a potencia 1 aquí.
      for (let i = 0; i < pcm.length; i++) canal[i] = ((pcm[i] ?? 0) / 32768) * 10;
      const fuente = c.createBufferSource();
      fuente.buffer = buf;
      fuente.loop = true;
      const g = c.createGain();
      g.gain.value = 10 ** (db / 20);
      fuente.connect(g).connect(mezcla as GainNode);
      fuente.start();
      ruidoSala = fuente;
    },
    sonando: () => eventos.at(-1)?.tipo === 'sube',
  };
  (window as unknown as { __microfono: MicrofonoFalso }).__microfono = microfono;
}
