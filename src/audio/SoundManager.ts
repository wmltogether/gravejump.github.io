export type SoundCue = "jump" | "note" | "hit";

/** Optional synthesized audio; no network requests or autoplay requirement. */
export class SoundManager {
  enabled = false;
  private context: AudioContext | null = null;

  async toggle(): Promise<boolean> {
    this.enabled = !this.enabled;
    if (this.enabled) {
      try {
        this.context ??= new AudioContext();
        await this.context.resume();
        this.play("note");
      } catch {
        this.enabled = false;
      }
    }
    return this.enabled;
  }

  play(cue: SoundCue): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = cue === "hit" ? "triangle" : "sine";
    const frequency = cue === "jump" ? 420 : cue === "note" ? 780 : 130;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      cue === "jump" ? 650 : cue === "note" ? 1150 : 70,
      now + 0.13,
    );
    volume.gain.setValueAtTime(cue === "hit" ? 0.055 : 0.025, now);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(volume);
    volume.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }
}
