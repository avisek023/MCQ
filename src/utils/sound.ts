class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public unlock(): void {
    if (this.muted || typeof window === 'undefined') return;
    this.getContext();
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    gainPeak = 0.06,
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
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  public playRoomJoin(): void {
    this.playTone(440, 0.1, 'sine', 0.055, 0);
    this.playTone(554.37, 0.15, 'sine', 0.055, 0.07);
  }

  public playPlayerJoined(): void {
    this.playTone(659.25, 0.11, 'sine', 0.04, 0);
  }

  public playMatchStart(): void {
    this.playTone(440, 0.1, 'triangle', 0.06, 0);
    this.playTone(554.37, 0.11, 'triangle', 0.06, 0.08);
    this.playTone(659.25, 0.2, 'triangle', 0.065, 0.16);
  }

  public playNextRound(): void {
    this.playTone(587.33, 0.1, 'sine', 0.04, 0);
  }

  public playLockIn(): void {
    this.playTone(523.25, 0.08, 'triangle', 0.065, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.055, 0.045);
  }

  public playOpponentLocked(): void {
    this.playTone(440, 0.075, 'sine', 0.035, 0);
  }

  public playCorrect(): void {
    this.playTone(523.25, 0.13, 'triangle', 0.07, 0);
    this.playTone(659.25, 0.15, 'triangle', 0.07, 0.075);
    this.playTone(783.99, 0.26, 'triangle', 0.075, 0.15);
  }

  public playWrong(): void {
    this.playTone(261.63, 0.13, 'triangle', 0.055, 0);
    this.playTone(207.65, 0.22, 'triangle', 0.05, 0.09);
  }

  public playRevealNeutral(): void {
    this.playTone(493.88, 0.1, 'sine', 0.04, 0);
    this.playTone(587.33, 0.14, 'sine', 0.04, 0.07);
  }

  public playTickWarning(): void {
    this.playTone(880, 0.045, 'sine', 0.03, 0);
  }

  public playChatPop(): void {
    this.playTone(587.33, 0.07, 'sine', 0.035, 0);
  }

  public playVictoryFanfare(): void {
    const notes = [
      { freq: 523.25, delay: 0, dur: 0.14 },
      { freq: 659.25, delay: 0.12, dur: 0.14 },
      { freq: 783.99, delay: 0.24, dur: 0.14 },
      { freq: 1046.5, delay: 0.38, dur: 0.45 },
      { freq: 783.99, delay: 0.38, dur: 0.45 },
      { freq: 659.25, delay: 0.38, dur: 0.45 },
    ];
    for (const n of notes) {
      this.playTone(n.freq, n.dur, 'triangle', 0.065, n.delay);
    }
  }
}

export const soundEngine = new SoundEngine();
