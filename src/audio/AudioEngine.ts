import type { GameEvent, PlayerId } from '../core';

/**
 * Komplett synthetischer Sound über die Web Audio API (keine Dateien).
 *
 * - Effekte: Tippen, Fehler, Wort fertig, Angriff senden, Müll erhalten,
 *   Abwehr, K.O.
 * - Musik: einfacher Loop (Bass + Kick), der mit steigender Combo
 *   zusätzliche Schichten bekommt (Hi-Hats, Arpeggio, Lead + Snare).
 *
 * Der AudioContext entsteht erst bei der ersten Nutzer-Interaktion
 * (Browser-Autoplay-Regeln).
 */

const BPM = 104;
const STEPS = 16; // 16tel pro Takt
const LOOKAHEAD_S = 0.12;

// a-Moll-Progression: Am – F – C – G (Grundtöne in Hz für die Bassoktave)
const CHORDS: number[][] = [
  [110.0, 130.81, 164.81], // A C E
  [87.31, 110.0, 130.81], // F A C
  [130.81, 164.81, 196.0], // C E G
  [98.0, 123.47, 146.83], // G B D
];

/** Combo-Stufen, ab denen eine Musikschicht dazukommt. */
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
  private noiseBuf!: AudioBuffer;
  private timer = 0;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
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
    this.music.gain.value = 0.45;
    this.music.connect(this.master);
    this.layers = LAYER_COMBOS.map((_, i) => {
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      g.connect(this.music);
      return g;
    });
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
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.setCombo(0);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  /** Blendet Musikschichten passend zur Combo ein/aus. */
  setCombo(combo: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    LAYER_COMBOS.forEach((min, i) => {
      if (i === 0) return;
      this.layers[i].gain.setTargetAtTime(combo >= min ? 1 : 0, t, combo >= min ? 0.15 : 0.4);
    });
  }

  private schedule(): void {
    const ctx = this.ctx!;
    const stepDur = 60 / BPM / 4;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step, this.bar, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % STEPS;
      if (this.step === 0) this.bar = (this.bar + 1) % CHORDS.length;
    }
  }

  private playStep(step: number, bar: number, t: number, dur: number): void {
    const chord = CHORDS[bar];
    const [base, mid, layerArp, layerTop] = this.layers;
    // Schicht 0: Kick auf 1 und 3, Bass auf Achteln
    if (step % 8 === 0) this.kick(t, base);
    if (step % 2 === 0) this.tone(chord[0] / 2, t, dur * 1.6, 'triangle', 0.22, base);
    // Schicht 1 (Combo 3): Hi-Hats auf Achteln, offen auf den Off-Beats
    if (step % 2 === 0) this.hat(t, step % 4 === 2 ? 0.09 : 0.035, mid, 0.06);
    // Schicht 2 (Combo 6): Arpeggio über den Akkord
    if (step % 2 === 1 || step % 4 === 0) {
      const n = chord[(step >> 1) % 3] * 2;
      this.tone(n, t, dur * 0.9, 'square', 0.035, layerArp, 2400);
    }
    // Schicht 3 (Combo 10): Snare + Lead-Melodie
    if (step === 4 || step === 12) this.snare(t, layerTop);
    if (step % 4 === 0) {
      const melody = [2, 1, 0, 1];
      const n = chord[melody[step / 4]] * 4;
      this.tone(n, t, dur * 3, 'sawtooth', 0.03, layerTop, 3000);
    }
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
    this.tone(120, t, 0.28, 'sine', 0.5, out, undefined, 40);
  }

  private hat(t: number, gain: number, out: AudioNode, dur: number): void {
    this.noise(t, dur, gain, out, 'highpass', 7000);
  }

  private snare(t: number, out: AudioNode): void {
    this.noise(t, 0.16, 0.14, out, 'bandpass', 1800, 0.8);
    this.tone(190, t, 0.1, 'triangle', 0.08, out);
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
