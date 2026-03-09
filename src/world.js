// Open world builder — terrain, roads, buildings, trees, coins, ramps

import * as THREE from 'three';

const WORLD_SIZE = 1600;
const ROAD_WIDTH = 14;

// Road network paths
const ROADS = [
  // Main cross roads
  { points: [[-WORLD_SIZE / 2, 0], [WORLD_SIZE / 2, 0]], width: ROAD_WIDTH },
  { points: [[0, -WORLD_SIZE / 2], [0, WORLD_SIZE / 2]], width: ROAD_WIDTH },
  // Diagonals
  { points: [[-500, -500], [500, 500]], width: ROAD_WIDTH * 0.8 },
  { points: [[-500, 500], [500, -500]], width: ROAD_WIDTH * 0.8 },
  // Inner ring road
  { points: [[-200, -200], [200, -200], [200, 200], [-200, 200], [-200, -200]], width: ROAD_WIDTH, loop: true },
  // Middle ring
  { points: [[-400, -400], [400, -400], [400, 400], [-400, 400], [-400, -400]], width: ROAD_WIDTH * 0.85, loop: true },
  // Outer ring
  { points: [[-650, -650], [650, -650], [650, 650], [-650, 650], [-650, -650]], width: ROAD_WIDTH * 0.7, loop: true },
  // Extra city streets
  { points: [[-300, -150], [300, -150]], width: 10 },
  { points: [[-300, 150], [300, 150]], width: 10 },
  { points: [[-150, -300], [-150, 300]], width: 10 },
  { points: [[150, -300], [150, 300]], width: 10 },
  // Highway strips
  { points: [[-700, -300], [-400, -400]], width: ROAD_WIDTH },
  { points: [[400, -400], [700, -300]], width: ROAD_WIDTH },
  { points: [[400, 400], [700, 300]], width: ROAD_WIDTH },
  { points: [[-400, 400], [-700, 300]], width: ROAD_WIDTH },
  // Long coastal road
  { points: [[-700, 0], [-700, -600]], width: 10 },
  { points: [[700, 0], [700, 600]], width: 10 },
  // Mountain pass switchbacks
  { points: [[500, -200], [600, -300], [550, -450], [650, -550]], width: 9 },
  { points: [[-500, 200], [-600, 300], [-550, 450], [-650, 550]], width: 9 },
];

// Race tracks
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
      { x: 400, z: -200, radius: 20 },
      { x: 400, z: -400, radius: 20 },
      { x: 200, z: -400, radius: 20 },
      { x: 0, z: -400, radius: 20 },
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
      { x: -400, z: -400, radius: 22 },
      { x: -100, z: -400, radius: 22 },
      { x: 150, z: -300, radius: 18 },
      { x: 400, z: -150, radius: 22 },
      { x: 300, z: 150, radius: 18 },
      { x: 0, z: 200, radius: 18 },
      { x: -200, z: 100, radius: 18 },
    ],
    startPos: { x: -200, z: 0 },
    startAngle: -Math.PI / 2,
  },
};

// Spawn position — on the main east road, clear of all buildings
export const SPAWN_POS = { x: 30, z: 0 };
export const SPAWN_ANGLE = 0;

export function buildWorld(scene) {
  const objects = { buildings: [], trees: [], coins: [], checkpointMeshes: [], ramps: [] };

  // ── Ground ──
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    // Gentle hills, flatter near center
    const distFromCenter = Math.sqrt(x * x + y * y);
    const flatZone = Math.min(1, distFromCenter / 300);
    const height = (Math.sin(x * 0.006) * 4 + Math.cos(y * 0.008) * 3 + Math.sin(x * 0.015 + y * 0.015) * 2) * flatZone;
    posAttr.setZ(i, height);
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a7d3a, roughness: 0.9, flatShading: true });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  objects.ground = ground;

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

      // Center dashed line
      const dashCount = Math.floor(len / 8);
      for (let d = 0; d < dashCount; d++) {
        const t = (d + 0.3) / dashCount;
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), lineMat);
        line.rotation.x = -Math.PI / 2;
        line.rotation.z = -angle;
        line.position.set(x1 + dx * t, 0.06, z1 + dz * t);
        scene.add(line);
      }

      // Curb edges
      [-1, 1].forEach(side => {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, len), curbMat);
        const perpX = -Math.sin(angle + Math.PI / 2) * (road.width / 2);
        const perpZ = -Math.cos(angle + Math.PI / 2) * (road.width / 2);
        curb.position.set(
          (x1 + x2) / 2 + perpX * side,
          0.08,
          (z1 + z2) / 2 + perpZ * side
        );
        curb.rotation.y = angle;
        scene.add(curb);
      });
    }
  });

  // ── Buildings ──
  const buildingColors = [0x8899aa, 0x99aabb, 0x778899, 0x667788, 0xaabbcc, 0x556677, 0x889988, 0x998877];
  const windowMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffff88, emissiveIntensity: 0.15 });

  const buildingPositions = [];

  // Check if position is on a road
  function isOnRoad(px, pz, margin = 12) {
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

  // City blocks — generate buildings in grid pattern
  for (let bx = -8; bx <= 8; bx++) {
    for (let bz = -8; bz <= 8; bz++) {
      // Vary density — denser near center
      const dist = Math.sqrt(bx * bx + bz * bz);
      if (dist > 7 && Math.random() > 0.4) continue;

      const cx = bx * 80 + (Math.random() - 0.5) * 35;
      const cz = bz * 80 + (Math.random() - 0.5) * 35;

      // Skip spawn area
      if (Math.abs(cx) < 25 && Math.abs(cz) < 25) continue;

      if (isOnRoad(cx, cz, 14)) continue;

      // Building gets taller near center
      const distFromCenter = Math.sqrt(cx * cx + cz * cz);
      const maxH = distFromCenter < 300 ? 50 : (distFromCenter < 500 ? 35 : 20);
      const w = 8 + Math.random() * 14;
      const h = 8 + Math.random() * maxH;
      const d = 8 + Math.random() * 14;

      const color = buildingColors[Math.floor(Math.random() * buildingColors.length)];
      const bMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
      building.position.set(cx, h / 2, cz);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
      objects.buildings.push({ mesh: building, x: cx, z: cz, w, d, h });
      buildingPositions.push({ x: cx, z: cz, w, d });

      // Windows on two faces
      const windowRows = Math.floor(h / 4);
      const windowCols = Math.floor(w / 3);
      for (let wr = 0; wr < windowRows; wr++) {
        for (let wc = 0; wc < windowCols; wc++) {
          if (Math.random() > 0.55) continue;
          // Front face
          const winMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), windowMat);
          winMesh.position.set(
            cx - w / 2 + (wc + 0.5) * (w / windowCols),
            2 + wr * 4,
            cz + d / 2 + 0.01
          );
          scene.add(winMesh);
          // Side face
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

  for (let i = 0; i < 400; i++) {
    const tx = (Math.random() - 0.5) * WORLD_SIZE * 0.92;
    const tz = (Math.random() - 0.5) * WORLD_SIZE * 0.92;

    if (isOnRoad(tx, tz, 8)) continue;
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
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8 });
    const leafSize = 1.5 + Math.random() * 2.5;
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(leafSize, 7, 7), leafMat);
    leaves.position.y = trunkH + leafSize * 0.4;
    leaves.castShadow = true;
    treeGroup.add(leaves);

    treeGroup.position.set(tx, 0, tz);
    scene.add(treeGroup);
    objects.trees.push({ mesh: treeGroup, x: tx, z: tz, radius: leafSize });
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
    // Highway ramps
    { x: 500, z: 0, rotY: 0 },
    { x: -500, z: 0, rotY: Math.PI },
  ];

  rampPositions.forEach(rp => {
    const rampW = 8;
    const rampD = 12;
    const rampH = 2.5;

    // Visual ramp (wedge shape)
    const rampGeo = new THREE.BufferGeometry();
    const hw = rampW / 2, hd = rampD / 2;
    const verts = new Float32Array([
      // Bottom face
      -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,
      -hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
      // Top face (ramp surface)
      -hw, 0, -hd,  hw, 0, -hd,  hw, rampH, hd,
      -hw, 0, -hd,  hw, rampH, hd,  -hw, rampH, hd,
      // Left side
      -hw, 0, -hd,  -hw, 0, hd,  -hw, rampH, hd,
      // Right side
      hw, 0, -hd,  hw, rampH, hd,  hw, 0, hd,
      // Back face
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

    // Yellow warning stripes on sides
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.2 });
    [-1, 1].forEach(side => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, rampH * 0.6, rampD * 0.8), stripeMat);
      stripe.position.set(rp.x + Math.cos(rp.rotY) * side * hw, rampH * 0.35, rp.z + Math.sin(rp.rotY) * side * hw);
      stripe.rotation.y = rp.rotY;
      scene.add(stripe);
    });

    // Physics collider for ramp
    objects.ramps.push({
      x: rp.x, y: rampH / 2, z: rp.z,
      w: rampW, d: rampD,
      rotX: -Math.atan2(rampH, rampD),
      rotY: rp.rotY,
    });
  });

  // ── Street lights ──
  const lightBulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
  for (let i = -700; i <= 700; i += 40) {
    [{ x: i, z: 9 }, { x: i, z: -9 }, { x: 9, z: i }, { x: -9, z: i }].forEach(pos => {
      if (Math.abs(pos.x) < 15 && Math.abs(pos.z) < 15) return;
      if (Math.abs(pos.x) > 700 || Math.abs(pos.z) > 700) return;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 4), poleMat);
      pole.position.set(pos.x, 3.5, pos.z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), lightBulbMat);
      lamp.position.set(pos.x, 7, pos.z);
      scene.add(lamp);
    });
  }

  // ── Coins — more of them, on roads ──
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa500, emissiveIntensity: 0.4, metalness: 0.9 });
  const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 16);

  // Place coins along roads
  for (let i = 0; i < 200; i++) {
    let cx, cz;
    if (i < 120) {
      // Place on roads
      const road = ROADS[Math.floor(Math.random() * ROADS.length)];
      const segIdx = Math.floor(Math.random() * (road.points.length - 1));
      const t = Math.random();
      cx = road.points[segIdx][0] + (road.points[segIdx + 1][0] - road.points[segIdx][0]) * t;
      cz = road.points[segIdx][1] + (road.points[segIdx + 1][1] - road.points[segIdx][1]) * t;
      // Slight offset from center
      cx += (Math.random() - 0.5) * road.width * 0.5;
      cz += (Math.random() - 0.5) * road.width * 0.5;
    } else {
      cx = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
      cz = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    }
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.position.set(cx, 1.5, cz);
    coin.rotation.x = Math.PI / 2;
    coin.userData.collected = false;
    scene.add(coin);
    objects.coins.push(coin);
  }

  // ── Lighting ──
  const ambient = new THREE.AmbientLight(0x7799bb, 0.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
  sun.position.set(100, 150, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -250;
  sun.shadow.camera.right = 250;
  sun.shadow.camera.top = 250;
  sun.shadow.camera.bottom = -250;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  objects.sun = sun;

  const hemiLight = new THREE.HemisphereLight(0x88bbff, 0x445522, 0.5);
  scene.add(hemiLight);

  // Fog — adjusted for larger world
  scene.fog = new THREE.Fog(0x88bbdd, 300, 800);

  // Sky
  scene.background = new THREE.Color(0x88bbdd);

  return objects;
}

// Add race checkpoints to scene
export function addCheckpoints(scene, track, objects) {
  objects.checkpointMeshes.forEach(m => scene.remove(m));
  objects.checkpointMeshes = [];

  const ringGeo = new THREE.TorusGeometry(track.checkpoints[0].radius * 0.6, 0.5, 8, 24);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff44, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 });
  const startMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffcc00, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 });

  track.checkpoints.forEach((cp, i) => {
    const mat = i === 0 ? startMat : ringMat;
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.set(cp.x, 4, cp.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    objects.checkpointMeshes.push(ring);
  });
}

// Get collision info for world objects
export function getColliders(objects) {
  const colliders = [];
  objects.buildings.forEach(b => {
    colliders.push({ x: b.x, z: b.z, hw: b.w / 2 + 0.5, hd: b.d / 2 + 0.5, type: 'box' });
  });
  objects.trees.forEach(t => {
    colliders.push({ x: t.x, z: t.z, radius: 0.5, type: 'circle' });
  });
  return colliders;
}
