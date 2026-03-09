// Car definitions, mesh builder, and garage/shop system

import * as THREE from 'three';

export const CAR_DEFS = [
  { id: 'starter', name: 'Rookie RS', price: 0, color: 0x3388ff, accentColor: 0xffffff, speed: 140, acceleration: 7, handling: 7, braking: 6, bodyStyle: 'gt' },
  { id: 'sport', name: 'Viper GT3', price: 500, color: 0xff2222, accentColor: 0x111111, speed: 180, acceleration: 9, handling: 8, braking: 7, bodyStyle: 'gt' },
  { id: 'muscle', name: 'Thunder V8', price: 800, color: 0xff8800, accentColor: 0x222222, speed: 200, acceleration: 10, handling: 5, braking: 6, bodyStyle: 'muscle' },
  { id: 'drift', name: 'Drift Phantom', price: 1200, color: 0x00ff88, accentColor: 0x000000, speed: 170, acceleration: 7, handling: 10, braking: 8, bodyStyle: 'drift' },
  { id: 'super', name: 'Zenith LMP', price: 2500, color: 0xffcc00, accentColor: 0x333333, speed: 240, acceleration: 10, handling: 9, braking: 9, bodyStyle: 'prototype' },
  { id: 'hyper', name: 'Hyperion F1', price: 5000, color: 0x8800ff, accentColor: 0x00ffcc, speed: 280, acceleration: 10, handling: 10, braking: 10, bodyStyle: 'formula' },
];

export function buildCarMesh(def) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.7, roughness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: def.accentColor || 0x222222, metalness: 0.5, roughness: 0.3 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.4 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 0.5 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 });

  const s = def.bodyStyle;

  let bodyW, bodyH, bodyL, cabinH, cabinL, cabinZ, wheelR, wheelW, fenderH;
  if (s === 'formula') {
    bodyW = 1.4; bodyH = 0.25; bodyL = 4.8; cabinH = 0.35; cabinL = 1.0; cabinZ = -0.4; wheelR = 0.34; wheelW = 0.28; fenderH = 0.1;
  } else if (s === 'prototype') {
    bodyW = 1.9; bodyH = 0.3; bodyL = 4.6; cabinH = 0.35; cabinL = 1.2; cabinZ = -0.2; wheelR = 0.33; wheelW = 0.26; fenderH = 0.12;
  } else if (s === 'muscle') {
    bodyW = 1.95; bodyH = 0.4; bodyL = 4.7; cabinH = 0.42; cabinL = 1.5; cabinZ = -0.3; wheelR = 0.35; wheelW = 0.3; fenderH = 0.15;
  } else if (s === 'drift') {
    bodyW = 1.8; bodyH = 0.35; bodyL = 4.4; cabinH = 0.38; cabinL = 1.3; cabinZ = -0.2; wheelR = 0.32; wheelW = 0.24; fenderH = 0.12;
  } else {
    bodyW = 1.85; bodyH = 0.35; bodyL = 4.5; cabinH = 0.4; cabinL = 1.4; cabinZ = -0.15; wheelR = 0.33; wheelW = 0.24; fenderH = 0.12;
  }

  const baseY = 0.35;

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
  body.position.y = baseY;
  body.castShadow = true;
  group.add(body);

  // Front nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.85, bodyH * 0.6, 0.8), bodyMat);
  nose.position.set(0, baseY - bodyH * 0.15, bodyL / 2 + 0.35);
  nose.castShadow = true;
  group.add(nose);

  // Front splitter
  group.add(new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.3, 0.04, 0.5), carbonMat).translateY(baseY - bodyH / 2).translateZ(bodyL / 2 + 0.2));

  // Side skirts
  [-1, 1].forEach(side => {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, fenderH, bodyL * 0.7), carbonMat);
    skirt.position.set(side * (bodyW / 2 + 0.04), baseY - bodyH / 2 + fenderH / 2, 0);
    group.add(skirt);
  });

  // Rear diffuser
  group.add(new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, 0.12, 0.4), carbonMat).translateY(baseY - bodyH / 2 + 0.06).translateZ(-bodyL / 2 - 0.1));

  // Cabin / cockpit
  if (s === 'formula') {
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.6, cabinH, cabinL * 0.7), carbonMat);
    cockpit.position.set(0, baseY + bodyH / 2 + cabinH / 2, cabinZ);
    cockpit.castShadow = true;
    group.add(cockpit);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 8, 16, Math.PI), carbonMat);
    halo.position.set(0, baseY + bodyH / 2 + cabinH, cabinZ + cabinL * 0.2);
    halo.rotation.x = Math.PI / 2;
    halo.rotation.z = Math.PI;
    group.add(halo);
  } else {
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(bodyW - 0.3, cabinH, cabinL), glassMat);
    windshield.position.set(0, baseY + bodyH / 2 + cabinH / 2, cabinZ);
    windshield.castShadow = true;
    group.add(windshield);
    if (s === 'muscle' || s === 'gt') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.3), accentMat).translateY(baseY + bodyH / 2 + cabinH + 0.04).translateZ(cabinZ + cabinL / 2 - 0.2));
    }
  }

  // Fenders
  const fenderW = 0.15;
  const wheelZ_f = 1.3, wheelZ_r = -1.3;
  [-1, 1].forEach(side => {
    const ff = new THREE.Mesh(new THREE.BoxGeometry(fenderW, bodyH + fenderH, 1.0), bodyMat);
    ff.position.set(side * (bodyW / 2 + fenderW / 2), baseY + fenderH / 2, wheelZ_f);
    ff.castShadow = true;
    group.add(ff);
    const rfw = s === 'formula' ? fenderW * 1.5 : fenderW;
    const rf = new THREE.Mesh(new THREE.BoxGeometry(rfw, bodyH + fenderH, 1.0), bodyMat);
    rf.position.set(side * (bodyW / 2 + rfw / 2), baseY + fenderH / 2, wheelZ_r);
    rf.castShadow = true;
    group.add(rf);
  });

  // Racing stripe
  if (s !== 'formula') {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, bodyL + 0.6), accentMat).translateY(baseY + bodyH / 2 + 0.01).translateZ(0.1));
  }

  // Number decals
  [-1, 1].forEach(side => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.25, 0.8), accentMat).translateX(side * (bodyW / 2 + 0.01)).translateY(baseY + 0.05).translateZ(0.3));
  });

  // Wheels
  const wheelPositions = [
    [-bodyW / 2 - fenderW, wheelR, wheelZ_f],
    [bodyW / 2 + fenderW, wheelR, wheelZ_f],
    [-bodyW / 2 - fenderW, wheelR, wheelZ_r],
    [bodyW / 2 + fenderW, wheelR, wheelZ_r],
  ];

  const wheels = [];
  wheelPositions.forEach(([x, y, z]) => {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20), tireMat);
    tire.rotation.z = Math.PI / 2;
    wheelGroup.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelW + 0.01, wheelR * 0.9, 0.04), rimMat);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.x = (i / 5) * Math.PI;
      wheelGroup.add(spoke);
    }
    wheelGroup.position.set(x, y, z);
    wheelGroup.castShadow = true;
    group.add(wheelGroup);
    wheels.push(wheelGroup);
  });

  // Headlights
  [-0.5, 0.5].forEach(x => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.04), lightMat).translateX(x).translateY(baseY + 0.05).translateZ(bodyL / 2 + 0.7));
  });

  // Tail lights
  group.add(new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.8, 0.06, 0.04), tailMat).translateY(baseY + bodyH * 0.3).translateZ(-bodyL / 2 - 0.01));
  [-0.7, 0.7].forEach(x => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), tailMat).translateX(x).translateY(baseY + 0.05).translateZ(-bodyL / 2 - 0.01));
  });

  // Exhaust pipes
  const exhaustCount = s === 'muscle' ? 4 : 2;
  const exhaustSpacing = s === 'muscle' ? 0.2 : 0.35;
  for (let i = 0; i < exhaustCount; i++) {
    const xOff = (i - (exhaustCount - 1) / 2) * exhaustSpacing;
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 8), carbonMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(xOff, baseY - bodyH / 4, -bodyL / 2 - 0.2);
    group.add(exhaust);
  }

  // Spoiler / Wing
  if (s === 'formula' || s === 'prototype') {
    const wingW = s === 'formula' ? bodyW + 0.8 : bodyW + 0.4;
    const wingY = baseY + bodyH + cabinH + 0.25;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.04, 0.35), carbonMat).translateY(wingY).translateZ(-bodyL / 2 + 0.2));
    [-wingW / 2, wingW / 2].forEach(x => {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.4), carbonMat).translateX(x).translateY(wingY - 0.08).translateZ(-bodyL / 2 + 0.2));
    });
    [-0.4, 0.4].forEach(x => {
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), carbonMat).translateX(x).translateY(wingY - 0.18).translateZ(-bodyL / 2 + 0.2));
    });
    if (s === 'formula') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.6, 0.03, 0.25), carbonMat).translateY(baseY - bodyH / 2 + 0.03).translateZ(bodyL / 2 + 0.6));
      [-0.8, 0.8].forEach(x => {
        group.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.3), carbonMat).translateX(x).translateY(baseY - bodyH / 2 + 0.08).translateZ(bodyL / 2 + 0.6));
      });
    }
  } else {
    const spoilerW = s === 'drift' ? bodyW + 0.3 : bodyW + 0.1;
    const spoilerY = baseY + bodyH / 2 + cabinH + 0.15;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(spoilerW, 0.04, 0.25), carbonMat).translateY(spoilerY).translateZ(-bodyL / 2 + 0.3));
    [-0.5, 0.5].forEach(x => {
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), carbonMat).translateX(x).translateY(spoilerY - 0.12).translateZ(-bodyL / 2 + 0.3));
    });
  }

  // Side mirrors
  if (s !== 'formula') {
    [-1, 1].forEach(side => {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), carbonMat).translateX(side * (bodyW / 2 + 0.12)).translateY(baseY + bodyH / 2 + cabinH * 0.3).translateZ(cabinZ + cabinL / 2 + 0.1));
    });
  }

  // Hood vent
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), carbonMat).translateY(baseY + bodyH / 2 + 0.03).translateZ(bodyL / 4));

  group.userData.wheels = wheels;
  return group;
}

// Garage/shop manager
class GarageManager {
  constructor() {
    this.coins = parseInt(localStorage.getItem('racing_coins') || '0');
    this.owned = JSON.parse(localStorage.getItem('racing_owned_cars') || '["starter"]');
    this.selected = localStorage.getItem('racing_selected_car') || 'starter';
  }

  save() {
    localStorage.setItem('racing_coins', this.coins.toString());
    localStorage.setItem('racing_owned_cars', JSON.stringify(this.owned));
    localStorage.setItem('racing_selected_car', this.selected);
  }

  addCoins(amount) {
    this.coins += amount;
    this.save();
    this.updateUI();
  }

  buyCar(carId) {
    const def = CAR_DEFS.find(c => c.id === carId);
    if (!def || this.owned.includes(carId) || this.coins < def.price) return false;
    this.coins -= def.price;
    this.owned.push(carId);
    this.selected = carId;
    this.save();
    return true;
  }

  selectCar(carId) {
    if (this.owned.includes(carId)) {
      this.selected = carId;
      this.save();
    }
  }

  getSelectedDef() {
    return CAR_DEFS.find(c => c.id === this.selected) || CAR_DEFS[0];
  }

  updateUI() {
    const menuCoins = document.getElementById('menuCoins');
    const hudCoins = document.getElementById('hudCoins');
    if (menuCoins) menuCoins.textContent = this.coins;
    if (hudCoins) hudCoins.textContent = this.coins;
  }

  renderGarage() {
    const grid = document.getElementById('carGrid');
    grid.innerHTML = '';
    CAR_DEFS.forEach(def => {
      const owned = this.owned.includes(def.id);
      const selected = this.selected === def.id;
      const card = document.createElement('div');
      card.className = `car-card ${selected ? 'selected' : ''} ${!owned ? 'locked' : ''}`;

      const color = '#' + def.color.toString(16).padStart(6, '0');
      card.innerHTML = `
        <div class="car-preview" style="background: linear-gradient(135deg, ${color}, ${color}88); border: 2px solid ${color}"></div>
        <div class="car-name">${def.name}</div>
        <div class="car-price">${owned ? (selected ? '\u2713 Selected' : 'Owned') : '\ud83e\ude99 ' + def.price}</div>
        <div class="car-stats">
          <div class="stat-bar"><label>Speed</label><div class="bar"><div class="bar-fill" style="width: ${def.speed / 2.6}%"></div></div></div>
          <div class="stat-bar"><label>Accel</label><div class="bar"><div class="bar-fill" style="width: ${def.acceleration * 10}%"></div></div></div>
          <div class="stat-bar"><label>Handle</label><div class="bar"><div class="bar-fill" style="width: ${def.handling * 10}%"></div></div></div>
          <div class="stat-bar"><label>Brake</label><div class="bar"><div class="bar-fill" style="width: ${def.braking * 10}%"></div></div></div>
        </div>
      `;

      card.addEventListener('click', () => {
        if (owned) {
          this.selectCar(def.id);
        } else if (this.coins >= def.price) {
          if (confirm(`Buy ${def.name} for \ud83e\ude99${def.price}?`)) {
            this.buyCar(def.id);
          }
        }
        this.renderGarage();
        this.updateUI();
      });

      grid.appendChild(card);
    });
  }
}

export const garage = new GarageManager();
