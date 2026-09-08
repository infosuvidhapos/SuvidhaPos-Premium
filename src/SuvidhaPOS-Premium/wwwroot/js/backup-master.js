(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let drives=[],timer=null;
async function getSetting(k){try{const r=await api('/api/app-settings/'+encodeURIComponent(k));return r.Value??r.value??''}catch{return''}}
async function setSetting(k,v){return api('/api/app-settings/'+encodeURIComponent(k),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Value:String(v??'')})})}
function status(text,kind=''){const b=$('bkStatus');if(b)b.innerHTML='<span class="'+(kind==='ok'?'backup-ok':kind==='warn'?'backup-warn':'')+'">'+esc(text)+'</span>'}
function fmtDate(v){if(!v)return'Not yet';const d=new Date(v);return isNaN(d)?v:d.toLocaleString('en-IN')}
function scheduleMs(s){if(/1 Hour/i.test(s))return 3600000;if(/2 Hour/i.test(s))return 7200000;if(/4 Hour/i.test(s))return 14400000;if(/6 Hour/i.test(s))return 21600000;if(/12 Hour/i.test(s))return 43200000;return 86400000}
function calcNext(){const s=$('bkSchedule')?.value||'Manual';if(s==='Manual')return null;const d=new Date(Date.now()+scheduleMs(s));if(s==='Daily'){d.setDate(new Date().getDate()+1);d.setHours(1,0,0,0)}return d}
function updateNextCard(){const d=calcNext();if($('bkNext'))$('bkNext').textContent=d?d.toLocaleString('en-IN'):'Manual'}
function driveRoot(path){const m=String(path||'').match(/^[A-Za-z]:\\/);return m?m[0].slice(0,3):''}
function externalState(){
 const enabled=$('bkExternalEnable')?.checked,folder=$('bkExternalFolder')?.value||'',root=driveRoot(folder),d=drives.find(x=>String(x.root).toUpperCase()===root.toUpperCase());
 const online=enabled&&(!root||d?.ready);
 if($('bkExternalBadge'))$('bkExternalBadge').textContent=!enabled?'EXTERNAL DRIVE DISABLED':online?'EXTERNAL DRIVE ONLINE':'EXTERNAL DRIVE OFFLINE';
 if($('bkSystem'))$('bkSystem').textContent=!enabled?'Local Backup Ready':online?'All Destinations Ready':'External Drive Offline';
 if($('bkExternal'))$('bkExternal').textContent=!enabled?'Disabled':online?'Online':'Offline';
 const note=$('bkExternalNote');if(note)note.textContent=!enabled?'External backup disabled.':online?'CONNECTED • External copy will run after local backup.':'DISCONNECTED • Local backup will still complete. External copy resumes automatically when reconnected.';
}
function renderDriveOptions(selected){
 const el=$('bkDrive');if(!el)return;el.innerHTML='<option value="">Detected External / USB Drive</option>'+drives.map(d=>'<option value="'+esc(d.root)+'" '+(d.root===selected?'selected':'')+'>'+esc(d.root+' '+(d.label||'')+' · '+(d.ready?d.freeGb+' GB free':'Offline'))+'</option>').join('');
}
window.addEventListener('suvidha:desktop-result',e=>{const d=e.detail||{};if(!d.path)return;if(d.target&&$(d.target)){$(d.target).value=d.path;if(d.target==='bkExternalFolder')externalState()}});
window.backupBrowseFolder=function(target){const p=$(target)?.value||'';if(window.desktopBrowseFolder)window.desktopBrowseFolder(target,p);else{const v=prompt('Enter folder path:',p);if(v!==null)$(target).value=v}}
window.backupBrowseJson=function(){const p=$('bkGoogle')?.value||'';if(window.desktopBrowseJson)window.desktopBrowseJson('bkGoogle',p);else{const v=prompt('Enter Google credentials JSON path:',p);if(v!==null)$('bkGoogle').value=v}}
window.backupSelectDrive=function(){const root=$('bkDrive').value;if(root){$('bkExternalFolder').value=root+'SuvidhaBackup';externalState()}}
window.backupTestGoogle=async function(){const p=$('bkGoogle').value.trim();if(!p)return status('Browse and select Google Drive credentials JSON first.','warn');status('Connecting to Google Drive…');try{const r=await api('/api/backup-master/google/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({JsonPath:p})});$('bkGoogleState').textContent='CONNECTED';status(r.message||'Google Drive connected.','ok')}catch(e){$('bkGoogleState').textContent='NOT CONNECTED';status(e.message,'warn')}}
window.openBackupLog=async function(){try{const r=await fetch('/api/backup-master/log',{headers:{Authorization:'Bearer '+(localStorage.getItem('suvidha_token')||'')}});const t=await r.text();modal('Backup Log','<pre class="backup-log">'+esc(t)+'</pre>',`<button class="btn" onclick="closeModal()">Close</button>`)}catch(e){alert(e.message)}}
async function refreshRuntime(){
 try{const s=await api('/api/backup-master/status');drives=s.drives||[];renderDriveOptions(driveRoot($('bkExternalFolder')?.value||''));if($('bkLast'))$('bkLast').textContent=fmtDate(s.lastBackup);if($('bkLastResult')&&s.lastResult)$('bkLastResult').textContent=s.lastResult;if(s.nextBackup&&$('bkNext'))$('bkNext').textContent=fmtDate(s.nextBackup);externalState()}catch{}
}
window.loadBackupMaster=async function(){
 if(typeof setPage==='function')setPage('settings');title.textContent='SuvidhaSqlBackup';document.querySelector('header p').textContent='SQL Backup Scheduler';
 const st=await api('/api/backup-master/status').catch(()=>({server:'.\\SQLEXPRESS',database:'SuvidhaPOS',defaultFolder:'D:\\SuvidhaBackup',drives:[]}));
 drives=st.drives||[];
 const keys=['Backup.Server','Backup.Databases','Backup.Labels','Backup.Folder','Backup.Schedule','Backup.RetentionDays','Backup.LocalEnabled','Backup.ZipEnabled','Backup.AutoCleanup','Backup.StartWithWindows','Backup.ExternalFolder','Backup.ExternalEnabled','Backup.GoogleDriveJson','Backup.GoogleDriveEnabled'];
 const v=await Promise.all(keys.map(getSetting));
 const server=v[0]||st.server||'.\\SQLEXPRESS',dbs=v[1]||st.database||'SuvidhaPOS',labels=v[2]||'',folder=v[3]||st.defaultFolder||'D:\\SuvidhaBackup',schedule=v[4]||'Every 1 Hour',days=v[5]||'7',extFolder=v[10]||'E:\\SuvidhaBackup';
 app.innerHTML=`<div class="content sqlbackup">
 <div class="sqlbackup-title"><div><h2>🛩 SuvidhaSqlBackup</h2><p>SQL Backup Scheduler</p></div><div id="bkExternalBadge" class="sqlbackup-online">EXTERNAL DRIVE OFFLINE</div></div>
 <div class="sqlbackup-stats"><div><small>Last Backup</small><b id="bkLast">${fmtDate(st.lastBackup)}</b><span id="bkLastResult">${esc(st.lastResult||'')}</span></div><div><small>Next Backup</small><b id="bkNext">${st.nextBackup?fmtDate(st.nextBackup):'Manual'}</b></div><div><small>Backup Frequency</small><b id="bkFreq">${esc(schedule)}</b></div><div><small>System Status</small><b id="bkSystem">Checking…</b></div></div>
 <div class="sqlbackup-card sqlbackup-main">
  <section><h3>SQL SERVER CONNECTION</h3><label>Server / Instance<input id="bkServer" value="${esc(server)}"></label><label>Database(s) • comma separated<input id="bkDb" value="${esc(dbs)}"></label><label>Backup Label(s) • same order as Database(s)<input id="bkLabels" value="${esc(labels)}" placeholder="Example: Bogo-Muzaffarpur, Besure-Patna"></label><small>Leave blank to use database name.</small></section>
  <section><h3>BACKUP SETTINGS</h3><label>Primary Backup Folder<div class="input-button"><input id="bkFolder" value="${esc(folder)}"><button onclick="backupBrowseFolder('bkFolder')">Browse</button></div></label><label>Schedule<select id="bkSchedule" onchange="document.getElementById('bkFreq').textContent=this.value;updateBackupNext()"><option>Manual</option><option>Every 1 Hour</option><option>Every 2 Hours</option><option>Every 4 Hours</option><option>Every 6 Hours</option><option>Every 12 Hours</option><option>Daily</option></select></label></section>
  <section><h3>EXTERNAL DRIVE</h3><label class="check"><input id="bkExternalEnable" type="checkbox" onchange="externalState()"> Enable External Drive Backup</label><label>Detected External / USB Drive<select id="bkDrive" onchange="backupSelectDrive()"></select></label><div class="input-button"><input id="bkExternalFolder" value="${esc(extFolder)}"><button onclick="backupBrowseFolder('bkExternalFolder')">Browse</button></div><small id="bkExternalNote"></small></section>
 </div>
 <div class="sqlbackup-lower">
  <div class="sqlbackup-card"><h3>DESTINATIONS & RETENTION</h3><div class="checks"><label class="check"><input id="bkLocal" type="checkbox"> Local Backup</label><label class="check"><input id="bkZip" type="checkbox"> ZIP Compression</label><label class="check"><input id="bkCleanup" type="checkbox"> Auto Cleanup</label><label class="check"><input id="bkStart" type="checkbox"> Start with Windows</label></div><label class="retention">Keep backups for <input id="bkDays" type="number" min="0" max="3650" value="${esc(days)}"> days <small>• 0 = keep latest successful backup only; newest backup is never deleted</small></label></div>
  <div class="sqlbackup-card"><h3>CLOUD STORAGE</h3><label class="check"><input id="bkGoogleEnable" type="checkbox"> Upload ZIP to Google Drive <span id="bkGoogleState"></span></label><div class="input-button"><input id="bkGoogle" value="${esc(v[12]||'')}" placeholder="Google OAuth / service-account JSON"><button onclick="backupBrowseJson()">Browse JSON</button></div><div class="cloud-row"><button onclick="backupTestGoogle()">CONNECT / TEST GOOGLE DRIVE</button><small>Cloud upload is optional.</small></div></div>
 </div>
 <div class="sqlbackup-card sqlbackup-actions"><button class="primary" id="bkNow" onclick="backupNowMaster()">BACKUP NOW</button><button onclick="saveBackupMaster()">SAVE SETTINGS</button><button onclick="openBackupLog()">OPEN LOG</button><div id="bkStatus">Automatic scheduler is running. Scheduled time and destination monitoring are active.</div></div>
 <div class="sqlbackup-foot">SuvidhaSqlBackup | SQL Server • Local • External Drive • Google Drive</div></div>`;
 $('bkSchedule').value=schedule;$('bkLocal').checked=v[6]===''?true:v[6]!=='false';$('bkZip').checked=v[7]===''?true:v[7]!=='false';$('bkCleanup').checked=v[8]===''?true:v[8]!=='false';$('bkStart').checked=v[9]===''?true:v[9]==='true';$('bkExternalEnable').checked=v[11]==='true';$('bkGoogleEnable').checked=v[13]==='true';
 renderDriveOptions(driveRoot(extFolder));externalState();updateNextCard();if(timer)clearInterval(timer);timer=setInterval(refreshRuntime,30000)
};
window.updateBackupNext=updateNextCard;
window.saveBackupMaster=async function(){
 try{
  const data={'Backup.Server':$('bkServer').value.trim(),'Backup.Databases':$('bkDb').value.trim(),'Backup.Labels':$('bkLabels').value.trim(),'Backup.Folder':$('bkFolder').value.trim(),'Backup.Schedule':$('bkSchedule').value,'Backup.RetentionDays':$('bkDays').value,'Backup.LocalEnabled':$('bkLocal').checked,'Backup.ZipEnabled':$('bkZip').checked,'Backup.AutoCleanup':$('bkCleanup').checked,'Backup.StartWithWindows':$('bkStart').checked,'Backup.ExternalFolder':$('bkExternalFolder').value.trim(),'Backup.ExternalEnabled':$('bkExternalEnable').checked,'Backup.GoogleDriveJson':$('bkGoogle').value.trim(),'Backup.GoogleDriveEnabled':$('bkGoogleEnable').checked};
  if(!data['Backup.Databases'])throw new Error('At least one database name is required');if(!data['Backup.Folder'])throw new Error('Primary backup folder is required');
  for(const [k,val] of Object.entries(data))await setSetting(k,val);
  const n=calcNext();if(n)await setSetting('Backup.NextRun',n.toISOString());
  if(window.desktopBackupStartup)window.desktopBackupStartup($('bkStart').checked);
  status('Settings saved. Scheduler updated.','ok');updateNextCard()
 }catch(e){status('Save failed: '+e.message,'warn')}
};
window.backupNowMaster=async function(){
 const btn=$('bkNow');btn.disabled=true;btn.textContent='BACKING UP…';status('Creating verified SQL Server backup…');
 try{
  await saveBackupMaster();
  const body={Server:$('bkServer').value.trim(),Databases:$('bkDb').value.trim(),Labels:$('bkLabels').value.trim(),Folder:$('bkFolder').value.trim(),Schedule:$('bkSchedule').value,RetentionDays:Math.max(0,Number($('bkDays').value||0)),LocalEnabled:$('bkLocal').checked,Zip:$('bkZip').checked,AutoCleanup:$('bkCleanup').checked,ExternalFolder:$('bkExternalFolder').value.trim(),ExternalEnabled:$('bkExternalEnable').checked,GoogleDriveJson:$('bkGoogle').value.trim(),GoogleDriveEnabled:$('bkGoogleEnable').checked};
  const r=await api('/api/backup-master',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const w=r.warnings||[];const clean=(r.cleanupDeleted??r.CleanupDeleted??0),cleanFail=(r.cleanupFailures??r.CleanupFailures??0);status(r.message+(w.length?' — '+w.join(' | '):'')+(clean||cleanFail?' · Cleanup: '+clean+' deleted'+(cleanFail?', '+cleanFail+' failed':''):''),w.length||cleanFail?'warn':'ok');$('bkLast').textContent=new Date(r.completedAt||Date.now()).toLocaleString('en-IN');$('bkLastResult').textContent=w.length?'Success with warnings':'Success';await refreshRuntime()
 }catch(e){status('Backup failed: '+e.message,'warn')}finally{btn.disabled=false;btn.textContent='BACKUP NOW'}
};
})();