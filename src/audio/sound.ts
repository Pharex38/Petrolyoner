/**
 * Küçük oyun sesleri Web Audio ile üretilir; harici ses dosyası ve ağ isteği yok.
 * Tarayıcı politikası gereği AudioContext ilk oyuncu hareketinde açılır.
 */
export class SoundManager {
  private context: AudioContext | null = null;
  private pendingHornUntil = 0;
  private bassRequested = false;
  private bassTimer: number | null = null;
  private bassStep = 0;
  private sirenRequested = false;
  private sirenCarrier: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  unlock(): void {
    if (this.context === null) {
      try {
        this.context = new AudioContext();
      } catch {
        return;
      }
    }

    const context = this.context;
    const playPending = (): void => {
      if (performance.now() <= this.pendingHornUntil) this.playHorn('arrival');
      this.pendingHornUntil = 0;
      if (this.bassRequested) this.startBassLoop();
      if (this.sirenRequested) this.startSiren();
    };

    if (context.state === 'suspended') {
      void context.resume().then(playPending).catch(() => undefined);
    } else {
      playPending();
    }
  }

  horn(kind: 'arrival' | 'traffic' = 'arrival'): void {
    if (this.context === null || this.context.state !== 'running') {
      if (kind === 'arrival') this.pendingHornUntil = performance.now() + 5000;
      return;
    }
    this.playHorn(kind);
  }

  cash(): void {
    const context = this.context;
    if (context === null || context.state !== 'running') return;

    const now = context.currentTime;
    this.playTone(660, now, 0.08, 0.035, 'sine');
    this.playTone(920, now + 0.075, 0.12, 0.032, 'sine');
  }

  /** Üstü açık bass aracının olayı boyunca kısa, ritmik bir synth loop çalar. */
  bass(active: boolean): void {
    this.bassRequested = active;
    if (!active) {
      if (this.bassTimer !== null) clearInterval(this.bassTimer);
      this.bassTimer = null;
      this.bassStep = 0;
      return;
    }
    this.startBassLoop();
  }

  /** Polis ve ambulans görünür olduğu sürece yumuşak frekans taramalı siren. */
  siren(active: boolean): void {
    this.sirenRequested = active;
    if (!active) {
      this.stopSiren();
      return;
    }
    this.startSiren();
  }

  private playHorn(kind: 'arrival' | 'traffic'): void {
    const context = this.context;
    if (context === null || context.state !== 'running') return;

    const now = context.currentTime;
    const duration = kind === 'arrival' ? 0.24 : 0.13;
    const volume = kind === 'arrival' ? 0.045 : 0.026;
    this.playTone(kind === 'arrival' ? 245 : 290, now, duration, volume, 'sawtooth');
    this.playTone(kind === 'arrival' ? 306 : 352, now, duration, volume * 0.72, 'square');
  }

  private startBassLoop(): void {
    const context = this.context;
    if (
      this.bassTimer !== null ||
      context === null ||
      context.state !== 'running' ||
      !this.bassRequested
    ) {
      return;
    }

    this.playBassBeat();
    this.bassTimer = window.setInterval(() => this.playBassBeat(), 330);
  }

  private playBassBeat(): void {
    const context = this.context;
    if (context === null || context.state !== 'running' || !this.bassRequested) return;

    const notes = [55, 65.41, 49, 73.42] as const;
    const note = notes[this.bassStep % notes.length] ?? 55;
    const now = context.currentTime;
    this.playTone(note, now, 0.27, 0.042, 'sine');
    this.playTone(note * 2, now + 0.008, 0.19, 0.013, 'triangle');
    if (this.bassStep % 2 === 0) {
      this.playTone(note * 4, now + 0.035, 0.09, 0.007, 'square');
    }
    this.bassStep += 1;
  }

  private startSiren(): void {
    const context = this.context;
    if (
      this.sirenCarrier !== null ||
      context === null ||
      context.state !== 'running' ||
      !this.sirenRequested
    ) {
      return;
    }

    const now = context.currentTime;
    const carrier = context.createOscillator();
    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    const gain = context.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(690, now);
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(1.55, now);
    lfoDepth.gain.setValueAtTime(185, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.08);

    lfo.connect(lfoDepth);
    lfoDepth.connect(carrier.frequency);
    carrier.connect(gain);
    gain.connect(context.destination);
    carrier.start(now);
    lfo.start(now);

    this.sirenCarrier = carrier;
    this.sirenLfo = lfo;
    this.sirenGain = gain;
  }

  private stopSiren(): void {
    const context = this.context;
    const carrier = this.sirenCarrier;
    const lfo = this.sirenLfo;
    const gain = this.sirenGain;
    this.sirenCarrier = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    if (context === null || carrier === null || lfo === null || gain === null) return;

    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    carrier.stop(now + 0.11);
    lfo.stop(now + 0.11);
  }

  private playTone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ): void {
    const context = this.context;
    if (context === null) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
