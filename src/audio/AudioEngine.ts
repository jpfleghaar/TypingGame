import type { GameEvent, PlayerId } from '../core';

/**
 * Komplett synthetischer Sound über die Web Audio API (keine Dateien).
 *
 * - Effekte: Tippen, Fehler, Wort fertig, Angriff senden, Müll erhalten,
 *   Abwehr, K.O.
 * - Musik: treibender Loop (Four-on-the-floor, galoppierender Bass), der im
 *   Lauf der Runde schneller wird und mit der Combo Schichten bekommt:
 *   Combo 3 Hi-Hats, Combo 6 Arpeggio mit Echo, Combo 10 Lead + Crash + Riser.
 *   Eine Gefahren-Schicht (pulsierende Dissonanz) setzt ein, wenn der eigene
 *   Stapel fast voll ist oder Müll unterwegs ist.
 *
 * Der AudioContext entsteht erst bei der ersten Nutzer-Interaktion
 * (Browser-Autoplay-Regeln).
 */

const BPM_START = 128;
const BPM_END = 152;
const STEPS = 16; // 16tel pro Takt
const LOOKAHEAD_S = 0.12;

// 8-taktige Progression in a-Moll: Am F C G | Am F G E (E-Dur am Ende baut Spannung auf)
const CHORDS: number[][] = [
  [110.0, 130.81, 164.81], // Am
  [87.31, 110.0, 130.81], // F
  [130.81, 164.81, 196.0], // C
  [98.0, 123.47, 146.83], // G
  [110.0, 130.81, 164.81], // Am
  [87.31, 110.0, 130.81], // F
  [98.0, 123.47, 146.83], // G
  [82.41, 103.83, 123.47], // E
];

/** Galopp-Bass: 1 = Ton, 2 = Oktave höher, 0 = Pause (pro 16tel). */
const BASS = [1, 0, 1, 1, 2, 0, 1, 1, 1, 0, 1, 1, 2, 0, 1, 2];
/** Arpeggio-Muster über die Akkordtöne (Index), pro 16tel. */
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2];
/** Lead-Motive auf Achteln (Akkordton-Index, -1 = Pause), wechselnd je Takt. */
const LEAD = [
  [2, -1, 1, 2, 0, -1, 2, 1],
  [0, 2, -1, 1, 2, -1, 1, 0],
];

/** Combo-Stufen, ab denen eine Musikschicht dazukommt (Index 0 = immer an). */
const LAYER_COMBOS = [0, 3, 6, 10];

export interface AudioSettings {
  volume: number; // 0..1
  muted: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private layers: GainNode[] = [];
  private dangerLayer!: GainNode;
  private arpIn!: GainNode;
  private arpDelay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private timer = 0;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private bpm = BPM_START;
  private danger = 0;
  private musicOn = false;
  private lastKeySound = 0;

  constructor(private settings: AudioSettings) {}

  get volume(): number {
    return this.settings.volume;
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  /** Muss aus einem Klick/Tastendruck heraus aufgerufen werden. */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) this.init();
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
  }

  private init(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.music.connect(this.master);
    this.layers = LAYER_COMBOS.map((_, i) => {
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      g.connect(this.music);
      return g;
    });
    this.dangerLayer = ctx.createGain();
    this.dangerLayer.gain.value = 0;
    this.dangerLayer.connect(this.music);
    // Arpeggio mit punktiertem Achtel-Echo
    this.arpIn = ctx.createGain();
    this.arpDelay = ctx.createDelay(1);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    this.arpIn.connect(this.layers[2]);
    this.arpIn.connect(this.arpDelay);
    this.arpDelay.connect(feedback).connect(this.arpDelay);
    this.arpDelay.connect(wet).connect(this.layers[2]);
    // 1 s weißes Rauschen als Quelle für Klicks, Hi-Hats und Whooshes
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolume();
  }

  setVolume(v: number): void {
    this.settings.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    this.applyVolume();
    return this.settings.muted;
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    const target = this.settings.muted ? 0 : this.settings.volume * this.settings.volume; // quadratisch = natürlicher
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  /* ---------- Musik ---------- */

  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.bar = 0;
    this.bpm = BPM_START;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.setCombo(0);
    this.setGameState(0, 0);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    clearInterval(this.timer);
    if (this.ctx) this.dangerLayer.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  /** Blendet Musikschichten passend zur Combo ein/aus. */
  setCombo(combo: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    LAYER_COMBOS.forEach((min, i) => {
      if (i === 0) return;
      this.layers[i].gain.setTargetAtTime(combo >= min ? 1 : 0, t, combo >= min ? 0.12 : 0.4);
    });
  }

  /**
   * Rundenfortschritt (0..1, steuert das Tempo) und Gefahr (0..1, steuert die
   * Spannungs-Schicht). Wird pro Frame aufgerufen; ändert nur bei Bedarf.
   */
  setGameState(progress: number, danger: number): void {
    const k = Math.min(1, Math.max(0, progress));
    this.bpm = BPM_START + (BPM_END - BPM_START) * k;
    if (!this.ctx) return;
    if (Math.abs(danger - this.danger) > 0.04 || (danger === 0 && this.danger !== 0)) {
      this.danger = danger;
      this.dangerLayer.gain.setTargetAtTime(danger, this.ctx.currentTime, 0.25);
    }
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
      const stepDur = 60 / this.bpm / 4;
      this.arpDelay.delayTime.setValueAtTime(stepDur * 3, this.nextStepTime);
      this.playStep(this.step, this.bar, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.bar = (this.bar + 1) % CHORDS.length;
    }
  }

  private playStep(step: number, bar: number, t: number, dur: number): void {
    const chord = CHORDS[bar];
    const [base, hats, , top] = this.layers;

    // Schicht 0 (immer): Four-on-the-floor, Galopp-Bass, Clap, Flächen-Akkord
    if (step % 4 === 0) this.kick(t, base);
    const b = BASS[step];
    if (b) this.tone((chord[0] / 2) * b, t, dur * 0.85, 'sawtooth', 0.11, base, 750);
    if (step === 4 || step === 12) this.noise(t, 0.12, 0.09, base, 'bandpass', 1400, 0.9);
    if (step === 0) for (const n of chord) this.tone(n * 2, t, dur * 15, 'triangle', 0.025, base, 1800);

    // Schicht 1 (Combo 3): 16tel-Hi-Hats mit Akzenten, offene Hats auf den Off-Beats
    if (step % 4 === 2) this.noise(t, 0.12, 0.07, hats, 'highpass', 6500);
    else this.noise(t, 0.035, step % 2 === 0 ? 0.05 : 0.028, hats, 'highpass', 8000);

    // Schicht 2 (Combo 6): Arpeggio über zwei Oktaven, mit Echo
    const octave = step >= 8 ? 8 : 4;
    this.tone(chord[ARP[step]] * octave, t, dur * 0.7, 'square', 0.03, this.arpIn, 3200);

    // Schicht 3 (Combo 10): Lead-Melodie, Snare-Wirbel, Crash, Riser vor jedem 4. Takt
    if (step % 2 === 0) {
      const idx = LEAD[bar % 2][step / 2];
      if (idx >= 0) this.tone(chord[idx] * 4, t, dur * 1.8, 'sawtooth', 0.032, top, 3600);
    }
    if (step >= 12 && bar % 4 === 3) this.noise(t, 0.08, 0.05 + (step - 12) * 0.015, top, 'bandpass', 2000, 0.8);
    if (step === 0 && bar % 4 === 0) this.noise(t, 1.4, 0.05, top, 'highpass', 5000);
    if (step === 0 && bar % 4 === 3) this.noise(t, dur * 16, 0.06, top, 'bandpass', 300, 1.5, 7000);

    // Gefahr: pulsierende kleine Sekunde hoch oben + zusätzlicher Herzschlag
    if (step % 2 === 0) {
      const root = chord[0] * 8;
      this.tone(root, t, dur * 0.8, 'square', 0.018, this.dangerLayer, 2600);
      this.tone(root * 1.0595, t, dur * 0.8, 'square', 0.014, this.dangerLayer, 2600);
    }
    if (step === 2 || step === 10) this.tone(90, t, 0.18, 'sine', 0.35, this.dangerLayer, undefined, 45);
  }

  /* ---------- Bausteine ---------- */

  private tone(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    out: AudioNode,
    lowpass?: number,
    endFreq?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node = osc.connect(f);
    }
    node.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number, out: AudioNode, filter: BiquadFilterType, freq: number, q = 1, sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number, out: AudioNode): void {
    this.tone(150, t, 0.22, 'sine', 0.55, out, undefined, 42);
    this.noise(t, 0.015, 0.06, out, 'highpass', 3000); // Klick für mehr Druck
  }

  /** Countdown-Piep: kurz für 5…1, höher und länger bei "Los!" (remaining = 0). */
  countdownBeep(remaining: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (remaining > 0) this.tone(660, t, 0.14, 'square', 0.06, this.sfx, 2500);
    else {
      this.tone(1320, t, 0.45, 'square', 0.07, this.sfx, 4000);
      this.tone(660, t, 0.45, 'triangle', 0.08, this.sfx);
    }
  }

  /* ---------- Spiel-Events ---------- */

  handle(events: GameEvent[], me: PlayerId): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    for (const e of events) {
      switch (e.type) {
        case 'KEY_CORRECT':
          if (e.playerId === me && t - this.lastKeySound > 0.012) {
            this.lastKeySound = t;
            // leises, leicht variiertes Klicken
            this.noise(t, 0.03, 0.05, this.sfx, 'bandpass', 2600 + Math.random() * 1400, 3);
          }
          break;
        case 'KEY_ERROR':
          if (e.playerId === me) this.tone(140, t, 0.09, 'square', 0.05, this.sfx, 600);
          break;
        case 'WORD_CLEARED':
          if (e.playerId === me) {
            this.setCombo(e.combo);
            const f = 520 * Math.pow(2, Math.min(e.combo, 12) / 24);
            this.tone(f, t, 0.12, 'sine', 0.06, this.sfx);
          }
          break;
        case 'COMBO_BROKEN':
          if (e.playerId === me) this.setCombo(0);
          if (e.playerId === me && e.combo >= 3) this.tone(330, t, 0.25, 'triangle', 0.05, this.sfx, 1200, 180);
          break;
        case 'ATTACK_SENT':
          if (e.from === me) {
            this.noise(t, 0.35, 0.16, this.sfx, 'bandpass', 500, 2, 5000);
            this.tone(330, t, 0.25, 'sawtooth', 0.05, this.sfx, 2500, 990);
          } else if (e.to === me) {
            // leiser Warnton: Müll kommt
            this.tone(880, t, 0.08, 'square', 0.025, this.sfx, 2000);
            this.tone(660, t + 0.09, 0.1, 'square', 0.025, this.sfx, 2000);
          }
          break;
        case 'GARBAGE_CANCELLED':
          if (e.playerId === me) this.tone(660, t, 0.18, 'triangle', 0.07, this.sfx, undefined, 1320);
          break;
        case 'GARBAGE_ARRIVED':
          if (e.playerId === me) {
            this.tone(160, t, 0.35, 'sawtooth', 0.12, this.sfx, 700, 60);
            this.noise(t, 0.2, 0.1, this.sfx, 'lowpass', 400);
          }
          break;
        case 'PLAYER_KO':
          if (e.playerId === me) {
            this.setCombo(0);
            this.tone(440, t, 0.9, 'sawtooth', 0.1, this.sfx, 1500, 55);
            this.noise(t, 0.6, 0.15, this.sfx, 'lowpass', 900, 1, 80);
          } else if (e.by === me) {
            [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.06, 0.4, 'triangle', 0.08, this.sfx));
          } else {
            this.tone(220, t, 0.15, 'sine', 0.025, this.sfx, undefined, 110);
          }
          break;
        case 'GAME_OVER':
          this.stopMusic();
          break;
      }
    }
  }
}
