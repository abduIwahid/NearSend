export function createPeer({ remoteId, stun, ice, signalSend, initiator, onChannel }) {
  const cfg = ice || (stun ? { stun, turn: null } : { stun: null, turn: null });
  const iceServers = [];
  if (cfg.stun) iceServers.push({ urls: cfg.stun });
  if (cfg.turn && cfg.turn.urls) iceServers.push({ urls: cfg.turn.urls, username: cfg.turn.username || undefined, credential: cfg.turn.credential || undefined });
  const pc = new RTCPeerConnection({ iceServers });
  const pending = []; let remoteSet = false;
  pc.onicecandidate = e => { if (e.candidate) signalSend({ to: remoteId, kind: 'ice', data: e.candidate }); };
  pc.ondatachannel = e => onChannel(e.channel);
  async function handle({ kind, data }) {
    try {
      if (kind === 'offer') {
        await pc.setRemoteDescription(data); remoteSet = true;
        for (const c of pending.splice(0)) await pc.addIceCandidate(c);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        signalSend({ to: remoteId, kind: 'answer', data: pc.localDescription });
      } else if (kind === 'answer') {
        await pc.setRemoteDescription(data); remoteSet = true;
        for (const c of pending.splice(0)) await pc.addIceCandidate(c);
      } else if (kind === 'ice') {
        if (remoteSet) await pc.addIceCandidate(data); else pending.push(data);
      }
    } catch (e) { console.error('WebRTC signaling failed', e); }
  }
  async function start() {
    const ch = pc.createDataChannel('files', { ordered: true });
    ch.binaryType = 'arraybuffer'; onChannel(ch);
    await pc.setLocalDescription(await pc.createOffer());
    signalSend({ to: remoteId, kind: 'offer', data: pc.localDescription });
  }
  return { pc, handle, start, close: () => pc.close() };
}