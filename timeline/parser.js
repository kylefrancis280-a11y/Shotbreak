/* SHOTBREAK Timeline — Script Parser (offline module ①) */
window.SBParser = (function(){
  function isSH(t){return /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)}
  function isCC(t){return /^[A-Z][A-Z0-9 .'\-()]+$/i.test(t)&&t.length<40&&!isSH(t)&&!/^(FADE|CUT|DISSOLVE)/i.test(t)}
  function isPar(t){return /^\([^)]+\)$/.test(t)}
  function isTr(t){return /^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT)/i.test(t)}
  function isSceneNumberOnly(t){return /^\d+[A-Z]?\.?$/.test(t)}
  function isTitlePageLine(t){
    if(isSH(t))return false;
    if(/^(written by|by |story by|draft|revision|page |registered|copyright|contact|address|phone|email|wga|version)/i.test(t))return true;
    if(/^[A-Z][A-Z\s]{3,40}$/.test(t)&&!isCC(t)&&t.split(/\s+/).length<=5)return true;
    return false;
  }
  function exCN(t){return t.replace(/\s*\([^)]*\)\s*/g,'').trim().toUpperCase()}
  function resCN(n,c){if(c[n]!==undefined)return n;for(const f of Object.keys(c)){if(f.split(/\s+/).length>1&&f.split(/\s+/).includes(n))return f}return n}
  function spS(t){
    const r=t.match(/[^.!?]+[.!?]+[\s]*/g)||[t],res=[];let b='';
    for(const s of r){b+=s;if(b.trim().split(/\s+/).length>=6||s===r[r.length-1]){res.push(b.trim());b=''}}
    if(b.trim())res.push(b.trim());return res;
  }
  function iT(t,d,c){
    const x=t.toLowerCase().replace(/\([^)]*\)/g,'');
    if(/\b(close[\s-]?up|eyes|mouth|hand|tears)\b/.test(x))return'CLOSE-UP';
    if(/\b(insert|phone|screen|key|gun|weapon|drive)\b/.test(x))return'INSERT';
    if(d&&c===2)return'TWO-SHOT';if(d)return'MEDIUM';
    if(/\b(behind|shoulder)\b/.test(x))return'OTS';
    if(/\b(wide|room|city|street|warehouse|sky|surround)\b/.test(x))return'WIDE';
    if(/\b(walks?|run|follow|track|through|across)\b/.test(x))return'TRACKING';
    if(/\b(looks?\s+at|stares?|meets?\s+(his|her)\s+eyes)\b/.test(x))return'CLOSE-UP';
    return'MEDIUM';
  }
  function iCm(t,s){
    const x=t.toLowerCase();
    if(/\b(slow(ly)?|creep)\b/.test(x))return'SLOW DOLLY';
    if(/\b(pan|scans?)\b/.test(x))return'PAN';
    if(/\b(follow|track)\b/.test(x)&&s==='TRACKING')return'STEADICAM';
    if(/\b(crash|sudden)\b/.test(x))return'HANDHELD';
    return'STATIC';
  }
  function inferLocation(heading){
    if(!heading)return'';
    const m=heading.match(/^(?:INT\.|EXT\.|INT\/EXT\.)\s+([^-]+)/i);
    return m?m[1].trim():'';
  }
  function inferTOD(heading){
    if(!heading)return'Day';
    if(/\bNIGHT\b/i.test(heading))return'Night';
    if(/\bDAWN\b/i.test(heading))return'Dawn';
    if(/\bDUSK\b/i.test(heading))return'Dusk';
    return'Day';
  }

  function parse(text, durSec){
    const dur=durSec||5;
    const dl=dur+'-'+(dur+1)+'s';
    const lines=text.split('\n'),scenes=[],chars={};
    let cur=null,i=0,seenFirstScene=false;
    while(i<lines.length){
      const l=lines[i],t=l.trim();
      if(!t||isTr(t)){i++;continue}
      if(isSceneNumberOnly(t)&&i+1<lines.length&&isSH(lines[i+1].trim())){i++;continue}
      if(isSH(t)){cur={heading:t,shots:[]};scenes.push(cur);seenFirstScene=true;i++;continue}
      if(!seenFirstScene&&isTitlePageLine(t)){i++;continue}
      if(!cur){
        if(!seenFirstScene&&isTitlePageLine(t)){i++;continue}
        cur={heading:'SCENE 1',shots:[]};scenes.push(cur);seenFirstScene=true;
      }
      if(isCC(t)){
        const rn=exCN(t),cn=resCN(rn,chars),ci=t.match(/\(([^)]+)\)/);
        if(chars[cn]===undefined)chars[cn]=ci?ci[1]:'';
        i++;let par='',dl2=[];
        while(i<lines.length){
          const d=lines[i];
          if(!d.trim()||isSH(d.trim()))break;
          if(isCC(d.trim())&&!isPar(d))break;
          if(isPar(d))par=d.trim();else dl2.push(d.trim());
          i++;
        }
        if(dl2.length){
          const fd=dl2.join(' '),tp=iT(fd,!0,1),cm=iCm(fd,tp);
          let ds='Close on '+cn;if(chars[cn])ds+=' ('+chars[cn]+')';
          if(par)ds+=', '+par.replace(/[()]/g,'');
          ds+=', delivering dialogue.';
          cur.shots.push({type:tp,camera:cm,duration:dl,description:ds,dialogue:fd,characters_in_frame:[cn],cine:{}});
        }
        continue;
      }
      const ss=spS(t);
      for(const s of ss){
        let m=[];
        Object.keys(chars).forEach(c=>{if(s.toUpperCase().includes(c)&&!m.includes(c))m.push(c)});
        cur.shots.push({type:iT(s,!1,m.length),camera:iCm(s,iT(s,!1,m.length)),duration:dl,description:s,dialogue:null,characters_in_frame:m,cine:{}});
      }
      i++;
    }
    return{scenes,characters:chars};
  }

  function scenesToClips(result, global, clipDur){
    const clips=[];
    const labels=['Opening scene','Character intro','Dialogue','Action beat','Reaction shot','Scene transition','Climax','Resolution','Epilogue'];
    let n=0;
    result.scenes.forEach((sc,si)=>{
      sc.shots.forEach((sh,shi)=>{
        n++;
        const loc=inferLocation(sc.heading);
        const tod=inferTOD(sc.heading);
        clips.push({
          id:'clip-'+String(n).padStart(2,'0'),
          num:n,
          label:labels[(n-1)%labels.length]||('Beat '+n),
          sceneIdx:si,shotIdx:shi,
          heading:sc.heading,
          durationSec:clipDur||5,
          status:'draft',
          description:sh.description||'',
          dialogue:sh.dialogue||'',
          shotType:sh.type||'MEDIUM',
          camera:sh.camera||'STATIC',
          characters:sh.characters_in_frame||[],
          emotion:'Neutral',
          videoUrl:null,
          requestId:null,
          error:null,
          edit:{trimIn:0,trimOut:null,transition:'cut',transitionDur:0.5,speed:1,overlayFx:'',colorCorrect:''},
          params:{
            scene:{on:{location:true,timeOfDay:true,weather:false,season:false},location:loc,timeOfDay:tod,weather:'Clear',season:'Summer'},
            camera:{on:{angle:true,filmGrade:true,colorMode:true,saturation:false},angle:sh.type||'Medium',filmGrade:global.filmStyle||'35mm Grain',colorMode:'Color',saturation:'0'},
            atmosphere:{on:{lighting:true,mood:true,fx:false,sound:false},lighting:'Natural',mood:'Cinematic',fx:'',sound:''}
          }
        });
      });
    });
    return clips;
  }

  async function readFile(file){
    const name=(file.name||'').toLowerCase();
    if(name.endsWith('.txt'))return file.text();
    if(name.endsWith('.fdx'))return readFdx(file);
    if(name.endsWith('.pdf'))return readPdf(file);
    throw new Error('Unsupported file — use .txt, .fdx, or .pdf');
  }

  async function readFdx(file){
    const t=await file.text();
    const d=new DOMParser().parseFromString(t,'application/xml');
    const ps=d.getElementsByTagName('Paragraph'),ls=[];
    for(let i=0;i<ps.length;i++){
      const tp=ps[i].getAttribute('Type')||'';
      const ts=ps[i].getElementsByTagName('Text');
      let c='';for(let j=0;j<ts.length;j++)c+=ts[j].textContent;
      if(['Scene Heading','Action','Character','Dialogue','Parenthetical','Transition'].includes(tp)){
        ls.push(c);
        if(tp==='Scene Heading'||tp==='Transition')ls.push('');
      }
    }
    return ls.join('\n');
  }

  async function readPdf(file){
    if(!window.pdfjsLib)throw new Error('PDF library not loaded');
    const buf=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
    let text='';
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const content=await page.getTextContent();
      text+=content.items.map(it=>it.str).join(' ')+'\n';
    }
    return text;
  }

  return{parse,scenesToClips,readFile};
})();