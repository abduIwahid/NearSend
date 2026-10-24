// Protocol compatibility test against ANY running NearSend signaling server
// (Node or the Python port). Usage: NS_TEST_URL=ws://127.0.0.1:8901 npm run test:remote
// Verifies: hello shape, discovery, signal forwarding, rename broadcast,
// binary relay framing.
const assert = require('assert');
const { WebSocket } = require('ws');

const base = process.env.NS_TEST_URL;
if (!base) { console.error('NS_TEST_URL is not set'); process.exit(2); }
const url = base.replace(/\/$/, '') + '/api/ws?room=compat1';

const waitFor = (inbox, pred, label, ms = 4000) => new Promise((resolve, reject) => {
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
  const mk = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    ws.on('message', (d, isBinary) => {
      if (isBinary) { inbox.push({ type: '__binary', data: Buffer.from(d) }); return; }
      const m = JSON.parse(d.toString());
      inbox.push(m);
      if (m.type === 'hello') resolve({ ws, inbox, hello: m });
    });
    ws.on('error', reject);
  });

  const a = await mk();
  const b = await mk();
  assert.notStrictEqual(a.hello.id, b.hello.id, 'peer ids must differ');
  assert.match(a.hello.id, /^[a-z0-9]{8}$/, 'peer id format');
  assert.ok('stun' in a.hello && 'turn' in a.hello, 'hello must carry ICE config');
  assert.ok(a.hello.name && a.hello.deviceType, 'hello must carry name + deviceType');

  await waitFor(a.inbox, m => m.type === 'peers' && m.list.some(p => p.id === b.hello.id), 'A discovering B');

  a.ws.send(JSON.stringify({ type: 'signal', to: b.hello.id, kind: 'offer', data: { sdp: 'x' } }));
  const sig = await waitFor(b.inbox, m => m.type === 'signal', 'signal delivery');
  assert.strictEqual(sig.from, a.hello.id);
  assert.strictEqual(sig.kind, 'offer');
  assert.ok(!('to' in sig), 'forwarded message must not carry "to"');

  // Rename: B renames, A should see the new name in a fresh peers list.
  b.ws.send(JSON.stringify({ type: 'rename', name: 'Test <Phone>' }));
  const renamed = await waitFor(a.inbox, m => m.type === 'peers' && m.list.some(p => p.id === b.hello.id && p.name === 'Test Phone'), 'rename broadcast');
  assert.ok(renamed, 'rename should be sanitised and broadcast');

  // Binary relay: A -> frame(target=B.id, payload) => B gets frame(from=A.id, payload).
  const payload = Buffer.from('hello-relay');
  const frame = Buffer.concat([Buffer.from(b.hello.id.padEnd(8, 'x').slice(0, 8)), payload]);
  a.ws.send(frame);
  const bin = await waitFor(b.inbox, m => m.type === '__binary', 'binary relay');
  assert.strictEqual(bin.data.subarray(0, 8).toString().replace(/x+$/, ''), a.hello.id, 'relay frame sender id');
  assert.strictEqual(bin.data.subarray(8).toString(), 'hello-relay', 'relay payload');

  a.ws.close(); b.ws.close();
  console.log('signaling compat test: PASS (' + base + ')');
}

main().catch(e => { console.error('signaling compat test: FAIL —', e.message); process.exit(1); });
