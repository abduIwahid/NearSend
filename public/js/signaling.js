export function connect({ onHello, onPeers, onSignal, onRelay, onBinary, onStatus }) {
  let ws, retry = 1000, stopped = false, currentId = null;
  const room = new URLSearchParams(location.search).get('room');
  function open() {
    if (stopped) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const query = room ? `?room=${encodeURIComponent(room)}` : '';
    ws = new WebSocket(`${proto}://${location.host}/${query}`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { retry = 1000; onStatus('connected'); };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') return onBinary?.(e.data);
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'hello') { currentId = m.id; onHello?.(m); }
      else if (m.type === 'peers') onPeers?.(m);
      else if (m.type === 'signal') onSignal?.(m);
      else if (m.type === 'relay') onRelay?.(m);
      else if (m.type === 'error') onStatus?.(m.message || 'Connection error');
    };
    ws.onclose = () => {
      if (stopped) return;
      onStatus('reconnecting');
      setTimeout(open, retry); retry = Math.min(retry * 2, 10000);
    };
    ws.onerror = () => {};
  }
  open();
  return {
    send: obj => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); },
    sendBinary: buf => { if (ws?.readyState === WebSocket.OPEN) ws.send(buf); },
    get buffered() { return ws?.bufferedAmount || 0; },
    get id() { return currentId; },
    close: () => { stopped = true; ws?.close(); }
  };
}