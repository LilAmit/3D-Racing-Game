// Multiplayer via WebSocket — syncs car positions with friends using friend tags

import * as THREE from 'three';
import { buildCarMesh, CAR_DEFS } from './cars.js';

class MultiplayerManager {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.myTag = this.loadTag();
    this.peers = new Map(); // tag -> { mesh, position, rotation, lastUpdate }
    this.scene = null;
    this.onPeerUpdate = null;
    this.serverUrl = null;
  }

  loadTag() {
    let tag = localStorage.getItem('racing_player_tag');
    if (!tag) {
      tag = '#' + Math.random().toString(36).substring(2, 8);
      localStorage.setItem('racing_player_tag', tag);
    }
    return tag;
  }

  init(scene) {
    this.scene = scene;
    document.getElementById('myTag').value = this.myTag;
  }

  connect(serverUrl) {
    if (this.ws) this.ws.close();

    this.serverUrl = serverUrl || 'ws://localhost:8080';

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.ws.send(JSON.stringify({ type: 'join', tag: this.myTag }));
        this.showToast('Connected to server');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.showToast('Disconnected from server');
      };

      this.ws.onerror = () => {
        this.showToast('Could not connect — play offline or start a server');
      };
    } catch {
      this.showToast('Multiplayer server not available — playing offline');
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'peer_join':
        this.addPeer(msg.tag);
        break;

      case 'peer_leave':
        this.removePeer(msg.tag);
        break;

      case 'peer_update':
        this.updatePeer(msg.tag, msg.data);
        break;

      case 'peer_list':
        msg.tags.forEach(tag => {
          if (tag !== this.myTag) this.addPeer(tag);
        });
        break;
    }
  }

  addPeer(tag) {
    if (this.peers.has(tag) || tag === this.myTag) return;

    const def = CAR_DEFS[Math.floor(Math.random() * CAR_DEFS.length)];
    const mesh = buildCarMesh(def);
    if (this.scene) this.scene.add(mesh);

    this.peers.set(tag, {
      mesh,
      position: new THREE.Vector3(),
      rotation: 0,
      lastUpdate: performance.now(),
    });

    this.updatePlayerList();
    this.showToast(`${tag} joined`);
  }

  removePeer(tag) {
    const peer = this.peers.get(tag);
    if (peer) {
      if (this.scene) this.scene.remove(peer.mesh);
      this.peers.delete(tag);
      this.updatePlayerList();
      this.showToast(`${tag} left`);
    }
  }

  updatePeer(tag, data) {
    const peer = this.peers.get(tag);
    if (!peer) {
      this.addPeer(tag);
      return;
    }

    peer.position.set(data.x, data.y, data.z);
    peer.rotation = data.r;
    peer.lastUpdate = performance.now();
  }

  // Send local player state
  sendUpdate(position, rotation) {
    if (!this.connected || !this.ws) return;

    this.ws.send(JSON.stringify({
      type: 'update',
      tag: this.myTag,
      data: {
        x: position.x,
        y: position.y,
        z: position.z,
        r: rotation,
      },
    }));
  }

  // Interpolate peer meshes
  updateMeshes() {
    const now = performance.now();
    this.peers.forEach((peer) => {
      // Lerp position
      peer.mesh.position.lerp(peer.position, 0.15);
      // Lerp rotation
      let diff = peer.rotation - peer.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      peer.mesh.rotation.y += diff * 0.15;

      // Remove stale peers (no update for 10s)
      if (now - peer.lastUpdate > 10000) {
        if (this.scene) this.scene.remove(peer.mesh);
        // Mark for cleanup
        peer.stale = true;
      }
    });

    // Cleanup stale
    for (const [tag, peer] of this.peers) {
      if (peer.stale) this.peers.delete(tag);
    }
  }

  updatePlayerList() {
    const el = document.getElementById('connectedPlayers');
    if (!el) return;
    el.innerHTML = '';
    this.peers.forEach((_, tag) => {
      const span = document.createElement('span');
      span.className = 'player-tag';
      span.textContent = tag;
      el.appendChild(span);
    });
  }

  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.peers.forEach((peer) => {
      if (this.scene) this.scene.remove(peer.mesh);
    });
    this.peers.clear();
    this.connected = false;
  }
}

export const multiplayer = new MultiplayerManager();
