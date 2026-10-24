"""
NearSend signaling server — Python port for Hugging Face (Gradio) Spaces.

A protocol-compatible port of server/signaling.js + server/util.js from the
NearSend repo: same rooms, same JSON messages (hello / peers / signal /
relay / pair-request / pair-response / rename / error), same binary relay
framing (8-byte target-id prefix), same limits (20 connections/min/IP,
64 KB text cap, rename sanitising). The web frontend needs no changes —
it just connects here via SIGNAL_WS_URL instead of the same-origin /api/ws.

Runs as a FastAPI app so a small Gradio page can be mounted next to the
WebSocket endpoint for the Space landing page. Built for Gradio 5.x: the
Space pins sdk_version 5.50.0 (Gradio 6's internals break ZeroGPU's
startup detection of @spaces.GPU functions).
"""

import os

# The host may inject proxy variables (e.g. NO_PROXY containing bracketed
# IPv6 entries) that crash httpx while gradio is importing. This service
# makes no outbound HTTP calls, so drop them before anything imports httpx.
for _v in ('http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY',
           'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY'):
    os.environ.pop(_v, None)

import asyncio
import base64
import hashlib
import json
import os
import re
import time

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse

import spaces


# ZeroGPU (the only free hardware for Gradio Spaces) kills a Space at
# startup unless it detects a @spaces.GPU function. The signaling server
# is pure CPU, so this dummy exists only to pass that check - it is
# intentionally unused. (Placement matters: right after the imports is
# the arrangement known to be detected.)
@spaces.GPU(duration=1)
def _zerogpu_dummy():
    return None

# ---------------------------------------------------------------- util (port)
ADJ = ['Grey', 'Quiet', 'Swift', 'Calm', 'Bright', 'Plain', 'Steady', 'Silver']
ANI = ['Panda', 'Fox', 'Heron', 'Otter', 'Falcon', 'Lynx', 'Badger', 'Crane']


def _pick(seq):
    return seq[int.from_bytes(os.urandom(1), 'big') % len(seq)]


def random_name():
    return f"{_pick(ADJ)} {_pick(ANI)}"


def random_id():
    # Relay frames pad the sender id with 'x' to 8 bytes and receivers strip
    # trailing 'x' - so a minted id must never end in 'x' itself, or it
    # would decode truncated on the other side.
    while True:
        raw = base64.urlsafe_b64encode(os.urandom(6)).decode('ascii')[:8].lower()
        rid = re.sub(r'[^a-z0-9]', 'x', raw)
        if not rid.endswith('x'):
            return rid


def device_type(ua):
    ua = (ua or '').lower()
    if re.search(r'ipad|tablet', ua):
        return 'tablet'
    if re.search(r'mobi|android|iphone', ua):
        return 'phone'
    return 'laptop'


def client_ip(ws):
    # Behind the Hugging Face proxy the real client is the first
    # x-forwarded-for entry; fall back to the socket peer.
    xff = ws.headers.get('x-forwarded-for')
    if xff:
        return xff.split(',')[0].strip()
    return ws.client.host if ws.client else 'unknown'


def room_for(ws, code):
    if code:
        return 'c:' + str(code)[:12].lower()
    ip = client_ip(ws)
    return 'ip:' + hashlib.sha256((ip or 'unknown').encode()).hexdigest()[:16]


def ice_config():
    turn = None
    if os.environ.get('TURN_URL'):
        turn = {
            'urls': os.environ['TURN_URL'],
            'username': os.environ.get('TURN_USERNAME', ''),
            'credential': os.environ.get('TURN_CREDENTIAL', ''),
        }
    return {'stun': os.environ.get('STUN_URL', 'stun:stun.l.google.com:19302'), 'turn': turn}


ICE = ice_config()

# ------------------------------------------------------------- signaling core
rooms = {}            # room -> {peer_id: Peer}
connect_log = {}      # ip -> [timestamps]


class Peer:
    def __init__(self, ws, room):
        self.ws = ws
        self.room = room
        self.id = random_id()
        self.name = random_name()
        self.type = device_type(ws.headers.get('user-agent'))
        self.last_message = 0.0
        self.lock = asyncio.Lock()

    async def send_json(self, obj):
        async with self.lock:
            try:
                await self.ws.send_text(json.dumps(obj))
            except Exception:
                pass

    async def send_bytes(self, data):
        async with self.lock:
            try:
                await self.ws.send_bytes(data)
            except Exception:
                pass


async def broadcast(room):
    peers = rooms.get(room)
    if not peers:
        return
    for p in list(peers.values()):
        others = [
            {'id': o.id, 'name': o.name, 'deviceType': o.type}
            for o in peers.values() if o.id != p.id
        ]
        await p.send_json({'type': 'peers', 'list': others})


app = FastAPI()


@app.get('/healthz', response_class=PlainTextResponse)
async def healthz():
    return 'ok'


@app.websocket('/api/ws')
async def ws_endpoint(ws: WebSocket):
    ip = client_ip(ws)
    now = time.time()
    recent = [t for t in connect_log.get(ip, []) if now - t < 60]
    if len(recent) >= 20:
        await ws.accept()
        await ws.close(code=1008)
        return
    recent.append(now)
    connect_log[ip] = recent

    await ws.accept()
    room = room_for(ws, ws.query_params.get('room'))
    peer = Peer(ws, room)
    rooms.setdefault(room, {})[peer.id] = peer
    await peer.send_json({
        'type': 'hello', 'id': peer.id, 'name': peer.name,
        'deviceType': peer.type, 'stun': ICE['stun'], 'turn': ICE['turn'],
    })
    await broadcast(room)

    try:
        while True:
            msg = await ws.receive()
            if msg['type'] == 'websocket.disconnect':
                break
            data_bytes = msg.get('bytes')
            data_text = msg.get('text')
            peers = rooms.get(room, {})

            if data_bytes is not None:
                # Binary relay frame: target peer ID (8 ASCII bytes) + payload.
                if len(data_bytes) < 8:
                    continue
                if len(data_bytes) > 64 * 1024 + 8:
                    continue
                target_id = data_bytes[:8].decode('ascii', errors='ignore')
                target = peers.get(target_id)
                if target is not None:
                    head = peer.id.ljust(8, 'x')[:8].encode('ascii')
                    await target.send_bytes(head + data_bytes[8:])
                continue

            if data_text is None:
                continue
            if len(data_text.encode('utf-8')) > 65536:
                continue
            ts = time.time()
            if ts - peer.last_message < 0.005:
                continue
            peer.last_message = ts
            try:
                m = json.loads(data_text)
            except Exception:
                continue
            if not isinstance(m, dict):
                continue

            if m.get('type') in ('signal', 'relay', 'pair-request', 'pair-response'):
                to = m.get('to')
                if not isinstance(to, str) or to not in peers:
                    continue
                clean = {k: v for k, v in m.items() if k != 'to'}
                clean['from'] = peer.id
                await peers[to].send_json(clean)
            elif m.get('type') == 'rename' and isinstance(m.get('name'), str):
                clean = re.sub(r'[<>]', '', m['name']).strip()[:24]
                if clean:
                    peer.name = clean
                    await broadcast(room)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        peers = rooms.get(room)
        if peers and peer.id in peers:
            del peers[peer.id]
            if not peers:
                rooms.pop(room, None)
            else:
                await broadcast(room)


# --------------------------------------------------------------- Space front
# NOTE: the landing page is a plain gradio mount; the ZeroGPU dummy
# function lives at the top of this file, next to the imports.
import gradio as gr


with gr.Blocks() as demo:
    gr.Markdown(
        "# NearSend Signaling\n"
        "WebSocket signaling server for NearSend's online mode "
        "(device discovery, pairing and relay fallback).\n\n"
        "This Space is a backend service, not a website.\n\n"
        "Open the app: https://share-any-file.vercel.app  \n"
        "Source: https://github.com/abduIwahid/NearSend"
    )
app = gr.mount_gradio_app(app, demo, path='/')


if __name__ == '__main__':
    import uvicorn

    # Port is FIXED at 7860, the Hugging Face Spaces contract. Do NOT read
    # GRADIO_SERVER_PORT here: on the Space it points at 7861, which the
    # platform's own component already occupies - uvicorn died at startup
    # with "[Errno 98] address already in use" (seen in the Space's
    # container logs, 2026-10-24). NEARSEND_PORT exists only for local tests.
    port = int(os.environ.get('NEARSEND_PORT') or 7860)
    # ws_ping_interval/timeout mirror the Node server's 15 s heartbeat:
    # dead peers are dropped by the server instead of lingering in rooms.
    uvicorn.run(app, host='0.0.0.0', port=port,
                ws_max_size=128 * 1024, ws_ping_interval=15, ws_ping_timeout=20)
