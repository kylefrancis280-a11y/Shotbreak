'use strict';

const { locKey, applyAliasMapToKey } = require('./location-aliases');

function validateLocationEnrich(data) {
  return !!(data && typeof data === 'object');
}

function isJunkLocationText(text) {
  const d = String(text || '').trim();
  if (!d || d.length < 8) return true;
  if (/^SCENE\s*\d*$/i.test(d)) return true;
  if (/delivering dialogue/i.test(d)) return true;
  if (/^Close on\b/i.test(d)) return true;
  return false;
}

function filterEnrichedLocations(data, trustedKeys, sanitizeField) {
  const trusted = new Set((trustedKeys || []).map(function (k) {
    return String(k || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }).filter(Boolean));
  const sanitize = typeof sanitizeField === 'function'
    ? sanitizeField
    : function (v, max) { return String(v || '').slice(0, max || 400); };

  const aliases = {};
  const locations = {};

  if (data.aliases && typeof data.aliases === 'object') {
    Object.entries(data.aliases).forEach(function (entry) {
      const canonRaw = entry[0];
      const aliasList = entry[1];
      const canon = String(canonRaw || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (!canon || !trusted.has(canon)) return;
      if (!Array.isArray(aliasList)) return;
      aliasList.forEach(function (alias) {
        const ak = String(alias || '').toUpperCase().replace(/\s+/g, ' ').trim();
        if (ak && ak !== canon) aliases[ak] = canon;
      });
    });
  }

  Object.entries(data.locations || {}).forEach(function (entry) {
    const rawKey = entry[0];
    const rawVal = entry[1];
    const key = String(rawKey || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!key || !trusted.has(key)) return;
    const val = rawVal && typeof rawVal === 'object' ? rawVal : { description: String(rawVal || '') };
    const description = sanitize(val.description || '', 420).trim();
    const consistencyPhrase = sanitize(val.consistencyPhrase || '', 200).trim();
    const atmosphere = sanitize(val.atmosphere || '', 200).trim();
    const confidence = ['high', 'medium', 'low'].indexOf(val.confidence) >= 0 ? val.confidence : 'medium';
    if (isJunkLocationText(description) && isJunkLocationText(consistencyPhrase)) return;
    locations[key] = {
      canonicalName: sanitize(val.canonicalName || key, 120).trim() || key,
      description: isJunkLocationText(description) ? '' : description,
      consistencyPhrase: isJunkLocationText(consistencyPhrase) ? '' : consistencyPhrase,
      atmosphere: isJunkLocationText(atmosphere) ? '' : atmosphere,
      confidence: confidence,
    };
  });

  return { aliases: aliases, locations: locations };
}

module.exports = {
  validateLocationEnrich,
  isJunkLocationText,
  filterEnrichedLocations,
  applyAliasMapToKey,
  locKey,
};