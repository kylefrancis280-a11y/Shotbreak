'use strict';

function cleanLocName(name) {
  return String(name || '')
    .replace(/^\s*(?:at|inside|outside|near|on)\s+(?:the\s+)?/i, '')
    .replace(/^\s*in\s+(?:the\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function locKey(name, scriptText) {
  const n = canonicalLocName(name, scriptText);
  return n ? n.toUpperCase().replace(/\s+/g, ' ') : '';
}

function scriptHintsAirportDeparture(scriptText) {
  const s = String(scriptText || '');
  return /trudeau|montréal[\s-]*airport|montreal[\s-]*airport|\byul\b|pierre\s+elliott/i.test(s);
}

/** Deterministic canonical location — same physical place → same key. */
function canonicalLocName(name, scriptText) {
  const n = cleanLocName(name);
  if (!n) return '';

  if (/montreal[\s-]*trudeau|montréal[\s-]*trudeau|pierre\s+elliott\s+trudeau|\byul\b|aéroport.*trudeau/i.test(n)) {
    return 'Pierre Trudeau International Airport';
  }
  if (/^pierre\s+trudeau\b/i.test(n) && /airport/i.test(n)) {
    return 'Pierre Trudeau International Airport';
  }

  const airportCtx = scriptHintsAirportDeparture(scriptText);
  if (airportCtx) {
    if (/^(?:airport\s+)?(?:terminal|tarmac|runway|departure\s+gate|arrivals|baggage|customs|immigration|curb|drop[- ]?off)(?:\s+area)?$/i.test(n)) {
      return 'Pierre Trudeau International Airport';
    }
    if (/^airport\s+(?:terminal|tarmac|gate|curb)/i.test(n)) {
      return 'Pierre Trudeau International Airport';
    }
    if (/^montreal\s+airport$/i.test(n) || /^montréal\s+airport$/i.test(n)) {
      return 'Pierre Trudeau International Airport';
    }
  }

  return n;
}

function tokenSet(name) {
  return new Set(
    String(name || '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(function (w) {
      return w.length > 2 && !/^(THE|AND|INT|EXT|DAY|NIGHT)$/.test(w);
    })
  );
}

function tokenOverlapScore(a, b) {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  ta.forEach(function (t) { if (tb.has(t)) shared++; });
  return shared / Math.min(ta.size, tb.size);
}

/** Build alias map: rawKey → canonicalKey for entries that are the same place. */
function buildAliasMap(locationNames, scriptText) {
  const names = (locationNames || []).map(cleanLocName).filter(Boolean);
  const canonByName = {};
  names.forEach(function (nm) {
    canonByName[nm] = locKey(nm, scriptText || '');
  });

  const groups = {};
  names.forEach(function (nm) {
    const ck = canonByName[nm];
    if (!ck) return;
    if (!groups[ck]) groups[ck] = [];
    if (groups[ck].indexOf(nm) < 0) groups[ck].push(nm);
  });

  const aliasMap = {};
  Object.keys(groups).forEach(function (canonKey) {
    const members = groups[canonKey];
    if (members.length < 2) return;
    members.forEach(function (nm) {
      const rawKey = nm.toUpperCase().replace(/\s+/g, ' ');
      if (rawKey !== canonKey) aliasMap[rawKey] = canonKey;
    });
  });

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const ka = canonByName[a];
      const kb = canonByName[b];
      if (ka === kb) continue;
      const score = tokenOverlapScore(a, b);
      if (score >= 0.6 || (score >= 0.4 && /airport|terminal|tarmac/i.test(a) && /airport|terminal|tarmac/i.test(b))) {
        const winner = ka.length >= kb.length ? ka : kb;
        aliasMap[a.toUpperCase().replace(/\s+/g, ' ')] = winner;
        aliasMap[b.toUpperCase().replace(/\s+/g, ' ')] = winner;
      }
    }
  }

  return aliasMap;
}

function applyAliasMapToKey(key, aliasMap) {
  const up = String(key || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!up) return '';
  if (aliasMap && aliasMap[up]) return aliasMap[up];
  return up;
}

module.exports = {
  cleanLocName,
  locKey,
  canonicalLocName,
  scriptHintsAirportDeparture,
  buildAliasMap,
  applyAliasMapToKey,
  tokenOverlapScore,
};