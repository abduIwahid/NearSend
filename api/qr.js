const QRCode = require('qrcode');
module.exports = async function handler(req, res) {
  const text = String(req.query.text || '').slice(0, 500);
  if (!text || !/^https?:\/\//i.test(text)) return res.status(400).send('Invalid QR text');
  try {
    const data = await QRCode.toDataURL(text, { margin: 1, width: 180, color: { dark: '#111111', light: '#ffffff' } });
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/plain').status(200).send(data);
  } catch { res.status(500).send('QR generation failed'); }
};
