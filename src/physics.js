// Car physics simulation — powered by cannon-es

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { audio } from './audio.js';

// Shared physics world
export let physicsWorld = null;

// Contact materials for road vs off-road
let roadMaterial, tireMaterial, groundMaterial;
let roadTireContact, groundTireContact;

export function initPhysicsWorld() {
  physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -14, 0), // Slightly stronger gravity for better feel
  });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.solver.iterations = 12; // Better solver accuracy
  physicsWorld.defaultContactMaterial.friction = 0.4;
  physicsWorld.defaultContactMaterial.restitution = 0.05;

  // Contact materials
  tireMaterial = new CANNON.Material('tire');
  roadMaterial = new CANNON.Material('road');
  groundMaterial = new CANNON.Material('ground');

  roadTireContact = new CANNON.ContactMaterial(tireMaterial, roadMaterial, {
    friction: 0.7,
    restitution: 0.02,
  });
  groundTireContact = new CANNON.ContactMaterial(tireMaterial, groundMaterial, {
    friction: 0.3, // Less grip off-road
    restitution: 0.05,
  });
  physicsWorld.addContactMaterial(roadTireContact);
  physicsWorld.addContactMaterial(groundTireContact);

  // Ground plane
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: groundMaterial,
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(groundBody);

  // World boundary walls
  const bound = 800;
  const wallShape = new CANNON.Box(new CANNON.Vec3(bound, 20, 1));
  const walls = [
    { pos: [0, 10, bound], rot: [0, 0, 0] },
    { pos: [0, 10, -bound], rot: [0, 0, 0] },
    { pos: [bound, 10, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [-bound, 10, 0], rot: [0, Math.PI / 2, 0] },
  ];
  walls.forEach(w => {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: wallShape });
    body.position.set(...w.pos);
    body.quaternion.setFromEuler(...w.rot);
    physicsWorld.addBody(body);
  });

  return physicsWorld;
}

// Add building colliders to physics world
export function addBuildingColliders(buildings) {
  if (!physicsWorld) return;
  buildings.forEach(b => {
    const shape = new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2));
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape });
    body.position.set(b.x, b.h / 2, b.z);
    physicsWorld.addBody(body);
  });
}

// Add tree colliders
export function addTreeColliders(trees) {
  if (!physicsWorld) return;
  trees.forEach(t => {
    const shape = new CANNON.Cylinder(0.4, 0.4, 4, 6);
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape });
    body.position.set(t.x, 2, t.z);
    physicsWorld.addBody(body);
  });
}

// Add ramp colliders — use trimesh-like approach with multiple thin boxes for slope
export function addRampColliders(ramps) {
  if (!physicsWorld) return;
  ramps.forEach(r => {
    // Create multiple stacked boxes to approximate the ramp slope
    const steps = 6;
    const stepD = r.d / steps;
    const maxH = Math.abs(r.y) * 2; // full ramp height
    for (let i = 0; i < steps; i++) {
      const stepH = (maxH / steps) * (i + 1);
      const shape = new CANNON.Box(new CANNON.Vec3(r.w / 2, stepH / 2, stepD / 2));
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape });

      // Position each step along the ramp direction
      const t = (i + 0.5) / steps; // 0..1 along ramp
      const localZ = -r.d / 2 + stepD * (i + 0.5);

      // Transform local offset by rotY
      const cosY = Math.cos(r.rotY || 0);
      const sinY = Math.sin(r.rotY || 0);
      const worldX = r.x + sinY * localZ;
      const worldZ = r.z + cosY * localZ;

      body.position.set(worldX, stepH / 2, worldZ);
      body.quaternion.setFromEuler(0, r.rotY || 0, 0);
      physicsWorld.addBody(body);
    }
  });
}

export function stepPhysics(dt) {
  if (!physicsWorld) return;
  physicsWorld.step(1 / 60, dt, 5); // 5 substeps for better stability
}

// ─── Car with RaycastVehicle ───
// NOTE: cannon-es RaycastVehicle positive engine force pushes in -Z.
// Our mesh/camera treat +Z as forward, so we NEGATE engine force.

export class CarPhysics {
  constructor(carDef) {
    this.def = carDef;
    this.position = new THREE.Vector3(0, 0.5, 0);
    this.quaternion = new THREE.Quaternion();
    this.rotation = 0;
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.speed = 0;
    this.angularVelocity = 0;
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.steerCurrent = 0; // Smooth steering interpolation
    this.nitro = false;
    this.nitroFuel = 100;
    this.drifting = false;
    this.onGround = true;
    this.lastSkidTime = 0;
    this.lastCollisionTime = 0;
    this.gear = 1;
    this.rpm = 0;

    // Derived stats
    this.maxSpeed = carDef.speed;
    this.engineForce = carDef.acceleration * 450;
    this.maxSteer = 0.55 + carDef.handling * 0.025;
    this.brakeForce = carDef.braking * 30;

    // Cannon chassis body
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.95, 0.4, 2.0));
    this.chassisBody = new CANNON.Body({
      mass: 650,
      shape: chassisShape,
      position: new CANNON.Vec3(0, 4, 0),
      material: tireMaterial,
      angularDamping: 0.35,
      linearDamping: 0.01,
    });

    // Collision sounds
    this.chassisBody.addEventListener('collide', (e) => {
      const relVel = e.contact.getImpactVelocityAlongNormal();
      if (Math.abs(relVel) > 3) {
        const now = performance.now();
        if (now - this.lastCollisionTime > 300) {
          audio.playCollision(Math.min(Math.abs(relVel) / 20, 1));
          this.lastCollisionTime = now;
        }
      }
    });

    if (physicsWorld) {
      physicsWorld.addBody(this.chassisBody);
    }

    // Vehicle
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const baseGrip = 2.2 + carDef.handling * 0.22;

    // Wheel options
    const wheelOptions = {
      radius: 0.35,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 35,
      suspensionRestLength: 0.5,
      frictionSlip: baseGrip,
      dampingRelaxation: 2.8,
      dampingCompression: 4.5,
      maxSuspensionForce: 120000,
      rollInfluence: 0.04,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.5,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    // Front wheels (z=+1.4 = mesh front)
    this.frontGrip = baseGrip * 1.15;
    wheelOptions.frictionSlip = this.frontGrip;

    wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.85, -0.3, 1.4);
    this.vehicle.addWheel({ ...wheelOptions });
    wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(0.85, -0.3, 1.4);
    this.vehicle.addWheel({ ...wheelOptions });

    // Rear wheels (z=-1.3 = mesh back)
    this.rearGrip = baseGrip * 0.88;
    wheelOptions.frictionSlip = this.rearGrip;

    wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.85, -0.3, -1.3);
    this.vehicle.addWheel({ ...wheelOptions });
    wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(0.85, -0.3, -1.3);
    this.vehicle.addWheel({ ...wheelOptions });

    if (physicsWorld) {
      this.vehicle.addToWorld(physicsWorld);
    }

    // Wheel bodies for visual sync
    this.wheelBodies = [];
    this.vehicle.wheelInfos.forEach(() => {
      const wheelBody = new CANNON.Body({ mass: 0 });
      wheelBody.type = CANNON.Body.KINEMATIC;
      wheelBody.collisionFilterGroup = 0;
      if (physicsWorld) physicsWorld.addBody(wheelBody);
      this.wheelBodies.push(wheelBody);
    });
  }

  update(dt, inputs, _colliders) {
    if (dt > 0.1) dt = 0.1;

    // Input
    this.throttle = inputs.forward ? 1 : (inputs.backward ? -0.6 : 0);
    this.brake = inputs.brake ? 1 : 0;
    const targetSteer = (inputs.left ? 1 : 0) - (inputs.right ? 1 : 0);
    this.nitro = inputs.nitro && this.nitroFuel > 0;

    // Smooth steering — gradual ramp instead of instant snap
    const steerSpeed = 5.0; // How fast steering reaches target (radians/sec equivalent)
    if (targetSteer !== 0) {
      this.steerCurrent += (targetSteer - this.steerCurrent) * Math.min(steerSpeed * dt, 1);
    } else {
      // Return to center faster
      this.steerCurrent *= Math.max(0, 1 - steerSpeed * 1.5 * dt);
      if (Math.abs(this.steerCurrent) < 0.01) this.steerCurrent = 0;
    }
    this.steer = this.steerCurrent;

    // Get forward speed — +Z is our forward
    const chassisVel = this.chassisBody.velocity;
    const forward = new CANNON.Vec3();
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward);
    this.speed = (chassisVel.x * forward.x + chassisVel.y * forward.y + chassisVel.z * forward.z) * 3.6;

    const absSpeed = Math.abs(this.speed);
    const speedNorm = Math.min(absSpeed / this.maxSpeed, 1);

    // Gear & RPM calculation
    const gearRanges = [0, 30, 60, 100, 150, 210];
    if (absSpeed < 30) this.gear = 1;
    else if (absSpeed < 60) this.gear = 2;
    else if (absSpeed < 100) this.gear = 3;
    else if (absSpeed < 150) this.gear = 4;
    else if (absSpeed < 210) this.gear = 5;
    else this.gear = 6;

    // RPM within current gear (0-1 range)
    const gearMin = gearRanges[this.gear - 1];
    const gearMax = this.gear < 6 ? gearRanges[this.gear] : this.maxSpeed;
    this.rpm = Math.min(1, (absSpeed - gearMin) / (gearMax - gearMin));

    // Ground check
    const wheelsInContact = this.vehicle.wheelInfos.filter(w => w.isInContact).length;
    this.onGround = wheelsInContact > 0;

    // Engine torque curve — peak power in mid-RPM range
    const torqueCurve = 0.7 + 0.3 * Math.sin(this.rpm * Math.PI); // Peaks at 50% RPM
    let force = this.engineForce * this.throttle * torqueCurve * (1 - speedNorm * 0.35);

    // Nitro
    if (this.nitro) {
      force *= 1.8;
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 20);
    }

    // Reverse speed limiter — cap at 40 km/h
    const REVERSE_MAX = 40;
    if (this.speed < -REVERSE_MAX && this.throttle < 0) {
      force = 0;
    }

    // Apply NEGATED force — rear-biased AWD (30% front, 70% rear)
    for (let i = 0; i < 4; i++) {
      this.vehicle.applyEngineForce(-force * (i < 2 ? 0.3 : 0.7), i);
    }

    // Steering — speed-dependent reduction with smooth input
    const speedSteerFactor = 1 - speedNorm * 0.45;
    const steerVal = this.steer * this.maxSteer * speedSteerFactor;
    this.vehicle.setSteeringValue(-steerVal, 0);
    this.vehicle.setSteeringValue(-steerVal, 1);

    // Braking — front-biased (60/40 split for realism)
    const brakeVal = this.brake * this.brakeForce;
    this.vehicle.setBrake(brakeVal * 0.6, 0);
    this.vehicle.setBrake(brakeVal * 0.6, 1);
    this.vehicle.setBrake(brakeVal * 0.4, 2);
    this.vehicle.setBrake(brakeVal * 0.4, 3);

    // ── Drift mechanics ──
    // Handbrake drift (Space held)
    const handbraking = this.brake > 0 && absSpeed > 15;
    // Oversteer drift — turning hard at speed with throttle
    const turnAmount = Math.abs(this.steer);
    const oversteerDrift = turnAmount > 0.6 && absSpeed > 50 && this.throttle > 0.5;

    if (handbraking) {
      this.vehicle.wheelInfos[2].frictionSlip = this.rearGrip * 0.15;
      this.vehicle.wheelInfos[3].frictionSlip = this.rearGrip * 0.15;
      this.drifting = true;
    } else if (oversteerDrift) {
      // Power oversteer — rear grip reduces based on speed and turn
      const overFactor = 0.35 + (1 - turnAmount) * 0.3;
      this.vehicle.wheelInfos[2].frictionSlip = this.rearGrip * overFactor;
      this.vehicle.wheelInfos[3].frictionSlip = this.rearGrip * overFactor;
      this.drifting = true;
    } else {
      this.vehicle.wheelInfos[2].frictionSlip = this.rearGrip;
      this.vehicle.wheelInfos[3].frictionSlip = this.rearGrip;
      this.drifting = false;
    }

    // Drift skid sound
    if (this.drifting && absSpeed > 20) {
      const now = performance.now();
      if (now - this.lastSkidTime > 350) {
        audio.playSkid(0.3);
        this.lastSkidTime = now;
      }
    }

    // ── Downforce ── pushes car down at speed for better grip
    if (this.onGround) {
      const downforceCoeff = 0.8 + (this.def.handling / 10) * 0.4; // Better handling = more downforce
      const downforce = speedNorm * speedNorm * downforceCoeff * 800;
      this.chassisBody.applyForce(new CANNON.Vec3(0, -downforce, 0), this.chassisBody.position);

      // Increase grip at speed via downforce effect on suspension
      const gripBoost = 1 + speedNorm * 0.3;
      this.vehicle.wheelInfos[0].frictionSlip = this.frontGrip * gripBoost;
      this.vehicle.wheelInfos[1].frictionSlip = this.frontGrip * gripBoost;
      if (!this.drifting) {
        this.vehicle.wheelInfos[2].frictionSlip = this.rearGrip * gripBoost;
        this.vehicle.wheelInfos[3].frictionSlip = this.rearGrip * gripBoost;
      }
    }

    // ── Speed-adaptive suspension ──
    const adaptiveStiffness = 35 + speedNorm * 20; // Stiffer at speed
    this.vehicle.wheelInfos.forEach(w => {
      w.suspensionStiffness = adaptiveStiffness;
    });

    // Speed limiter
    const maxMs = (this.nitro ? this.maxSpeed * 1.35 : this.maxSpeed) / 3.6;
    const vel = this.chassisBody.velocity;
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (hSpeed > maxMs) {
      const scale = maxMs / hSpeed;
      vel.x *= scale;
      vel.z *= scale;
    }

    // Reverse speed limiter (hard cap)
    if (this.speed < 0) {
      const revMaxMs = REVERSE_MAX / 3.6;
      const revSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
      if (revSpeed > revMaxMs) {
        const scale = revMaxMs / revSpeed;
        vel.x *= scale;
        vel.z *= scale;
      }
    }

    // Nitro regen
    if (!this.nitro && this.nitroFuel < 100) {
      this.nitroFuel = Math.min(100, this.nitroFuel + dt * 8);
    }

    // Anti-flip — gentler correction
    const up = new CANNON.Vec3();
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), up);
    if (up.y < 0.5) {
      this.chassisBody.angularVelocity.x *= 0.88;
      this.chassisBody.angularVelocity.z *= 0.88;
      this.chassisBody.applyTorque(new CANNON.Vec3(
        -this.chassisBody.angularVelocity.x * 600,
        0,
        -this.chassisBody.angularVelocity.z * 600
      ));
    }

    // Auto-reset if fully flipped
    if (up.y < -0.3) {
      const pos = this.chassisBody.position;
      this.reset(pos.x, pos.z, this.rotation);
    }

    // Keep car above ground
    if (this.chassisBody.position.y < 0.3) {
      this.chassisBody.position.y = 0.3;
      if (this.chassisBody.velocity.y < 0) {
        this.chassisBody.velocity.y = 0;
      }
    }

    // Idle drag — car slows when no input
    if (this.throttle === 0 && this.brake === 0 && this.onGround) {
      vel.x *= (1 - dt * 1.0);
      vel.z *= (1 - dt * 1.0);
    }

    // Lateral drag — reduces sideways sliding for more planted feel
    if (this.onGround && !this.drifting) {
      const right = new CANNON.Vec3();
      this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0), right);
      const lateralSpeed = vel.x * right.x + vel.z * right.z;
      const lateralDamp = 0.92; // How much lateral velocity is preserved
      vel.x -= right.x * lateralSpeed * (1 - lateralDamp) * (1 - speedNorm * 0.3);
      vel.z -= right.z * lateralSpeed * (1 - lateralDamp) * (1 - speedNorm * 0.3);
    }

    // Sync position/rotation to THREE
    const pos = this.chassisBody.position;
    this.position.set(pos.x, pos.y, pos.z);

    const q = this.chassisBody.quaternion;
    this.quaternion.set(q.x, q.y, q.z, q.w);

    // Extract Y rotation
    const euler = new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ');
    this.rotation = euler.y;

    this.velocity.set(vel.x, vel.y, vel.z);

    // Update wheel bodies
    this.vehicle.wheelInfos.forEach((info, i) => {
      this.vehicle.updateWheelTransform(i);
      const t = info.worldTransform;
      this.wheelBodies[i].position.copy(t.position);
      this.wheelBodies[i].quaternion.copy(t.quaternion);
    });

    // Audio
    audio.updateEngine(speedNorm, Math.abs(this.throttle));

    return {
      speed: absSpeed,
      speedNorm,
      drifting: this.drifting,
      nitroFuel: this.nitroFuel,
      gear: this.gear,
      rpm: this.rpm,
    };
  }

  reset(x = 0, z = 0, angle = 0) {
    this.chassisBody.position.set(x, 4, z);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, angle, 0);
    this.position.set(x, 4, z);
    this.rotation = angle;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.nitroFuel = 100;
    this.steerCurrent = 0;
  }

  applyToMesh(mesh) {
    mesh.position.copy(this.position);
    mesh.quaternion.copy(this.quaternion);

    if (mesh.userData.wheels) {
      mesh.userData.wheels.forEach((wheelMesh, i) => {
        if (this.wheelBodies[i]) {
          const wp = this.wheelBodies[i].position;
          const localPos = new THREE.Vector3(wp.x, wp.y, wp.z);
          mesh.worldToLocal(localPos);
          wheelMesh.position.copy(localPos);
        }
      });
    }
  }

  destroy() {
    if (physicsWorld) {
      this.vehicle.removeFromWorld(physicsWorld);
      physicsWorld.removeBody(this.chassisBody);
      this.wheelBodies.forEach(wb => physicsWorld.removeBody(wb));
    }
  }
}
