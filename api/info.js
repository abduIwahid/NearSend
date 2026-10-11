module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).json({
    mode: 'online',
    urls: [],
    stun: process.env.STUN_URL || 'stun:stun.l.google.com:19302'
  });
};
