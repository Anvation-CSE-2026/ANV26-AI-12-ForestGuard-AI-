/**
 * AgniRakshak Web Audio Emergency Siren Synthesizer
 * Uses native Web Audio API to create authentic emergency alert tones
 * without external audio file dependencies.
 */
class EmergencyAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.isPlaying = false;
    this.activeNodes = [];
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playSirenAlert(durationSeconds = 4) {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      this.stop(); // Stop any currently playing siren

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      osc.type = 'sawtooth';

      // Modulate frequency between 750Hz and 950Hz (Standard Emergency Two-Tone Siren)
      for (let i = 0; i < durationSeconds; i += 0.5) {
        osc.frequency.setValueAtTime(880, now + i);
        osc.frequency.exponentialRampToValueAtTime(620, now + i + 0.25);
        osc.frequency.exponentialRampToValueAtTime(880, now + i + 0.5);
      }

      // Gain envelope
      gainNode.gain.setValueAtTime(0.01, now);
      gainNode.gain.linearRampToValueAtTime(0.28, now + 0.1);
      gainNode.gain.setValueAtTime(0.28, now + durationSeconds - 0.3);
      gainNode.gain.linearRampToValueAtTime(0.001, now + durationSeconds);

      osc.connect(gainNode);
      gainNode.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + durationSeconds);

      this.activeNodes = [osc, gainNode];
      this.isPlaying = true;

      setTimeout(() => {
        this.isPlaying = false;
      }, durationSeconds * 1000);
    } catch (e) {
      console.warn('Audio siren playback error:', e);
    }
  }

  playDispatchChime() {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.15); // A5
      osc.frequency.setValueAtTime(1174.66, now + 0.3); // D6

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {
      console.warn('Chime error:', e);
    }
  }

  stop() {
    this.activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (err) {}
    });
    this.activeNodes = [];
    this.isPlaying = false;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stop();
    return this.isMuted;
  }
}

window.emergencyAudio = new EmergencyAudioEngine();
