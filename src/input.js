// InputHandler — keyboard + mouse with sticky-key prevention

import { settings } from './settings.js';

export class InputHandler {
  constructor() {
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;

    // Bind handlers so we can remove them if needed
    this._onKeyDown = (e) => { this.keys[e.code] = true; };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onBlur = () => { this.keys = {}; }; // Prevent sticky keys on focus loss
    this._onMouseMove = (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    };
    this._onPointerLockChange = () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement !== null;
      // Clear keys when pointer lock is lost to prevent sticky keys
      if (wasLocked && !this.locked) {
        this.keys = {};
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  isPressed(action) {
    return !!this.keys[settings.getKeybind(action)];
  }

  consumeMouse() {
    const sens = settings.get('mouseSensitivity');
    const invertY = settings.get('invertY');
    const dx = this.mouseDX * sens * 0.002;
    const dy = this.mouseDY * sens * 0.002 * (invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  requestPointerLock() {
    const canvas = document.getElementById('gameCanvas');
    if (canvas && !this.locked) {
      canvas.requestPointerLock();
    }
  }

  releasePointerLock() {
    if (this.locked) {
      document.exitPointerLock();
    }
  }

  reset() {
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
