import { formatBytes } from './transfer.js';
const $ = id => document.getElementById(id);
const escapeText = s => String(s ?? '');
function iconFor(type){ return type==='phone'?'▯':type==='tablet'?'▤':'▱'; }
export class UI {
  constructor() {
    this.deviceList=$('deviceList'); this.empty=$('emptyState'); this.count=$('deviceCount');
    this.transfers=$('transfersList'); this.transferSection=$('transfersSection'); this.dialogBackdrop=$('dialogBackdrop');
    this.activeDialog=null; this.lastFocus=null;
    $('declineButton').addEventListener('click',()=>this.finishDialog(false));
    $('acceptButton').addEventListener('click',()=>this.finishDialog(true));
    $('dialogBackdrop').addEventListener('click',e=>{if(e.target===this.dialogBackdrop)this.finishDialog(false)});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!this.dialogBackdrop.hidden)this.finishDialog(false);
      if(e.key==='Tab'&&!this.dialogBackdrop.hidden){
        const items=[...this.dialogBackdrop.querySelectorAll('button:not(:disabled)')];
        if(!items.length)return;
        if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
      }
    });
  }
  renderDevices(list,onRequest) {
    this.deviceList.replaceChildren(); this.count.textContent=list.length;
    this.empty.hidden=list.length>0;
    for(const p of list){
      const card=document.createElement('article'); card.className='device-card';
      const ico=document.createElement('span');ico.className='device-icon';ico.setAttribute('aria-hidden','true');ico.textContent=iconFor(p.deviceType);
      const name=document.createElement('span');name.className='device-name';name.textContent=p.name;
      const type=document.createElement('span');type.className='device-type';type.textContent=p.deviceType;
      const button=document.createElement('button');button.type='button';button.className='button primary small-button';button.textContent='Request to connect';button.addEventListener('click',()=>onRequest(p));
      card.append(ico,name,type,button); this.deviceList.append(card);
    }
  }
  askPairRequest(meta,onAccept,onReject) {
    const backdrop=$('pairRequestBackdrop');
    $('pairRequestDescription').textContent=`${meta.name || 'A nearby device'} wants to connect to your device for file sharing. Accept only if you recognize this request.`;
    backdrop.hidden=false;
    const accept=$('acceptPairButton'), reject=$('rejectPairButton');
    const finish=(accepted)=>{backdrop.hidden=true;accept.removeEventListener('click',yes);reject.removeEventListener('click',no);accepted?onAccept():onReject();};
    const yes=()=>finish(true), no=()=>finish(false);
    accept.addEventListener('click',yes);reject.addEventListener('click',no);
  }
  setSelf(name){$('renameButton').innerHTML='';const t=document.createElement('span');t.textContent=name;const e=document.createElement('span');e.textContent=' ✎';e.setAttribute('aria-hidden','true');$('renameButton').append(t,e);}
  setStatus(status,mode){$('connectionLabel').textContent=status;$('footerStatus').textContent=`${status} · ${mode} mode`;}
  showShare(url,qrData) {
    $('shareBox').hidden=false;$('shareUrl').textContent=url;
    const box=$('qr');box.replaceChildren();
    if(qrData){const img=document.createElement('img');img.alt='Scan to open NearSend';img.src=qrData;box.append(img);}
    else {const p=document.createElement('span');p.className='qr-placeholder';p.textContent='Use the address or terminal QR';box.append(p);}
  }
  toast(message,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;$('toastRegion').append(el);setTimeout(()=>el.remove(),3600);}
  addTransfer(t){
    this.transferSection.hidden=false;
    const row=document.createElement('article');row.className='transfer-row';row.id=`transfer-${t.id}`;
    const main=document.createElement('div');main.className='transfer-main';
    const title=document.createElement('div');title.className='transfer-title';title.textContent=t.name;
    const sub=document.createElement('div');sub.className='transfer-sub';sub.textContent=t.direction;
    const track=document.createElement('div');track.className='progress-track';const fill=document.createElement('div');fill.className='progress-fill';track.append(fill);
    const bottom=document.createElement('div');bottom.className='transfer-bottom';const meta=document.createElement('span');meta.textContent=formatBytes(t.size);const speed=document.createElement('span');speed.textContent='Waiting…';bottom.append(meta,speed);
    main.append(title,sub,track,bottom);
    const side=document.createElement('div');side.className='transfer-status';side.textContent=t.state;
    if(t.canCancel){const cancel=document.createElement('button');cancel.className='button secondary small-button';cancel.type='button';cancel.textContent='Cancel';cancel.dataset.cancel=t.id;side.append(document.createElement('br'),cancel);}
    row.append(main,side);this.transfers.prepend(row);
    return row;
  }
  updateTransfer(id,data){
    const row=document.getElementById(`transfer-${id}`);if(!row)return;
    const fill=row.querySelector('.progress-fill'),side=row.querySelector('.transfer-status'),bottom=row.querySelector('.transfer-bottom'),meta=bottom?.children[0],speed=bottom?.children[1];
    if(data.percent!=null)fill.style.width=`${Math.max(0,Math.min(100,data.percent))}%`;
    if(data.bytes!=null&&meta)meta.textContent=`${formatBytes(data.bytes)} / ${formatBytes(data.size ?? 0)}`;
    if(data.speed!=null&&speed)speed.textContent=`${formatBytes(data.speed)}/s`;
    if(data.state&&side){side.childNodes[0].textContent=data.state;}
    if(data.done){const btn=side?.querySelector('button');btn?.remove();if(data.error)row.classList.add('failed');}
    if(data.saveUrl){
      const a=document.createElement('a');a.href=data.saveUrl;a.download=data.saveName||'download';a.className='button primary small-button';a.textContent='Save file';a.style.display='inline-flex';a.style.alignItems='center';a.style.marginTop='8px';side.append(document.createElement('br'),a);
      a.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(data.saveUrl),60000),{once:true});
    }
  }
  askReceive(meta){
    if(this.activeDialog){this.toast('Another incoming file is waiting. Accept or decline it first.',true);return;}
    this.activeDialog=meta;this.lastFocus=document.activeElement;
    $('dialogTitle').textContent='Incoming file';
    $('dialogDescription').textContent=`${meta.peerName || 'A nearby device'} wants to send you a file.`;
    $('incomingName').textContent=meta.name;$('incomingMeta').textContent=`${formatBytes(meta.size)} · ${meta.mime||'Unknown file type'}`;
    $('largeFileWarning').hidden=!(meta.size>500*1024*1024);
    this.dialogBackdrop.hidden=false;$('acceptButton').focus();
  }
  finishDialog(accept){
    if(!this.activeDialog)return;
    const meta=this.activeDialog;this.activeDialog=null;this.dialogBackdrop.hidden=true;
    this.onReceiveDecision?.(accept,meta);this.lastFocus?.focus?.();
  }
  onReceiveDecision(fn){this.onReceiveDecision=fn;}
}