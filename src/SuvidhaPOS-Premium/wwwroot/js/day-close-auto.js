(function(w,d){
'use strict';
const KEY='DayClose.Auto';
const oldClose=w.closeDay,oldSettings=w.loadSettings;
w.closeDay=async function(){
 if(!w.confirm('Confirm Day Close & Shift End ?'))return;
 if(typeof oldClose!=='function')return alert('Day Close function is not loaded');
 return oldClose.apply(this,arguments)
};
async function readAuto(){try{const x=await api('/api/app-settings/'+encodeURIComponent(KEY));return /^true|1|on$/i.test(String(x.Value??x.value??''))}catch{return false}}
w.saveAutoDayClose=async function(on){try{await api('/api/app-settings/'+encodeURIComponent(KEY),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:on?'true':'false'})});toast('Auto Day Close '+(on?'enabled':'disabled'));schedule()}catch(e){alert(e.message||e)}};
async function inject(){
 const host=d.querySelector('#app .content');if(!host||d.getElementById('autoDayClosePanel'))return;
 const on=await readAuto(),status=await api('/api/day-closing/status').catch(()=>({}));
 const last=status.last||status.Last||{},panel=d.createElement('div');panel.id='autoDayClosePanel';panel.className='panel';panel.style.marginTop='14px';
 panel.innerHTML='<h3>DAY CLOSE & SHIFT</h3><p class="muted">Manual close asks for confirmation. Auto Day Close, when enabled, closes the previous business date just after local midnight if it was not already closed.</p><label class="feature-flag" style="max-width:520px"><span><b>Auto Day Close after midnight</b><small>Last closed: '+String(last.BusinessDate||last.businessDate||'Not available')+'</small></span><input type="checkbox" '+(on?'checked':'')+' onchange="saveAutoDayClose(this.checked)"></label>';
 host.appendChild(panel)
}
if(typeof oldSettings==='function')w.loadSettings=async function(){const r=await oldSettings.apply(this,arguments);setTimeout(inject,30);return r};
let timer=0;
async function runAuto(){
 try{const on=await readAuto();if(!on)return;const r=await api('/api/day-closing/auto-run',{method:'POST'});if(r&&r.closed)toast('Auto Day Close completed for '+r.businessDate)}catch(e){console.warn('Auto Day Close:',e)}
}
function schedule(){
 if(timer)clearTimeout(timer);
 const now=new Date(),next=new Date(now);next.setDate(next.getDate()+1);next.setHours(0,1,0,0);
 timer=setTimeout(async()=>{await runAuto();schedule()},Math.max(5000,next-now))
}
w.addEventListener('load',()=>{setTimeout(runAuto,1200);schedule()});
})(window,document);