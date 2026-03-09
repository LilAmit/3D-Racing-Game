// Audio manager — procedural engine sounds + music

import { settings } from './settings.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.engineNode = null;
    this.engineGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.masterGain = null;
    this.musicPlaying = false;
    this.currentMusicSource = null;
    this.musicNotes = [];
    this.musicTimer = null;
  }

  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = settings.get('masterVolume');

    this.engineGain = this.ctx.createGain();
    this.engineGain.connect(this.masterGain);
    this.engineGain.gain.value = 0;

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.sfxGain.gain.value = settings.get('sfxVolume');

    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.musicGain.gain.value = settings.get('musicVolume');

    // Create engine oscillator
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;

    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    this.engineFilter = engineFilter;

    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineOsc.start();

    // Sub-bass for engine rumble
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'sine';
    this.engineSub.frequency.value = 30;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.3;
    this.engineSub.connect(subGain);
    subGain.connect(this.engineGain);
    this.engineSub.start();
    this.engineSubNode = this.engineSub;

    this.initialized = true;
  }

  updateVolumes() {
    if (!this.initialized) return;
    this.masterGain.gain.value = settings.get('masterVolume');
    this.musicGain.gain.value = settings.get('musicVolume');
    this.sfxGain.gain.value = settings.get('sfxVolume');
  }

  // Update engine sound based on speed (0-1 normalized) and throttle
  updateEngine(speedNorm, throttle) {
    if (!this.initialized) return;
    const baseFreq = 55 + speedNorm * 180;
    const vol = 0.05 + throttle * 0.25 + speedNorm * 0.15;
    const t = this.ctx.currentTime;

    this.engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.1);
    this.engineSubNode.frequency.setTargetAtTime(25 + speedNorm * 40, t, 0.1);
    this.engineGain.gain.setTargetAtTime(Math.min(vol, 0.5), t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + speedNorm * 1200 + throttle * 600, t, 0.1);
  }

  // Nitro whoosh
  playNitro() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    osc.frequency.value = 200;
    g.gain.value = 0.3;
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    osc.stop(this.ctx.currentTime + 0.5);
  }

  // Collision thud
  playCollision(intensity = 0.5) {
    if (!this.initialized) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.2));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = intensity * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  // Coin pickup
  playCoinPickup() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    g.gain.value = 0.15;
    osc.connect(g);
    g.connect(this.sfxGain);
    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1320, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // Checkpoint ding
  playCheckpoint() {
    if (!this.initialized) return;
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const g = this.ctx.createGain();
      g.gain.value = 0.12;
      osc.connect(g);
      g.connect(this.sfxGain);
      const t = this.ctx.currentTime + i * 0.1;
      osc.frequency.value = freq;
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  // Countdown beep
  playCountdown(final = false) {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const g = this.ctx.createGain();
    g.gain.value = 0.1;
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.frequency.value = final ? 880 : 440;
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (final ? 0.5 : 0.2));
    osc.stop(this.ctx.currentTime + (final ? 0.5 : 0.2));
  }

  // Horn
  playHorn() {
    if (!this.initialized) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.value = 340;
    osc2.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.15;
    osc1.connect(g);
    osc2.connect(g);
    g.connect(this.sfxGain);
    osc1.start();
    osc2.start();
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    osc1.stop(this.ctx.currentTime + 0.5);
    osc2.stop(this.ctx.currentTime + 0.5);
  }

  // Tire screech
  playSkid(duration = 0.3) {
    if (!this.initialized) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 2;
    const g = this.ctx.createGain();
    g.gain.value = 0.08;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  // Background music — procedural synth loop
  startMusic() {
    if (!this.initialized || this.musicPlaying) return;
    this.musicPlaying = true;

    // Simple chord progression: Am - F - C - G
    const chords = [
      [220, 261.63, 329.63],   // Am
      [174.61, 220, 261.63],   // F
      [261.63, 329.63, 392],   // C
      [196, 246.94, 293.66],   // G
    ];

    let chordIdx = 0;
    const playChord = () => {
      if (!this.musicPlaying) return;
      const chord = chords[chordIdx % chords.length];
      chord.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(this.musicGain);
        const t = this.ctx.currentTime;
        g.gain.linearRampToValueAtTime(0.06, t + 0.1);
        g.gain.linearRampToValueAtTime(0.04, t + 1.5);
        g.gain.linearRampToValueAtTime(0.001, t + 1.9);
        osc.start(t);
        osc.stop(t + 2);
      });

      // Bassline
      const bass = this.ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.value = chord[0] / 2;
      const bg = this.ctx.createGain();
      bg.gain.value = 0.1;
      bass.connect(bg);
      bg.connect(this.musicGain);
      const t = this.ctx.currentTime;
      bg.gain.linearRampToValueAtTime(0.08, t + 0.8);
      bg.gain.linearRampToValueAtTime(0.001, t + 1.9);
      bass.start(t);
      bass.stop(t + 2);

      // Simple beat
      for (let b = 0; b < 4; b++) {
        const beatTime = t + b * 0.5;
        // Kick
        const kickOsc = this.ctx.createOscillator();
        kickOsc.type = 'sine';
        kickOsc.frequency.value = 150;
        const kickG = this.ctx.createGain();
        kickG.gain.value = b % 2 === 0 ? 0.12 : 0.04;
        kickOsc.connect(kickG);
        kickG.connect(this.musicGain);
        kickOsc.frequency.exponentialRampToValueAtTime(40, beatTime + 0.1);
        kickG.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.15);
        kickOsc.start(beatTime);
        kickOsc.stop(beatTime + 0.15);

        // Hi-hat on off-beats
        if (b % 2 === 1) {
          const hat = this.ctx.createBufferSource();
          const hatBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
          const hatData = hatBuf.getChannelData(0);
          for (let i = 0; i < hatData.length; i++) hatData[i] = (Math.random() * 2 - 1) * Math.exp(-i / 200);
          hat.buffer = hatBuf;
          const hatG = this.ctx.createGain();
          hatG.gain.value = 0.06;
          const hatF = this.ctx.createBiquadFilter();
          hatF.type = 'highpass';
          hatF.frequency.value = 8000;
          hat.connect(hatF);
          hatF.connect(hatG);
          hatG.connect(this.musicGain);
          hat.start(beatTime);
        }
      }

      chordIdx++;
      this.musicTimer = setTimeout(playChord, 2000);
    };

    playChord();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) clearTimeout(this.musicTimer);
  }

  // Race finish fanfare
  playFinish() {
    if (!this.initialized) return;
    const melody = [523, 659, 784, 1047];
    melody.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const g = this.ctx.createGain();
      g.gain.value = 0.15;
      osc.connect(g);
      g.connect(this.sfxGain);
      const t = this.ctx.currentTime + i * 0.15;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }
}

export const audio = new AudioManager();
