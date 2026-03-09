// Settings manager — persists to localStorage

const DEFAULT_SETTINGS = {
  brightness: 1,
  fov: 75,
  shadows: true,
  drawDistance: 800,
  mouseSensitivity: 1,
  invertY: false,
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  keybinds: {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    brake: 'Space',
    nitro: 'ShiftLeft',
    camera: 'KeyC',
    lookBack: 'KeyV',
    horn: 'KeyH',
    reset: 'KeyR',
  },
};

const KEYBIND_LABELS = {
  forward: 'Accelerate',
  backward: 'Reverse',
  left: 'Steer Left',
  right: 'Steer Right',
  brake: 'Brake / Handbrake',
  nitro: 'Nitro Boost',
  camera: 'Change Camera',
  lookBack: 'Look Back',
  horn: 'Horn',
  reset: 'Reset Car',
};

class Settings {
  constructor() {
    this.data = { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
    this.load();
    this._listeningKey = null;
    this._listeningBtn = null;
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem('racing_settings'));
      if (saved) {
        Object.assign(this.data, saved);
        this.data.keybinds = { ...DEFAULT_SETTINGS.keybinds, ...saved.keybinds };
      }
    } catch {}
  }

  save() {
    localStorage.setItem('racing_settings', JSON.stringify(this.data));
  }

  reset() {
    this.data = { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
    this.save();
  }

  get(key) { return this.data[key]; }

  set(key, val) {
    this.data[key] = val;
    this.save();
  }

  getKeybind(action) { return this.data.keybinds[action]; }

  isKey(action, code) { return this.data.keybinds[action] === code; }

  // Initialize settings UI
  initUI(onUpdate) {
    const el = (id) => document.getElementById(id);

    // Display
    const brightness = el('setBrightness');
    const fov = el('setFOV');
    const shadows = el('setShadows');
    const drawDist = el('setDrawDist');
    const mouseSens = el('setMouseSens');
    const invertY = el('setInvertY');
    const masterVol = el('setMasterVol');
    const musicVol = el('setMusicVol');
    const sfxVol = el('setSFXVol');

    const syncUI = () => {
      brightness.value = this.data.brightness;
      el('brightnessVal').textContent = Math.round(this.data.brightness * 100) + '%';
      fov.value = this.data.fov;
      el('fovVal').textContent = this.data.fov;
      shadows.checked = this.data.shadows;
      drawDist.value = this.data.drawDistance;
      el('drawDistVal').textContent = this.data.drawDistance;
      mouseSens.value = this.data.mouseSensitivity;
      el('mouseSensVal').textContent = this.data.mouseSensitivity.toFixed(1);
      invertY.checked = this.data.invertY;
      masterVol.value = this.data.masterVolume;
      el('masterVolVal').textContent = Math.round(this.data.masterVolume * 100) + '%';
      musicVol.value = this.data.musicVolume;
      el('musicVolVal').textContent = Math.round(this.data.musicVolume * 100) + '%';
      sfxVol.value = this.data.sfxVolume;
      el('sfxVolVal').textContent = Math.round(this.data.sfxVolume * 100) + '%';
      this.renderKeybinds();
    };

    const onChange = (key, parse) => (e) => {
      this.data[key] = parse ? parse(e.target.value || e.target.checked) : e.target.value;
      this.save();
      syncUI();
      if (onUpdate) onUpdate(this.data);
    };

    brightness.addEventListener('input', onChange('brightness', parseFloat));
    fov.addEventListener('input', onChange('fov', parseInt));
    shadows.addEventListener('change', (e) => { this.data.shadows = e.target.checked; this.save(); syncUI(); if (onUpdate) onUpdate(this.data); });
    drawDist.addEventListener('input', onChange('drawDistance', parseInt));
    mouseSens.addEventListener('input', onChange('mouseSensitivity', parseFloat));
    invertY.addEventListener('change', (e) => { this.data.invertY = e.target.checked; this.save(); syncUI(); if (onUpdate) onUpdate(this.data); });
    masterVol.addEventListener('input', onChange('masterVolume', parseFloat));
    musicVol.addEventListener('input', onChange('musicVolume', parseFloat));
    sfxVol.addEventListener('input', onChange('sfxVolume', parseFloat));

    el('btnResetSettings').addEventListener('click', () => {
      this.reset();
      syncUI();
      if (onUpdate) onUpdate(this.data);
    });

    syncUI();
  }

  renderKeybinds() {
    const container = document.getElementById('keybindList');
    container.innerHTML = '';
    for (const [action, code] of Object.entries(this.data.keybinds)) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const label = document.createElement('label');
      label.textContent = KEYBIND_LABELS[action] || action;
      const btn = document.createElement('button');
      btn.className = 'keybind-btn';
      btn.textContent = this.formatKeyCode(code);
      btn.addEventListener('click', () => this.startListening(action, btn));
      row.appendChild(label);
      row.appendChild(btn);
      container.appendChild(row);
    }
  }

  formatKeyCode(code) {
    return code
      .replace('Key', '')
      .replace('Digit', '')
      .replace('Arrow', '')
      .replace('ShiftLeft', 'L-Shift')
      .replace('ShiftRight', 'R-Shift')
      .replace('ControlLeft', 'L-Ctrl')
      .replace('ControlRight', 'R-Ctrl')
      .replace('AltLeft', 'L-Alt')
      .replace('AltRight', 'R-Alt')
      .replace('Space', 'Space');
  }

  startListening(action, btn) {
    if (this._listeningBtn) {
      this._listeningBtn.classList.remove('listening');
      this._listeningBtn.textContent = this.formatKeyCode(this.data.keybinds[this._listeningKey]);
    }
    this._listeningKey = action;
    this._listeningBtn = btn;
    btn.classList.add('listening');
    btn.textContent = '...';

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        btn.classList.remove('listening');
        btn.textContent = this.formatKeyCode(this.data.keybinds[action]);
      } else {
        this.data.keybinds[action] = e.code;
        this.save();
        btn.classList.remove('listening');
        btn.textContent = this.formatKeyCode(e.code);
      }
      this._listeningKey = null;
      this._listeningBtn = null;
      window.removeEventListener('keydown', handler, true);
    };

    window.addEventListener('keydown', handler, true);
  }
}

export const settings = new Settings();
