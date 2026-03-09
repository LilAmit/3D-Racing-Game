// Car physics simulation — powered by cannon-es

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { audio } from './audio.js';

// Shared physics world
export let physicsWorld = null;

// Collision groups
const GROUP_CHASSIS = 1;
const GROUP_WORLD = 2;
const GROUP_ALL = -1; // Everything

export function initPhysicsWorld() {
  physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -15, 0),
  });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.solver.iterations = 14;
  physicsWorld.defaultContactMaterial.friction = 0.4;
  physicsWorld.defaultContactMaterial.restitution = 0.05;

  // Ground plane — in GROUP_WORLD, does NOT collide with GROUP_CHASSIS
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    collisionFilterGroup: GROUP_WORLD,
    collisionFilterMask: GROUP_WORLD, // Only collides with other GROUP_WORLD (buildings etc), NOT chassis
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
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: wallShape,
      collisionFilterGroup: GROUP_WORLD,
      collisionFilterMask: GROUP_ALL,
    });
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
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      collisionFilterGroup: GROUP_WORLD,
      collisionFilterMask: GROUP_ALL,
    });
    body.position.set(b.x, b.h / 2, b.z);
    physicsWorld.addBody(body);
  });
}

// Add tree colliders
export function addTreeColliders(trees) {
  if (!physicsWorld) return;
  trees.forEach(t => {
    const shape = new CANNON.Cylinder(0.4, 0.4, 4, 6);
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      collisionFilterGroup: GROUP_WORLD,
      collisionFilterMask: GROUP_ALL,
    });
    body.position.set(t.x, 2, t.z);
    physicsWorld.addBody(body);
  });
}

// Add ramp colliders
export function addRampColliders(ramps) {
  if (!physicsWorld) return;
  ramps.forEach(r => {
    const shape = new CANNON.Box(new CANNON.Vec3(r.w / 2, 0.2, r.d / 2));
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      collisionFilterGroup: GROUP_WORLD,
      collisionFilterMask: GROUP_ALL,
    });
    body.position.set(r.x, r.y, r.z);
    body.quaternion.setFromEuler(r.rotX || 0, r.rotY || 0, 0);
    physicsWorld.addBody(body);
  });
}

export function stepPhysics(dt) {
  if (!physicsWorld) return;
  physicsWorld.step(1 / 60, dt, 5);
}

// ─── Car with RaycastVehicle ───

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
    this.steerCurrent = 0;
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
    this.engineForce = carDef.acceleration * 500;
    this.maxSteer = 0.55 + carDef.handling * 0.025;
    this.brakeForce = carDef.braking * 30;

    // Cannon chassis body — uses GROUP_CHASSIS so it doesn't collide with ground plane
    // (RaycastVehicle handles ground interaction via raycasts, not body collision)
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.95, 0.4, 2.0));
    this.chassisBody = new CANNON.Body({
      mass: 650,
      shape: chassisShape,
      position: new CANNON.Vec3(0, 1.2, 0),
      collisionFilterGroup: GROUP_CHASSIS,
      collisionFilterMask: GROUP_WORLD, // Collides with buildings/walls but NOT ground plane
      angularDamping: 0.4,
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

    const baseGrip = 2.5 + carDef.handling * 0.25;

    // Wheel options
    const wheelOptions = {
      radius: 0.35,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 30,
      suspensionRestLength: 0.5,
      frictionSlip: baseGrip,
      dampingRelaxation: 2.5,
      dampingCompression: 4.0,
      maxSuspensionForce: 100000,
      rollInfluence: 0.05,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.5,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    // Front wheels (z=+1.4 = mesh front)
    this.frontGrip = baseGrip * 1.1;
    wheelOptions.frictionSlip = this.frontGrip;

    wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.85, -0.3, 1.4);
    this.vehicle.addWheel({ ...wheelOptions });
    wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(0.85, -0.3, 1.4);
    this.vehicle.addWheel({ ...wheelOptions });

    // Rear wheels (z=-1.3 = mesh back)
    this.rearGrip = baseGrip * 0.85;
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

  // Set all forces/steering based on input — call BEFORE stepPhysics
  applyInputs(dt, inputs) {
    if (dt > 0.1) dt = 0.1;

    // Input
    this.throttle = inputs.forward ? 1 : (inputs.backward ? -0.6 : 0);
    this.brake = inputs.brake ? 1 : 0;
    const targetSteer = (inputs.left ? 1 : 0) - (inputs.right ? 1 : 0);
    this.nitro = inputs.nitro && this.nitroFuel > 0;

    // Smooth steering
    const steerSpeed = 5.0;
    if (targetSteer !== 0) {
      this.steerCurrent += (targetSteer - this.steerCurrent) * Math.min(steerSpeed * dt, 1);
    } else {
      this.steerCurrent *= Math.max(0, 1 - steerSpeed * 1.5 * dt);
      if (Math.abs(this.steerCurrent) < 0.01) this.steerCurrent = 0;
    }
    this.steer = this.steerCurrent;

    // Get forward speed
    const chassisVel = this.chassisBody.velocity;
    const forward = new CANNON.Vec3();
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward);
    this.speed = (chassisVel.x * forward.x + chassisVel.y * forward.y + chassisVel.z * forward.z) * 3.6;

    const absSpeed = Math.abs(this.speed);
    const speedNorm = Math.min(absSpeed / this.maxSpeed, 1);

    // Ground check
    this.onGround = this.vehicle.wheelInfos.some(w => w.isInContact);

    // Engine force
    let force = this.engineForce * this.throttle * (1 - speedNorm * 0.35);
    if (this.nitro) {
      force *= 1.8;
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 20);
    }

    // Reverse speed limiter
    if (this.speed < -40 && this.throttle < 0) {
      force = 0;
    }

    // Apply engine force to all 4 wheels (AWD) — NEGATED because cannon-es pushes -Z
    for (let i = 0; i < 4; i++) {
      this.vehicle.applyEngineForce(-force * (i < 2 ? 0.3 : 0.7), i);
    }

    // === DIRECT FORCE ASSIST ===
    // Apply direct force to chassis as backup — ensures car ALWAYS responds to throttle
    // This is essential because RaycastVehicle only works when wheels are in contact
    if (Math.abs(this.throttle) > 0) {
      const fwd = new CANNON.Vec3();
      this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), fwd);
      // Strong at low speed, fades at high speed
      const assistStrength = this.throttle * 2500 * Math.max(0, 1 - speedNorm * 0.9);
      this.chassisBody.applyForce(
        new CANNON.Vec3(fwd.x * assistStrength, 0, fwd.z * assistStrength),
        this.chassisBody.position
      );
    }

    // Steering
    const speedSteerFactor = 1 - speedNorm * 0.45;
    const steerVal = this.steer * this.maxSteer * speedSteerFactor;
    this.vehicle.setSteeringValue(-steerVal, 0);
    this.vehicle.setSteeringValue(-steerVal, 1);

    // Braking — front-biased
    const brakeVal = this.brake * this.brakeForce;
    this.vehicle.setBrake(brakeVal * 0.6, 0);
    this.vehicle.setBrake(brakeVal * 0.6, 1);
    this.vehicle.setBrake(brakeVal * 0.4, 2);
    this.vehicle.setBrake(brakeVal * 0.4, 3);

    // Drift mechanics
    const handbraking = this.brake > 0 && absSpeed > 15;
    const turnAmount = Math.abs(this.steer);
    const oversteerDrift = turnAmount > 0.6 && absSpeed > 50 && this.throttle > 0.5;

    if (handbraking) {
      this.vehicle.wheelInfos[2].frictionSlip = this.rearGrip * 0.15;
      this.vehicle.wheelInfos[3].frictionSlip = this.rearGrip * 0.15;
      this.drifting = true;
    } else if (oversteerDrift) {
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

    // Downforce at speed
    if (this.onGround && speedNorm > 0.1) {
      const downforce = speedNorm * speedNorm * 600;
      this.chassisBody.applyForce(new CANNON.Vec3(0, -downforce, 0), this.chassisBody.position);
    }
  }

  // Read state after physics step — call AFTER stepPhysics
  readState(dt) {
    if (dt > 0.1) dt = 0.1;

    const vel = this.chassisBody.velocity;
    const forward = new CANNON.Vec3();
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward);
    this.speed = (vel.x * forward.x + vel.y * forward.y + vel.z * forward.z) * 3.6;

    const absSpeed = Math.abs(this.speed);
    const speedNorm = Math.min(absSpeed / this.maxSpeed, 1);

    // Gear & RPM
    const gearRanges = [0, 30, 60, 100, 150, 210];
    if (absSpeed < 30) this.gear = 1;
    else if (absSpeed < 60) this.gear = 2;
    else if (absSpeed < 100) this.gear = 3;
    else if (absSpeed < 150) this.gear = 4;
    else if (absSpeed < 210) this.gear = 5;
    else this.gear = 6;

    const gearMin = gearRanges[this.gear - 1];
    const gearMax = this.gear < 6 ? gearRanges[this.gear] : this.maxSpeed;
    this.rpm = Math.max(0, Math.min(1, (absSpeed - gearMin) / (gearMax - gearMin)));

    // Ground check
    this.onGround = this.vehicle.wheelInfos.some(w => w.isInContact);

    // Speed limiter
    const maxMs = (this.nitro ? this.maxSpeed * 1.35 : this.maxSpeed) / 3.6;
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (hSpeed > maxMs) {
      const scale = maxMs / hSpeed;
      vel.x *= scale;
      vel.z *= scale;
    }

    // Reverse speed limiter
    if (this.speed < 0) {
      const revMaxMs = 40 / 3.6;
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

    // Anti-flip
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

    // Safety: if car falls below world, reset
    if (this.chassisBody.position.y < -10) {
      this.reset(this.position.x, this.position.z, this.rotation);
    }

    // Idle drag
    if (this.throttle === 0 && this.brake === 0 && this.onGround) {
      vel.x *= (1 - dt * 1.0);
      vel.z *= (1 - dt * 1.0);
    }

    // Lateral drag — reduces sideways sliding
    if (this.onGround && !this.drifting) {
      const right = new CANNON.Vec3();
      this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0), right);
      const lateralSpeed = vel.x * right.x + vel.z * right.z;
      const lateralDamp = 0.92;
      vel.x -= right.x * lateralSpeed * (1 - lateralDamp) * (1 - speedNorm * 0.3);
      vel.z -= right.z * lateralSpeed * (1 - lateralDamp) * (1 - speedNorm * 0.3);
    }

    // Sync to THREE
    const pos = this.chassisBody.position;
    this.position.set(pos.x, pos.y, pos.z);

    const q = this.chassisBody.quaternion;
    this.quaternion.set(q.x, q.y, q.z, q.w);

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
    // Spawn at y=1.2 — near suspension equilibrium height, wheels touch ground immediately
    this.chassisBody.position.set(x, 1.2, z);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, angle, 0);
    this.position.set(x, 1.2, z);
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
