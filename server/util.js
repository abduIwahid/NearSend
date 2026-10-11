const os = require('os');
const crypto = require('crypto');

const ADJ = ['Grey','Quiet','Swift','Calm','Bright','Plain','Steady','Silver'];
const ANI = ['Panda','Fox','Heron','Otter','Falcon','Lynx','Badger','Crane'];
const pick = a => a[Math.floor(Math.random() * a.length)];
exports.randomName = () => `${pick(ADJ)} ${pick(ANI)}`;
exports.randomId = () => crypto.randomBytes(6).toString('base64url').slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, 'x');
exports.deviceType = ua => {
  ua = (ua || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'phone';
  return 'laptop';
};
exports.lanUrls = port => {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
  return [...new Set(out)];
};
exports.roomFor = (req, mode, code) => {
  if (code) return 'c:' + String(code).slice(0, 12).toLowerCase();
  if (mode === 'local') return 'local';
  const forwarded = process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
  return 'ip:' + crypto.createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 16);
};