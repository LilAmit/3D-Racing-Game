// Car — mesh + Vector3 physics + BoundingBox collisions

import * as THREE from 'three';
import { buildCarMesh } from './garage.js';
import { audio } from './audio.js';

export class Car {
  constructor(carDef, scene) {
    this.def = carDef;
    this.mesh = buildCarMesh(carDef);
    this.scene = scene;
    scene.add(this.mesh);

    // Physics state
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = 0; // y-axis angle
    this.yVelocity = 0;
    this.onGround = true;

    // Derived from car definition
    this.maxSpeed = carDef.speed / 3.6;             // km/h → m/s
    this.accelForce = carDef.acceleration * 5;       // m/s²
    this.brakeDecel = carDef.braking * 6;            // m/s²
    this.maxSteerRate = 1.5 + carDef.handling * 0.12; // rad/s
    this.lateralGripNormal = 10 + carDef.handling * 0.8;
    this.lateralGripDrift = 2.5;

    // State
    this.speed = 0;       // display speed in km/h
    this.throttle = 0;
    this.steer = 0;
    this.steerSmooth = 0;
    this.braking = false;
    this.drifting = false;
    this.nitro = false;
    this.nitroFuel = 100;
    this.gear = 1;
    this.rpm = 0;

    // Collision shape — circle radius
    this.collisionRadius = 1.6;

    // Audio timing
    this._lastSkidTime = 0;
    this._lastCollisionTime = 0;
  }

  update(dt, inputs, colliders, ramps) {
    // === INPUT ===
    this.throttle = inputs.forward ? 1 : (inputs.backward ? -0.5 : 0);
    this.braking = inputs.brake;
    this.nitro = inputs.nitro && this.nitroFuel > 0 && this.throttle > 0;

    const targetSteer = (inputs.left ? 1 : 0) - (inputs.right ? 1 : 0);
    // Smooth steering — responsive but not instant
    if (Math.abs(targetSteer) > 0.1) {
      this.steerSmooth += (targetSteer - this.steerSmooth) * Math.min(8 * dt, 1);
    } else {
      this.steerSmooth *= Math.max(0, 1 - 12 * dt);
      if (Math.abs(this.steerSmooth) < 0.01) this.steerSmooth = 0;
    }
    this.steer = this.steerSmooth;

    // === VECTORS ===
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    const right = new THREE.Vector3(Math.cos(this.rotation), 0, -Math.sin(this.rotation));

    const forwardSpeed = this.velocity.dot(forward);
    const absForwardSpeed = Math.abs(forwardSpeed);
    const speedNorm = Math.min(absForwardSpeed / this.maxSpeed, 1);

    // === ACCELERATION ===
    let accel = this.accelForce * this.throttle;
    accel *= (1 - speedNorm * 0.4); // less force at high speed
    if (this.nitro) {
      accel *= 1.6;
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 20);
    }
    // Don't accelerate past max reverse speed
    if (forwardSpeed < -12 && this.throttle < 0) accel = 0;

    if (this.onGround) {
      this.velocity.addScaledVector(forward, accel * dt);
    }

    // === BRAKING ===
    if (this.braking && this.onGround) {
      const currentSpeed = this.velocity.length();
      if (currentSpeed > 0.1) {
        const reduction = Math.min(this.brakeDecel * dt, currentSpeed);
        this.velocity.multiplyScalar(1 - reduction / currentSpeed);
      }
    }

    // === STEERING ===
    // Only steer when moving
    const steerFactor = Math.min(absForwardSpeed / 4, 1);
    const speedSteerReduction = 1 - speedNorm * 0.4;
    const steerAmount = this.steer * this.maxSteerRate * steerFactor * speedSteerReduction;
    // Reverse steering direction when going backward
    const steerDir = forwardSpeed >= 0 ? 1 : -1;
    this.rotation += steerAmount * steerDir * dt;

    // === DRIFT MECHANICS ===
    const handbraking = this.braking && absForwardSpeed > 5;
    const powerSlide = Math.abs(this.steer) > 0.5 && absForwardSpeed > 15 && this.throttle > 0.5;
    this.drifting = handbraking || powerSlide;

    // === LATERAL FRICTION (grip) ===
    if (this.onGround) {
      // Recalculate right vector after rotation change
      const rightNow = new THREE.Vector3(Math.cos(this.rotation), 0, -Math.sin(this.rotation));
      const lateralSpeed = this.velocity.dot(rightNow);
      const grip = this.drifting ? this.lateralGripDrift : this.lateralGripNormal;
      const lateralReduction = lateralSpeed * grip * dt;
      this.velocity.addScaledVector(rightNow, -lateralReduction);
    }

    // Drift skid sound
    if (this.drifting && absForwardSpeed > 8) {
      const now = performance.now();
      if (now - this._lastSkidTime > 350) {
        audio.playSkid(0.3);
        this._lastSkidTime = now;
      }
    }

    // === ROLLING FRICTION + AIR DRAG ===
    if (this.onGround) {
      if (Math.abs(this.throttle) < 0.1 && !this.braking) {
        // Coast to stop
        this.velocity.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      }
      // Air drag (quadratic)
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (hSpeed > 0.5) {
        const dragFactor = 0.0008 * hSpeed;
        this.velocity.x *= Math.max(0, 1 - dragFactor * dt);
        this.velocity.z *= Math.max(0, 1 - dragFactor * dt);
      }
    }

    // === SPEED LIMIT ===
    const maxMs = this.nitro ? this.maxSpeed * 1.3 : this.maxSpeed;
    const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (hSpeed > maxMs) {
      const scale = maxMs / hSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // === POSITION UPDATE ===
    // Velocity is horizontal-only; y-axis handled separately
    this.velocity.y = 0;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // === Y-AXIS PHYSICS (ramps + gravity) ===
    this._updateYPhysics(dt, ramps);

    // === COLLISIONS ===
    this._resolveCollisions(colliders);

    // === NITRO REGEN ===
    if (!this.nitro && this.nitroFuel < 100) {
      this.nitroFuel = Math.min(100, this.nitroFuel + dt * 8);
    }

    // === DISPLAY VALUES ===
    const fwdNow = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    this.speed = Math.abs(this.velocity.dot(fwdNow)) * 3.6;
    this._updateGear();

    // === SYNC MESH ===
    this.mesh.position.copy(this.position);
    this.mesh.position.y = this.position.y + 0.15;
    this.mesh.rotation.y = this.rotation;

    // Wheel spin
    if (this.mesh.userData.wheels) {
      const wheelSpin = forwardSpeed * dt * 3;
      this.mesh.userData.wheels.forEach((w, i) => {
        w.children[0].rotation.x += wheelSpin; // tire
        // Front wheels turn with steering
        if (i < 2) {
          w.rotation.y = this.steer * 0.3;
        }
      });
    }

    // Audio
    audio.updateEngine(speedNorm, Math.abs(this.throttle));

    return this.getState();
  }

  _updateYPhysics(dt, ramps) {
    // Check ramps
    let onRamp = false;
    for (const ramp of ramps) {
      // Transform car position to ramp local space
      const relX = this.position.x - ramp.x;
      const relZ = this.position.z - ramp.z;
      const cos = Math.cos(-ramp.rotY);
      const sin = Math.sin(-ramp.rotY);
      const localZ = relX * sin + relZ * cos;
      const localX = relX * cos - relZ * sin;

      const halfW = ramp.w / 2;
      const halfD = ramp.d / 2;

      if (Math.abs(localX) < halfW && localZ > -halfD && localZ < halfD) {
        // On ramp — height increases from back (-halfD = 0) to front (+halfD = rampH)
        const t = (localZ + halfD) / (halfD * 2);
        const rampY = t * ramp.h;
        if (this.position.y <= rampY + 0.3) {
          this.position.y = rampY;
          this.yVelocity = 0;
          onRamp = true;
          // Launch off the top edge
          const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
          if (t > 0.9 && hSpeed > 8) {
            this.yVelocity = Math.min(hSpeed * 0.35, 12);
          }
        }
      }
    }

    // Gravity when airborne
    if (!onRamp) {
      this.yVelocity -= 25 * dt;
      this.position.y += this.yVelocity * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.yVelocity = 0;
      }
    }

    // Hard floor — car can never go below ground
    if (this.position.y < 0) {
      this.position.y = 0;
      this.yVelocity = 0;
    }

    this.onGround = this.position.y < 0.05 || onRamp;
  }

  _resolveCollisions(colliders) {
    let collided = false;

    for (const c of colliders) {
      if (c.type === 'box') {
        // Circle vs AABB
        const closestX = Math.max(c.x - c.hw, Math.min(this.position.x, c.x + c.hw));
        const closestZ = Math.max(c.z - c.hd, Math.min(this.position.z, c.z + c.hd));
        const dx = this.position.x - closestX;
        const dz = this.position.z - closestZ;
        const distSq = dx * dx + dz * dz;
        const r = this.collisionRadius;

        if (distSq < r * r) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.001) {
            const nx = dx / dist;
            const nz = dz / dist;
            const push = r - dist;
            this.position.x += nx * push;
            this.position.z += nz * push;
            // Reflect velocity along normal
            const dot = this.velocity.x * nx + this.velocity.z * nz;
            if (dot < 0) {
              this.velocity.x -= dot * nx * 1.5;
              this.velocity.z -= dot * nz * 1.5;
            }
            this.velocity.multiplyScalar(0.6);
            collided = true;
          } else {
            // Inside box — push out to nearest edge
            this.position.x = c.x + (this.position.x > c.x ? c.hw + r : -(c.hw + r));
            this.velocity.multiplyScalar(0.5);
            collided = true;
          }
        }
      } else if (c.type === 'circle') {
        // Circle vs circle
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = c.radius + this.collisionRadius;

        if (dist < minDist && dist > 0.001) {
          const push = minDist - dist;
          this.position.x += (dx / dist) * push;
          this.position.z += (dz / dist) * push;
          this.velocity.multiplyScalar(0.6);
          collided = true;
        }
      }
    }

    // World boundaries
    const bound = 790;
    if (this.position.x > bound) { this.position.x = bound; this.velocity.x = 0; }
    if (this.position.x < -bound) { this.position.x = -bound; this.velocity.x = 0; }
    if (this.position.z > bound) { this.position.z = bound; this.velocity.z = 0; }
    if (this.position.z < -bound) { this.position.z = -bound; this.velocity.z = 0; }

    // Collision sound
    if (collided) {
      const now = performance.now();
      if (now - this._lastCollisionTime > 300) {
        const intensity = Math.min(this.velocity.length() / 20, 1);
        if (intensity > 0.15) audio.playCollision(intensity);
        this._lastCollisionTime = now;
      }
    }
  }

  _updateGear() {
    const s = this.speed;
    if (s < 30) this.gear = 1;
    else if (s < 60) this.gear = 2;
    else if (s < 100) this.gear = 3;
    else if (s < 150) this.gear = 4;
    else if (s < 210) this.gear = 5;
    else this.gear = 6;

    const gearRanges = [0, 30, 60, 100, 150, 210];
    const gearMin = gearRanges[this.gear - 1];
    const gearMax = this.gear < 6 ? gearRanges[this.gear] : 280;
    this.rpm = Math.max(0, Math.min(1, (s - gearMin) / (gearMax - gearMin)));
  }

  getState() {
    return {
      speed: this.speed,
      gear: this.gear,
      rpm: this.rpm,
      drifting: this.drifting,
      nitroFuel: this.nitroFuel,
      nitroActive: this.nitro,
    };
  }

  reset(x = 0, z = 0, angle = 0) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yVelocity = 0;
    this.rotation = angle;
    this.speed = 0;
    this.nitroFuel = 100;
    this.steerSmooth = 0;
    this.steer = 0;
    this.drifting = false;
    this.gear = 1;
    this.rpm = 0;
    this.onGround = true;
    this.mesh.position.set(x, 0.15, z);
    this.mesh.rotation.y = angle;
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}
