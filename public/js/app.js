import { connect } from './signaling.js';
import { createPeer } from './peer.js';
import { TransferManager } from './transfer.js';
import { UI } from './ui.js';

const $=id=>document.getElementById(id);

const ui=new UI();
const peers=new Map(), peerConnections=new Map(), pendingFiles={};
let self=null, stun=null, mode='local', transferManager, queuedFiles=null, connectedPeerId=null, pendingPairRequest=null;
const nameKey='nearsend-device-name';
function signalSend(m){sig.send({type:'signal',...m});}
const sig=connect({
  onHello:m=>{
    self=m;stun=m.stun;const saved=localStorage.getItem(nameKey);
    ui.setSelf(saved||m.name);
    if(saved&&saved!==m.name)sig.send({type:'rename',name:saved});
    ui.setStatus('Connected',mode);
  },
  onPeers:m=>{peers.clear();m.list.forEach(p=>peers.set(p.id,p));ui.renderDevices(m.list,requestConnection);},
  onSignal:async m=>{
    let entry=peerConnections.get(m.from);
    if(!entry){
      entry=makePeer(m.from,false);peerConnections.set(m.from,entry);
    }
    await entry.peer.handle(m);
  },
  onPairRequest:m=>{pendingPairRequest=m;ui.askPairRequest(m,()=>{sig.send({type:'pair-response',to:m.from,accepted:true});connectedPeerId=m.from;const entry=makePeer(m.from,false);peerConnections.set(m.from,entry);ui.toast(`Accepted ${m.name||'device'}’s request. Connecting…`);},()=>{sig.send({type:'pair-response',to:m.from,accepted:false});ui.toast('Connection request rejected.');});},
  onPairResponse:m=>{if(!m.accepted){ui.toast(`${peers.get(m.from)?.name||'Device'} declined the request.`,true);return;}connectedPeerId=m.from;const entry=makePeer(m.from,true);peerConnections.set(m.from,entry);ui.toast('Request accepted. Establishing secure connection…');},
  onRelay:m=>handleRelayControl(m),
  onBinary:data=>handleRelayBinary(data),
  onStatus:s=>{ui.setStatus(s,mode);if(s==='reconnecting')ui.toast('Connection lost. Reconnecting…',true);}
});
transferManager=new TransferManager({ui,sendSignal:signalSend});

// Offline pairing uses WebRTC with no STUN/TURN server. Devices exchange SDP
// manually (copy/paste) while on the same Wi-Fi or hotspot.
const offlinePeerId='offline-peer';
let offlinePc=null, offlineChannel=null, offlineRole=null;
const localCode=$('localCode'), remoteCode=$('remoteCode'), offlineStatus=$('offlineStatus');
function setOfflineStatus(message,connected=false){offlineStatus.textContent=message;$('sendOfflineFilesButton').disabled=!connected;}
function waitForIce(pc,timeoutMs=15000){
  if(pc.iceGatheringState==='complete')return Promise.resolve();
  return new Promise(resolve=>{
    let finished=false;
    const done=()=>{if(finished)return;finished=true;clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};
    const check=()=>{if(pc.iceGatheringState==='complete')done();};
    const timer=setTimeout(done,timeoutMs);
    pc.addEventListener('icegatheringstatechange',check);
  });
}
function closeOfflinePeer(){
  try{offlineChannel?.close();}catch{}
  try{offlinePc?.close();}catch{}
  offlinePc=null;offlineChannel=null;offlineRole=null;
  setOfflineStatus('Not connected');
}
function setupOfflineChannel(channel){
  offlineChannel=channel;channel.binaryType='arraybuffer';
  channel.onopen=()=>{transferManager.register(offlinePeerId,channel);connectedPeerId=offlinePeerId;setOfflineStatus('Connected — offline transfer ready',true);showFileSharing('Offline device');ui.toast('Offline device connected');};
  channel.onclose=()=>{setOfflineStatus('Connection closed');};
  channel.onerror=()=>{setOfflineStatus('Connection error');};
  channel.onmessage=event=>transferManager.onMessage(offlinePeerId,event.data);
}
function newOfflinePeer(){
  closeOfflinePeer();
  offlinePc=new RTCPeerConnection({iceServers:[]});
  offlinePc.ondatachannel=event=>setupOfflineChannel(event.channel);
  offlinePc.onconnectionstatechange=()=>{
    if(offlinePc?.connectionState==='connected'&&offlineChannel?.readyState==='open')setOfflineStatus('Connected — offline transfer ready',true);
    else if(['failed','disconnected','closed'].includes(offlinePc?.connectionState)&&offlineChannel?.readyState!=='open')setOfflineStatus(`Connection ${offlinePc.connectionState}`);
  };
  return offlinePc;
}
function parseCode(text){
  let value;try{value=JSON.parse(text.trim());}catch{throw new Error('That code is not valid JSON. Copy the entire code, including both braces.');}
  if(!value||!['offer','answer'].includes(value.type)||!value.sdp)throw new Error('This does not look like a NearSend connection code.');
  return value;
}
$('createOfferButton').addEventListener('click',async()=>{
  try{
    const pc=newOfflinePeer();offlineRole='offerer';setupOfflineChannel(pc.createDataChannel('nearsend-files',{ordered:true}));
    setOfflineStatus('Creating code…');
    await pc.setLocalDescription(await pc.createOffer());await waitForIce(pc);
    localCode.value=JSON.stringify(pc.localDescription);setOfflineStatus('Code ready. Share it with Device 2.');
    ui.toast('Connection code created. Copy it to Device 2.');
  }catch(error){setOfflineStatus('Could not create code');ui.toast(error.message||'Could not create offline code',true);}
});
$('processOfferButton').addEventListener('click',async()=>{
  try{
    const offer=parseCode(remoteCode.value);if(offer.type!=='offer')throw new Error('Paste Device 1’s offer code into “Other device’s connection code”.');
    const pc=newOfflinePeer();offlineRole='answerer';setOfflineStatus('Creating reply code…');
    await pc.setRemoteDescription(offer);await pc.setLocalDescription(await pc.createAnswer());await waitForIce(pc);
    localCode.value=JSON.stringify(pc.localDescription);setOfflineStatus('Reply ready. Send it back to Device 1.');
    ui.toast('Reply code created. Copy it back to Device 1.');
  }catch(error){setOfflineStatus('Could not process code');ui.toast(error.message||'Could not process offline code',true);}
});
$('applyAnswerButton').addEventListener('click',async()=>{
  try{
    const answer=parseCode(remoteCode.value);if(answer.type!=='answer')throw new Error('Paste Device 2’s reply code into “Other device’s connection code”.');
    if(!offlinePc||offlineRole!=='offerer')throw new Error('First create a connection code on Device 1.');
    await offlinePc.setRemoteDescription(answer);setOfflineStatus('Connecting to Device 2…');
    ui.toast('Reply accepted. Waiting for the local connection…');
  }catch(error){ui.toast(error.message||'Could not connect offline',true);}
});
$('copyLocalCodeButton').addEventListener('click',async()=>{
  if(!localCode.value.trim()){ui.toast('Create a connection code first.',true);return;}
  try{await navigator.clipboard.writeText(localCode.value);ui.toast('Connection code copied. Share it with the other device.');}
  catch{localCode.focus();localCode.select();ui.toast('Code selected. Copy it and share it with the other device.');}
});
$('resetOfflineButton').addEventListener('click',()=>{closeOfflinePeer();localCode.value='';remoteCode.value='';setOfflineStatus('Not connected');});
$('sendOfflineFilesButton').addEventListener('click',()=>{
  if(!transferManager.channels.has(offlinePeerId)){ui.toast('Connect the other device first.',true);return;}
  const input=$('fileInput');input.value='';input.onchange=async()=>{
    const files=Array.from(input.files||[]);if(!files.length)return;
    try{await transferManager.sendFiles(offlinePeerId,files,'offline device');}catch(error){ui.toast(error.message||'Offline send failed',true);}
  };input.click();
});
function showFileSharing(name){
  $('intro').hidden=true;$('pairingActions').hidden=true;$('devicesSection').hidden=true;$('offlinePanel').hidden=true;$('shareBox').hidden=true;
  $('fileSharingPage').hidden=false;$('connectedHeading').textContent=`Connected to ${name}`;$('keepOpen').hidden=false;
}
function showDiscovery(){
  $('intro').hidden=false;$('pairingActions').hidden=false;$('devicesSection').hidden=false;$('fileSharingPage').hidden=true;$('offlinePanel').hidden=true;$('shareBox').hidden=true;
  $('keepOpen').hidden=true;connectedPeerId=null;
}
function requestConnection(p){
  if(!p||!sig.id)return;
  sig.send({type:'pair-request',to:p.id,name:self?.name||'Nearby device'});
  ui.toast(`Connection request sent to ${p.name}.`);
}
$('disconnectButton').addEventListener('click',()=>{
  if(connectedPeerId===offlinePeerId){closeOfflinePeer();transferManager.channels.delete(offlinePeerId);}
  else if(connectedPeerId){const entry=peerConnections.get(connectedPeerId);entry?.peer?.close();peerConnections.delete(connectedPeerId);transferManager.channels.delete(connectedPeerId);}
  showDiscovery();ui.toast('Disconnected.');
});
$('showOfflinePairButton').addEventListener('click',()=>{$('offlinePanel').hidden=false;$('offlinePanel').scrollIntoView({behavior:'smooth',block:'start'});});
$('showQrPairButton').addEventListener('click',()=>{
  const room=crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,10):Math.random().toString(36).slice(2,12);
  const invite=new URL(location.href);invite.search='';invite.searchParams.set('room',room);
  // Reload into the same room that the other device will join by scanning the QR.
  location.href=invite.href;
});
function makePeer(id,initiator){
  const entry={peer:null,channel:null,relayTimer:null};
  const peer=createPeer({remoteId:id,stun,initiator,signalSend,onChannel:ch=>{
    entry.channel=ch;ch.binaryType='arraybuffer';
    ch.onopen=()=>{clearTimeout(entry.relayTimer);transferManager.register(id,ch);connectedPeerId=id;showFileSharing(peers.get(id)?.name||'Nearby device');ui.toast(`Connected to ${peers.get(id)?.name||'device'}`);};
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
  label.textContent=`${files.length} file${files.length===1?'':'s'} selected · ${formatSize(total)}. Ready to send to the connected device.`;
}
function formatSize(bytes){
  if(bytes<1024)return `${bytes} B`;
  const units=['KB','MB','GB','TB'];let size=bytes/1024,i=0;
  while(size>=1024&&i<units.length-1){size/=1024;i++;}
  return `${size.toFixed(size>=10?1:2)} ${units[i]}`;
}
const dropZone=$('fileDropZone');
$('chooseFilesButton').addEventListener('click',()=>{$('fileInput').value='';$('fileInput').onchange=()=>{const files=Array.from($('fileInput').files||[]);if(!files.length)return;queuedFiles=files;updateSelectedFiles(files);if(connectedPeerId===offlinePeerId&&transferManager.channels.has(offlinePeerId)){const chosen=queuedFiles;queuedFiles=null;updateSelectedFiles(null);transferManager.sendFiles(offlinePeerId,chosen,'offline device').catch(e=>ui.toast(e.message,true));}else if(connectedPeerId&&transferManager.channels.has(connectedPeerId)){const chosen=queuedFiles;queuedFiles=null;updateSelectedFiles(null);transferManager.sendFiles(connectedPeerId,chosen,peers.get(connectedPeerId)?.name||'connected device').catch(e=>ui.toast(e.message,true));}else if(peers.size===1){const target=peers.values().next().value;queuedFiles=null;updateSelectedFiles(null);beginSend(target,files);}else if(!peers.size){ui.toast('No nearby devices yet. Keep these files selected, then try again when a device appears.',true);queuedFiles=files;updateSelectedFiles(files);}else{ui.toast('Files selected. Tap the device you want to send them to.');}};$('fileInput').click();});
for(const eventName of ['dragenter','dragover'])dropZone.addEventListener(eventName,e=>{e.preventDefault();dropZone.classList.add('dragover');});
for(const eventName of ['dragleave','drop'])dropZone.addEventListener(eventName,e=>{e.preventDefault();if(eventName==='dragleave'&&dropZone.contains(e.relatedTarget))return;dropZone.classList.remove('dragover');if(eventName==='drop'&&e.dataTransfer?.files?.length){const files=Array.from(e.dataTransfer.files);queuedFiles=files;updateSelectedFiles(files);if(connectedPeerId===offlinePeerId&&transferManager.channels.has(offlinePeerId)){queuedFiles=null;updateSelectedFiles(null);transferManager.sendFiles(offlinePeerId,files,'offline device').catch(e=>ui.toast(e.message,true));}else if(connectedPeerId&&transferManager.channels.has(connectedPeerId)){queuedFiles=null;updateSelectedFiles(null);transferManager.sendFiles(connectedPeerId,files,peers.get(connectedPeerId)?.name||'connected device').catch(e=>ui.toast(e.message,true));}else if(peers.size===1){const target=peers.values().next().value;queuedFiles=null;updateSelectedFiles(null);beginSend(target,files);}else if(peers.size>1){ui.toast('Files selected. Tap the device you want to send them to.');}else ui.toast('No nearby devices found yet. Keep this page open and try again.',true);}});
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
$('transfersList').addEventListener('click',e=>{const b=e.target.closest('[data-cancel]');if(b)transferManager.cancel(b.dataset.cancel);});
async function setupInfo(){
  try{
    const res=await fetch('/api/info');const info=await res.json();mode=info.mode||'local';ui.setStatus('Connected',mode);
    if(new URLSearchParams(location.search).has('room')){
      const url=location.href;let qrData=null;
      try{const q=await fetch('/api/qr?text='+encodeURIComponent(url));if(q.ok)qrData=await q.text();}catch{}
      ui.showShare(url,qrData);$('shareBox').hidden=false;
      $('shareBox').scrollIntoView({behavior:'smooth',block:'center'});
    } else if(mode==='local'){
      const host=info.urls?.[0];
      if(host){
        const url=host+location.pathname+location.search;
        let qrData=null;try{const q=await fetch('/api/qr?text='+encodeURIComponent(url));if(q.ok)qrData=await q.text();}catch{}
        ui.showShare(url,qrData);$('shareBox').hidden=true;
      }
    }
  }catch{mode='local';}
}
setupInfo();
if('serviceWorker'in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{if(navigator.onLine)ui.toast('Offline app files are being cached for later use.');}).catch(()=>{});}
