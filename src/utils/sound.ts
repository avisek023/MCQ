class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.08,
    delaySec = 0
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  public playLockIn(): void {
    this.playTone(523.25, 0.09, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.07, 0.05);
  }

  public playOpponentLocked(): void {
    this.playTone(440, 0.08, 'sine', 0.05, 0);
  }

  public playCorrect(): void {
    this.playTone(523.25, 0.14, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.16, 'triangle', 0.09, 0.08);
    this.playTone(783.99, 0.28, 'triangle', 0.1, 0.16);
  }

  public playWrong(): void {
    this.playTone(240, 0.16, 'sawtooth', 0.045, 0);
    this.playTone(196, 0.24, 'sawtooth', 0.04, 0.1);
  }

  public playTickWarning(): void {
    this.playTone(880, 0.045, 'sine', 0.035, 0);
  }

  public playChatPop(): void {
    this.playTone(587.33, 0.07, 'sine', 0.04, 0);
  }

  public playVictoryFanfare(): void {
    const notes = [
      { freq: 523.25, delay: 0, dur: 0.14 },
      { freq: 659.25, delay: 0.12, dur: 0.14 },
      { freq: 783.99, delay: 0.24, dur: 0.14 },
      { freq: 1046.5, delay: 0.38, dur: 0.48 },
      { freq: 783.99, delay: 0.38, dur: 0.48 },
      { freq: 659.25, delay: 0.38, dur: 0.48 },
    ];
    for (const n of notes) {
      this.playTone(n.freq, n.dur, 'triangle', 0.08, n.delay);
    }
  }
}

export const soundEngine = new SoundEngine();
