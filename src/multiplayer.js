// Multiplayer via WebSocket — connects to macOS Sonoma server on Render
// Uses /velocity path with room-based matchmaking (no JWT needed)

import * as THREE from 'three';
import { buildCarMesh, CAR_DEFS } from './garage.js';

// Server URL — uses the macOS Sonoma backend
const WS_SERVER = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `ws://${window.location.hostname}:3001/velocity`
  : 'wss://macos-sonoma.onrender.com/velocity';

class MultiplayerManager {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.myTag = this._loadTag();
    this.roomId = 'freeroam';
    this.peers = new Map(); // tag → { mesh, position, rotation, lastUpdate }
    this.scene = null;
    this.onRaceEvent = null; // callback for race events from other players
  }

  _loadTag() {
    let tag = localStorage.getItem('racing_player_tag');
    if (!tag) {
      tag = '#' + Math.random().toString(36).substring(2, 8);
      localStorage.setItem('racing_player_tag', tag);
    }
    return tag;
  }

  init(scene) {
    this.scene = scene;
    const tagEl = document.getElementById('myTag');
    if (tagEl) tagEl.value = this.myTag;
  }

  connect(roomId = 'freeroam') {
    if (this.ws) this.disconnect();
    this.roomId = roomId;

    const url = `${WS_SERVER}?tag=${encodeURIComponent(this.myTag)}&room=${encodeURIComponent(roomId)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        this._showToast(`Connected to ${roomId === 'freeroam' ? 'Free Roam' : 'Race'} server`);
        this._updateStatus(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        this._updateStatus(false);
      };

      this.ws.onerror = () => {
        this._showToast('Could not connect — playing offline');
        this._updateStatus(false);
      };
    } catch {
      this._showToast('Multiplayer not available — playing offline');
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'peer_join':
        this._addPeer(msg.tag);
        break;

      case 'peer_leave':
        this._removePeer(msg.tag);
        break;

      case 'peer_update':
        this._updatePeer(msg.tag, msg.data);
        break;

      case 'peer_list':
        msg.tags.forEach(tag => {
          if (tag !== this.myTag) this._addPeer(tag);
        });
        break;

      case 'race_event':
        if (this.onRaceEvent) this.onRaceEvent(msg.tag, msg.event, msg.payload);
        break;
    }
  }

  _addPeer(tag) {
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

    this._updatePlayerList();
    this._showToast(`${tag} joined`);
  }

  _removePeer(tag) {
    const peer = this.peers.get(tag);
    if (peer) {
      if (this.scene) this.scene.remove(peer.mesh);
      this.peers.delete(tag);
      this._updatePlayerList();
      this._showToast(`${tag} left`);
    }
  }

  _updatePeer(tag, data) {
    let peer = this.peers.get(tag);
    if (!peer) {
      this._addPeer(tag);
      peer = this.peers.get(tag);
      if (!peer) return;
    }

    peer.position.set(data.x, data.y, data.z);
    peer.rotation = data.r;
    peer.lastUpdate = performance.now();
  }

  // Send local player state — throttled to ~20 updates/sec
  sendUpdate(position, rotation) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;

    this.ws.send(JSON.stringify({
      type: 'update',
      data: {
        x: Math.round(position.x * 10) / 10,
        y: Math.round(position.y * 10) / 10,
        z: Math.round(position.z * 10) / 10,
        r: Math.round(rotation * 100) / 100,
      },
    }));
  }

  // Send race events (countdown start, finish, etc.)
  sendRaceEvent(event, payload = {}) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'race_event', event, payload }));
  }

  // Interpolate peer meshes toward their target positions
  updateMeshes() {
    const now = performance.now();
    this.peers.forEach((peer, tag) => {
      peer.mesh.position.lerp(peer.position, 0.15);
      let diff = peer.rotation - peer.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      peer.mesh.rotation.y += diff * 0.15;

      // Remove stale peers (no update for 10s)
      if (now - peer.lastUpdate > 10000) {
        if (this.scene) this.scene.remove(peer.mesh);
        peer.stale = true;
      }
    });

    // Cleanup stale
    for (const [tag, peer] of this.peers) {
      if (peer.stale) this.peers.delete(tag);
    }
  }

  _updatePlayerList() {
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

  _updateStatus(connected) {
    const el = document.getElementById('mpStatus');
    if (el) {
      el.textContent = connected ? `Online (${this.peers.size + 1} players)` : 'Offline';
      el.style.color = connected ? '#00ff88' : '#ff4444';
    }
  }

  _showToast(msg) {
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
    this._updateStatus(false);
  }
}

export const multiplayer = new MultiplayerManager();
