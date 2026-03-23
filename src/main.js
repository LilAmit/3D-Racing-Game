// Main — entry point, menu navigation, HUD, minimap, game loop

import { GameEngine } from './engine.js';
import { InputHandler } from './input.js';
import { Car } from './car.js';
import { World, TRACKS, SPAWN_POS, SPAWN_ANGLE } from './world.js';
import { garage } from './garage.js';
import { settings } from './settings.js';
import { audio } from './audio.js';
import { raceManager } from './racing.js';
import { multiplayer } from './multiplayer.js';

// ─── State ───
let state = 'menu';
let engine, input, world, playerCar;
let cameraMode = 0;
let lookingBack = false;
let coinTimer = 0;
const COIN_INTERVAL = 25;
let minimapCtx;
let mpSendTimer = 0;
const MP_SEND_RATE = 0.05; // send position every 50ms (20 Hz)

// ─── Init ───
function init() {
  engine = new GameEngine('gameCanvas');
  input = new InputHandler();
  world = new World(engine.scene);

  // Position camera at spawn
  engine.camera.position.set(SPAWN_POS.x - 12, 6, SPAWN_POS.z);

  // Spawn player car
  spawnPlayerCar();

  // Multiplayer — init scene ref
  multiplayer.init(engine.scene);

  // Minimap
  const minimapCanvas = document.getElementById('minimapCanvas');
  minimapCtx = minimapCanvas.getContext('2d');

  // Settings UI
  settings.initUI((data) => {
    engine.applySettings(data);
    audio.updateVolumes();
  });

  // Menu events
  setupMenuEvents();

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') handleEscape();
    if (state === 'playing' || state === 'countdown') {
      if (settings.isKey('camera', e.code)) cameraMode = (cameraMode + 1) % 3;
      if (settings.isKey('lookBack', e.code)) lookingBack = true;
      if (settings.isKey('horn', e.code)) audio.playHorn();
      if (settings.isKey('nitro', e.code) && playerCar.nitro) audio.playNitro();
      if (settings.isKey('reset', e.code)) {
        playerCar.reset(playerCar.position.x, playerCar.position.z, playerCar.rotation);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (settings.isKey('lookBack', e.code)) lookingBack = false;
  });

  // Click canvas to lock pointer
  document.getElementById('gameCanvas').addEventListener('click', () => {
    if (state === 'playing') {
      audio.init();
      input.requestPointerLock();
    }
  });

  // Coin display
  garage.updateUI();

  // Game loop
  engine.onUpdate(gameLoop);
  engine.start();
}

function spawnPlayerCar() {
  if (playerCar) playerCar.destroy();
  const def = garage.getSelectedDef();
  playerCar = new Car(def, engine.scene);
}

// ─── Menu Events ───
function setupMenuEvents() {
  const show = (id) => document.getElementById(id).classList.remove('hidden');
  const hide = (id) => document.getElementById(id).classList.add('hidden');

  document.getElementById('btnFreeRoam').addEventListener('click', () => startPlaying());

  document.getElementById('btnRace').addEventListener('click', () => {
    hide('mainMenu'); show('raceSetup'); state = 'race_setup';
  });

  document.getElementById('btnGarage').addEventListener('click', () => {
    hide('mainMenu'); show('garage'); state = 'garage'; garage.renderGarage();
  });

  document.getElementById('btnMultiplayer').addEventListener('click', () => {
    hide('mainMenu'); show('multiplayerMenu'); state = 'multiplayer_menu';
  });

  document.getElementById('btnSettings').addEventListener('click', () => {
    hide('mainMenu'); show('settingsMenu'); state = 'settings';
  });

  // Race setup
  document.getElementById('btnBackFromRace').addEventListener('click', () => {
    hide('raceSetup'); show('mainMenu'); state = 'menu';
  });

  document.getElementById('btnStartRace').addEventListener('click', () => {
    const trackId = document.getElementById('trackSelect').value;
    const laps = parseInt(document.getElementById('lapSelect').value);
    const bots = parseInt(document.getElementById('botSelect').value);
    raceManager.setup(trackId, laps, bots);
    hide('raceSetup');
    startRace();
  });

  // Garage
  document.getElementById('btnBackFromGarage').addEventListener('click', () => {
    hide('garage'); show('mainMenu'); state = 'menu'; spawnPlayerCar();
  });

  // Multiplayer
  document.getElementById('btnBackFromMP').addEventListener('click', () => {
    hide('multiplayerMenu'); show('mainMenu'); state = 'menu';
  });
  document.getElementById('btnConnect').addEventListener('click', () => {
    const roomId = document.getElementById('roomSelect').value || 'freeroam';
    multiplayer.connect(roomId);
  });
  document.getElementById('btnStartMP').addEventListener('click', () => {
    hide('multiplayerMenu'); startPlaying();
  });

  // Settings
  document.getElementById('btnBackFromSettings').addEventListener('click', () => {
    hide('settingsMenu');
    if (state === 'settings') { show('mainMenu'); state = 'menu'; }
    else { show('pauseMenu'); state = 'paused'; }
  });

  // Pause
  document.getElementById('btnResume').addEventListener('click', resumePlaying);

  document.getElementById('btnPauseSettings').addEventListener('click', () => {
    hide('pauseMenu'); show('settingsMenu');
  });

  document.getElementById('btnQuitToMenu').addEventListener('click', () => {
    hide('pauseMenu'); hide('hud'); show('mainMenu');
    state = 'menu';
    raceManager.end(world);
    input.releasePointerLock();
    garage.updateUI();
  });

  // Race results
  document.getElementById('btnResultsOk').addEventListener('click', () => {
    hide('raceResults'); hide('hud'); show('mainMenu');
    state = 'menu';
    raceManager.end(world);
    input.releasePointerLock();
    garage.updateUI();
  });
}

function startPlaying() {
  document.getElementById('mainMenu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  state = 'playing';
  coinTimer = 0;
  spawnPlayerCar();
  playerCar.reset(SPAWN_POS.x, SPAWN_POS.z, SPAWN_ANGLE);
  engine.snapCamera(playerCar.position, playerCar.rotation);
  audio.init();
  audio.startMusic();
  input.requestPointerLock();

  // Auto-connect multiplayer for free roam
  if (!multiplayer.connected) {
    multiplayer.connect('freeroam');
  }
}

function startRace() {
  document.getElementById('hud').classList.remove('hidden');
  state = 'countdown';
  spawnPlayerCar();
  audio.init();
  audio.startMusic();

  // Connect to race room if multiplayer is active
  if (multiplayer.connected) {
    multiplayer.connect('race_' + raceManager.trackId);
  }

  raceManager.startCountdown(engine.scene, world, playerCar, () => {
    state = 'playing';
    input.requestPointerLock();
  });
}

function resumePlaying() {
  document.getElementById('pauseMenu').classList.add('hidden');
  state = 'playing';
  input.requestPointerLock();
}

function handleEscape() {
  if (state === 'playing') {
    state = 'paused';
    document.getElementById('pauseMenu').classList.remove('hidden');
    input.releasePointerLock();
  } else if (state === 'paused') {
    resumePlaying();
  }
}

// ─── Game Loop ───
function gameLoop(dt) {
  if (state === 'playing') {
    // Read inputs
    const inputs = {
      forward: input.isPressed('forward'),
      backward: input.isPressed('backward'),
      left: input.isPressed('left'),
      right: input.isPressed('right'),
      brake: input.isPressed('brake'),
      nitro: input.isPressed('nitro'),
    };

    // Update player car physics
    const carState = playerCar.update(dt, inputs, world.colliders, world.ramps);

    // Camera
    const mouse = input.locked && cameraMode === 0 && !lookingBack ? input.consumeMouse() : (input.consumeMouse(), null);
    engine.updateCamera(playerCar.position, playerCar.rotation, carState.speed, {
      mode: cameraMode,
      lookingBack,
      baseFov: settings.get('fov'),
      nitro: carState.nitroActive,
      drifting: carState.drifting,
    });

    // Sun follows player
    world.updateSunPosition(playerCar.position);

    // HUD
    updateHUD(carState);

    // Coins — each coin gives 10 coins
    checkCoins();

    // Driving coin timer (1 coin per 25 seconds of driving)
    if (carState.speed > 5) {
      coinTimer += dt;
      if (coinTimer >= COIN_INTERVAL) {
        coinTimer = 0;
        garage.addCoins(1);
      }
    }

    // Race logic
    if (raceManager.active) {
      const result = raceManager.update(dt, playerCar, world.colliders, world.ramps);
      if (result) showRaceResults(result);
    }

    // Multiplayer — throttled position sync
    mpSendTimer += dt;
    if (mpSendTimer >= MP_SEND_RATE) {
      mpSendTimer = 0;
      multiplayer.sendUpdate(playerCar.position, playerCar.rotation);
    }
    multiplayer.updateMeshes();

    // Minimap
    updateMinimap();

  } else if (state === 'countdown') {
    engine.updateCamera(playerCar.position, playerCar.rotation, 0, {
      mode: 0, lookingBack: false, baseFov: settings.get('fov'),
    });
  }
}

// ─── HUD ───
function updateHUD(carState) {
  document.getElementById('speedValue').textContent = Math.round(carState.speed);

  const gearEl = document.getElementById('gearValue');
  if (gearEl) gearEl.textContent = carState.gear;

  const rpmFill = document.getElementById('rpmFill');
  if (rpmFill) {
    rpmFill.style.width = (carState.rpm * 100) + '%';
    rpmFill.style.backgroundColor = carState.rpm > 0.85 ? '#ff4444' : carState.rpm > 0.6 ? '#ffaa00' : '#00ff88';
  }

  const nitroFill = document.getElementById('nitroFill');
  if (nitroFill) {
    nitroFill.style.width = carState.nitroFuel + '%';
    nitroFill.style.backgroundColor = carState.nitroFuel < 20 ? '#ff4444' : (carState.nitroActive ? '#00ccff' : '#00ff88');
  }

  const driftInd = document.getElementById('driftIndicator');
  if (driftInd) driftInd.style.opacity = carState.drifting ? '1' : '0';
}

// ─── Coins — each pickup = 10 coins ───
function checkCoins() {
  world.coins.forEach(coin => {
    if (coin.userData.collected) return;
    const dx = playerCar.position.x - coin.position.x;
    const dz = playerCar.position.z - coin.position.z;
    if (dx * dx + dz * dz < 12.25) { // 3.5²
      coin.userData.collected = true;
      coin.visible = false;
      garage.addCoins(10); // 10 coins per pickup
      audio.playCoinPickup();
      setTimeout(() => { coin.userData.collected = false; coin.visible = true; }, 45000);
    }
  });

  // Animate coins — spin on Z axis (they're already rotated via group)
  world.coins.forEach(coin => {
    if (!coin.userData.collected) {
      coin.rotation.z += 0.03;
      coin.position.y = 1.5 + Math.sin(performance.now() * 0.003 + coin.position.x) * 0.4;
    }
  });
}

// ─── Minimap ───
function updateMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const w = 160, h = 160, scale = 0.045; // Smaller scale for bigger map

  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2 - playerCar.position.x * scale;
  const cz = h / 2 - playerCar.position.z * scale;

  // Roads
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  world.getRoadsData().forEach(road => {
    ctx.beginPath();
    road.forEach(([x, z], i) => {
      const sx = cx + x * scale, sy = cz + z * scale;
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  });

  // Buildings
  ctx.fillStyle = '#445';
  world.buildings.forEach(b => {
    ctx.fillRect(cx + (b.x - b.w / 2) * scale, cz + (b.z - b.d / 2) * scale, b.w * scale, b.d * scale);
  });

  // Coins
  ctx.fillStyle = '#ffd700';
  world.coins.forEach(coin => {
    if (coin.userData.collected) return;
    ctx.beginPath();
    ctx.arc(cx + coin.position.x * scale, cz + coin.position.z * scale, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Race checkpoints
  if (raceManager.active) {
    const track = TRACKS[raceManager.trackId];
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    track.checkpoints.forEach((cp, i) => {
      ctx.beginPath();
      ctx.arc(cx + cp.x * scale, cz + cp.z * scale, 4, 0, Math.PI * 2);
      ctx.stroke();
      if (i === raceManager.playerCheckpoint) {
        ctx.fillStyle = '#00ff88';
        ctx.fill();
      }
    });
  }

  // Bot cars
  ctx.fillStyle = '#ff4444';
  raceManager.bots.forEach(bot => {
    ctx.fillRect(cx + bot.car.position.x * scale - 2, cz + bot.car.position.z * scale - 2, 4, 4);
  });

  // Multiplayer peers
  ctx.fillStyle = '#44aaff';
  multiplayer.peers.forEach(peer => {
    ctx.fillRect(cx + peer.position.x * scale - 2, cz + peer.position.z * scale - 2, 4, 4);
  });

  // Player
  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Direction
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2);
  ctx.lineTo(w / 2 + Math.sin(playerCar.rotation) * 8, h / 2 + Math.cos(playerCar.rotation) * 8);
  ctx.stroke();
}

// ─── Race Results ───
function showRaceResults(result) {
  state = 'results';
  input.releasePointerLock();
  audio.stopMusic();

  const suffix = result.position === 1 ? 'st' : result.position === 2 ? 'nd' : result.position === 3 ? 'rd' : 'th';
  document.getElementById('resultTitle').textContent = `${result.position}${suffix} Place!`;

  const mins = Math.floor(result.time / 60);
  const secs = (result.time % 60).toFixed(1);
  let details = `<div>Time: ${mins}:${secs.padStart(4, '0')}</div>`;
  details += '<div style="margin-top:12px; font-size:14px; opacity:0.7">';
  result.order.forEach((r, i) => {
    const s = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : (i + 1) + 'th';
    const highlight = r.isPlayer ? ' style="color: #00ff88; font-weight: 700"' : '';
    details += `<div${highlight}>${s} \u2014 ${r.name} (${r.time.toFixed(1)}s)</div>`;
  });
  details += '</div>';
  document.getElementById('resultDetails').innerHTML = details;
  document.getElementById('resultReward').textContent = `+${result.coins} coins`;
  garage.addCoins(result.coins);
  document.getElementById('raceResults').classList.remove('hidden');
}

// ─── Start ───
init();
