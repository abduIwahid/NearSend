module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const turn = process.env.TURN_URL
    ? { urls: process.env.TURN_URL, username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' }
    : null;
  res.status(200).json({
    mode: 'online',
    urls: [],
    stun: process.env.STUN_URL || 'stun:stun.l.google.com:19302',
    turn,
    // When SIGNAL_WS_URL points at a separately hosted signaling server,
    // the web app connects there instead of this deployment's /api/ws
    // (whose in-memory rooms cannot guarantee two clients meet).
    signal: process.env.SIGNAL_WS_URL || null
  });
};
