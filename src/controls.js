// Input handler — keyboard + mouse

import { settings } from './settings.js';

class Controls {
  constructor() {
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement !== null;
    });
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

export const controls = new Controls();
