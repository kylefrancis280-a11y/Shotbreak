/* Timeline — Scene continuity graph (locations + cast blocks) */
window.SBContinuity = (function () {
  function escRe(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseHeading(heading) {
    if (window.SBParser && window.SBParser.parseSceneHeading) {
      return window.SBParser.parseSceneHeading(heading);
    }
    return { key: '', name: '', timeOfDay: '', raw: heading || '' };
  }

  function continuityType(heading) {
    const h = String(heading || '');
    if (/\bCONTINUOUS\b/i.test(h)) return 'continuous';
    if (/\b(?:MOMENTS?\s+LATER|LATER|SAME\s+TIME)\b/i.test(h)) return 'later';
    if (/\b(?:FLASHBACK|FLASH\s*CUT|INTERCUT|TIME\s+CUT|MONTAGE|DREAM)\b/i.test(h)) return 'break';
    return 'new';
  }

  function inferCharRole(name, clip, sceneBg) {
    const up = String(name || '').toUpperCase().trim();
    if (!up) return 'supporting';
    if (sceneBg && sceneBg[up]) return 'background';
    const words = up.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && !(clip && clip.dialogue)) return 'background';
    if (clip && clip.dialogue && (clip.characters || []).some(function (n) {
      return String(n || '').toUpperCase().trim() === up;
    })) return 'lead';
    return words.length >= 2 ? 'background' : 'supporting';
  }

  function nameInBlob(name, blob) {
    const up = String(name || '').toUpperCase().trim();
    if (!up || !blob) return false;
    return new RegExp('(?:^|[^A-Z])' + escRe(up) + '(?:[^A-Z]|$)').test(String(blob).toUpperCase());
  }

  function shotNeedsBackground(shot, bgNames) {
    if (!shot || !bgNames.length) return false;
    const type = String(shot.type || shot.shotType || '').toUpperCase();
    if (/^(WIDE|ESTABLISHING|MASTER)/.test(type)) return true;
    const blob = ((shot.description || '') + ' ' + (shot.dialogue || '')).toUpperCase();
    return bgNames.some(function (n) { return nameInBlob(n, blob); });
  }

  /** Group parsed scenes into location/time continuity blocks. */
  function buildBlocks(scenes, clips) {
    scenes = scenes || [];
    clips = clips || [];
    const blocks = [];
    let block = null;

    scenes.forEach(function (sc, si) {
      const meta = parseHeading(sc.heading || '');
      const ctype = continuityType(sc.heading);
      const prev = block;
      const sameKey = !!(prev && meta.key && prev.locationKey && prev.locationKey === meta.key);
      const merge = prev && (ctype === 'continuous' || (sameKey && ctype !== 'break' && ctype !== 'new'));

      if (!block || !merge) {
        block = {
          id: 'blk' + blocks.length,
          locationKey: meta.key || '',
          locationName: meta.name || '',
          timeOfDay: meta.timeOfDay || '',
          continuity: ctype,
          sceneIndices: [si],
          clipIndices: [],
          leads: [],
          supporting: [],
          background: [],
          headings: [sc.heading || ''],
        };
        blocks.push(block);
      } else {
        if (block.sceneIndices.indexOf(si) < 0) block.sceneIndices.push(si);
        if (meta.key && !block.locationKey) {
          block.locationKey = meta.key;
          block.locationName = meta.name;
        }
        if (sc.heading) block.headings.push(sc.heading);
      }

      const bgMap = sc.background_cast || {};
      const bgNames = Object.keys(bgMap);
      const present = new Set((sc.characters_present || []).map(function (n) {
        return String(n || '').toUpperCase().trim();
      }).filter(Boolean));
      bgNames.forEach(function (n) {
        present.add(String(n || '').toUpperCase().trim());
      });

      clips.forEach(function (clip, ci) {
        if (clip.sceneIdx !== si) return;
        if (block.clipIndices.indexOf(ci) < 0) block.clipIndices.push(ci);

        (clip.characters || []).forEach(function (n) {
          const up = String(n || '').toUpperCase().trim();
          if (!up) return;
          present.add(up);
        });

        present.forEach(function (up) {
          const clipRef = clip;
          const role = inferCharRole(up, clipRef, bgMap);
          const list = role === 'lead' ? block.leads : (role === 'background' ? block.background : block.supporting);
          if (list.indexOf(up) < 0) list.push(up);
        });
      });
    });

    return blocks;
  }

  function sortClipIndices(indices) {
    return indices.slice().sort(function (a, b) { return a - b; });
  }

  /** Apply continuity: carry cast across connected shots, scope background, link locations. */
  function applyGraph(state) {
    if (!state || !state.clips || !state.clips.length) return { blocks: [], changed: 0 };
    const scenes = (state.parseResult && state.parseResult.scenes) || [];
    const blocks = buildBlocks(scenes, state.clips);
    let changed = 0;
    const chars = state.characters || {};

    blocks.forEach(function (blk) {
      const carry = { leads: [], all: [] };
      const ordered = sortClipIndices(blk.clipIndices);

      ordered.forEach(function (ci) {
        const clip = state.clips[ci];
        if (!clip) return;
        const sc = scenes[clip.sceneIdx];
        const bgMap = (sc && sc.background_cast) || {};
        const bgNames = Object.keys(bgMap);
        let frame = (clip.characters || []).map(function (n) {
          return String(n || '').toUpperCase().trim();
        }).filter(Boolean);

        if (!frame.length && carry.all.length) {
          frame = carry.all.slice();
          clip.characters = frame.slice();
          changed++;
        }

        if (sc && sc.shots && sc.shots[clip.shotIdx]) {
          const sh = sc.shots[clip.shotIdx];
          if (shotNeedsBackground(sh, bgNames)) {
            bgNames.forEach(function (n) {
              const up = String(n || '').toUpperCase().trim();
              if (!up || frame.indexOf(up) >= 0) return;
              frame.push(up);
              if (!chars[up]) {
                chars[up] = Object.assign({}, window.SBCharacters.DEFAULTS, { role: 'background' });
                changed++;
              }
              const desc = bgMap[n] || bgMap[up] || '';
              if (desc && chars[up] && !chars[up].description) {
                chars[up].description = String(desc).trim();
              }
            });
            clip.characters = frame.slice();
          }
        }

        blk.leads.forEach(function (up) {
          if (frame.indexOf(up) < 0 && carry.leads.indexOf(up) >= 0) {
            frame.push(up);
            clip.characters = frame.slice();
            changed++;
          }
        });

        if (frame.length) {
          carry.all = frame.slice();
          carry.leads = frame.filter(function (up) {
            return inferCharRole(up, clip, bgMap) === 'lead';
          });
        }

        frame.forEach(function (up) {
          if (!chars[up]) {
            chars[up] = Object.assign({}, window.SBCharacters.DEFAULTS);
            changed++;
          }
          const role = inferCharRole(up, clip, bgMap);
          if (role && chars[up].role !== 'lead') chars[up].role = role;
        });
      });

      if (blk.locationKey && state.locationBible) {
        const loc = state.locationBible.find(function (l) { return l && l.key === blk.locationKey; });
        if (loc) {
          ordered.forEach(function (ci) {
            if (!loc.clipIndices) loc.clipIndices = [];
            if (loc.clipIndices.indexOf(ci) < 0) {
              loc.clipIndices.push(ci);
              changed++;
            }
          });
        }
      }
    });

    state.continuityGraph = { blocks: blocks, builtAt: Date.now() };
    state.characters = chars;
    return { blocks: blocks, changed: changed };
  }

  function blockForClip(state, clipIndex) {
    const g = state && state.continuityGraph;
    if (!g || !g.blocks) return null;
    for (let i = 0; i < g.blocks.length; i++) {
      if (g.blocks[i].clipIndices.indexOf(clipIndex) >= 0) return g.blocks[i];
    }
    return null;
  }

  return {
    continuityType: continuityType,
    buildBlocks: buildBlocks,
    applyGraph: applyGraph,
    blockForClip: blockForClip,
  };
})();