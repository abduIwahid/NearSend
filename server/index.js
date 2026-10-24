const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { attach } = require('./signaling');
const { lanUrls, iceConfig } = require('./util');

const PORT = Number(process.env.PORT || 3000);
const MODE = process.env.MODE === 'online' ? 'online' : 'local';
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.static('public', { extensions: ['html'] }));
app.get('/healthz', (_, res) => res.status(200).send('ok'));
app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text || !/^https?:\/\//i.test(text)) return res.status(400).send('Invalid QR text');
  try { res.type('text/plain').send(await QRCode.toDataURL(text, { margin: 1, width: 180, color: { dark: '#111111', light: '#ffffff' } })); }
  catch { res.status(500).send('QR generation failed'); }
});
app.get('/api/info', (_, res) => { const ice = iceConfig(MODE); res.json({
  mode: MODE, urls: MODE === 'local' ? lanUrls(PORT) : [],
  stun: ice.stun, turn: ice.turn,
  signal: process.env.SIGNAL_WS_URL || null
});});
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });
attach(wss, { mode: MODE });
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nNearSend running (${MODE} mode)`);
  const urls = lanUrls(PORT);
  if (MODE === 'local') {
    if (!urls.length) console.log(`  http://localhost:${PORT}`);
    urls.forEach(u => { console.log('  ' + u); qrcode.generate(u, { small: true }); });
  } else console.log(`  Port: ${PORT}`);
  console.log('Keep this terminal open while sharing files.\n');
});