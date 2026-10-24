// Smoke test for the signaling layer: boots the real attach() from
// server/signaling.js on an ephemeral port and verifies that two clients
// in the same room discover each other and can exchange a signal message.
// Run with: npm test
const http = require('http');
const assert = require('assert');
const { WebSocketServer, WebSocket } = require('ws');
const { attach } = require('../server/signaling');

const waitFor = (inbox, pred, label, ms = 3000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => {
    const m = inbox.find(pred);
    if (m) resolve(m);
    else if (Date.now() - t0 > ms) reject(new Error('timeout waiting for ' + label));
    else setTimeout(tick, 25);
  };
  tick();
});

async function main() {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  attach(wss, { mode: 'online' });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/api/ws?room=test1`;

  const mk = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    ws.on('message', d => {
      const m = JSON.parse(d.toString());
      inbox.push(m);
      if (m.type === 'hello') resolve({ ws, inbox, hello: m });
    });
    ws.on('error', reject);
  });

  const a = await mk();
  const b = await mk();
  assert.notStrictEqual(a.hello.id, b.hello.id, 'peer ids must differ');
  assert.ok('stun' in a.hello && 'turn' in a.hello, 'hello must carry ICE config');

  // A receives an (empty) peers list on its own join, then a fresh one when
  // B joins - wait for the one that actually contains B.
  await waitFor(a.inbox, m => m.type === 'peers' && m.list.some(p => p.id === b.hello.id), 'A discovering B');

  a.ws.send(JSON.stringify({ type: 'signal', to: b.hello.id, kind: 'offer', data: { sdp: 'x' } }));
  const sig = await waitFor(b.inbox, m => m.type === 'signal', 'signal delivery');
  assert.strictEqual(sig.from, a.hello.id);
  assert.strictEqual(sig.kind, 'offer');

  a.ws.close(); b.ws.close();
  wss.close(); server.close();
  console.log('signaling smoke test: PASS');
}

main().catch(e => { console.error('signaling smoke test: FAIL —', e.message); process.exit(1); });
