// Audio manager — realistic multi-cylinder engine + procedural SFX + music

import { settings } from './settings.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.masterGain = null;
    this.engineGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicPlaying = false;
    this.musicTimer = null;

    // Engine nodes
    this._engineCylinders = [];
    this._engineLPF = null;
    this._engineHPF = null;
    this._exhaustGain = null;
    this._intakeGain = null;
    this._rumbleNode = null;
    this._rumbleGain = null;
    this._prevSpeedNorm = 0;
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

    this._buildEngine();
    this.initialized = true;
  }

  _buildEngine() {
    const ctx = this.ctx;

    // === Realistic multi-cylinder engine ===
    // We layer several oscillators to simulate a V8-style engine:
    // 1. Primary firing frequency (sawtooth — gives the "putt putt" character)
    // 2. Second harmonic (adds body)
    // 3. Sub-bass rumble (gives chest-thumping low end)
    // 4. Intake whoosh (noise filtered to mid-high range)
    // 5. Exhaust crackle (noise shaped by envelope)

    // Exhaust bus with distortion-like waveshaping
    const exhaust = ctx.createGain();
    exhaust.gain.value = 0.35;
    const exhaustFilter = ctx.createBiquadFilter();
    exhaustFilter.type = 'lowpass';
    exhaustFilter.frequency.value = 800;
    exhaustFilter.Q.value = 2;
    exhaust.connect(exhaustFilter);
    exhaustFilter.connect(this.engineGain);
    this._exhaustGain = exhaust;
    this._engineLPF = exhaustFilter;

    // Cylinder 1 — primary firing (sawtooth for harsh harmonics)
    const cyl1 = ctx.createOscillator();
    cyl1.type = 'sawtooth';
    cyl1.frequency.value = 35; // idle ~35 Hz for a V8
    const cyl1Gain = ctx.createGain();
    cyl1Gain.gain.value = 0.18;
    cyl1.connect(cyl1Gain);
    cyl1Gain.connect(exhaust);
    cyl1.start();
    this._engineCylinders.push({ osc: cyl1, gain: cyl1Gain, freqMult: 1.0 });

    // Cylinder 2 — second harmonic (triangle, smoother)
    const cyl2 = ctx.createOscillator();
    cyl2.type = 'triangle';
    cyl2.frequency.value = 70;
    const cyl2Gain = ctx.createGain();
    cyl2Gain.gain.value = 0.10;
    cyl2.connect(cyl2Gain);
    cyl2Gain.connect(exhaust);
    cyl2.start();
    this._engineCylinders.push({ osc: cyl2, gain: cyl2Gain, freqMult: 2.0 });

    // Cylinder 3 — third harmonic for bite
    const cyl3 = ctx.createOscillator();
    cyl3.type = 'square';
    cyl3.frequency.value = 105;
    const cyl3Gain = ctx.createGain();
    cyl3Gain.gain.value = 0.04;
    cyl3.connect(cyl3Gain);
    cyl3Gain.connect(exhaust);
    cyl3.start();
    this._engineCylinders.push({ osc: cyl3, gain: cyl3Gain, freqMult: 3.0 });

    // Sub-bass rumble
    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 18;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.20;
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.engineGain);
    rumble.start();
    this._rumbleNode = rumble;
    this._rumbleGain = rumbleGain;

    // Intake noise (air being sucked in at high RPM)
    const intakeBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const intakeData = intakeBuffer.getChannelData(0);
    for (let i = 0; i < intakeData.length; i++) {
      intakeData[i] = (Math.random() * 2 - 1) * 0.5;
    }
    this._intakeSource = ctx.createBufferSource();
    this._intakeSource.buffer = intakeBuffer;
    this._intakeSource.loop = true;
    const intakeFilter = ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass';
    intakeFilter.frequency.value = 2000;
    intakeFilter.Q.value = 1.5;
    this._intakeFilter = intakeFilter;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    this._intakeSource.connect(intakeFilter);
    intakeFilter.connect(intakeGain);
    intakeGain.connect(this.engineGain);
    this._intakeSource.start();
    this._intakeGain = intakeGain;

    // High-pass on whole engine to cut muddy low end
    this._engineHPF = ctx.createBiquadFilter();
    this._engineHPF.type = 'highpass';
    this._engineHPF.frequency.value = 30;
  }

  updateVolumes() {
    if (!this.initialized) return;
    this.masterGain.gain.value = settings.get('masterVolume');
    this.musicGain.gain.value = settings.get('musicVolume');
    this.sfxGain.gain.value = settings.get('sfxVolume');
  }

  // Update engine sound — speedNorm 0-1, throttle 0-1
  updateEngine(speedNorm, throttle) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;

    // Base firing frequency: idle 35 Hz → redline ~120 Hz
    const baseFreq = 35 + speedNorm * 85;

    // Update each cylinder harmonic
    this._engineCylinders.forEach(cyl => {
      cyl.osc.frequency.setTargetAtTime(baseFreq * cyl.freqMult, t, 0.08);
    });

    // Sub rumble follows at half frequency
    this._rumbleNode.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.08);

    // Volume envelope — louder with throttle, moderate at cruise
    const idleVol = 0.06;
    const throttleVol = throttle * 0.25;
    const speedVol = speedNorm * 0.12;
    const totalVol = Math.min(idleVol + throttleVol + speedVol, 0.45);
    this.engineGain.gain.setTargetAtTime(totalVol, t, 0.04);

    // Exhaust filter opens up at high RPM (more high-freq harmonics = louder/raspier)
    const filterFreq = 600 + speedNorm * 2500 + throttle * 1000;
    this._engineLPF.frequency.setTargetAtTime(filterFreq, t, 0.08);

    // Intake whoosh increases at high RPM + throttle
    const intakeVol = Math.max(0, (speedNorm - 0.3) * 0.15 + throttle * 0.06);
    this._intakeGain.gain.setTargetAtTime(intakeVol, t, 0.06);
    this._intakeFilter.frequency.setTargetAtTime(1500 + speedNorm * 3000, t, 0.1);

    // Sub-bass rumble — prominent at idle, fades at speed
    const rumbleVol = 0.2 - speedNorm * 0.12;
    this._rumbleGain.gain.setTargetAtTime(Math.max(0.04, rumbleVol), t, 0.1);

    this._prevSpeedNorm = speedNorm;
  }

  // Nitro whoosh — deeper and more dramatic
  playNitro() {
    if (!this.initialized) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 300;
    f.Q.value = 1;
    osc.frequency.value = 120;
    g.gain.value = 0.2;
    osc.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    osc.stop(this.ctx.currentTime + 0.6);

    // Whoosh layer
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.4));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2000;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.1;
    src.connect(hpf);
    hpf.connect(ng);
    ng.connect(this.sfxGain);
    src.start();
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

  // Coin pickup — satisfying ding
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

  // Horn — dual-tone car horn
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

  // Background music — electronic racing theme
  startMusic() {
    if (!this.initialized || this.musicPlaying) return;
    this.musicPlaying = true;

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

      for (let b = 0; b < 4; b++) {
        const beatTime = t + b * 0.5;
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
