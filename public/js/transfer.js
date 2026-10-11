const CHUNK = 16 * 1024;
const randomId = () => Math.random().toString(36).slice(2, 10);
const safeName = name => (name || 'download').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || 'download';
const formatBytes = n => {
  if (!Number.isFinite(n)) return '—';
  const units = ['B','KB','MB','GB']; let i=0;
  while(n>=1024 && i<units.length-1){n/=1024;i++;}
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
};
export class TransferManager {
  constructor({ ui, sendSignal }) {
    this.ui = ui; this.sendSignal = sendSignal; this.channels = new Map(); this.pending = new Map(); this.receives = new Map(); this.transfers = new Map();
  }
  register(peerId, channel) {
    this.channels.set(peerId, channel);
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onmessage = e => this.onMessage(peerId, e.data);
    channel.onclose = () => { this.channels.delete(peerId); };
  }
  sendControl(peerId, obj) {
    const ch = this.channels.get(peerId);
    if (ch?.readyState === 'open') ch.send(JSON.stringify(obj));
  }
  async sendFiles(peerId, files, peerLabel) {
    const ch = this.channels.get(peerId);
    if (!ch || ch.readyState !== 'open') throw new Error('Connection is not ready.');
    for (let i=0; i<files.length; i++) {
      const file = files[i], tid = randomId();
      const row = this.ui.addTransfer({ id: tid, name: file.name, direction: `Sending to ${peerLabel}`, state: 'Waiting for acceptance', size: file.size, canCancel: true });
      this.transfers.set(tid, { peerId, row, direction: 'send', cancelled: false });
      const decision = await new Promise(resolve => {
        const timer = setTimeout(() => { this.pending.delete(tid); resolve('timeout'); }, 120000);
        this.pending.set(tid, { resolve: value => { clearTimeout(timer); resolve(value); }, peerId });
        this.sendControl(peerId, { t:'meta', tid, name:file.name, size:file.size, mime:file.type || 'application/octet-stream', index:i+1, total:files.length });
      });
      if (decision !== 'accept') {
        this.ui.updateTransfer(tid, { state: decision === 'reject' ? 'Declined' : 'No response — timed out', done: true });
        this.transfers.delete(tid); continue;
      }
      try {
        let offset = 0, lastTime = performance.now(), lastBytes = 0, speed = 0;
        this.ui.updateTransfer(tid, { state: 'Sending', percent: 0 });
        while (offset < file.size) {
          const active = this.transfers.get(tid);
          if (!active || active.cancelled) throw new Error('Cancelled');
          if (ch.readyState !== 'open') throw new Error('Connection lost');
          if (ch.bufferedAmount > 1024*1024) await new Promise((resolve,reject) => {
            const timeout = setTimeout(()=>reject(new Error('Transfer stalled')),30000);
            const ready=()=>{clearTimeout(timeout);resolve();};
            ch.addEventListener('bufferedamountlow',ready,{once:true});
            if(ch.bufferedAmount <= 256*1024) ready();
          });
          const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
          ch.send(buf); offset += buf.byteLength;
          const now=performance.now();
          if(now-lastTime>=500){speed=(offset-lastBytes)/((now-lastTime)/1000);lastTime=now;lastBytes=offset;}
          this.ui.updateTransfer(tid,{bytes:offset,size:file.size,percent:file.size?offset/file.size*100:100,speed,state:'Sending'});
        }
        ch.send(JSON.stringify({t:'end',tid}));
        const result = await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Receiver did not confirm the file')),120000);
          this.pending.set(tid,{resolve:value=>{clearTimeout(timer);resolve(value);},reject,peerId});
        });
        if (result === 'done') this.ui.updateTransfer(tid,{state:'Sent successfully',percent:100,bytes:file.size,size:file.size,done:true});
        else throw new Error('Receiver did not confirm the file');
      } catch(e) {
        this.sendControl(peerId,{t:'cancel',tid});
        this.ui.updateTransfer(tid,{state:e.message==='Cancelled'?'Cancelled':`Failed: ${e.message}`,done:true,error:true});
      }
      this.transfers.delete(tid);
    }
  }
  onMessage(peerId, data) {
    if (typeof data !== 'string') {
      const r = this.receives.get(peerId);
      if (!r) return;
      r.chunks.push(data); r.received += data.byteLength;
      const now=performance.now();
      if(now-r.lastTime>400){r.speed=(r.received-r.lastBytes)/((now-r.lastTime)/1000);r.lastTime=now;r.lastBytes=r.received;}
      this.ui.updateTransfer(r.tid,{bytes:r.received,size:r.size,percent:r.size?r.received/r.size*100:100,speed:r.speed,state:'Receiving'});
      return;
    }
    let m; try{m=JSON.parse(data)}catch{return}
    if(m.t==='accept'||m.t==='reject'||m.t==='done') {
      const p=this.pending.get(m.tid);
      if(p && p.peerId===peerId){this.pending.delete(m.tid);p.resolve(m.t==='accept'?'accept':m.t==='reject'?'reject':'done');}
    } else if(m.t==='meta') {
      this.ui.askReceive({ ...m, peerId, name:safeName(m.name) });
    } else if(m.t==='end') this.finishReceive(peerId,m.tid);
    else if(m.t==='cancel') {
      const r=this.receives.get(peerId);
      if(r && r.tid===m.tid){this.receives.delete(peerId);this.ui.updateTransfer(m.tid,{state:'Cancelled by sender',done:true,error:true});}
      const t=this.transfers.get(m.tid); if(t){t.cancelled=true;this.ui.updateTransfer(m.tid,{state:'Cancelled by receiver',done:true,error:true});}
    }
  }
  accept(meta) {
    const row=this.ui.addTransfer({id:meta.tid,name:meta.name,direction:`Receiving from ${meta.peerName}`,state:'Receiving',size:meta.size,canCancel:true});
    this.receives.set(meta.peerId,{tid:meta.tid,name:meta.name,size:meta.size,mime:meta.mime,chunks:[],received:0,row,lastTime:performance.now(),lastBytes:0,speed:0});
    this.sendControl(meta.peerId,{t:'accept',tid:meta.tid});
  }
  decline(meta) { this.sendControl(meta.peerId,{t:'reject',tid:meta.tid}); }
  finishReceive(peerId,tid) {
    const r=this.receives.get(peerId);
    if(!r||r.tid!==tid)return;
    this.receives.delete(peerId);
    if(r.received!==r.size){this.ui.updateTransfer(tid,{state:`Failed: expected ${formatBytes(r.size)}, received ${formatBytes(r.received)}`,done:true,error:true});this.sendControl(peerId,{t:'cancel',tid});return;}
    const blob=new Blob(r.chunks,{type:r.mime||'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    this.ui.updateTransfer(tid,{state:'Received — ready to save',percent:100,bytes:r.size,size:r.size,done:true,saveUrl:url,saveName:r.name});
    this.sendControl(peerId,{t:'done',tid,received:r.received});
  }
  cancel(tid) {
    const t=this.transfers.get(tid);
    if(t){t.cancelled=true;this.sendControl(t.peerId,{t:'cancel',tid});this.ui.updateTransfer(tid,{state:'Cancelled',done:true,error:true});this.transfers.delete(tid);return;}
    for(const [peerId,r] of this.receives) if(r.tid===tid){this.sendControl(peerId,{t:'cancel',tid});this.receives.delete(peerId);this.ui.updateTransfer(tid,{state:'Cancelled',done:true,error:true});}
  }
}
export { formatBytes };