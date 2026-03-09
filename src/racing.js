// Race mode — bots, checkpoints, laps, results

import * as THREE from 'three';
import { TRACKS, addCheckpoints } from './world.js';
import { CarPhysics } from './physics.js';
import { buildCarMesh, CAR_DEFS, garage } from './cars.js';
import { audio } from './audio.js';

class BotCar {
  constructor(scene, def, startX, startZ, startAngle, trackId) {
    this.physics = new CarPhysics(def);
    this.physics.reset(startX, startZ, startAngle);
    this.mesh = buildCarMesh(def);
    scene.add(this.mesh);
    this.track = TRACKS[trackId];
    this.currentCheckpoint = 0;
    this.lap = 0;
    this.finished = false;
    this.finishTime = 0;
  }

  update(dt, colliders) {
    if (this.finished) return;

    const target = this.track.checkpoints[this.currentCheckpoint];
    const dx = target.x - this.physics.position.x;
    const dz = target.z - this.physics.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const targetAngle = Math.atan2(dx, dz);

    // Normalize angle difference
    let angleDiff = targetAngle - this.physics.rotation;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Bot AI inputs
    const inputs = {
      forward: true,
      backward: false,
      left: angleDiff > 0.1,
      right: angleDiff < -0.1,
      brake: Math.abs(angleDiff) > 1.2 && Math.abs(this.physics.speed) > 40,
      nitro: dist > 50 && Math.abs(angleDiff) < 0.3,
    };

    this.physics.update(dt, inputs, colliders);
    this.physics.applyToMesh(this.mesh);
  }

  checkCheckpoint(totalLaps) {
    if (this.finished) return false;
    const cp = this.track.checkpoints[this.currentCheckpoint];
    const dx = this.physics.position.x - cp.x;
    const dz = this.physics.position.z - cp.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < cp.radius) {
      this.currentCheckpoint++;
      if (this.currentCheckpoint >= this.track.checkpoints.length) {
        this.currentCheckpoint = 0;
        this.lap++;
        if (this.lap >= totalLaps) {
          this.finished = true;
          return true;
        }
      }
    }
    return false;
  }

  destroy(scene) {
    scene.remove(this.mesh);
    this.physics.destroy();
  }
}

export class RaceManager {
  constructor() {
    this.active = false;
    this.trackId = 'circuit';
    this.totalLaps = 3;
    this.botCount = 3;
    this.bots = [];
    this.playerCheckpoint = 0;
    this.playerLap = 0;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.playerFinished = false;
    this.finishOrder = [];
    this.countingDown = false;
    this.countdownValue = 0;
  }

  setup(trackId, laps, botCount) {
    this.trackId = trackId;
    this.totalLaps = laps;
    this.botCount = botCount;
  }

  async startCountdown(scene, playerPhysics, worldObjects, colliders, onReady) {
    const track = TRACKS[this.trackId];
    addCheckpoints(scene, track, worldObjects);

    // Position player at start
    playerPhysics.reset(track.startPos.x, track.startPos.z, track.startAngle);

    // Create bots
    this.bots.forEach(b => b.destroy(scene));
    this.bots = [];

    const botDefs = [];
    for (let i = 0; i < this.botCount; i++) {
      botDefs.push(CAR_DEFS[Math.floor(Math.random() * Math.min(CAR_DEFS.length, 4))]);
    }

    botDefs.forEach((def, i) => {
      const offset = (i + 1) * 6;
      const side = i % 2 === 0 ? -5 : 5;
      const bot = new BotCar(
        scene, def,
        track.startPos.x + side,
        track.startPos.z - offset,
        track.startAngle,
        this.trackId
      );
      this.bots.push(bot);
    });

    // Countdown
    this.countingDown = true;
    const countdownEl = document.getElementById('countdown');
    const countdownText = document.getElementById('countdownText');
    countdownEl.classList.remove('hidden');

    for (let i = 3; i >= 1; i--) {
      countdownText.textContent = i;
      countdownText.style.animation = 'none';
      countdownText.offsetHeight; // Reflow
      countdownText.style.animation = 'countPulse 1s ease-out';
      audio.playCountdown(false);
      await this.delay(1000);
    }

    countdownText.textContent = 'GO!';
    countdownText.style.color = '#00ff88';
    countdownText.style.animation = 'none';
    countdownText.offsetHeight;
    countdownText.style.animation = 'countPulse 1s ease-out';
    audio.playCountdown(true);
    await this.delay(800);

    countdownEl.classList.add('hidden');
    countdownText.style.color = '';

    // Start race
    this.active = true;
    this.countingDown = false;
    this.playerCheckpoint = 0;
    this.playerLap = 0;
    this.playerFinished = false;
    this.finishOrder = [];
    this.startTime = performance.now();
    this.elapsedTime = 0;

    if (onReady) onReady();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  update(dt, playerPhysics, colliders) {
    if (!this.active) return null;

    this.elapsedTime = (performance.now() - this.startTime) / 1000;

    // Update bots
    this.bots.forEach((bot, i) => {
      bot.update(dt, colliders);
      const finished = bot.checkCheckpoint(this.totalLaps);
      if (finished) {
        bot.finishTime = this.elapsedTime;
        this.finishOrder.push({ name: bot.physics.def.name + ' Bot', time: this.elapsedTime });
      }
    });

    // Check player checkpoints
    if (!this.playerFinished) {
      const track = TRACKS[this.trackId];
      const cp = track.checkpoints[this.playerCheckpoint];
      const dx = playerPhysics.position.x - cp.x;
      const dz = playerPhysics.position.z - cp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < cp.radius) {
        audio.playCheckpoint();
        this.playerCheckpoint++;
        if (this.playerCheckpoint >= track.checkpoints.length) {
          this.playerCheckpoint = 0;
          this.playerLap++;
          if (this.playerLap >= this.totalLaps) {
            this.playerFinished = true;
            this.finishOrder.push({ name: 'You', time: this.elapsedTime, isPlayer: true });
            audio.playFinish();
            return this.getResults();
          }
        }
      }
    }

    // Check if all finished
    const allBotsFinished = this.bots.every(b => b.finished);
    if (this.playerFinished || (allBotsFinished && !this.playerFinished)) {
      if (allBotsFinished && !this.playerFinished) {
        // Player DNF — still finish them
        this.playerFinished = true;
        this.finishOrder.push({ name: 'You', time: this.elapsedTime, isPlayer: true });
        return this.getResults();
      }
    }

    // Update HUD
    this.updateHUD();
    return null;
  }

  updateHUD() {
    const raceHud = document.getElementById('raceHud');
    raceHud.classList.remove('hidden');

    // Position
    let pos = 1;
    this.bots.forEach(bot => {
      const botProgress = bot.lap * 100 + (bot.currentCheckpoint / TRACKS[this.trackId].checkpoints.length) * 100;
      const playerProgress = this.playerLap * 100 + (this.playerCheckpoint / TRACKS[this.trackId].checkpoints.length) * 100;
      if (botProgress > playerProgress) pos++;
    });
    const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
    document.getElementById('racePosition').textContent = pos + suffix;
    document.getElementById('raceLap').textContent = `Lap ${Math.min(this.playerLap + 1, this.totalLaps)}/${this.totalLaps}`;

    const mins = Math.floor(this.elapsedTime / 60);
    const secs = Math.floor(this.elapsedTime % 60);
    document.getElementById('raceTime').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getResults() {
    // Sort by time
    this.finishOrder.sort((a, b) => a.time - b.time);
    const playerIdx = this.finishOrder.findIndex(f => f.isPlayer);
    const position = playerIdx + 1;

    // Coins reward
    const rewards = { 1: 200, 2: 100, 3: 50 };
    const coins = rewards[position] || 20;

    return {
      position,
      totalRacers: this.botCount + 1,
      time: this.elapsedTime,
      coins,
      order: this.finishOrder,
    };
  }

  end(scene) {
    this.active = false;
    this.bots.forEach(b => b.destroy(scene));
    this.bots = [];
    document.getElementById('raceHud').classList.add('hidden');
  }
}

export const raceManager = new RaceManager();
