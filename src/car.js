// Car — mesh + Vector3 physics + BoundingBox collisions

import * as THREE from 'three';
import { buildCarMesh } from './garage.js';
import { audio } from './audio.js';

// Speed feel multiplier — makes displayed km/h feel realistic.
// Real 140 km/h ≈ 39 m/s. In-game world units are ~1m but objects are small,
// so we multiply actual movement speed by this factor to make scenery fly past
// at a rate that matches the speedometer reading.
const SPEED_FEEL = 2.8;

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

    // Derived from car definition — tuned with SPEED_FEEL
    this.maxSpeed = (carDef.speed / 3.6) * SPEED_FEEL;      // display km/h → actual m/s with feel
    this.accelForce = carDef.acceleration * 5 * SPEED_FEEL;  // scale accel to match
    this.brakeDecel = carDef.braking * 6 * SPEED_FEEL;
    this.maxSteerRate = 1.5 + carDef.handling * 0.12;
    this.lateralGripNormal = 10 + carDef.handling * 0.8;
    this.lateralGripDrift = 2.5;

    // Display speed cap (the number shown on HUD)
    this.displayMaxSpeed = carDef.speed;

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
    if (Math.abs(targetSteer) > 0.1) {
      this.steerSmooth += (targetSteer - this.steerSmooth) * Math.min(8 * dt, 1);
    } else {
      this.steerSmooth *= Math.max(0, 1 - 12 * dt);
      if (Math.abs(this.steerSmooth) < 0.01) this.steerSmooth = 0;
    }
    this.steer = this.steerSmooth;

    // === VECTORS ===
    const forward = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    const forwardSpeed = this.velocity.dot(forward);
    const absForwardSpeed = Math.abs(forwardSpeed);
    const speedNorm = Math.min(absForwardSpeed / this.maxSpeed, 1);

    // === ACCELERATION ===
    let accel = this.accelForce * this.throttle;
    accel *= (1 - speedNorm * 0.4);
    if (this.nitro) {
      accel *= 1.6;
      this.nitroFuel = Math.max(0, this.nitroFuel - dt * 20);
    }
    if (forwardSpeed < -12 * SPEED_FEEL && this.throttle < 0) accel = 0;

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
    const steerFactor = Math.min(absForwardSpeed / (4 * SPEED_FEEL), 1);
    const speedSteerReduction = 1 - speedNorm * 0.4;
    const steerAmount = this.steer * this.maxSteerRate * steerFactor * speedSteerReduction;
    const steerDir = forwardSpeed >= 0 ? 1 : -1;
    this.rotation += steerAmount * steerDir * dt;

    // === DRIFT MECHANICS ===
    const handbraking = this.braking && absForwardSpeed > 5 * SPEED_FEEL;
    const powerSlide = Math.abs(this.steer) > 0.5 && absForwardSpeed > 15 * SPEED_FEEL && this.throttle > 0.5;
    this.drifting = handbraking || powerSlide;

    // === LATERAL FRICTION (grip) ===
    if (this.onGround) {
      const rightNow = new THREE.Vector3(Math.cos(this.rotation), 0, -Math.sin(this.rotation));
      const lateralSpeed = this.velocity.dot(rightNow);
      const grip = this.drifting ? this.lateralGripDrift : this.lateralGripNormal;
      const lateralReduction = lateralSpeed * grip * dt;
      this.velocity.addScaledVector(rightNow, -lateralReduction);
    }

    // Drift skid sound
    if (this.drifting && absForwardSpeed > 8 * SPEED_FEEL) {
      const now = performance.now();
      if (now - this._lastSkidTime > 350) {
        audio.playSkid(0.3);
        this._lastSkidTime = now;
      }
    }

    // === ROLLING FRICTION + AIR DRAG ===
    if (this.onGround) {
      if (Math.abs(this.throttle) < 0.1 && !this.braking) {
        this.velocity.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      }
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (hSpeed > 0.5) {
        const dragFactor = 0.0003 * hSpeed; // Reduced drag for higher speeds
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
    // Convert actual velocity back to display km/h
    const fwdNow = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
    const actualMps = Math.abs(this.velocity.dot(fwdNow));
    this.speed = (actualMps / SPEED_FEEL) * 3.6; // Undo feel factor for display
    this._updateGear();

    // === SYNC MESH ===
    this.mesh.position.copy(this.position);
    this.mesh.position.y = this.position.y + 0.15;
    this.mesh.rotation.y = this.rotation;

    // Wheel spin
    if (this.mesh.userData.wheels) {
      const wheelSpin = forwardSpeed * dt * 3;
      this.mesh.userData.wheels.forEach((w, i) => {
        w.children[0].rotation.x += wheelSpin;
        if (i < 2) {
          w.rotation.y = this.steer * 0.3;
        }
      });
    }

    // Audio — pass normalized speed and throttle
    audio.updateEngine(speedNorm, Math.abs(this.throttle));

    return this.getState();
  }

  _updateYPhysics(dt, ramps) {
    let onRamp = false;
    for (const ramp of ramps) {
      const relX = this.position.x - ramp.x;
      const relZ = this.position.z - ramp.z;
      const cos = Math.cos(-ramp.rotY);
      const sin = Math.sin(-ramp.rotY);
      const localZ = relX * sin + relZ * cos;
      const localX = relX * cos - relZ * sin;

      const halfW = ramp.w / 2;
      const halfD = ramp.d / 2;

      if (Math.abs(localX) < halfW && localZ > -halfD && localZ < halfD) {
        const t = (localZ + halfD) / (halfD * 2);
        const rampY = t * ramp.h;
        if (this.position.y <= rampY + 0.3) {
          this.position.y = rampY;
          this.yVelocity = 0;
          onRamp = true;
          const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
          if (t > 0.9 && hSpeed > 8 * SPEED_FEEL) {
            this.yVelocity = Math.min(hSpeed * 0.25, 14);
          }
        }
      }
    }

    if (!onRamp) {
      this.yVelocity -= 25 * dt;
      this.position.y += this.yVelocity * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.yVelocity = 0;
      }
    }

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
            const dot = this.velocity.x * nx + this.velocity.z * nz;
            if (dot < 0) {
              this.velocity.x -= dot * nx * 1.5;
              this.velocity.z -= dot * nz * 1.5;
            }
            this.velocity.multiplyScalar(0.6);
            collided = true;
          } else {
            this.position.x = c.x + (this.position.x > c.x ? c.hw + r : -(c.hw + r));
            this.velocity.multiplyScalar(0.5);
            collided = true;
          }
        }
      } else if (c.type === 'circle') {
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

    // World boundaries — expanded for bigger map
    const bound = 1580;
    if (this.position.x > bound) { this.position.x = bound; this.velocity.x = 0; }
    if (this.position.x < -bound) { this.position.x = -bound; this.velocity.x = 0; }
    if (this.position.z > bound) { this.position.z = bound; this.velocity.z = 0; }
    if (this.position.z < -bound) { this.position.z = -bound; this.velocity.z = 0; }

    // Collision sound
    if (collided) {
      const now = performance.now();
      if (now - this._lastCollisionTime > 300) {
        const intensity = Math.min(this.velocity.length() / (20 * SPEED_FEEL), 1);
        if (intensity > 0.15) audio.playCollision(intensity);
        this._lastCollisionTime = now;
      }
    }
  }

  _updateGear() {
    const maxSpd = this.displayMaxSpeed;
    const s = this.speed;
    // Gear ratios scale with the car's max speed
    const gearThresholds = [0, maxSpd * 0.15, maxSpd * 0.3, maxSpd * 0.5, maxSpd * 0.7, maxSpd * 0.85];
    this.gear = 1;
    for (let i = 1; i < gearThresholds.length; i++) {
      if (s >= gearThresholds[i]) this.gear = i + 1;
    }

    const gearMin = gearThresholds[this.gear - 1];
    const gearMax = this.gear < 6 ? gearThresholds[this.gear] : maxSpd * 1.1;
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
