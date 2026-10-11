// Vercel Functions WebSocket beta endpoint.
// IMPORTANT: the signaling registry currently lives in memory. Vercel does not
// guarantee that separate clients land on the same Function instance. For
// reliable production discovery, move rooms/presence/signaling to shared Redis.
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { attach } = require('../server/signaling');

const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });
attach(wss, { mode: 'online' });
module.exports = server;
