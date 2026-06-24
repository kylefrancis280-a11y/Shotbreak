/* Module ⑤ — Character consistency */
window.SBCharacters = (function(){
  const DEFAULTS = {
    description:'', refUrl:null, faceLock:false, bodyType:'Average',
    wardrobe:'', voice:'Natural', lipSync:true, emotion:'Neutral', lockMethod:'ip-adapter',
    role:'lead'
  };

  function normalize(raw){
    const out={};
    Object.entries(raw||{}).forEach(([name,val])=>{
      if(typeof val==='string')out[name]={...DEFAULTS,description:val};
      else out[name]={...DEFAULTS,...val};
    });
    return out;
  }

  function renderList(chars, selected){
    const names=Object.keys(chars);
    if(!names.length)return '<div class="empty-hint">Characters come from the same script parse as your timeline clips. Re-import your script, or click <strong>+ Add Character</strong>.</div>';
    return '<div class="char-grid">'+names.map(n=>{
      const c=chars[n];
      const thumb=c.refUrl?'<img src="'+esc(c.refUrl)+'" alt="">':'<span class="ph">👤</span>';
      const lock=c.faceLock?'<span class="lock-badge">🔒 Face lock</span>':'';
      const sel=selected===n?' selected':'';
      return '<div class="char-card'+sel+'" data-name="'+esc(n)+'">'+
        '<button type="button" class="char-del" data-del="'+esc(n)+'" title="Delete character" aria-label="Delete '+esc(n)+'">×</button>'+
        '<div class="char-thumb">'+thumb+'</div>'+
        '<div class="char-name">'+esc(n)+'</div>'+lock+
        '<div class="char-meta">'+esc(c.emotion||'Neutral')+' · '+esc(c.voice||'Natural')+'</div></div>';
    }).join('')+'</div>';
  }

  function renderEditor(name, c){
    if(!name)return '<div class="empty-hint">Select a character to edit face lock, wardrobe, and voice.</div>';
    return '<div class="char-editor">'+
      '<h4>'+esc(name)+'</h4>'+
      field('Description','desc','textarea',c.description)+
      field('Body type','bodyType','select',c.bodyType,['Slender','Average','Athletic','Stocky','Tall','Petite'])+
      field('Wardrobe','wardrobe','input',c.wardrobe)+
      field('Voice profile','voice','select',c.voice,['Natural','Deep','Soft','Gravel','Young','Elder'])+
      field('Default emotion','emotion','select',c.emotion,['Neutral','Tense','Joy','Fear','Anger','Sad','Noir'])+
      field('Cast role','role','select',c.role||'lead',['lead','supporting','background','crowd','voice_only'])+
      '<div class="field"><label><span>Face lock (I2V)</span><span class="toggle'+(c.faceLock?' on':'')+'" data-k="faceLock"></span></label></div>'+
      '<div class="field"><label><span>Lip-sync enable</span><span class="toggle'+(c.lipSync?' on':'')+'" data-k="lipSync"></span></label></div>'+
      '<div class="field"><label>Lock method</label><select data-k="lockMethod"><option value="ip-adapter"'+(c.lockMethod==='ip-adapter'?' selected':'')+'>IP-Adapter</option><option value="lora"'+(c.lockMethod==='lora'?' selected':'')+'>LoRA</option></select></div>'+
      (c.refUrl?'<div class="ref-preview"><img src="'+esc(c.refUrl)+'" alt="ref"></div>':'')+
      '<button type="button" class="tb-btn gold" id="btnUploadRef">Upload reference image</button>'+
      (c.refUrl?'<button type="button" class="tb-btn" id="btnClearRef">Remove reference</button>':'')+
      '<button type="button" class="tb-btn char-delete-btn" id="btnDeleteChar">Delete character</button>'+
      '</div>';
  }

  function field(label,key,type,val,opts){
    if(type==='textarea')return '<div class="field"><label>'+label+'</label><textarea data-k="'+key+'">'+esc(val||'')+'</textarea></div>';
    if(type==='select')return '<div class="field"><label>'+label+'</label><select data-k="'+key+'">'+opts.map(o=>'<option'+(o===val?' selected':'')+'>'+o+'</option>').join('')+'</select></div>';
    return '<div class="field"><label>'+label+'</label><input data-k="'+key+'" value="'+esc(val||'')+'"></div>';
  }

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}

  function getRefForClip(chars, clip){
    const names=clip.characters||[];
    const rank={lead:0,supporting:1,background:2,crowd:9,voice_only:10};
    const sorted=names.slice().sort((a,b)=>{
      const ra=rank[(chars[a]&&chars[a].role)||'lead']||5;
      const rb=rank[(chars[b]&&chars[b].role)||'lead']||5;
      return ra-rb;
    });
    for(const n of sorted){
      const c=chars[n];
      if(!c||c.role==='crowd'||c.role==='voice_only')continue;
      if(c.faceLock&&c.refUrl&&String(c.refUrl).startsWith('https://'))return{url:c.refUrl,name:n};
    }
    for(const n of sorted){
      const c=chars[n];
      if(!c||c.role==='crowd'||c.role==='voice_only')continue;
      if(c.refUrl&&String(c.refUrl).startsWith('https://'))return{url:c.refUrl,name:n};
    }
    return null;
  }

  function injectIntoPrompt(prompt, chars, clip){
    const names=clip.characters||[];
    let extra='';
    names.forEach(n=>{
      const c=chars[n];if(!c)return;
      if(c.description)extra+=' '+n+': '+c.description.slice(0,100)+'.';
      if(c.wardrobe)extra+=' Wardrobe: '+c.wardrobe+'.';
      if(c.emotion)extra+=' Emotion: '+c.emotion+'.';
      if(c.lipSync&&clip.dialogue)extra+=' Lip-sync dialogue.';
    });
    return (prompt+extra).slice(0,900);
  }

  return{DEFAULTS,normalize,renderList,renderEditor,getRefForClip,injectIntoPrompt};
})();