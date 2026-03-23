// GameEngine — Scene, Renderer, Camera, animate loop with THREE.Clock

import * as THREE from 'three';

export class GameEngine {
  constructor(canvasId) {
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();

    const canvas = document.getElementById(canvasId);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.3, 1500
    );

    // Lerp targets for smooth camera
    this._camPos = new THREE.Vector3();
    this._camLookAt = new THREE.Vector3();
    this._camInitialized = false;

    this._updateCallbacks = [];

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  onUpdate(callback) {
    this._updateCallbacks.push(callback);
  }

  start() {
    this._animate();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    for (const cb of this._updateCallbacks) cb(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // Smooth lerp camera follow
  // opts: { mode, lookingBack, baseFov, nitro, drifting, speed }
  updateCamera(position, rotation, speed, opts = {}) {
    const { mode = 0, lookingBack = false, baseFov = 75, nitro = false, drifting = false } = opts;

    const speedFactor = Math.min(Math.abs(speed) / 200, 1);
    const chaseDist = 7 + speedFactor * 2;   // stays close even at max speed
    const chaseHeight = 3 + speedFactor * 1.5;

    let targetPos, targetLook;

    if (lookingBack) {
      targetPos = new THREE.Vector3(
        position.x + Math.sin(rotation) * 12,
        position.y + 5,
        position.z + Math.cos(rotation) * 12
      );
      targetLook = new THREE.Vector3(
        position.x + Math.sin(rotation) * 20,
        position.y + 2,
        position.z + Math.cos(rotation) * 20
      );
    } else if (mode === 0) {
      // Chase cam
      targetPos = new THREE.Vector3(
        position.x - Math.sin(rotation) * chaseDist,
        position.y + chaseHeight,
        position.z - Math.cos(rotation) * chaseDist
      );
      targetLook = new THREE.Vector3(
        position.x + Math.sin(rotation) * 6,
        position.y + 0.5,
        position.z + Math.cos(rotation) * 6
      );
    } else if (mode === 1) {
      // Top-down
      targetPos = new THREE.Vector3(position.x, position.y + 35, position.z + 0.1);
      targetLook = position.clone();
    } else {
      // Hood cam
      targetPos = new THREE.Vector3(
        position.x + Math.sin(rotation) * 1.8,
        position.y + 1.2,
        position.z + Math.cos(rotation) * 1.8
      );
      targetLook = new THREE.Vector3(
        position.x + Math.sin(rotation) * 25,
        position.y + 0.5,
        position.z + Math.cos(rotation) * 25
      );
    }

    // First frame — snap
    if (!this._camInitialized) {
      this._camPos.copy(targetPos);
      this._camLookAt.copy(targetLook);
      this._camInitialized = true;
    }

    // Lerp
    const smoothing = mode === 2 ? 0.35 : 0.15;
    this._camPos.lerp(targetPos, smoothing);
    this._camLookAt.lerp(targetLook, smoothing);

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLookAt);

    // Camera shake
    if (drifting && Math.abs(speed) > 30) {
      this.camera.position.x += (Math.random() - 0.5) * 0.08;
      this.camera.position.y += (Math.random() - 0.5) * 0.04;
    } else if (Math.abs(speed) > 180) {
      this.camera.position.x += (Math.random() - 0.5) * 0.03;
      this.camera.position.y += (Math.random() - 0.5) * 0.02;
    }

    // Dynamic FOV
    if (mode !== 1) {
      const targetFov = baseFov + speedFactor * 12 + (nitro ? 5 : 0);
      this.camera.fov += (targetFov - this.camera.fov) * 0.05;
      this.camera.updateProjectionMatrix();
    }
  }

  snapCamera(position, rotation) {
    this._camPos.set(
      position.x - Math.sin(rotation) * 12,
      position.y + 5,
      position.z - Math.cos(rotation) * 12
    );
    this._camLookAt.set(position.x, position.y + 0.5, position.z);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLookAt);
    this._camInitialized = true;
  }

  applySettings(data) {
    this.renderer.toneMappingExposure = data.brightness;
    this.camera.fov = data.fov;
    this.renderer.shadowMap.enabled = data.shadows;
    this.camera.far = data.drawDistance;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog) {
      this.scene.fog.near = data.drawDistance * 0.4;
      this.scene.fog.far = data.drawDistance;
    }
  }
}
