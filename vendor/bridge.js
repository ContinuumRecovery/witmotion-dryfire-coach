/* =========================================================================
   Dry-Fire Coach — Phone↔Laptop bridge (WebRTC P2P via PeerJS)
   ---------------------------------------------------------------------------
   - PHONE role: streams camera track + telemetry/shot data to LAPTOP
   - LAPTOP role: receives video + data, renders dashboard
   - Peer broker: PeerJS public broker (no server to run). Switch BROKER
     to a self-hosted PeerServer instance to avoid third-party dependency.
   - Channels:
       video: MediaStream (rear camera)
       data:  reliable, ordered DataChannel with JSON messages
         { type: 'telemetry', laser: {x,y}|null, target: string, ... }
         { type: 'shot', t, devIn, moa, score, source, jerk:{...}, preShot:{laser:[], imu:[]} }
         { type: 'state', mode, sessionShots, sessionArmed, ... }
   ========================================================================= */

(function(global){
  'use strict';

  // PeerJS public broker (free, no API key needed for prototyping).
  // To self-host: see https://github.com/peers/peerjs-server
  const BROKER = { host: '0.peerjs.com', port: 443, path: '/', secure: true };

  // Channel-name constant kept short to keep bandwidth low
  const CHAN = 'dryfire';

  // Generate a friendly 6-char alphanumeric session code (no ambiguous chars)
  function makeCode(){
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
    let c = '';
    for (let i=0;i<6;i++) c += A[Math.floor(Math.random()*A.length)];
    return c;
  }

  // Peer IDs derived from the session code so both sides can predict them.
  // Phone owns the "host" id; Laptop dials it.
  const phoneId  = code => `dfc-phone-${code}`;
  const laptopId = code => `dfc-laptop-${code}`;

  class Bridge {
    constructor(){
      this.peer = null;
      this.conn = null;        // DataConnection
      this.call = null;        // MediaConnection
      this.role = null;        // 'phone' | 'laptop'
      this.code = null;
      this.listeners = { open: [], peer: [], data: [], stream: [], close: [], error: [] };
    }

    on(ev, fn){ (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; }
    _emit(ev, ...a){ (this.listeners[ev] || []).forEach(fn => { try { fn(...a); } catch(e){ console.error(e); } }); }

    _ensurePeer(){
      if (!global.Peer) throw new Error('PeerJS not loaded');
    }

    /** PHONE: create a peer with a deterministic id derived from the code,
     *  then wait for the laptop to dial in. */
    hostAsPhone(code){
      this._ensurePeer();
      this.role = 'phone';
      this.code = code;
      const Peer = global.Peer;
      this.peer = new Peer(phoneId(code), BROKER);

      this.peer.on('open', id => { this._emit('open', { id, code, role: this.role }); });
      this.peer.on('error', e => { this._emit('error', e); });

      // Laptop will open a data connection to us
      this.peer.on('connection', conn => {
        this.conn = conn;
        this._wireConn(conn);
      });
      // Laptop may also call us back (not used; phone calls laptop)
      this.peer.on('call', call => {
        // Phone is the caller; it shouldn't receive calls. Answer with no media to be safe.
        try { call.answer(); } catch(e){}
      });
      return this;
    }

    /** PHONE: after stream + connection established, push the camera track */
    pushStream(stream){
      if (!this.peer || !this.conn) return;
      this.localStream = stream;
      // Call the laptop peer with the stream
      this.call = this.peer.call(laptopId(this.code), stream);
      if (this.call){
        this.call.on('close', () => this._emit('close', 'media'));
        this.call.on('error', e => this._emit('error', e));
      }
    }

    /** LAPTOP: create a peer for itself, then dial the phone peer */
    joinAsLaptop(code){
      this._ensurePeer();
      this.role = 'laptop';
      this.code = code;
      const Peer = global.Peer;
      this.peer = new Peer(laptopId(code), BROKER);

      this.peer.on('open', () => {
        this._emit('open', { id: laptopId(code), code, role: this.role });
        // Dial phone's data channel
        const conn = this.peer.connect(phoneId(code), { reliable: true, label: CHAN });
        this.conn = conn;
        this._wireConn(conn);
      });
      this.peer.on('error', e => this._emit('error', e));
      // Phone will call us (video). Auto-answer with no outgoing media.
      this.peer.on('call', call => {
        this.call = call;
        try { call.answer(); } catch(e){}
        call.on('stream', remote => this._emit('stream', remote));
        call.on('close', () => this._emit('close', 'media'));
        call.on('error', e => this._emit('error', e));
      });
      return this;
    }

    _wireConn(conn){
      conn.on('open', () => this._emit('peer', { id: conn.peer }));
      conn.on('data', data => this._emit('data', data));
      conn.on('close', () => this._emit('close', 'data'));
      conn.on('error', e => this._emit('error', e));
    }

    send(obj){
      if (this.conn && this.conn.open){
        try { this.conn.send(obj); return true; } catch(e){ return false; }
      }
      return false;
    }

    destroy(){
      try { this.call && this.call.close(); } catch(e){}
      try { this.conn && this.conn.close(); } catch(e){}
      try { this.peer && this.peer.destroy(); } catch(e){}
      this.peer = this.conn = this.call = null;
    }
  }

  global.DryFireBridge = { Bridge, makeCode, phoneId, laptopId };
})(window);
