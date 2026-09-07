(function(){
  async function refreshAiKeyStatus(){
    try{
      const c=await api('/api/ai/config');
      const input=document.querySelector('#oaikey');
      const model=document.querySelector('#oaimodel');
      if(model&&c.model)model.value=c.model;
      if(input){
        input.value='';
        input.placeholder=c.configured?'Saved securely '+(c.maskedKey||'••••••••')+' — enter a new key to replace':'Enter OpenAI API key';
        input.title=c.configured?'An OpenAI API key is already saved. Leave blank to keep it.':'Enter your OpenAI API key';
      }
      const host=input?.closest('.panel');
      if(host){
        let s=host.querySelector('.ai-key-status');
        if(!s){s=document.createElement('div');s.className='muted ai-key-status';s.style.marginTop='8px';host.appendChild(s)}
        s.textContent=c.configured?'✓ OpenAI key configured ('+c.source+'). Model: '+c.model:'⚠ OpenAI API key is not configured.';
        let b=host.querySelector('.ai-test-btn');
        if(!b){b=document.createElement('button');b.className='btn secondary ai-test-btn';b.style.margin='10px 0 0 8px';b.textContent='Test AI Connection';b.onclick=async()=>{b.disabled=true;b.textContent='Testing…';try{const r=await api('/api/ai/test',{method:'POST'});toast('OpenAI connection OK · '+r.model)}catch(e){alert(e.message)}finally{b.disabled=false;b.textContent='Test AI Connection'}};host.querySelector('button')?.after(b)}
      }
    }catch(e){}
  }
  const originalLoadSettings=window.loadSettings;
  if(typeof originalLoadSettings==='function')window.loadSettings=async function(){await originalLoadSettings();await refreshAiKeyStatus()};
  const originalSaveAISettings=window.saveAISettings;
  if(typeof originalSaveAISettings==='function')window.saveAISettings=async function(){const entered=(document.querySelector('#oaikey')?.value||'').trim();await originalSaveAISettings();await refreshAiKeyStatus();if(entered)toast('AI key saved securely')};
})();