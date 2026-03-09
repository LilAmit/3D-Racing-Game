// Main game — initializes Three.js, game loop, menu navigation

import * as THREE from 'three';
import { settings } from './settings.js';
import { controls } from './controls.js';
import { audio } from './audio.js';
import { buildWorld, getColliders, TRACKS, addCheckpoints, SPAWN_POS, SPAWN_ANGLE } from './world.js';
import { buildCarMesh, garage } from './cars.js';
import { CarPhysics, initPhysicsWorld, addBuildingColliders, addTreeColliders, addRampColliders, stepPhysics } from './physics.js';
import { raceManager } from './racing.js';
import { multiplayer } from './multiplayer.js';

// ─── State ───
let state = 'menu'; // menu | playing | paused | race_setup | garage | multiplayer_menu | settings | countdown | results
let scene, camera, renderer, clock;
let playerMesh, playerPhysics;
let worldObjects, colliders;
let cameraMode = 0; // 0 = chase, 1 = top-down, 2 = hood
let lookingBack = false;
let coinTimer = 0;
const COIN_INTERVAL = 25;

// ─── Init ───
function init() {
  clock = new THREE.Clock();

  // Renderer
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = settings.get('shadows');
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.get('brightness');

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(settings.get('fov'), window.innerWidth / window.innerHeight, 0.3, settings.get('drawDistance'));
  camera.position.set(SPAWN_POS.x - 12, 6, SPAWN_POS.z);

  // Init cannon-es physics world
  initPhysicsWorld();

  // Build world
  worldObjects = buildWorld(scene);
  colliders = getColliders(worldObjects);

  // Add physics colliders
  addBuildingColliders(worldObjects.buildings);
  addTreeColliders(worldObjects.trees);
  addRampColliders(worldObjects.ramps);

  // Player car
  spawnPlayerCar();

  // Multiplayer
  multiplayer.init(scene);

  // Minimap setup
  setupMinimap();

  // Settings UI
  settings.initUI((data) => {
    renderer.toneMappingExposure = data.brightness;
    camera.fov = data.fov;
    camera.updateProjectionMatrix();
    renderer.shadowMap.enabled = data.shadows;
    camera.far = data.drawDistance;
    camera.updateProjectionMatrix();
    if (scene.fog) {
      scene.fog.near = data.drawDistance * 0.4;
      scene.fog.far = data.drawDistance;
    }
    audio.updateVolumes();
  });

  // Menu events
  setupMenuEvents();

  // Window resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') handleEscape();
    if (state === 'playing' || state === 'countdown') {
      if (settings.isKey('camera', e.code)) {
        cameraMode = (cameraMode + 1) % 3;
      }
      if (settings.isKey('lookBack', e.code)) lookingBack = true;
      if (settings.isKey('horn', e.code)) audio.playHorn();
      if (settings.isKey('nitro', e.code) && playerPhysics.nitro) audio.playNitro();
      if (settings.isKey('reset', e.code)) {
        playerPhysics.reset(playerPhysics.position.x, playerPhysics.position.z, playerPhysics.rotation);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (settings.isKey('lookBack', e.code)) lookingBack = false;
  });

  // Update coin display
  garage.updateUI();

  // Start loop
  animate();
}

function spawnPlayerCar() {
  if (playerPhysics) playerPhysics.destroy();
  if (playerMesh) scene.remove(playerMesh);
  const def = garage.getSelectedDef();
  playerMesh = buildCarMesh(def);
  playerPhysics = new CarPhysics(def);
  scene.add(playerMesh);
}

// ─── Menu Events ───
function setupMenuEvents() {
  const show = (id) => document.getElementById(id).classList.remove('hidden');
  const hide = (id) => document.getElementById(id).classList.add('hidden');

  document.getElementById('btnFreeRoam').addEventListener('click', () => {
    startPlaying();
  });

  document.getElementById('btnRace').addEventListener('click', () => {
    hide('mainMenu');
    show('raceSetup');
    state = 'race_setup';
  });

  document.getElementById('btnGarage').addEventListener('click', () => {
    hide('mainMenu');
    show('garage');
    state = 'garage';
    garage.renderGarage();
  });

  document.getElementById('btnMultiplayer').addEventListener('click', () => {
    hide('mainMenu');
    show('multiplayerMenu');
    state = 'multiplayer_menu';
  });

  document.getElementById('btnSettings').addEventListener('click', () => {
    hide('mainMenu');
    show('settingsMenu');
    state = 'settings';
  });

  // Race setup
  document.getElementById('btnBackFromRace').addEventListener('click', () => {
    hide('raceSetup');
    show('mainMenu');
    state = 'menu';
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
    hide('garage');
    show('mainMenu');
    state = 'menu';
    spawnPlayerCar();
  });

  // Multiplayer
  document.getElementById('btnBackFromMP').addEventListener('click', () => {
    hide('multiplayerMenu');
    show('mainMenu');
    state = 'menu';
  });

  document.getElementById('btnConnect').addEventListener('click', () => {
    multiplayer.connect('ws://localhost:8080');
  });

  document.getElementById('btnStartMP').addEventListener('click', () => {
    hide('multiplayerMenu');
    startPlaying();
  });

  // Settings
  document.getElementById('btnBackFromSettings').addEventListener('click', () => {
    hide('settingsMenu');
    if (state === 'settings') {
      show('mainMenu');
      state = 'menu';
    } else {
      show('pauseMenu');
      state = 'paused';
    }
  });

  // Pause
  document.getElementById('btnResume').addEventListener('click', () => {
    resumePlaying();
  });

  document.getElementById('btnPauseSettings').addEventListener('click', () => {
    hide('pauseMenu');
    show('settingsMenu');
  });

  document.getElementById('btnQuitToMenu').addEventListener('click', () => {
    hide('pauseMenu');
    hide('hud');
    show('mainMenu');
    state = 'menu';
    raceManager.end(scene);
    controls.releasePointerLock();
    garage.updateUI();
  });

  // Race results
  document.getElementById('btnResultsOk').addEventListener('click', () => {
    hide('raceResults');
    hide('hud');
    show('mainMenu');
    state = 'menu';
    raceManager.end(scene);
    controls.releasePointerLock();
    garage.updateUI();
  });

  // Click canvas to lock pointer during gameplay
  document.getElementById('gameCanvas').addEventListener('click', () => {
    if (state === 'playing') {
      audio.init();
      controls.requestPointerLock();
    }
  });
}

function startPlaying() {
  document.getElementById('mainMenu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  state = 'playing';
  coinTimer = 0;
  spawnPlayerCar();
  playerPhysics.reset(SPAWN_POS.x, SPAWN_POS.z, SPAWN_ANGLE);

  // Snap camera behind car immediately
  const pos = playerPhysics.position;
  const rot = playerPhysics.rotation;
  camera.position.set(
    pos.x - Math.sin(rot) * 12,
    pos.y + 5,
    pos.z - Math.cos(rot) * 12
  );
  cameraOffset.copy(camera.position);
  cameraLookAt.set(pos.x, pos.y + 0.5, pos.z);
  camera.lookAt(cameraLookAt);

  audio.init();
  audio.startMusic();
  controls.requestPointerLock();
}

function startRace() {
  document.getElementById('hud').classList.remove('hidden');
  state = 'countdown';
  spawnPlayerCar();
  audio.init();
  audio.startMusic();

  raceManager.startCountdown(scene, playerPhysics, worldObjects, colliders, () => {
    state = 'playing';
    controls.requestPointerLock();
  });
}

function resumePlaying() {
  document.getElementById('pauseMenu').classList.add('hidden');
  state = 'playing';
  controls.requestPointerLock();
}

function handleEscape() {
  if (state === 'playing') {
    state = 'paused';
    document.getElementById('pauseMenu').classList.remove('hidden');
    controls.releasePointerLock();
  } else if (state === 'paused') {
    resumePlaying();
  }
}

// ─── Minimap ───
let minimapCtx;
function setupMinimap() {
  const canvas = document.getElementById('minimapCanvas');
  minimapCtx = canvas.getContext('2d');
}

function updateMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const w = 160, h = 160;
  const scale = 0.09; // Adjusted for larger world

  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2 - playerPhysics.position.x * scale;
  const cz = h / 2 - playerPhysics.position.z * scale;

  // Roads
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  const ROADS_DATA = [
    [[-800, 0], [800, 0]],
    [[0, -800], [0, 800]],
    [[-200, -200], [200, -200], [200, 200], [-200, 200], [-200, -200]],
    [[-400, -400], [400, -400], [400, 400], [-400, 400], [-400, -400]],
    [[-650, -650], [650, -650], [650, 650], [-650, 650], [-650, -650]],
  ];
  ROADS_DATA.forEach(road => {
    ctx.beginPath();
    road.forEach(([x, z], i) => {
      const sx = cx + x * scale, sy = cz + z * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  });

  // Buildings
  ctx.fillStyle = '#445';
  worldObjects.buildings.forEach(b => {
    ctx.fillRect(cx + (b.x - b.w / 2) * scale, cz + (b.z - b.d / 2) * scale, b.w * scale, b.d * scale);
  });

  // Coins
  ctx.fillStyle = '#ffd700';
  worldObjects.coins.forEach(coin => {
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
    const bx = cx + bot.physics.position.x * scale;
    const bz = cz + bot.physics.position.z * scale;
    ctx.fillRect(bx - 2, bz - 2, 4, 4);
  });

  // Multiplayer peers
  ctx.fillStyle = '#44aaff';
  multiplayer.peers.forEach(peer => {
    const px = cx + peer.position.x * scale;
    const pz = cz + peer.position.z * scale;
    ctx.fillRect(px - 2, pz - 2, 4, 4);
  });

  // Player
  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Direction indicator
  const dirX = Math.sin(playerPhysics.rotation) * 8;
  const dirZ = Math.cos(playerPhysics.rotation) * 8;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2);
  ctx.lineTo(w / 2 + dirX, h / 2 + dirZ);
  ctx.stroke();
}

// ─── Camera ───
const cameraOffset = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();

function updateCamera(dt) {
  const pos = playerPhysics.position;
  const rot = playerPhysics.rotation;
  const speed = playerPhysics.speed;

  // Dynamic camera distance based on speed
  const speedFactor = Math.min(Math.abs(speed) / 200, 1);
  const chaseDist = 10 + speedFactor * 6;
  const chaseHeight = 4 + speedFactor * 3;

  let targetOffset, targetLookAt;

  if (lookingBack) {
    targetOffset = new THREE.Vector3(
      pos.x + Math.sin(rot) * 12,
      pos.y + 5,
      pos.z + Math.cos(rot) * 12
    );
    targetLookAt = new THREE.Vector3(
      pos.x + Math.sin(rot) * 20,
      pos.y + 2,
      pos.z + Math.cos(rot) * 20
    );
  } else if (cameraMode === 0) {
    // Chase cam — dynamic distance
    targetOffset = new THREE.Vector3(
      pos.x - Math.sin(rot) * chaseDist,
      pos.y + chaseHeight,
      pos.z - Math.cos(rot) * chaseDist
    );
    targetLookAt = new THREE.Vector3(
      pos.x + Math.sin(rot) * 6,
      pos.y + 0.5,
      pos.z + Math.cos(rot) * 6
    );
  } else if (cameraMode === 1) {
    // Top-down
    targetOffset = new THREE.Vector3(pos.x, pos.y + 35, pos.z + 0.1);
    targetLookAt = pos.clone();
  } else {
    // Hood cam
    targetOffset = new THREE.Vector3(
      pos.x + Math.sin(rot) * 1.8,
      pos.y + 1.2,
      pos.z + Math.cos(rot) * 1.8
    );
    targetLookAt = new THREE.Vector3(
      pos.x + Math.sin(rot) * 25,
      pos.y + 0.5,
      pos.z + Math.cos(rot) * 25
    );
  }

  // Free-look with mouse in chase cam
  if (controls.locked && cameraMode === 0 && !lookingBack) {
    const mouse = controls.consumeMouse();
    const orbitX = mouse.dx * 4;
    targetOffset.x += orbitX;
  } else {
    controls.consumeMouse();
  }

  // Fast camera follow — much snappier
  const smoothing = cameraMode === 2 ? 0.35 : 0.18;
  cameraOffset.lerp(targetOffset, smoothing);
  cameraLookAt.lerp(targetLookAt, smoothing);

  camera.position.copy(cameraOffset);
  camera.lookAt(cameraLookAt);

  // Camera shake when drifting or at high speed
  if (playerPhysics.drifting && Math.abs(speed) > 30) {
    camera.position.x += (Math.random() - 0.5) * 0.08;
    camera.position.y += (Math.random() - 0.5) * 0.04;
  } else if (Math.abs(speed) > 180) {
    camera.position.x += (Math.random() - 0.5) * 0.03;
    camera.position.y += (Math.random() - 0.5) * 0.02;
  }

  // Dynamic FOV — slight increase at high speed
  if (cameraMode !== 1) {
    const baseFov = settings.get('fov');
    const targetFov = baseFov + speedFactor * 12 + (playerPhysics.nitro ? 5 : 0);
    camera.fov += (targetFov - camera.fov) * 0.05;
    camera.updateProjectionMatrix();
  }

  // Move sun shadow camera with player
  if (worldObjects.sun) {
    worldObjects.sun.position.set(pos.x + 100, 150, pos.z + 80);
    worldObjects.sun.target.position.copy(pos);
    worldObjects.sun.target.updateMatrixWorld();
  }
}

// ─── Coin Collection ───
function checkCoins() {
  worldObjects.coins.forEach(coin => {
    if (coin.userData.collected) return;
    const dx = playerPhysics.position.x - coin.position.x;
    const dz = playerPhysics.position.z - coin.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 3.5) {
      coin.userData.collected = true;
      coin.visible = false;
      garage.addCoins(1);
      audio.playCoinPickup();

      // Respawn after 45s
      setTimeout(() => {
        coin.userData.collected = false;
        coin.visible = true;
      }, 45000);
    }
  });

  // Rotate visible coins
  worldObjects.coins.forEach(coin => {
    if (!coin.userData.collected) {
      coin.rotation.z += 0.03;
      coin.position.y = 1.5 + Math.sin(performance.now() * 0.003 + coin.position.x) * 0.4;
    }
  });
}

// ─── HUD Update ───
function updateHUD(carState) {
  document.getElementById('speedValue').textContent = Math.round(carState.speed);

  // Gear
  const gearEl = document.getElementById('gearValue');
  if (gearEl) gearEl.textContent = carState.gear;

  // RPM bar
  const rpmFill = document.getElementById('rpmFill');
  if (rpmFill) {
    const rpm = carState.rpm || 0;
    rpmFill.style.width = (rpm * 100) + '%';
    rpmFill.style.backgroundColor = rpm > 0.85 ? '#ff4444' : rpm > 0.6 ? '#ffaa00' : '#00ff88';
  }

  // Nitro bar
  const nitroFill = document.getElementById('nitroFill');
  if (nitroFill) {
    nitroFill.style.width = carState.nitroFuel + '%';
    nitroFill.style.backgroundColor = carState.nitroFuel < 20 ? '#ff4444' : (playerPhysics.nitro ? '#00ccff' : '#00ff88');
  }

  // Drift indicator
  const driftInd = document.getElementById('driftIndicator');
  if (driftInd) {
    driftInd.style.opacity = carState.drifting ? '1' : '0';
  }
}

// ─── Game Loop ───
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    // 1. Read inputs
    const inputs = {
      forward: controls.isPressed('forward'),
      backward: controls.isPressed('backward'),
      left: controls.isPressed('left'),
      right: controls.isPressed('right'),
      brake: controls.isPressed('brake'),
      nitro: controls.isPressed('nitro'),
    };

    // 2. Apply forces BEFORE physics step (critical ordering!)
    playerPhysics.applyInputs(dt, inputs);

    // 3. Also update bot forces before step
    if (raceManager.active) {
      raceManager.bots.forEach(bot => {
        if (!bot.finished) {
          bot.applyForces(dt, colliders);
        }
      });
    }

    // 4. Step physics with all forces applied
    stepPhysics(dt);

    // 5. Read state after step
    const carState = playerPhysics.readState(dt);
    playerPhysics.applyToMesh(playerMesh);

    // 6. Update bot state after step
    if (raceManager.active) {
      raceManager.bots.forEach(bot => {
        if (!bot.finished) {
          bot.readStateAfterStep(dt);
        }
      });
    }

    // HUD
    updateHUD(carState);

    // Camera
    updateCamera(dt);

    // Coins
    checkCoins();

    // Driving coin timer
    if (carState.speed > 5) {
      coinTimer += dt;
      if (coinTimer >= COIN_INTERVAL) {
        coinTimer = 0;
        garage.addCoins(1);
      }
    }

    // Race logic
    if (raceManager.active) {
      const result = raceManager.update(dt, playerPhysics, colliders);
      if (result) {
        showRaceResults(result);
      }
    }

    // Multiplayer sync
    multiplayer.sendUpdate(playerPhysics.position, playerPhysics.rotation);
    multiplayer.updateMeshes();

    // Minimap
    updateMinimap();
  } else if (state === 'countdown') {
    // Step physics during countdown too
    stepPhysics(dt);
    playerPhysics.readState(dt);
    playerPhysics.applyToMesh(playerMesh);
    updateCamera(dt);
  }

  renderer.render(scene, camera);
}

function showRaceResults(result) {
  state = 'results';
  controls.releasePointerLock();
  audio.stopMusic();

  const suffix = result.position === 1 ? 'st' : result.position === 2 ? 'nd' : result.position === 3 ? 'rd' : 'th';
  document.getElementById('resultTitle').textContent = `${result.position}${suffix} Place!`;

  const mins = Math.floor(result.time / 60);
  const secs = (result.time % 60).toFixed(1);
  let details = `<div>Time: ${mins}:${secs.padStart(4, '0')}</div>`;
  details += `<div style="margin-top:12px; font-size:14px; opacity:0.7">`;
  result.order.forEach((r, i) => {
    const s = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : (i + 1) + 'th';
    const highlight = r.isPlayer ? ' style="color: #00ff88; font-weight: 700"' : '';
    const t = r.time.toFixed(1);
    details += `<div${highlight}>${s} — ${r.name} (${t}s)</div>`;
  });
  details += '</div>';
  document.getElementById('resultDetails').innerHTML = details;
  document.getElementById('resultReward').textContent = `+${result.coins} coins`;

  garage.addCoins(result.coins);

  document.getElementById('raceResults').classList.remove('hidden');
}

// ─── Start ───
init();
