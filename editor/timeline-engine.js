/* SHOTBREAK Timeline Editor Engine */
(function () {
  'use strict';

  const STORAGE_KEY = 'SB_Editor_v1';
  const PX_PER_SEC = 48;
  let state = {
    projectName: 'Untitled Project',
    bin: [],
    timeline: [],
    selectedId: null,
    playhead: 0,
    zoom: 1,
    playing: false,
  };
  let playTimer = null;
  let modalCb = null;
  let fileInput = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function uid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function agentLog(msg, kind) {
    const el = $('agentLog');
    if (!el) return;
    const line = document.createElement('div');
    line.className = 'line ' + (kind || 'info');
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        projectName: state.projectName,
        bin: state.bin,
        timeline: state.timeline,
        savedAt: Date.now(),
      }));
    } catch (e) { agentLog('Save failed: ' + e.message, 'err'); }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.projectName) state.projectName = d.projectName;
      if (Array.isArray(d.bin)) state.bin = d.bin;
      if (Array.isArray(d.timeline)) state.timeline = d.timeline;
    } catch (e) { /* ignore */ }
  }

  function probeDuration(src) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      const done = (n) => { v.src = ''; resolve(n || 5); };
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5);
      v.onerror = () => done(5);
      setTimeout(() => done(5), 8000);
      v.src = src;
    });
  }

  function normalizeBinItem(item) {
    const src = item.src || item.videoUrl || item.url || '';
    return {
      id: item.id || uid(),
      name: item.name || item.label || ('Clip ' + (item.num || '')).trim() || 'Clip',
      src: src,
      duration: Number(item.duration) > 0 ? Number(item.duration) : 5,
      thumb: item.thumb || null,
      source: item.source || 'import',
    };
  }

  async function addToBin(item, skipSave) {
    const b = normalizeBinItem(item);
    if (!b.src) return null;
    if (!b.duration || b.duration === 5) {
      b.duration = await probeDuration(b.src);
    }
    const exists = state.bin.some((x) => x.src === b.src);
    if (!exists) state.bin.push(b);
    if (!skipSave) { save(); renderBin(); }
    return b;
  }

  function importFromStorage() {
    let n = 0;
    try {
      const exportRaw = localStorage.getItem('SB_Timeline_Export');
      if (exportRaw) {
        const items = JSON.parse(exportRaw);
        if (Array.isArray(items) && items.length) {
          items.forEach((item, i) => {
            const b = normalizeBinItem({
              id: item.id || uid(),
              name: item.name || ('Clip ' + (i + 1)),
              src: item.src,
              duration: item.duration || 5,
              source: 'timeline-export',
            });
            if (!b.src) return;
            state.bin.push(b);
            state.timeline.push({
              id: uid(),
              binId: b.id,
              trimIn: 0,
              trimOut: null,
              transition: item.transition || 'cut',
            });
            n++;
          });
          localStorage.removeItem('SB_Timeline_Export');
        }
      }
    } catch (e) { agentLog('Timeline export import failed', 'err'); }

    if (!n) {
      try {
        const tlRaw = localStorage.getItem('SB_Timeline_v1');
        if (tlRaw) {
          const tl = JSON.parse(tlRaw);
          (tl.clips || []).filter((c) => c.videoUrl).forEach((c, i) => {
            const b = normalizeBinItem({
              id: c.id || uid(),
              name: 'Clip ' + (c.num || (i + 1)),
              src: c.videoUrl,
              duration: (c.edit && c.edit.trimOut != null ? c.edit.trimOut : c.durationSec) || 5,
              source: 'timeline-project',
            });
            state.bin.push(b);
            state.timeline.push({ id: uid(), binId: b.id, trimIn: 0, trimOut: null, transition: 'cut' });
            n++;
          });
        }
      } catch (e) { /* ignore */ }
    }

    try {
      const gen = JSON.parse(localStorage.getItem('SB_Generated') || '[]');
      if (Array.isArray(gen)) {
        gen.forEach((item) => {
          const b = normalizeBinItem({
            id: item.id || uid(),
            name: item.name || 'Generated',
            src: item.src || item.videoUrl,
            duration: item.duration || 5,
            source: 'generated',
          });
          if (!b.src) return;
          if (state.bin.some((x) => x.src === b.src)) return;
          state.bin.push(b);
          n++;
        });
      }
    } catch (e) { /* ignore */ }

    return n;
  }

  function binById(id) { return state.bin.find((b) => b.id === id); }

  function clipDuration(tlClip) {
    const b = binById(tlClip.binId);
    if (!b) return 0;
    const out = tlClip.trimOut != null ? tlClip.trimOut : b.duration;
    const inn = tlClip.trimIn || 0;
    return Math.max(0.1, out - inn);
  }

  function totalDuration() {
    return state.timeline.reduce((a, c) => a + clipDuration(c), 0);
  }

  function formatTc(sec) {
    const s = Math.max(0, sec || 0);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return String(m).padStart(2, '0') + ':' + r.toFixed(2).padStart(5, '0');
  }

  function renderBin() {
    const el = $('binItems');
    if (!el) return;
    if (!state.bin.length) {
      el.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">No media yet. Upload MP4 or click <strong>Refresh Generated</strong>. Send clips from Timeline → Open Full Editor.</div>';
      return;
    }
    el.innerHTML = state.bin.map((b) => {
      const thumb = b.src
        ? '<video class="thumb" src="' + esc(b.src) + '" muted preload="metadata"></video>'
        : '<div class="thumb"></div>';
      return '<div class="bin-item" data-id="' + esc(b.id) + '" draggable="true">' +
        thumb +
        '<div class="meta"><div class="name">' + esc(b.name) + '</div><div class="dur">' + b.duration.toFixed(1) + 's · ' + esc(b.source) + '</div></div></div>';
    }).join('');

    el.querySelectorAll('.bin-item').forEach((node) => {
      const id = node.getAttribute('data-id');
      node.addEventListener('click', () => addToTimeline(id));
      node.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/sb-bin-id', id);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  }

  function addToTimeline(binId) {
    const b = binById(binId);
    if (!b) return;
    state.timeline.push({
      id: uid(),
      binId: b.id,
      trimIn: 0,
      trimOut: null,
      transition: 'cut',
    });
    save();
    renderTimeline();
    renderInspector();
    agentLog('Added "' + b.name + '" to timeline', 'ok');
  }

  function renderTimeline() {
    const lane = $('videoLane');
    const ruler = $('ruler');
    if (!lane || !ruler) return;

    const z = state.zoom || 1;
    const total = Math.max(totalDuration(), 10);
    const width = total * PX_PER_SEC * z;
    lane.style.minWidth = width + 'px';
    ruler.innerHTML = '<div class="ruler-inner" style="width:' + width + 'px;position:relative;height:100%"></div>';
    const inner = ruler.querySelector('.ruler-inner');
    const step = z >= 2 ? 1 : z >= 1 ? 2 : 5;
    for (let t = 0; t <= total; t += step) {
      const x = t * PX_PER_SEC * z;
      inner.innerHTML += '<div class="ruler-tick" style="left:' + x + 'px"></div>' +
        '<div class="ruler-label" style="left:' + x + 'px">' + formatTc(t) + '</div>';
    }

    let offset = 0;
    lane.innerHTML = '';
    state.timeline.forEach((tl) => {
      const b = binById(tl.binId);
      if (!b) return;
      const dur = clipDuration(tl);
      const w = dur * PX_PER_SEC * z;
      const left = offset * PX_PER_SEC * z;
      const sel = tl.id === state.selectedId ? ' selected' : '';
      const div = document.createElement('div');
      div.className = 'clip' + sel;
      div.style.left = left + 'px';
      div.style.width = w + 'px';
      div.dataset.id = tl.id;
      div.innerHTML =
        (b.src ? '<video class="clip-thumb" src="' + esc(b.src) + '" muted preload="metadata"></video>' : '') +
        '<div class="clip-name">' + esc(b.name) + '</div>' +
        '<div class="clip-dur">' + dur.toFixed(1) + 's</div>';
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedId = tl.id;
        renderTimeline();
        renderInspector();
        seekToOffset(offset);
      });
      lane.appendChild(div);
      offset += dur;
    });

    let ph = lane.parentElement && lane.parentElement.querySelector('.playhead');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'playhead';
      lane.appendChild(ph);
    }
    ph.style.left = (state.playhead * PX_PER_SEC * z) + 'px';

    $('totalTime').textContent = '/ ' + formatTc(total);
    $('timecode').textContent = formatTc(state.playhead);
    updatePreview();
  }

  function renderInspector() {
    const el = $('inspectorContent');
    if (!el) return;
    const tl = state.timeline.find((c) => c.id === state.selectedId);
    if (!tl) {
      el.className = 'inspector-empty';
      el.textContent = 'Select a clip on the timeline';
      return;
    }
    const b = binById(tl.binId);
    el.className = '';
    el.innerHTML =
      '<div class="field"><label>Name</label><input value="' + esc(b && b.name) + '" readonly></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Trim in (s)</label><input type="number" step="0.1" min="0" id="inTrim" value="' + (tl.trimIn || 0) + '"></div>' +
      '<div class="field"><label>Trim out (s)</label><input type="number" step="0.1" min="0.1" id="outTrim" placeholder="end" value="' + (tl.trimOut != null ? tl.trimOut : '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>Transition</label><select id="transSel">' +
      ['cut', 'dissolve', 'fade'].map((t) => '<option value="' + t + '"' + (tl.transition === t ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select></div>' +
      '<div class="btn-row">' +
      '<button type="button" id="btnDupClip">Duplicate</button>' +
      '<button type="button" class="danger" id="btnDelClip">Delete</button>' +
      '</div>';

    $('inTrim').onchange = (e) => { tl.trimIn = Math.max(0, parseFloat(e.target.value) || 0); save(); renderTimeline(); };
    $('outTrim').onchange = (e) => {
      const v = e.target.value.trim();
      tl.trimOut = v === '' ? null : Math.max(0.1, parseFloat(v) || 0);
      save(); renderTimeline();
    };
    $('transSel').onchange = (e) => { tl.transition = e.target.value; save(); };
    $('btnDelClip').onclick = () => {
      state.timeline = state.timeline.filter((c) => c.id !== tl.id);
      state.selectedId = null;
      save(); renderTimeline(); renderInspector();
    };
    $('btnDupClip').onclick = () => {
      state.timeline.push({ id: uid(), binId: tl.binId, trimIn: tl.trimIn, trimOut: tl.trimOut, transition: tl.transition });
      save(); renderTimeline();
    };
  }

  function seekToOffset(sec) {
    state.playhead = Math.max(0, Math.min(sec, totalDuration()));
    renderTimeline();
  }

  function updatePreview() {
    const ph = $('previewA');
    const placeholder = $('previewPlaceholder');
    if (!ph) return;
    let offset = 0;
    let found = null;
    let local = 0;
    for (const tl of state.timeline) {
      const dur = clipDuration(tl);
      if (state.playhead >= offset && state.playhead < offset + dur) {
        found = tl;
        local = state.playhead - offset + (tl.trimIn || 0);
        break;
      }
      offset += dur;
    }
    if (!found) {
      ph.removeAttribute('src');
      ph.style.opacity = '0';
      if (placeholder) placeholder.style.display = '';
      return;
    }
    const b = binById(found.binId);
    if (!b || !b.src) return;
    if (placeholder) placeholder.style.display = 'none';
    ph.style.opacity = '1';
    if (ph.src !== b.src) ph.src = b.src;
    const target = Math.max(0, local);
    if (Math.abs((ph.currentTime || 0) - target) > 0.15) {
      try { ph.currentTime = target; } catch (e) { /* ignore */ }
    }
  }

  function stopPlay() {
    state.playing = false;
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    const ph = $('previewA');
    if (ph) ph.pause();
    const btn = $('playBtn');
    if (btn) btn.textContent = '▶';
  }

  function startPlay() {
    if (!state.timeline.length) return;
    state.playing = true;
    const btn = $('playBtn');
    if (btn) btn.textContent = '⏸';
    const ph = $('previewA');
    if (ph) ph.play().catch(() => {});
    const t0 = performance.now();
    const startPh = state.playhead;
    playTimer = setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      state.playhead = startPh + elapsed;
      if (state.playhead >= totalDuration()) {
        state.playhead = totalDuration();
        stopPlay();
      }
      renderTimeline();
    }, 50);
  }

  function ensureFileInput() {
    if (fileInput) return fileInput;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async () => {
      const files = fileInput.files;
      if (!files || !files.length) return;
      let added = 0;
      for (const f of files) {
        if (!f.type.startsWith('video/') && !/\.(mp4|webm|mov)$/i.test(f.name)) continue;
        const url = URL.createObjectURL(f);
        await addToBin({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), src: url, duration: 5, source: 'upload' });
        added++;
      }
      fileInput.value = '';
      renderBin();
      save();
      if (added) agentLog('Uploaded ' + added + ' file(s)', 'ok');
      else agentLog('No valid video files selected', 'err');
    });
    document.body.appendChild(fileInput);
    return fileInput;
  }

  window.uploadMedia = function () {
    ensureFileInput().click();
  };

  window.refreshGenerated = async function () {
    const before = state.bin.length;
    const n = importFromStorage();
    await Promise.all(state.bin.map(async (b) => {
      if (b.duration <= 5.01) b.duration = await probeDuration(b.src);
    }));
    save();
    renderBin();
    agentLog('Refreshed media bin (' + (state.bin.length - before + n) + ' new)', 'ok');
  };

  window.togglePlay = function () {
    if (state.playing) stopPlay();
    else startPlay();
  };

  window.seek = function (dir) {
    stopPlay();
    seekToOffset(state.playhead + (dir < 0 ? -1 : 1));
  };

  window.setZoom = function (val) {
    state.zoom = Math.max(0.5, Math.min(5, parseFloat(val) || 1));
    renderTimeline();
  };

  window.seekToRuler = function (ev) {
    const ruler = $('ruler');
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const x = ev.clientX - rect.left + ruler.scrollLeft;
    const sec = x / (PX_PER_SEC * (state.zoom || 1));
    stopPlay();
    seekToOffset(sec);
  };

  window.clearTimeline = function () {
    if (!state.timeline.length || !confirm('Clear all clips from the timeline?')) return;
    state.timeline = [];
    state.selectedId = null;
    state.playhead = 0;
    save();
    renderTimeline();
    renderInspector();
    agentLog('Timeline cleared', 'info');
  };

  window.runAgentOnSelection = function (role) {
    const tl = state.timeline.find((c) => c.id === state.selectedId);
    if (!tl) { agentLog('Select a timeline clip first', 'err'); return; }
    agentLog('Agent "' + role + '" queued (editor stub)', 'info');
  };

  window.closeModal = function () {
    $('modal').classList.remove('show');
    modalCb = null;
  };

  window.submitModal = function () {
    const val = ($('modalInput') || {}).value || '';
    if (modalCb) modalCb(val);
    closeModal();
  };

  function exportEdl() {
    const lines = ['TITLE: ' + state.projectName, 'FCM: NON-DROP FRAME'];
    let offset = 0;
    state.timeline.forEach((tl, i) => {
      const b = binById(tl.binId);
      if (!b) return;
      const dur = clipDuration(tl);
      lines.push('001  V     C        ' + formatTc(offset) + ' ' + formatTc(offset + dur) + ' ' + formatTc(tl.trimIn || 0) + ' ' + formatTc((tl.trimOut != null ? tl.trimOut : b.duration)) + ' ' + b.name);
      lines.push('* FROM CLIP NAME: ' + b.name);
      lines.push('* SOURCE FILE: ' + b.src);
      offset += dur;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.projectName || 'shotbreak').replace(/\s+/g, '_') + '.edl';
    a.click();
    agentLog('EDL exported', 'ok');
  }

  async function renderExport() {
    if (!state.timeline.length) { agentLog('Add clips to timeline first', 'err'); return; }
    agentLog('Preparing render…', 'info');
    const blobs = [];
    for (const tl of state.timeline) {
      const b = binById(tl.binId);
      if (!b || !b.src) continue;
      try {
        const r = await fetch(b.src);
        if (!r.ok) throw new Error('fetch ' + b.name);
        blobs.push(await r.blob());
      } catch (e) {
        agentLog('Could not fetch ' + b.name + ' — CORS or network', 'err');
        return;
      }
    }
    try {
      const { FFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js');
      const { fetchFile, toBlobURL } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js');
      const ff = new FFmpeg();
      ff.on('log', ({ message }) => { if (message) agentLog(message.slice(0, 120), 'info'); });
      const base = location.origin + '/static/ffmpeg/';
      await ff.load({
        coreURL: await toBlobURL(base + 'ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(base + 'ffmpeg-core.wasm', 'application/wasm'),
      });
      for (let i = 0; i < blobs.length; i++) await ff.writeFile('in' + i + '.mp4', await fetchFile(blobs[i]));
      if (blobs.length === 1) {
        await ff.exec(['-i', 'in0.mp4', '-c', 'copy', 'out.mp4']);
      } else {
        const list = blobs.map((_, i) => "file 'in" + i + ".mp4'").join('\n');
        await ff.writeFile('list.txt', new TextEncoder().encode(list));
        await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4']);
      }
      const data = await ff.readFile('out.mp4');
      const out = new Blob([data.buffer], { type: 'video/mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out);
      a.download = (state.projectName || 'shotbreak_edit').replace(/\s+/g, '_') + '.mp4';
      a.click();
      agentLog('Render complete — downloaded', 'ok');
    } catch (e) {
      agentLog('FFmpeg render failed: ' + e.message, 'err');
    }
  }

  function wireDropTargets() {
    const lane = $('videoLane');
    if (lane) {
      lane.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      lane.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/sb-bin-id');
        if (id) addToTimeline(id);
      });
    }
  }

  async function init() {
    loadSaved();
    const imported = importFromStorage();
    const pn = $('project-name');
    if (pn) {
      pn.value = state.projectName;
      pn.oninput = (e) => { state.projectName = e.target.value; save(); };
    }
    $('btn-save').onclick = () => { save(); agentLog('Project saved', 'ok'); };
    $('btn-export').onclick = exportEdl;
    $('btn-render').onclick = renderExport;
    wireDropTargets();
    await Promise.all(state.bin.map(async (b) => {
      if (!b.duration || b.duration <= 5) b.duration = await probeDuration(b.src);
    }));
    renderBin();
    renderTimeline();
    renderInspector();
    if (imported) agentLog('Loaded ' + imported + ' clip(s) from Timeline', 'ok');
    else if (!state.bin.length) agentLog('Upload MP4 or send clips from Timeline → Open Full Editor', 'info');
    console.log('[Editor] timeline-engine ready, bin=' + state.bin.length + ' timeline=' + state.timeline.length);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();