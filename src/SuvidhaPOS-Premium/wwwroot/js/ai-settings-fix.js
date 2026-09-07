(function(){
  async function refreshAiKeyStatus(){
    try{
      const c=await api('/api/ai/config');
      const input=document.querySelector('#oaikey');
      const model=document.querySelector('#oaimodel');
      if(model && c.model) model.value=c.model;
      if(input){
        input.value='';
        input.placeholder=c.configured
          ? 'Saved securely '+(c.maskedKey||'••••••••')+' — enter a new key to replace'
          : 'Enter OpenAI API key';
        input.title=c.configured
          ? 'An OpenAI API key is already saved. Leave this field blank to keep it.'
          : 'Enter your OpenAI API key';
      }
      const host=input?.closest('.panel');
      if(host){
        let s=host.querySelector('.ai-key-status');
        if(!s){s=document.createElement('div');s.className='muted ai-key-status';s.style.marginTop='8px';host.appendChild(s)}
        s.textContent=c.configured
          ? '✓ OpenAI key configured ('+c.source+'). The secret is stored server-side and is not shown in the browser.'
          : '⚠ OpenAI API key is not configured.';
      }
    }catch(e){/* keep settings page usable if status check is unavailable */}
  }
  const originalLoadSettings=window.loadSettings;
  if(typeof originalLoadSettings==='function'){
    window.loadSettings=async function(){
      await originalLoadSettings();
      await refreshAiKeyStatus();
    };
  }
  const originalSaveAISettings=window.saveAISettings;
  if(typeof originalSaveAISettings==='function'){
    window.saveAISettings=async function(){
      const entered=(document.querySelector('#oaikey')?.value||'').trim();
      await originalSaveAISettings();
      if(entered){
        await refreshAiKeyStatus();
        toast('AI key saved securely');
      }
    };
  }
})();
