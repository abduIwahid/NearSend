const { randomId, randomName, deviceType, roomFor, iceConfig } = require('./util');
const rooms = new Map();
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function broadcast(room) {
  const peers = rooms.get(room);
  if (!peers) return;
  for (const p of peers.values()) {
    const list = [...peers.values()].filter(o => o.id !== p.id)
      .map(o => ({ id: o.id, name: o.name, deviceType: o.type }));
    send(p.ws, { type: 'peers', list });
  }
}
exports.attach = (wss, { mode }) => {
  const ice = iceConfig(mode);
  const connectionCounts = new Map();
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const old = (connectionCounts.get(ip) || []).filter(t => now - t < 60000);
    if (old.length >= 20) { ws.close(1008, 'Connection rate limit'); return; }
    old.push(now); connectionCounts.set(ip, old);
    const url = new URL(req.url, 'http://localhost');
    const room = roomFor(req, mode, url.searchParams.get('room'));
    const peer = { id: randomId(), name: randomName(), type: deviceType(req.headers['user-agent']), room, ws, alive: true, lastMessage: 0 };
    if (!rooms.has(room)) rooms.set(room, new Map());
    rooms.get(room).set(peer.id, peer);
    send(ws, { type: 'hello', id: peer.id, name: peer.name, deviceType: peer.type,
      stun: ice.stun, turn: ice.turn });
    broadcast(room);
    ws.on('pong', () => { peer.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary relay frames: target peer ID (8 ASCII bytes) + payload.
        if (data.length < 8) return;
        const targetId = data.subarray(0, 8).toString();
        const target = rooms.get(room)?.get(targetId);
        if (target && target.ws.readyState === 1 && data.length <= 64 * 1024 + 8) {
          target.ws.send(Buffer.concat([Buffer.from(peer.id.padEnd(8, 'x').slice(0,8)), data.subarray(8)]), { binary: true });
        }
        return;
      }
      if (data.length > 65536) return;
      if (Date.now() - peer.lastMessage < 5) return;
      peer.lastMessage = Date.now();
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      const peers = rooms.get(room);
      if (msg.type === 'signal' || msg.type === 'relay' || msg.type === 'pair-request' || msg.type === 'pair-response') {
        if (typeof msg.to !== 'string' || !peers?.has(msg.to)) return;
        const target = peers.get(msg.to);
        const clean = { ...msg, to: undefined, from: peer.id };
        send(target.ws, clean);
      } else if (msg.type === 'rename' && typeof msg.name === 'string') {
        peer.name = msg.name.replace(/[<>]/g, '').trim().slice(0, 24) || peer.name;
        broadcast(room);
      }
    });
    ws.on('close', () => {
      const peers = rooms.get(room); peers?.delete(peer.id);
      if (peers && peers.size === 0) rooms.delete(room); else broadcast(room);
    });
  });
  const heartbeat = setInterval(() => {
    for (const peers of rooms.values()) for (const p of peers.values()) {
      if (!p.alive) { p.ws.terminate(); continue; }
      p.alive = false; p.ws.ping();
    }
    for (const [ip, times] of connectionCounts) {
      const recent = times.filter(t => Date.now() - t < 60000);
      if (recent.length) connectionCounts.set(ip, recent); else connectionCounts.delete(ip);
    }
  }, 15000);
  wss.on('close', () => clearInterval(heartbeat));
};