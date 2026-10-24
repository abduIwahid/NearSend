const $ = id => document.getElementById(id);
import { connect } from './signaling.js';
import { createPeer } from './peer.js';
import { TransferManager } from './transfer.js';
import { UI } from './ui.js';

const ui=new UI();
const peers=new Map(), peerConnections=new Map(), pendingFiles={};
let self=null, ice=null, mode='local', transferManager, queuedFiles=null;
const pairedDevices=new Set();let incomingPairRequest=null;
const nameKey='nearsend-device-name';
function signalSend(m){sig.send({type:'signal',...m});}
function requestPair(p){if(!peers.has(p.id))return;sig.send({type:'pair-request',to:p.id,name:self?.name||'Nearby device'});ui.toast(`Connection request sent to ${p.name}. Waiting for acceptance…`);}
function showPairRequest(m){incomingPairRequest=m;const who=peers.get(m.from)?.name||m.name||'A nearby device';$('pairRequestText').textContent=`${who} wants to connect and share files with you. Accept only if you recognize this device.`;$('pairRequestBackdrop').hidden=false;}
function handlePairResponse(m){if(m.accepted){pairedDevices.add(m.from);ui.toast(`${peers.get(m.from)?.name||'Device'} accepted. Establishing connection…`);const p=peers.get(m.from);if(p)beginPairConnection(p);}else ui.toast(`${peers.get(m.from)?.name||'Device'} declined the connection request.`,true);}
function beginPairConnection(p,initiator=true){let entry=peerConnections.get(p.id);if(!entry||entry.peer.pc.connectionState==='closed'){entry=makePeer(p.id,initiator);peerConnections.set(p.id,entry);}ui.toast(`Connecting to ${p.name}…`);setTimeout(()=>{if(transferManager.channels.get(p.id)?.readyState==='open'){pairedDevices.add(p.id);ui.toast(`Connected to ${p.name}. Choose files to send.`);}else if(!transferManager.channels.has(p.id))ui.toast(`Still connecting to ${p.name}. Keep both pages open.`,true);},2500);}
let sig;
function startSignaling(signalUrl){
  sig=connect({
  signalUrl,
  onHello:m=>{
    ui.hideConnectionLoading();
    self=m;ice={stun:m.stun||null,turn:m.turn||null};const saved=localStorage.getItem(nameKey);
    ui.setSelf(saved||m.name);
    if(saved&&saved!==m.name)sig.send({type:'rename',name:saved});
    ui.setStatus('Connected',mode);
  },
  onPeers:m=>{ui.hideConnectionLoading();peers.clear();m.list.forEach(p=>peers.set(p.id,p));ui.renderDevices(m.list,pickFiles);},
  onPairRequest:m=>showPairRequest(m),
  onPairResponse:m=>handlePairResponse(m),
  onSignal:async m=>{
    let entry=peerConnections.get(m.from);
    if(!entry){
      entry=makePeer(m.from,false);peerConnections.set(m.from,entry);
    }
    await entry.peer.handle(m);
  },
  onRelay:m=>handleRelayControl(m),
  onBinary:data=>handleRelayBinary(data),
  onStatus:s=>{ui.setStatus(s,mode);if(s==='reconnecting')ui.toast('Connection lost. Reconnecting…',true);}
  });
}
transferManager=new TransferManager({ui,sendSignal:signalSend});

function makePeer(id,initiator){
  const entry={peer:null,channel:null,relayTimer:null};
  const peer=createPeer({remoteId:id,ice,initiator,signalSend,onChannel:ch=>{
    entry.channel=ch;ch.binaryType='arraybuffer';
    ch.onopen=()=>{clearTimeout(entry.relayTimer);transferManager.register(id,ch);ui.toast(`Connected to ${peers.get(id)?.name||'device'}`);};
    ch.onclose=()=>{if(entry.channel===ch)entry.channel=null;};
    ch.onerror=()=>{};
  }});
  entry.peer=peer;
  if(initiator){
    entry.relayTimer=setTimeout(()=>{if(entry.channel?.readyState!=='open')activateRelay(id);},new URLSearchParams(location.search).has('relay')?0:8000);
    peer.start().catch(()=>activateRelay(id));
  }
  return entry;
}
async function pickFiles(p,dropFiles){
  if(!peers.has(p.id))return;
  if(!pairedDevices.has(p.id)){requestPair(p);return;}
  if(!transferManager.channels.get(p.id)||transferManager.channels.get(p.id).readyState!=='open'){beginPairConnection(p);return;}
  if(dropFiles?.length){queuedFiles=null;updateSelectedFiles(null);beginSend(p,dropFiles);return;}
  if(queuedFiles?.length){const files=queuedFiles;queuedFiles=null;updateSelectedFiles(null);beginSend(p,files);return;}
  $('fileInput').value='';
  $('fileInput').onchange=()=>{
    const selected=$('fileInput').files;
    if(selected.length){queuedFiles=Array.from(selected);updateSelectedFiles(queuedFiles);beginSend(p,queuedFiles);queuedFiles=null;updateSelectedFiles(null);}
  };
  $('fileInput').click();
}
function updateSelectedFiles(files){
  const label=$('selectedFilesLabel');
  if(!files?.length){label.textContent='Choose files from your device or drag and drop them here.';return;}
  const total=files.reduce((sum,f)=>sum+f.size,0);
  label.textContent=`${files.length} file${files.length===1?'':'s'} selected · ${formatSize(total)}. Tap a device below to send.`;
}
function formatSize(bytes){
  if(bytes<1024)return `${bytes} B`;
  const units=['KB','MB','GB','TB'];let size=bytes/1024,i=0;
  while(size>=1024&&i<units.length-1){size/=1024;i++;}
  return `${size.toFixed(size>=10?1:2)} ${units[i]}`;
}
const dropZone=$('fileDropZone');
$('chooseFilesButton').addEventListener('click',()=>{const input=$('fileInput');input.value='';input.onchange=()=>{const files=Array.from(input.files||[]);if(!files.length)return;queuedFiles=files;updateSelectedFiles(files);if(peers.size===1){const target=peers.values().next().value;queuedFiles=null;updateSelectedFiles(null);beginSend(target,files);}else if(!peers.size){ui.toast('No nearby devices yet. Keep these files selected, then try again when a device appears.',true);queuedFiles=files;updateSelectedFiles(files);}else{ui.toast('Files selected. Tap the device you want to send them to.');}};try{input.click();}catch(e){ui.toast('Your browser blocked the file picker. Try again or use drag and drop.',true);}});
for(const eventName of ['dragenter','dragover'])dropZone.addEventListener(eventName,e=>{e.preventDefault();dropZone.classList.add('dragover');});
for(const eventName of ['dragleave','drop'])dropZone.addEventListener(eventName,e=>{e.preventDefault();if(eventName==='dragleave'&&dropZone.contains(e.relatedTarget))return;dropZone.classList.remove('dragover');if(eventName==='drop'&&e.dataTransfer?.files?.length){const files=Array.from(e.dataTransfer.files);queuedFiles=files;updateSelectedFiles(files);if(peers.size===1){const target=peers.values().next().value;queuedFiles=null;updateSelectedFiles(null);beginSend(target,files);}else if(peers.size>1){ui.toast('Files selected. Tap the device you want to send them to.');}else ui.toast('No nearby devices found yet. Keep this page open and try again.',true);}});
async function beginSend(p,files){
  let entry=peerConnections.get(p.id);
  if(!entry||entry.peer.pc.connectionState==='closed'){
    entry=makePeer(p.id,true);peerConnections.set(p.id,entry);
  }else if(entry.channel?.readyState!=='open'&&entry.peer.pc.connectionState==='new'){
    // Existing negotiation is already in progress.
  }
  ui.toast(`Connecting to ${p.name}…`);
  const start=Date.now();
  while(Date.now()-start<10000 && !transferManager.channels.get(p.id)){
    if(entry.channel?.readyState==='open')transferManager.register(p.id,entry.channel);
    await new Promise(r=>setTimeout(r,100));
  }
  if(!transferManager.channels.get(p.id))activateRelay(p.id);
  const ch=transferManager.channels.get(p.id);
  if(!ch||ch.readyState!=='open'){ui.toast('Could not connect. Check both devices are on the same room/network.',true);return;}
  try{await transferManager.sendFiles(p.id,files,p.name);}catch(e){ui.toast(e.message,true);}
}
function activateRelay(id){
  const p=peers.get(id);if(!p)return;
  const current=peerConnections.get(id);
  if(current?.channel?.readyState==='open')return;
  if(current?.peer)current.peer.close();
  const relay=makeRelayChannel(id);transferManager.register(id,relay);
  ui.toast('Direct connection failed. Using relay (slower).');
}
function makeRelayChannel(peerId){
  const listeners=new Set();
  const ch={readyState:'open',bufferedAmount:0,bufferedAmountLowThreshold:262144,onmessage:null,onopen:null,onclose:null,
    send(data){
      if(typeof data==='string')sig.send({type:'relay',to:peerId,payload:data});
      else {const b=new Uint8Array(data);const frame=new Uint8Array(8+b.length);frame.set(new TextEncoder().encode(peerId.padEnd(8,'x').slice(0,8)),0);frame.set(b,8);sig.sendBinary(frame.buffer);}
    },
    addEventListener(type,fn,opts){if(type==='bufferedamountlow')listeners.add(fn);},
    removeEventListener(type,fn){listeners.delete(fn);}
  };
  relayChannels.set(peerId,ch);return ch;
}
const relayChannels=new Map();
function ensureRelayChannel(id){
  let ch=relayChannels.get(id);
  if(!ch){ch=makeRelayChannel(id);transferManager.register(id,ch);}
  else if(!transferManager.channels.has(id))transferManager.register(id,ch);
  return ch;
}
function handleRelayControl(m){
  const ch=ensureRelayChannel(m.from);
  if(m.payload&&ch.onmessage)ch.onmessage({data:m.payload});
}
function handleRelayBinary(data){
  const bytes=new Uint8Array(data);if(bytes.length<8)return;
  const from=new TextDecoder().decode(bytes.slice(0,8)).replace(/x+$/,'');
  const ch=ensureRelayChannel(from);
  if(ch.onmessage)ch.onmessage({data:bytes.slice(8).buffer});
}
ui.onReceiveDecision=(accept,meta)=>{
  if(accept){transferManager.accept({...meta,peerName:peers.get(meta.peerId)?.name||meta.peerName||'Nearby device'});$('keepOpen').hidden=false;}
  else transferManager.decline(meta);
};
$('acceptPairButton').addEventListener('click',()=>{if(!incomingPairRequest)return;const req=incomingPairRequest;incomingPairRequest=null;$('pairRequestBackdrop').hidden=true;sig.send({type:'pair-response',to:req.from,accepted:true});pairedDevices.add(req.from);const p=peers.get(req.from);if(p)beginPairConnection(p,false);});
$('rejectPairButton').addEventListener('click',()=>{if(incomingPairRequest)sig.send({type:'pair-response',to:incomingPairRequest.from,accepted:false});incomingPairRequest=null;$('pairRequestBackdrop').hidden=true;});
function updatePrivateRoomButton(){const b=$('privateRoomButton');if(!b)return;b.textContent=new URLSearchParams(location.search).get('room')?'Leave private room':'Private room';}
$('privateRoomButton').addEventListener('click',()=>{const url=new URL(location.href);if(url.searchParams.get('room'))url.searchParams.delete('room');else{const alphabet='abcdefghjkmnpqrstuvwxyz23456789';const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);url.searchParams.set('room',[...bytes].map(b=>alphabet[b%alphabet.length]).join(''));}location.href=url.href;});
$('generateQrButton').addEventListener('click',async()=>{
  const panel=$('pairQrPanel'),box=$('pairQrImage'); box.replaceChildren();
  const invite=new URL(location.href);
  $('pairQrTitle').textContent='Scan to open NearSend';
  $('pairQrHelp').textContent='Scan this code on the other device, then select the device to request a connection.';
  panel.hidden=false;
  try {
    const res=await fetch('/api/qr?text='+encodeURIComponent(invite.href),{cache:'no-store'});
    if(res.ok){const data=(await res.text()).trim();if(data.startsWith('data:image/')){const img=document.createElement('img');img.alt='QR code to open NearSend';img.src=data;box.append(img);return;}}
  } catch {}
  try {
    if(!window.QRCode) await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
    new window.QRCode(box,{text:invite.href,width:220,height:220,colorDark:'#111111',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
  } catch (error) {
    box.textContent='QR generation failed. Check your connection and reload the page.';
    ui.toast('QR generation failed. The QR library or /api/qr endpoint could not be loaded.', true);
  }
});
$('closeQrButton').addEventListener('click',()=>$('pairQrPanel').hidden=true);
async function loadQrDecoder() {
  if (window.jsQR) return window.jsQR;
  if (window.__nearSendQrDecoderPromise) return window.__nearSendQrDecoderPromise;
  window.__nearSendQrDecoderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    script.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('QR decoder failed to load.'));
    script.onerror = () => reject(new Error('Could not load the QR decoder. Check your internet connection.'));
    document.head.append(script);
  });
  return window.__nearSendQrDecoderPromise;
}
function openScannedInvite(value) {
  let target;
  try { target = new URL(value); } catch { throw new Error('The QR code does not contain a valid link.'); }
  if (!['http:', 'https:'].includes(target.protocol) || target.origin !== location.origin) {
    throw new Error('This QR code is not for this NearSend website.');
  }
  location.href = target.href;
}
$('scanQrButton').addEventListener('click', async () => {
  const panel = $('pairQrPanel'), box = $('pairQrImage');
  box.replaceChildren(); panel.hidden = false;
  $('pairQrTitle').textContent = 'Scan QR code';
  $('pairQrHelp').textContent = 'Allow camera access and point it at a NearSend QR code. You can also choose a QR image.';
  let stream = null, stopped = false, animation = 0;
  const stop = () => {
    stopped = true;
    if (animation) cancelAnimationFrame(animation);
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
  };
  $('closeQrButton').onclick = () => { stop(); panel.hidden = true; };
  try {
    const decoderPromise = loadQrDecoder();
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const jsQR = await decoderPromise;
        const video = document.createElement('video');
        video.autoplay = true; video.playsInline = true; video.muted = true;
        video.setAttribute('aria-label', 'Camera view for scanning a QR code');
        video.style.cssText = 'display:block;width:100%;max-width:420px;max-height:55vh;object-fit:cover;border-radius:12px;background:#111';
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        const choose = document.createElement('button');
        choose.type = 'button'; choose.className = 'button secondary'; choose.textContent = 'Choose QR image instead';
        choose.addEventListener('click', () => { stop(); $('qrCameraInput').click(); });
        box.append(video, choose); video.srcObject = stream; await video.play();
        const scanFrame = () => {
          if (stopped || panel.hidden) return;
          if (video.readyState >= 2 && video.videoWidth) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
            if (result?.data) {
              try { openScannedInvite(result.data); } catch (e) { stop(); ui.toast(e.message, true); return; }
              stop(); return;
            }
          }
          animation = requestAnimationFrame(scanFrame);
        };
        animation = requestAnimationFrame(scanFrame); return;
      } catch (cameraError) {
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;
        $('pairQrHelp').textContent = 'Camera access is unavailable. Choose an image of the QR code instead.';
      }
    }
    const jsQR = await decoderPromise;
    $('qrCameraInput').value = '';
    $('qrCameraInput').onchange = async () => {
      const file = $('qrCameraInput').files?.[0]; if (!file) return;
      try {
        const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0); bitmap.close?.();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
        if (!result?.data) throw new Error('No QR code found in that image.');
        openScannedInvite(result.data);
      } catch (e) { ui.toast(e.message || 'Could not read QR code.', true); }
    };
    $('qrCameraInput').click();
  } catch (e) { ui.toast(e.message || 'QR scanner could not start.', true); }
});
$('renameButton').addEventListener('click',()=>{
  if(!self)return;
  const current=localStorage.getItem(nameKey)||self.name;
  const next=prompt('Name this device (up to 24 characters):',current);
  if(next===null)return;
  const clean=next.trim().slice(0,24);
  if(!clean){ui.toast('Device name cannot be empty.',true);return;}
  localStorage.setItem(nameKey,clean);ui.setSelf(clean);sig.send({type:'rename',name:clean});
});
$('copyButton').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('shareUrl').textContent);ui.toast('Address copied');}
  catch{const range=document.createRange();range.selectNodeContents($('shareUrl'));const sel=getSelection();sel.removeAllRanges();sel.addRange(range);ui.toast('Select and copy the address');}
});
$('clearTransfers').addEventListener('click',()=>{for(const row of [...$('transfersList').children])if(!row.querySelector('button[data-cancel]'))row.remove();if(!$('transfersList').children.length)$('transfersSection').hidden=true;});
$('transfersList').addEventListener('click',e=>{const b=e.target.closest('[data-cancel]');if(b){transferManager.cancel(b.dataset.cancel);return;}const r=e.target.closest('[data-retry]');if(r)transferManager.retrySend(r.dataset.retry);});
async function init(){
  let signalUrl=null;
  try{
    const res=await fetch('/api/info');const info=await res.json();mode=info.mode||'local';signalUrl=info.signal||null;
    if(mode==='local'){
      const host=info.urls?.[0];
      if(host){
        const url=host+location.pathname+location.search;
        // QR generation uses a lightweight server-side endpoint when available.
        let qrData=null;try{const q=await fetch('/api/qr?text='+encodeURIComponent(url));if(q.ok)qrData=await q.text();}catch{}
        ui.showShare(url,qrData);
      }else ui.showShare(location.href,null);
    }
  }catch{mode='local';}
  startSignaling(signalUrl);
  const roomCode=new URLSearchParams(location.search).get('room');
  if(roomCode)ui.toast(`Private room "${roomCode}" — share this page's link or QR code so the other device joins the same room.`);
  updatePrivateRoomButton();
}
init();


let lastRuntimeError = '';
function reportRuntimeError(message) {
  const region = document.getElementById('toastRegion');
  const detail = String(message || 'Unknown JavaScript error').slice(0, 180);
  if (detail === lastRuntimeError) return;
  lastRuntimeError = detail;
  console.error('NearSend runtime error:', message);
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast error';
  el.textContent = `NearSend error: ${detail}. Reload the page; if it continues, send this message with a screenshot.`;
  region.append(el);
}
window.addEventListener('error', event => {
  reportRuntimeError(event.message || event.error?.message || 'A script failed to load');
});
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  reportRuntimeError(reason?.message || reason || 'An asynchronous operation failed');
});
