// Car physics simulation — powered by cannon-es

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { audio } from './audio.js';

// Shared physics world
export let physicsWorld = null;

export function initPhysicsWorld() {
  physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -15, 0),
  });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.defaultContactMaterial.friction = 0.4;
  physicsWorld.defaultContactMaterial.restitution = 0.1;

  // Ground plane
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(groundBody);

  // Road surface material — higher friction
  const roadMaterial = new CANNON.Material('road');
  const tireMaterial = new CANNON.Material('tire');
  const roadTireContact = new CANNON.ContactMaterial(roadMaterial, tireMaterial, {
    friction: 0.6,
    restitution: 0.05,
  });
  physicsWorld.addContactMaterial(roadTireContact);

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

// Add ramp colliders
export function addRampColliders(ramps) {
  if (!physicsWorld) return;
  ramps.forEach(r => {
    const shape = new CANNON.Box(new CANNON.Vec3(r.w / 2, 0.2, r.d / 2));
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape });
    body.position.set(r.x, r.y, r.z);
    body.quaternion.setFromEuler(r.rotX || 0, r.rotY || 0, 0);
    physicsWorld.addBody(body);
  });
}

export function stepPhysics(dt) {
  if (!physicsWorld) return;
  physicsWorld.step(1 / 60, dt, 3);
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
    this.nitro = false;
    this.nitroFuel = 100;
    this.drifting = false;
    this.onGround = true;
    this.lastSkidTime = 0;
    this.lastCollisionTime = 0;
    this.gear = 1;

    // Derived stats — tuned for fun arcade feel
    this.maxSpeed = carDef.speed;
    this.engineForce = carDef.acceleration * 300;
    this.maxSteer = 0.5 + carDef.handling * 0.015;
    this.brakeForce = carDef.braking * 20;

    // Cannon body — wider and lower for stability
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.95, 0.25, 2.0));
    this.chassisBody = new CANNON.Body({
      mass: 700,
      shape: chassisShape,
      position: new CANNON.Vec3(0, 2, 0),
      angularDamping: 0.6,
      linearDamping: 0.02,
    });

    // Lower center of mass for stability
    this.chassisBody.shapeOffsets[0] = new CANNON.Vec3(0, 0.15, 0);
    this.chassisBody.updateBoundingRadius();

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

    const baseGrip = 1.5 + carDef.handling * 0.15;

    const wheelOptions = {
      radius: 0.33,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 40,
      suspensionRestLength: 0.4,
      frictionSlip: baseGrip,
      dampingRelaxation: 2.8,
      dampingCompression: 4.0,
      maxSuspensionForce: 100000,
      rollInfluence: 0.05,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.4,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    // Front wheels — more grip for responsive steering
    this.frontGrip = baseGrip * 1.1;
    wheelOptions.frictionSlip = this.frontGrip;
    wheelOptions.chassisConnectionPointLocal.set(-0.85, -0.15, 1.4);
    this.vehicle.addWheel({ ...wheelOptions });
    wheelOptions.chassisConnectionPointLocal.set(0.85, -0.15, 1.4);
    this.vehicle.addWheel({ ...wheelOptions });

    // Rear wheels — slightly less grip for oversteer
    this.rearGrip = baseGrip * 0.9;
    wheelOptions.frictionSlip = this.rearGrip;
    wheelOptions.chassisConnectionPointLocal.set(-0.85, -0.15, -1.3);
    this.vehicle.addWheel({ ...wheelOptions });
    wheelOptions.chassisConnectionPointLocal.set(0.85, -0.15, -1.3);
    this.vehicle.addWheel({ ...wheelOptions });

    if (physicsWorld) {
      this.vehicle.addToWorld(physicsWorld);
    }

    // Create wheel bodies for visual sync
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
    this.steer = (inputs.left ? 1 : 0) - (inputs.right ? 1 : 0);
    this.nitro = inputs.nitro && this.nitroFuel > 0;

    // Get forward speed
    const chassisVel = this.chassisBody.velocity;
    const forward = new CANNON.Vec3();
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward);
    this.speed = (chassisVel.x * forward.x + chassisVel.y * forward.y + chassisVel.z * forward.z) * 3.6;

    const absSpeed = Math.abs(this.speed);
    const speedNorm = Math.min(absSpeed / this.maxSpeed, 1);

    // Gear calculation (for sound/HUD)
    if (absSpeed < 30) this.gear = 1;
    else if (absSpeed < 60) this.gear = 2;
    else if (absSpeed < 100) this.gear = 3;
    else if (absSpeed < 150) this.gear = 4;
    else if (absSpeed < 210) this.gear = 5;
    else this.gear = 6;

    // Engine force — more responsive, less drop-off at high speed
    let force = this.engineForce * this.throttle * (1 - speedNorm * 0.45);
    if (this.nitro) {
      force *= 1.8;
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 20);
    }

    // Apply engine force to rear wheels (RWD)
    this.vehicle.applyEngineForce(force, 2);
    this.vehicle.applyEngineForce(force, 3);

    // Also slight force to front for AWD feel at low speed
    if (absSpeed < 40) {
      this.vehicle.applyEngineForce(force * 0.3, 0);
      this.vehicle.applyEngineForce(force * 0.3, 1);
    } else {
      this.vehicle.applyEngineForce(0, 0);
      this.vehicle.applyEngineForce(0, 1);
    }

    // Steering — responsive at low speed, reduced at high speed
    const speedSteerFactor = 1 - speedNorm * 0.55;
    const steerVal = this.steer * this.maxSteer * speedSteerFactor;
    this.vehicle.setSteeringValue(steerVal, 0);
    this.vehicle.setSteeringValue(steerVal, 1);

    // Braking
    const brakeVal = this.brake * this.brakeForce;
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(brakeVal, i);
    }

    // Handbrake drift — dramatically reduce rear grip
    if (this.brake > 0 && absSpeed > 15) {
      this.vehicle.wheelInfos[2].frictionSlip = this.rearGrip * 0.2;
      this.vehicle.wheelInfos[3].frictionSlip = this.rearGrip * 0.2;
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

    // Speed limiter
    const maxMs = (this.nitro ? this.maxSpeed * 1.35 : this.maxSpeed) / 3.6;
    const vel = this.chassisBody.velocity;
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (hSpeed > maxMs) {
      const scale = maxMs / hSpeed;
      vel.x *= scale;
      vel.z *= scale;
    }

    // Nitro regen
    if (!this.nitro && this.nitroFuel < 100) {
      this.nitroFuel = Math.min(100, this.nitroFuel + dt * 8);
    }

    // Anti-flip: strong corrective force when tilting
    const up = new CANNON.Vec3();
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), up);
    if (up.y < 0.5) {
      // Aggressively dampen roll/pitch
      this.chassisBody.angularVelocity.x *= 0.85;
      this.chassisBody.angularVelocity.z *= 0.85;
      // Push car upright
      this.chassisBody.applyTorque(new CANNON.Vec3(
        -this.chassisBody.angularVelocity.x * 800,
        0,
        -this.chassisBody.angularVelocity.z * 800
      ));
    }

    // If fully flipped, auto-reset
    if (up.y < -0.5) {
      const pos = this.chassisBody.position;
      this.reset(pos.x, pos.z, this.rotation);
    }

    // Keep car from going underground
    if (this.chassisBody.position.y < 0.3) {
      this.chassisBody.position.y = 0.3;
      if (this.chassisBody.velocity.y < 0) {
        this.chassisBody.velocity.y = 0;
      }
    }

    // Ground check
    this.onGround = this.vehicle.wheelInfos.some(w => w.isInContact);

    // Idle drag - slight deceleration when not pressing anything
    if (this.throttle === 0 && this.brake === 0 && this.onGround) {
      vel.x *= (1 - dt * 0.8);
      vel.z *= (1 - dt * 0.8);
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
    };
  }

  reset(x = 0, z = 0, angle = 0) {
    this.chassisBody.position.set(x, 2, z);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, angle, 0);
    this.position.set(x, 2, z);
    this.rotation = angle;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.nitroFuel = 100;
  }

  applyToMesh(mesh) {
    mesh.position.copy(this.position);
    mesh.quaternion.copy(this.quaternion);

    // Wheel visuals
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
