/* Module ⑤ — Character consistency */
window.SBCharacters = (function () {
  const DEFAULTS = {
    description: '', refUrl: null, faceLock: false, bodyType: 'Average',
    wardrobe: '', voice: 'Natural', lipSync: true, emotion: 'Neutral', lockMethod: 'ip-adapter',
    role: 'lead'
  };

  function normalize (raw) {
    const out = {};
    Object.entries(raw || {}).forEach(([name, val]) => {
      if (typeof val === 'string') out[name] = { ...DEFAULTS, description: val };
      else out[name] = { ...DEFAULTS, ...val };
    });
    return out;
  }

  function normalizeScript (text) {
    if (window.SBParser && window.SBParser.normalizeScriptText) {
      return window.SBParser.normalizeScriptText(text);
    }
    return String(text || '').replace(/\r\n/g, '\n');
  }

  function isDialogueDirection (text, charName) {
    const d = String(text || '').trim();
    if (!d) return true;
    if (/^(v\.?o\.?|o\.?s\.?|o\.?c\.?|cont'?d|whispering|shouting|beat|pause|sighs|laughing|filtered|into radio|to camera)$/i.test(d)) return true;
    if (/^(to|at|from|with|into|toward|towards)\s+[A-Za-z][A-Za-z .'\-]{0,30}\.?$/i.test(d)) return true;
    const up = String(charName || '').toUpperCase().trim();
    if (up && new RegExp('^to\\s+' + up.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.?$', 'i').test(d)) return true;
    return d.length < 4;
  }

  function collapseRepeatedPhrases (text) {
    const d = String(text || '').trim();
    if (!d) return '';
    const phrases = d.split(/\.\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
    const seen = new Set();
    const out = [];
    phrases.forEach(function (p) {
      const key = p.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    });
    return out.join('. ').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
  }

  function sanitizeDescription (text, charName) {
    let d = collapseRepeatedPhrases(text);
    if (!d) return '';
    const up = String(charName || '').toUpperCase().trim();
    if (up) {
      const esc = up.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      d = d.replace(new RegExp('(?:to\\s+' + esc + '\\.?\\s*){2,}', 'gi'), 'to ' + up + '. ');
    }
    return d.trim().slice(0, 420);
  }

  function isBetterDescription (next, prev, charName) {
    const n = sanitizeDescription(next, charName);
    const p = sanitizeDescription(prev, charName);
    if (!n || isDialogueDirection(n, charName)) return false;
    if (!p) return n.length >= 8;
    if (isDialogueDirection(p, charName)) return true;
    if (n === p) return false;
    if (n.startsWith(p) && n.length > p.length + 6) {
      const extra = n.slice(p.length).trim();
      if (/^(to|at|from|with)\s+/i.test(extra)) return false;
    }
    const nParts = n.split(/\.\s+/).filter(Boolean);
    const pParts = p.split(/\.\s+/).filter(Boolean);
    if (nParts.length > pParts.length + 1 && n.length > p.length + 20) return false;
    return n.length > p.length + 4 || (n.length >= 8 && p.length < 8);
  }

  /** Pull appearance from action lines: NAME (traits), NAME, traits, intro sentence. */
  function synthesizeDescription (name, scriptText, hint) {
    const script = normalizeScript(scriptText);
    if (!script.trim()) return sanitizeDescription(hint || '', name);
    const upName = String(name || '').toUpperCase();
    const escName = upName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRE = new RegExp('\\b' + escName + '\\b', 'i');

    const bruteParen = script.match(new RegExp(escName + '\\s*\\(([^)]{3,200})\\)', 'i'));
    if (bruteParen && bruteParen[1] && !isDialogueDirection(bruteParen[1].trim(), name)) {
      return sanitizeDescription(bruteParen[1].trim(), name);
    }
    const bruteComma = script.match(new RegExp(escName + '\\s*,\\s*([^.!?\\n]{4,200})', 'i'));
    if (bruteComma && bruteComma[1] && !isDialogueDirection(bruteComma[1].trim(), name)) {
      return sanitizeDescription(bruteComma[1].trim(), name);
    }

    const lines = script.split('\n');

    const ACTION = 1; const DIALOGUE = 2; const CUE = 3; const SLUG = 4; const PAREN = 5; const BLANK = 6;
    const cls = new Array(lines.length);
    let inDialogue = false;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) { cls[i] = BLANK; inDialogue = false; continue; }
      if (window.SBParser && typeof window.SBParser.parseSceneHeading === 'function') {
        const sh = window.SBParser.parseSceneHeading(t);
        if (sh && sh.key) { cls[i] = SLUG; inDialogue = false; continue; }
      } else if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) { cls[i] = SLUG; inDialogue = false; continue; }
      if (/^\(.+\)$/.test(t)) { cls[i] = PAREN; continue; }
      const cuePart = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const isCue = cuePart.length > 0 && cuePart.length < 40
        && cuePart === cuePart.toUpperCase()
        && /[A-Z]/.test(cuePart)
        && !/[.!?,;:]$/.test(cuePart)
        && !/^(FADE|CUT|DISSOLVE|SMASH|MATCH|IRIS|WIPE|THE END)/i.test(cuePart);
      if (isCue) { cls[i] = CUE; inDialogue = true; continue; }
      if (inDialogue) { cls[i] = DIALOGUE; continue; }
      cls[i] = ACTION;
    }

    let parenTraits = '';
    let commaTraits = '';
    let introSentence = '';
    const laterActions = [];
    let firstMentionIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (cls[i] !== ACTION) continue;
      const L = lines[i];
      if (!nameRE.test(L)) continue;
      if (firstMentionIdx === -1) firstMentionIdx = i;

      if (!parenTraits) {
        const p = L.match(new RegExp(escName + '\\s*\\(([^)]{3,200})\\)', 'i'));
        if (p) parenTraits = p[1].trim();
      }
      if (!commaTraits) {
        const c = L.match(new RegExp(escName + '\\s*,\\s*([^.!?]{3,200}?)(?=[.!?]|\\s+(?:steps|walks|moves|stands|sits|enters|looks|turns|opens|closes|raises|lowers|draws|fires|whispers|shouts|says|tells|runs|falls|appears|emerges|exits))', 'i'));
        if (c) commaTraits = c[1].trim();
      }
      if (!introSentence && i === firstMentionIdx) {
        const t = L.trim();
        const sents = t.split(/(?<=[.!?])\s+/);
        for (const s of sents) {
          if (nameRE.test(s)) { introSentence = s.trim(); break; }
        }
        if (!introSentence) introSentence = t.substring(0, 220);
      } else if (laterActions.length < 2) {
        const t = L.trim();
        if (t.length < 280) laterActions.push(t);
      }
    }

    const parts = [];
    if (parenTraits && !isDialogueDirection(parenTraits, name)) parts.push(parenTraits);
    else if (commaTraits && !isDialogueDirection(commaTraits, name)) parts.push(commaTraits);
    else if (introSentence) {
      const bit = introSentence.replace(nameRE, '').replace(/^\s*[,.\-–—:\s]+/, '').trim();
      if (bit && !isDialogueDirection(bit, name)) parts.push(bit);
    }
    if (parts.join(' ').length < 24 && laterActions.length) {
      const bit = laterActions[0].replace(nameRE, '').replace(/^\s*[,.\-–—:\s]+/, '').trim().substring(0, 160);
      if (bit && !isDialogueDirection(bit, name)) parts.push(bit);
    }

    if (!parts.length) return sanitizeDescription(hint || '', name);
    return sanitizeDescription(parts.filter(Boolean).join('. '), name);
  }

  function inferWardrobe (desc) {
    const d = String(desc || '');
    const patterns = [
      /\b(?:tailored\s+)?(?:black\s+|white\s+|dark\s+|grey\s+|gray\s+|navy\s+)?suit\b[^.,;]*/i,
      /\b(?:leather|trench|bomber|denim|military|army)\s+jacket\b[^.,;]*/i,
      /\b(?:worn\s+)?(?:overcoat|coat|uniform|robes?|gown|dress|tuxedo|scrubs|lab\s+coat)\b[^.,;]*/i,
      /\b(?:hoodie|sweater|shirt|blouse|vest|armor|fatigues)\b[^.,;]*/i
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = d.match(patterns[i]);
      if (m) return m[0].trim().slice(0, 120);
    }
    return '';
  }

  function inferBodyType (desc) {
    const d = String(desc || '').toLowerCase();
    if (/\b(stocky|burly|heavyset|broad|thick)\b/.test(d)) return 'Stocky';
    if (/\b(athletic|muscular|fit|lean|wiry|ex-military|soldier)\b/.test(d)) return 'Athletic';
    if (/\b(slender|slim|thin|petite|small|frail)\b/.test(d)) return 'Slender';
    if (/\b(tall|lanky|towering)\b/.test(d)) return 'Tall';
    if (/\b(short|diminutive)\b/.test(d)) return 'Petite';
    return '';
  }

  function fallbackFromClips (name, clips) {
    const up = String(name || '').toUpperCase();
    for (let i = 0; i < (clips || []).length; i++) {
      const clip = clips[i];
      if (!appearsInClip(name, clip)) continue;
      const desc = String(clip.description || '').trim();
      if (desc && desc.length > 12 && !/^Close on\s+/i.test(desc)) {
        return desc.replace(new RegExp('\\b' + up.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '').replace(/^\s*[,.\-–—:\s]+/, '').trim().slice(0, 280);
      }
      if (clip.dialogue && String(clip.dialogue).trim()) {
        return 'Dialogue in clip ' + (clip.num || (i + 1)) + ': "' + String(clip.dialogue).trim().slice(0, 120) + '"';
      }
    }
    return '';
  }

  function appearsInClip (name, clip) {
    const up = String(name || '').toUpperCase().trim();
    if ((clip.characters || []).some(function (n) { return String(n || '').toUpperCase().trim() === up; })) return true;
    const blob = ((clip.heading || '') + ' ' + (clip.description || '') + ' ' + (clip.dialogue || '')).toUpperCase();
    return blob.indexOf(up) >= 0;
  }

  function extractFromClips (name, clips) {
    const up = String(name || '').toUpperCase();
    const esc = up.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = [];
    (clips || []).forEach(function (clip) {
      if (!appearsInClip(name, clip)) return;
      const desc = String(clip.description || '');
      const dlg = String(clip.dialogue || '');
      const patterns = [
        new RegExp('Close on\\s+' + esc + '\\s*\\(([^)]+)\\)', 'i'),
        new RegExp('\\b' + esc + '\\s*\\(([^)]+)\\)', 'i'),
        new RegExp('\\b' + esc + '\\s*,\\s*([^.!?]{4,160})', 'i')
      ];
      patterns.forEach(function (re) {
        const m = desc.match(re);
        if (!m || !m[1]) return;
        const bit = m[1].trim().replace(/,?\s*delivering dialogue\.?/i, '').trim();
        if (!bit || isDialogueDirection(bit, name)) return;
        if (parts.indexOf(bit) < 0) parts.push(bit);
      });
      if (dlg && parts.length < 2) {
        const tone = desc.match(/\((whispering|shouting|filtered|into radio|beat|pause)[^)]*\)/i);
        if (tone) parts.push(tone[0].replace(/[()]/g, ''));
      }
    });
    return parts.join('. ').slice(0, 420);
  }

  function enrichAll (characters, scriptText, clips, parseChars) {
    if (!characters || !Object.keys(characters).length) return characters;
    let blob = scriptText || '';
    if (!blob.trim() && clips && clips.length) {
      const parts = [];
      clips.forEach(function (c) {
        if (c.heading) parts.push(c.heading);
        if (c.description) parts.push(c.description);
        if (c.dialogue) parts.push(c.dialogue);
      });
      blob = parts.join('\n');
    }

    Object.keys(characters).forEach(function (name) {
      const c = characters[name];
      if (!c) return;
      const up = String(name).toUpperCase();
      const parseHint = parseChars && String((parseChars[up] || parseChars[name]) || '').trim();
      const fromClips = sanitizeDescription(extractFromClips(name, clips), name);
      const syn = blob.trim() ? synthesizeDescription(name, blob, parseHint || '') : '';
      const candidates = [syn, fromClips, parseHint].map(function (x) {
        return sanitizeDescription(x, name);
      }).filter(function (x) {
        return x && !isDialogueDirection(x, name);
      });
      let best = candidates.sort(function (a, b) { return b.length - a.length; })[0] || '';
      if (!best || best.length < 8) {
        const fb = sanitizeDescription(fallbackFromClips(name, clips), name);
        if (fb && !isDialogueDirection(fb, name) && fb.length > (best || '').length) best = fb;
      }

      const current = sanitizeDescription(c.description || '', name);
      if (best && isBetterDescription(best, current, name)) {
        c.description = best;
      } else if (current !== c.description) {
        c.description = current;
      }
      if (!c.wardrobe || !String(c.wardrobe).trim()) {
        const w = inferWardrobe(c.description);
        if (w) c.wardrobe = w;
      }
      if (!c.bodyType || c.bodyType === 'Average') {
        const b = inferBodyType(c.description);
        if (b) c.bodyType = b;
      }
    });
    return characters;
  }

  function renderList (chars, selected) {
    const names = Object.keys(chars);
    if (!names.length) return '<div class="empty-hint">Characters come from the same script parse as your timeline clips. Re-import your script, or click <strong>+ Add Character</strong>.</div>';
    return '<div class="char-grid">' + names.map(n => {
      const c = chars[n];
      const thumb = c.refUrl ? '<img src="' + esc(c.refUrl) + '" alt="">' : '<span class="ph">👤</span>';
      const lock = c.faceLock ? '<span class="lock-badge">🔒 Face lock</span>' : '';
      const sel = selected === n ? ' selected' : '';
      const preview = (c.description || '').trim().slice(0, 42);
      const roleTag = (c.role && c.role !== 'lead') ? '<span class="lock-badge" style="opacity:.85">' + esc(c.role) + '</span>' : '';
      return '<div class="char-card' + sel + '" data-name="' + esc(n) + '">' +
        '<button type="button" class="char-del" data-del="' + esc(n) + '" title="Delete character" aria-label="Delete ' + esc(n) + '">×</button>' +
        '<div class="char-thumb">' + thumb + '</div>' +
        '<div class="char-name">' + esc(n) + '</div>' +
        (preview ? '<div class="char-meta" style="color:var(--text2);margin-top:2px">' + esc(preview) + (c.description.length > 42 ? '…' : '') + '</div>' : '') +
        lock + roleTag +
        '<div class="char-meta">' + esc(c.emotion || 'Neutral') + ' · ' + esc(c.voice || 'Natural') + '</div></div>';
    }).join('') + '</div>';
  }

  function renderEditor (name, c) {
    if (!name) return '<div class="empty-hint">Select a character to edit face lock, wardrobe, and voice.</div>';
    const hasDesc = !!(c.description && String(c.description).trim());
    return '<div class="char-editor">' +
      '<h4>' + esc(name) + '</h4>' +
      (!hasDesc ? '<div class="empty-hint" style="margin-bottom:8px">No traits parsed yet — click <strong>↻ Sync from parse</strong> or re-import your script. Action lines like <em>NAME (50s, silver hair, suit)</em> fill this automatically.</div>' : '') +
      field('Description', 'description', 'textarea', c.description) +
      field('Body type', 'bodyType', 'select', c.bodyType, ['Slender', 'Average', 'Athletic', 'Stocky', 'Tall', 'Petite']) +
      field('Wardrobe', 'wardrobe', 'input', c.wardrobe) +
      field('Voice profile', 'voice', 'select', c.voice, ['Natural', 'Deep', 'Soft', 'Gravel', 'Young', 'Elder']) +
      field('Default emotion', 'emotion', 'select', c.emotion, ['Neutral', 'Tense', 'Joy', 'Fear', 'Anger', 'Sad', 'Noir']) +
      field('Cast role', 'role', 'select', c.role || 'lead', ['lead', 'supporting', 'background', 'crowd', 'voice_only']) +
      '<div class="field"><label><span>Face lock (I2V)</span><span class="toggle' + (c.faceLock ? ' on' : '') + '" data-k="faceLock"></span></label></div>' +
      '<div class="field"><label><span>Lip-sync enable</span><span class="toggle' + (c.lipSync ? ' on' : '') + '" data-k="lipSync"></span></label></div>' +
      '<div class="field"><label>Lock method</label><select data-k="lockMethod"><option value="ip-adapter"' + (c.lockMethod === 'ip-adapter' ? ' selected' : '') + '>IP-Adapter</option><option value="lora"' + (c.lockMethod === 'lora' ? ' selected' : '') + '>LoRA</option></select></div>' +
      (c.refUrl ? '<div class="ref-preview"><img src="' + esc(c.refUrl) + '" alt="ref"></div>' : '') +
      '<button type="button" class="tb-btn gold" id="btnUploadRef">Upload reference image</button>' +
      (c.refUrl ? '<button type="button" class="tb-btn" id="btnClearRef">Remove reference</button>' : '') +
      '<button type="button" class="tb-btn char-delete-btn" id="btnDeleteChar">Delete character</button>' +
      '</div>';
  }

  function field (label, key, type, val, opts) {
    if (type === 'textarea') return '<div class="field"><label>' + label + '</label><textarea data-k="' + key + '">' + esc(val || '') + '</textarea></div>';
    if (type === 'select') return '<div class="field"><label>' + label + '</label><select data-k="' + key + '">' + opts.map(o => '<option' + (o === val ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div>';
    return '<div class="field"><label>' + label + '</label><input data-k="' + key + '" value="' + esc(val || '') + '"></div>';
  }

  function esc (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function getRefForClip (chars, clip) {
    const names = clip.characters || [];
    const rank = { lead: 0, supporting: 1, background: 2, crowd: 9, voice_only: 10 };
    const sorted = names.slice().sort((a, b) => {
      const ra = rank[(chars[a] && chars[a].role) || 'lead'] || 5;
      const rb = rank[(chars[b] && chars[b].role) || 'lead'] || 5;
      return ra - rb;
    });
    for (const n of sorted) {
      const c = chars[n];
      if (!c || c.role === 'crowd' || c.role === 'voice_only') continue;
      if (c.faceLock && c.refUrl && String(c.refUrl).startsWith('https://')) return { url: c.refUrl, name: n };
    }
    for (const n of sorted) {
      const c = chars[n];
      if (!c || c.role === 'crowd' || c.role === 'voice_only') continue;
      if (c.refUrl && String(c.refUrl).startsWith('https://')) return { url: c.refUrl, name: n };
    }
    return null;
  }

  function injectIntoPrompt (prompt, chars, clip) {
    const names = clip.characters || [];
    let extra = '';
    names.forEach(n => {
      const c = chars[n]; if (!c) return;
      if (c.description) extra += ' ' + n + ': ' + c.description.slice(0, 100) + '.';
      if (c.wardrobe) extra += ' Wardrobe: ' + c.wardrobe + '.';
      if (c.emotion) extra += ' Emotion: ' + c.emotion + '.';
      if (c.lipSync && clip.dialogue) extra += ' Lip-sync dialogue.';
    });
    return (prompt + extra).slice(0, 900);
  }

  function inferCastRole (name, clips) {
    const up = String(name || '').toUpperCase().trim().replace(/^(A|AN|THE)\s+/, '');
    const words = up.split(/\s+/).filter(Boolean);
    let hasDialogue = false;
    (clips || []).forEach(function (clip) {
      if (!clip.dialogue) return;
      const inFrame = (clip.characters || []).some(function (n) {
        return String(n || '').toUpperCase().trim() === up;
      });
      if (inFrame) hasDialogue = true;
    });
    if (words.length >= 2) return hasDialogue ? 'supporting' : 'background';
    if (hasDialogue) return 'lead';
    return 'supporting';
  }

  function hydrate (characters, scriptText, clips, parseChars) {
    if (!characters) return characters;
    Object.keys(characters).forEach(function (name) {
      const c = characters[name];
      if (!c) return;
      if (c.desc && !c.description) c.description = c.desc;
      delete c.desc;
    });
    enrichAll(characters, scriptText, clips, parseChars);
    Object.keys(characters).forEach(function (name) {
      const c = characters[name];
      if (!c || (c.description && String(c.description).trim())) return;
      const up = String(name).toUpperCase();
      const fromParse = parseChars && (parseChars[up] || parseChars[name]);
      if (fromParse && String(fromParse).trim()) {
        c.description = String(fromParse).trim();
        return;
      }
      const fb = fallbackFromClips(name, clips);
      if (fb) c.description = fb;
    });
    Object.keys(characters).forEach(function (name) {
      const c = characters[name];
      if (!c) return;
      if (!c.role || c.role === 'lead') c.role = inferCastRole(name, clips);
    });
    return characters;
  }

  return {
    DEFAULTS, normalize, synthesizeDescription, sanitizeDescription, extractFromClips, inferWardrobe, inferBodyType, enrichAll, hydrate,
    renderList, renderEditor, getRefForClip, injectIntoPrompt
  };
})();