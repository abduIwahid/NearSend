import { connect } from './signaling.js';
import { createPeer } from './peer.js';
import { TransferManager } from './transfer.js';
import { UI } from './ui.js';

const ui=new UI();
const peers=new Map(), peerConnections=new Map(), pendingFiles={};
let self=null, stun=null, mode='local', transferManager;
const nameKey='nearsend-device-name';
function signalSend(m){sig.send({type:'signal',...m});}
const sig=connect({
  onHello:m=>{
    self=m;stun=m.stun;const saved=localStorage.getItem(nameKey);
    ui.setSelf(saved||m.name);
    if(saved&&saved!==m.name)sig.send({type:'rename',name:saved});
    ui.setStatus('Connected',mode);
  },
  onPeers:m=>{peers.clear();m.list.forEach(p=>peers.set(p.id,p));ui.renderDevices(m.list,pickFiles);},
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
transferManager=new TransferManager({ui,sendSignal:signalSend});
function makePeer(id,initiator){
  const entry={peer:null,channel:null,relayTimer:null};
  const peer=createPeer({remoteId:id,stun,initiator,signalSend,onChannel:ch=>{
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
  let files=dropFiles;
  if(!files){$('fileInput').value='';pendingFiles.target=p;const old=$('fileInput').onchange;$('fileInput').onchange=null;$('fileInput').click();$('fileInput').onchange=()=>{const selected=$('fileInput').files;if(selected.length)beginSend(p,selected);};return;}
  if(files.length)beginSend(p,files);
}
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
}
setupInfo();
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
