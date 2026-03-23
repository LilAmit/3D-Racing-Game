// World — track, terrain, buildings, trees, coins, ramps, lighting, collisions

import * as THREE from 'three';

const WORLD_SIZE = 3200;
const ROAD_WIDTH = 16;

const ROADS = [
  // Main cross roads
  { points: [[-WORLD_SIZE / 2, 0], [WORLD_SIZE / 2, 0]], width: ROAD_WIDTH },
  { points: [[0, -WORLD_SIZE / 2], [0, WORLD_SIZE / 2]], width: ROAD_WIDTH },
  // Diagonals
  { points: [[-1000, -1000], [1000, 1000]], width: ROAD_WIDTH * 0.8 },
  { points: [[-1000, 1000], [1000, -1000]], width: ROAD_WIDTH * 0.8 },
  // Inner loop
  { points: [[-200, -200], [200, -200], [200, 200], [-200, 200], [-200, -200]], width: ROAD_WIDTH, loop: true },
  // Mid loop
  { points: [[-500, -500], [500, -500], [500, 500], [-500, 500], [-500, -500]], width: ROAD_WIDTH * 0.9, loop: true },
  // Outer loop
  { points: [[-900, -900], [900, -900], [900, 900], [-900, 900], [-900, -900]], width: ROAD_WIDTH * 0.8, loop: true },
  // Far outer loop
  { points: [[-1300, -1300], [1300, -1300], [1300, 1300], [-1300, 1300], [-1300, -1300]], width: ROAD_WIDTH * 0.7, loop: true },
  // Inner grid roads
  { points: [[-300, -150], [300, -150]], width: 10 },
  { points: [[-300, 150], [300, 150]], width: 10 },
  { points: [[-150, -300], [-150, 300]], width: 10 },
  { points: [[150, -300], [150, 300]], width: 10 },
  // Connector roads
  { points: [[-900, -400], [-500, -500]], width: ROAD_WIDTH },
  { points: [[500, -500], [900, -400]], width: ROAD_WIDTH },
  { points: [[500, 500], [900, 400]], width: ROAD_WIDTH },
  { points: [[-500, 500], [-900, 400]], width: ROAD_WIDTH },
  // Outer straight roads
  { points: [[-1100, 0], [-1100, -900]], width: 10 },
  { points: [[1100, 0], [1100, 900]], width: 10 },
  // Winding roads
  { points: [[700, -300], [850, -450], [750, -650], [900, -800]], width: 10 },
  { points: [[-700, 300], [-850, 450], [-750, 650], [-900, 800]], width: 10 },
  // Extra ring roads
  { points: [[-600, 0], [-500, -300], [-200, -500], [200, -500], [500, -300], [600, 0]], width: 10 },
  { points: [[600, 0], [500, 300], [200, 500], [-200, 500], [-500, 300], [-600, 0]], width: 10 },
  // Far connector roads
  { points: [[900, 0], [1300, 0]], width: 10 },
  { points: [[-900, 0], [-1300, 0]], width: 10 },
  { points: [[0, 900], [0, 1300]], width: 10 },
  { points: [[0, -900], [0, -1300]], width: 10 },
];

export const TRACKS = {
  circuit: {
    name: 'City Circuit',
    checkpoints: [
      { x: 200, z: -200, radius: 18 },
      { x: 200, z: 200, radius: 18 },
      { x: -200, z: 200, radius: 18 },
      { x: -200, z: -200, radius: 18 },
    ],
    startPos: { x: 0, z: -200 },
    startAngle: 0,
  },
  highway: {
    name: 'Highway Sprint',
    checkpoints: [
      { x: 200, z: 0, radius: 18 },
      { x: 500, z: -300, radius: 20 },
      { x: 500, z: -500, radius: 20 },
      { x: 200, z: -500, radius: 20 },
      { x: 0, z: -500, radius: 20 },
      { x: -200, z: -200, radius: 18 },
      { x: -200, z: 0, radius: 18 },
    ],
    startPos: { x: 0, z: 0 },
    startAngle: 0,
  },
  mountain: {
    name: 'Mountain Pass',
    checkpoints: [
      { x: -200, z: -150, radius: 18 },
      { x: -500, z: -500, radius: 22 },
      { x: -100, z: -500, radius: 22 },
      { x: 150, z: -300, radius: 18 },
      { x: 500, z: -150, radius: 22 },
      { x: 300, z: 150, radius: 18 },
      { x: 0, z: 200, radius: 18 },
      { x: -200, z: 100, radius: 18 },
    ],
    startPos: { x: -200, z: 0 },
    startAngle: -Math.PI / 2,
  },
  // Dedicated race-only oval track
  racetrack: {
    name: 'Speedway Oval',
    checkpoints: [
      { x: 400, z: 0, radius: 25 },
      { x: 200, z: -350, radius: 25 },
      { x: -200, z: -350, radius: 25 },
      { x: -400, z: 0, radius: 25 },
      { x: -200, z: 350, radius: 25 },
      { x: 200, z: 350, radius: 25 },
    ],
    startPos: { x: 350, z: 50 },
    startAngle: -Math.PI / 2,
    dedicated: true, // flag: this track has its own built geometry
  },
  grandprix: {
    name: 'Grand Prix Circuit',
    checkpoints: [
      { x: 500, z: 0, radius: 22 },
      { x: 700, z: -400, radius: 22 },
      { x: 300, z: -700, radius: 22 },
      { x: -200, z: -600, radius: 22 },
      { x: -600, z: -300, radius: 22 },
      { x: -600, z: 200, radius: 22 },
      { x: -200, z: 500, radius: 22 },
      { x: 300, z: 400, radius: 22 },
    ],
    startPos: { x: 400, z: 100 },
    startAngle: 0,
    dedicated: true,
  },
};

export const SPAWN_POS = { x: 30, z: 0 };
export const SPAWN_ANGLE = 0;

function isOnRoad(px, pz, margin = 14) {
  for (const road of ROADS) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const [x1, z1] = road.points[i];
      const [x2, z2] = road.points[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len2 = dx * dx + dz * dz;
      let t = ((px - x1) * dx + (pz - z1) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const closestX = x1 + t * dx;
      const closestZ = z1 + t * dz;
      const dist = Math.sqrt((px - closestX) ** 2 + (pz - closestZ) ** 2);
      if (dist < road.width / 2 + margin) return true;
    }
  }
  return false;
}

// Build a gold coin mesh with dollar sign
function buildCoinMesh() {
  const group = new THREE.Group();

  // Coin body — cylinder
  const coinGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.12, 32);
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xcc8800,
    emissiveIntensity: 0.3,
    metalness: 0.95,
    roughness: 0.15,
  });
  const coinBody = new THREE.Mesh(coinGeo, coinMat);
  group.add(coinBody);

  // Rim ring
  const rimGeo = new THREE.TorusGeometry(0.7, 0.04, 8, 32);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.9, roughness: 0.2 });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // Dollar sign — built from thin boxes
  const signMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, metalness: 0.7, roughness: 0.3 });

  // S shape — approximate with 3 curved segments using boxes
  // Top curve
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.08), signMat);
  s1.position.set(0.02, 0.07, 0.16);
  group.add(s1);
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.14), signMat);
  s2.position.set(-0.12, 0.07, 0.1);
  group.add(s2);
  // Middle bar
  const s3 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.08), signMat);
  s3.position.set(0, 0.07, 0.0);
  group.add(s3);
  // Bottom curve
  const s4 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.14), signMat);
  s4.position.set(0.12, 0.07, -0.08);
  group.add(s4);
  const s5 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.08), signMat);
  s5.position.set(-0.02, 0.07, -0.16);
  group.add(s5);
  // Vertical line through S
  const sLine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.48), signMat);
  sLine.position.set(0, 0.07, 0);
  group.add(sLine);

  // Duplicate dollar sign on other side
  [s1, s2, s3, s4, s5, sLine].forEach(m => {
    const clone = m.clone();
    clone.position.y = -0.07;
    group.add(clone);
  });

  // The coin rotates on Z axis (standing upright, spinning)
  group.rotation.x = Math.PI / 2;
  return group;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.trees = [];
    this.coins = [];
    this.ramps = [];
    this.checkpointMeshes = [];
    this.raceTrackMeshes = [];
    this.sun = null;
    this.colliders = [];

    this._build();
    this._buildColliders();
  }

  _build() {
    const scene = this.scene;

    // ── Ground — FLAT plane, below road level so grass never covers roads ──
    const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
      color: 0x3a7d3a, roughness: 0.9,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1; // Grass sits BELOW road surface (y=0.05)
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Roads ──
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.75 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });

    ROADS.forEach(road => {
      for (let i = 0; i < road.points.length - 1; i++) {
        const [x1, z1] = road.points[i];
        const [x2, z2] = road.points[i + 1];
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dx, dz);

        const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(road.width, len), roadMat);
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.rotation.z = -angle;
        roadMesh.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
        roadMesh.receiveShadow = true;
        scene.add(roadMesh);

        const dashCount = Math.floor(len / 8);
        for (let d = 0; d < dashCount; d++) {
          const t = (d + 0.3) / dashCount;
          const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), lineMat);
          line.rotation.x = -Math.PI / 2;
          line.rotation.z = -angle;
          line.position.set(x1 + dx * t, 0.06, z1 + dz * t);
          scene.add(line);
        }

        [-1, 1].forEach(side => {
          const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, len), curbMat);
          const perpX = -Math.sin(angle + Math.PI / 2) * (road.width / 2);
          const perpZ = -Math.cos(angle + Math.PI / 2) * (road.width / 2);
          curb.position.set((x1 + x2) / 2 + perpX * side, 0.08, (z1 + z2) / 2 + perpZ * side);
          curb.rotation.y = angle;
          scene.add(curb);
        });
      }
    });

    // ── Road intersections — fill in corners so no grass peeks through ──
    const intersectionMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.75 });
    // Cover major intersection areas
    const intersections = [
      { x: 0, z: 0, size: 20 },
      { x: 200, z: -200, size: 18 }, { x: -200, z: -200, size: 18 },
      { x: 200, z: 200, size: 18 }, { x: -200, z: 200, size: 18 },
      { x: 500, z: -500, size: 18 }, { x: -500, z: -500, size: 18 },
      { x: 500, z: 500, size: 18 }, { x: -500, z: 500, size: 18 },
      { x: 900, z: -900, size: 16 }, { x: -900, z: -900, size: 16 },
      { x: 900, z: 900, size: 16 }, { x: -900, z: 900, size: 16 },
      { x: 900, z: 0, size: 14 }, { x: -900, z: 0, size: 14 },
      { x: 0, z: 900, size: 14 }, { x: 0, z: -900, size: 14 },
    ];
    intersections.forEach(({ x, z, size }) => {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(size, size), intersectionMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, 0.051, z);
      scene.add(patch);
    });

    // ── Buildings ──
    const buildingColors = [0x8899aa, 0x99aabb, 0x778899, 0x667788, 0xaabbcc, 0x556677, 0x889988, 0x998877];
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffff88, emissiveIntensity: 0.15 });
    const buildingPositions = [];

    for (let bx = -16; bx <= 16; bx++) {
      for (let bz = -16; bz <= 16; bz++) {
        const dist = Math.sqrt(bx * bx + bz * bz);
        if (dist > 14 && Math.random() > 0.4) continue;
        const cx = bx * 80 + (Math.random() - 0.5) * 35;
        const cz = bz * 80 + (Math.random() - 0.5) * 35;
        if (Math.abs(cx) < 25 && Math.abs(cz) < 25) continue;
        if (isOnRoad(cx, cz, 14)) continue;

        const distFromCenter = Math.sqrt(cx * cx + cz * cz);
        const maxH = distFromCenter < 300 ? 50 : (distFromCenter < 600 ? 35 : 20);
        const w = 8 + Math.random() * 14;
        const h = 8 + Math.random() * maxH;
        const d = 8 + Math.random() * 14;

        const color = buildingColors[Math.floor(Math.random() * buildingColors.length)];
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
        );
        building.position.set(cx, h / 2, cz);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        this.buildings.push({ mesh: building, x: cx, z: cz, w, d, h });
        buildingPositions.push({ x: cx, z: cz, w, d });

        // Windows
        const windowRows = Math.floor(h / 4);
        const windowCols = Math.floor(w / 3);
        for (let wr = 0; wr < windowRows; wr++) {
          for (let wc = 0; wc < windowCols; wc++) {
            if (Math.random() > 0.55) continue;
            const winMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), windowMat);
            winMesh.position.set(cx - w / 2 + (wc + 0.5) * (w / windowCols), 2 + wr * 4, cz + d / 2 + 0.01);
            scene.add(winMesh);
            if (Math.random() > 0.5) {
              const winSide = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), windowMat);
              winSide.position.set(cx + w / 2 + 0.01, 2 + wr * 4, cz - d / 2 + (wc + 0.5) * (d / windowCols));
              winSide.rotation.y = Math.PI / 2;
              scene.add(winSide);
            }
          }
        }
      }
    }

    // ── Trees ──
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x664422 });
    const leafColors = [0x228833, 0x33aa44, 0x44bb55, 0x227722, 0x1a6625];

    for (let i = 0; i < 700; i++) {
      const tx = (Math.random() - 0.5) * WORLD_SIZE * 0.92;
      const tz = (Math.random() - 0.5) * WORLD_SIZE * 0.92;
      if (isOnRoad(tx, tz, 10)) continue;
      if (Math.abs(tx) < 20 && Math.abs(tz) < 20) continue;
      let nearBuilding = false;
      for (const b of buildingPositions) {
        if (Math.abs(tx - b.x) < b.w / 2 + 4 && Math.abs(tz - b.z) < b.d / 2 + 4) { nearBuilding = true; break; }
      }
      if (nearBuilding) continue;

      const treeGroup = new THREE.Group();
      const trunkH = 2 + Math.random() * 3;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, trunkH, 6), trunkMat);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
      const leafSize = 1.5 + Math.random() * 2.5;
      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(leafSize, 7, 7),
        new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8 })
      );
      leaves.position.y = trunkH + leafSize * 0.4;
      leaves.castShadow = true;
      treeGroup.add(leaves);
      treeGroup.position.set(tx, -0.1, tz); // Trees sit on the grass level
      scene.add(treeGroup);
      this.trees.push({ mesh: treeGroup, x: tx, z: tz, radius: leafSize });
    }

    // ── Ramps ──
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xcc8833, roughness: 0.6, metalness: 0.3 });
    const rampPositions = [
      { x: 80, z: 0, rotY: 0 },
      { x: -80, z: 0, rotY: Math.PI },
      { x: 0, z: 80, rotY: Math.PI / 2 },
      { x: 0, z: -80, rotY: -Math.PI / 2 },
      { x: 250, z: 0, rotY: 0 },
      { x: -250, z: 0, rotY: Math.PI },
      { x: 0, z: 250, rotY: Math.PI / 2 },
      { x: 0, z: -250, rotY: -Math.PI / 2 },
      { x: 500, z: 0, rotY: 0 },
      { x: -500, z: 0, rotY: Math.PI },
      { x: 0, z: 500, rotY: Math.PI / 2 },
      { x: 0, z: -500, rotY: -Math.PI / 2 },
      { x: 900, z: 0, rotY: 0 },
      { x: -900, z: 0, rotY: Math.PI },
    ];

    rampPositions.forEach(rp => {
      const rampW = 8, rampD = 12, rampH = 2.5;
      const hw = rampW / 2, hd = rampD / 2;

      const rampGeo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,
        -hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
        -hw, 0, -hd,  hw, 0, -hd,  hw, rampH, hd,
        -hw, 0, -hd,  hw, rampH, hd,  -hw, rampH, hd,
        -hw, 0, -hd,  -hw, 0, hd,  -hw, rampH, hd,
        hw, 0, -hd,  hw, rampH, hd,  hw, 0, hd,
        -hw, 0, hd,  hw, 0, hd,  hw, rampH, hd,
        -hw, 0, hd,  hw, rampH, hd,  -hw, rampH, hd,
      ]);
      rampGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      rampGeo.computeVertexNormals();

      const rampMesh = new THREE.Mesh(rampGeo, rampMat);
      rampMesh.position.set(rp.x, 0, rp.z);
      rampMesh.rotation.y = rp.rotY;
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      scene.add(rampMesh);

      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.2 });
      [-1, 1].forEach(side => {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, rampH * 0.6, rampD * 0.8), stripeMat);
        stripe.position.set(rp.x + Math.cos(rp.rotY) * side * hw, rampH * 0.35, rp.z + Math.sin(rp.rotY) * side * hw);
        stripe.rotation.y = rp.rotY;
        scene.add(stripe);
      });

      this.ramps.push({ x: rp.x, z: rp.z, w: rampW, d: rampD, h: rampH, rotY: rp.rotY });
    });

    // ── Street lights ──
    const lightBulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (let i = -1400; i <= 1400; i += 50) {
      [{ x: i, z: 10 }, { x: i, z: -10 }, { x: 10, z: i }, { x: -10, z: i }].forEach(pos => {
        if (Math.abs(pos.x) < 15 && Math.abs(pos.z) < 15) return;
        if (Math.abs(pos.x) > 1400 || Math.abs(pos.z) > 1400) return;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 4), poleMat);
        pole.position.set(pos.x, 3.5, pos.z);
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), lightBulbMat);
        lamp.position.set(pos.x, 7, pos.z);
        scene.add(lamp);
      });
    }

    // ── Coins — gold round coins with $ sign ──
    for (let i = 0; i < 350; i++) {
      let cx, cz;
      if (i < 200) {
        const road = ROADS[Math.floor(Math.random() * ROADS.length)];
        const segIdx = Math.floor(Math.random() * (road.points.length - 1));
        const t = Math.random();
        cx = road.points[segIdx][0] + (road.points[segIdx + 1][0] - road.points[segIdx][0]) * t;
        cz = road.points[segIdx][1] + (road.points[segIdx + 1][1] - road.points[segIdx][1]) * t;
        cx += (Math.random() - 0.5) * road.width * 0.5;
        cz += (Math.random() - 0.5) * road.width * 0.5;
      } else {
        cx = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
        cz = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
      }
      const coin = buildCoinMesh();
      coin.position.set(cx, 1.5, cz);
      coin.userData.collected = false;
      scene.add(coin);
      this.coins.push(coin);
    }

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0x7799bb, 0.7));

    this.sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    this.sun.position.set(100, 150, 80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.left = -250;
    this.sun.shadow.camera.right = 250;
    this.sun.shadow.camera.top = 250;
    this.sun.shadow.camera.bottom = -250;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.001;
    scene.add(this.sun);

    scene.add(new THREE.HemisphereLight(0x88bbff, 0x445522, 0.5));
    scene.fog = new THREE.Fog(0x88bbdd, 500, 1500);
    scene.background = new THREE.Color(0x88bbdd);
  }

  _buildColliders() {
    this.colliders = [];
    this.buildings.forEach(b => {
      this.colliders.push({ x: b.x, z: b.z, hw: b.w / 2 + 0.5, hd: b.d / 2 + 0.5, type: 'box' });
    });
    this.trees.forEach(t => {
      this.colliders.push({ x: t.x, z: t.z, radius: 0.5, type: 'circle' });
    });
  }

  updateSunPosition(playerPos) {
    if (this.sun) {
      this.sun.position.set(playerPos.x + 100, 150, playerPos.z + 80);
      this.sun.target.position.copy(playerPos);
      this.sun.target.updateMatrixWorld();
    }
  }

  // Build dedicated race track geometry
  buildRaceTrack(trackId) {
    this.removeRaceTrack();
    const track = TRACKS[trackId];
    if (!track || !track.dedicated) return;

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff0000, emissiveIntensity: 0.2 });
    const whiteBarrierMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const cps = track.checkpoints;
    const trackWidth = 24;

    // Build road segments between checkpoints in a loop
    for (let i = 0; i < cps.length; i++) {
      const a = cps[i];
      const b = cps[(i + 1) % cps.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);

      // Road surface
      const road = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth, len + trackWidth), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -angle;
      road.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
      road.receiveShadow = true;
      this.scene.add(road);
      this.raceTrackMeshes.push(road);

      // Barriers
      [-1, 1].forEach(side => {
        const barrier = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.2, len + trackWidth),
          (Math.floor(i + (side > 0 ? 0 : 1)) % 2 === 0) ? barrierMat : whiteBarrierMat
        );
        const perpX = -Math.sin(angle + Math.PI / 2) * (trackWidth / 2);
        const perpZ = -Math.cos(angle + Math.PI / 2) * (trackWidth / 2);
        barrier.position.set(
          (a.x + b.x) / 2 + perpX * side,
          0.6,
          (a.z + b.z) / 2 + perpZ * side
        );
        barrier.rotation.y = angle;
        this.scene.add(barrier);
        this.raceTrackMeshes.push(barrier);

        // Add as collider
        this.colliders.push({
          x: barrier.position.x,
          z: barrier.position.z,
          hw: 0.5,
          hd: (len + trackWidth) / 2,
          type: 'box',
          raceTrack: true, // flag for cleanup
        });
      });
    }

    // Start/finish line
    const startLine = new THREE.Mesh(
      new THREE.PlaneGeometry(trackWidth, 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    startLine.rotation.x = -Math.PI / 2;
    const sa = cps[0], sb = cps[1];
    const sAngle = Math.atan2(sb.x - sa.x, sb.z - sa.z);
    startLine.rotation.z = -sAngle;
    startLine.position.set(sa.x, 0.07, sa.z);
    this.scene.add(startLine);
    this.raceTrackMeshes.push(startLine);

    // Checkerboard pattern on start line
    const checkerMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (let c = 0; c < 8; c++) {
      if (c % 2 === 0) {
        const sq = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth / 8, 1), checkerMat);
        sq.rotation.x = -Math.PI / 2;
        sq.rotation.z = -sAngle;
        const offset = (c - 3.5) * (trackWidth / 8);
        sq.position.set(
          sa.x + Math.cos(sAngle) * offset,
          0.071,
          sa.z - Math.sin(sAngle) * offset
        );
        this.scene.add(sq);
        this.raceTrackMeshes.push(sq);
      }
    }
  }

  removeRaceTrack() {
    this.raceTrackMeshes.forEach(m => this.scene.remove(m));
    this.raceTrackMeshes = [];
    this.colliders = this.colliders.filter(c => !c.raceTrack);
  }

  addCheckpoints(track) {
    this.removeCheckpoints();
    const ringGeo = new THREE.TorusGeometry(track.checkpoints[0].radius * 0.6, 0.5, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff44, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 });
    const startMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffcc00, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 });

    track.checkpoints.forEach((cp, i) => {
      const ring = new THREE.Mesh(ringGeo, i === 0 ? startMat : ringMat);
      ring.position.set(cp.x, 4, cp.z);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
      this.checkpointMeshes.push(ring);
    });
  }

  removeCheckpoints() {
    this.checkpointMeshes.forEach(m => this.scene.remove(m));
    this.checkpointMeshes = [];
  }

  getRoadsData() {
    return [
      [[-1600, 0], [1600, 0]],
      [[0, -1600], [0, 1600]],
      [[-200, -200], [200, -200], [200, 200], [-200, 200], [-200, -200]],
      [[-500, -500], [500, -500], [500, 500], [-500, 500], [-500, -500]],
      [[-900, -900], [900, -900], [900, 900], [-900, 900], [-900, -900]],
      [[-1300, -1300], [1300, -1300], [1300, 1300], [-1300, 1300], [-1300, -1300]],
    ];
  }
}
