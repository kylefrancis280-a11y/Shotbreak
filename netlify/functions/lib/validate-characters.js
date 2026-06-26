'use strict';

const BODY_TYPES = new Set(['Slender', 'Average', 'Athletic', 'Stocky', 'Tall', 'Petite']);
const ROLES = new Set(['lead', 'supporting', 'background', 'crowd', 'voice_only']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);

function isJunkDescription(desc) {
  const d = String(desc || '').trim();
  if (!d || d.length < 8) return true;
  if (/^Dialogue\s+(?:in\s+clip|\(clip)/i.test(d)) return true;
  if (/reads\s*["']\s*["']/i.test(d)) return true;
  if (/^(to|at|from|with)\s+[A-Za-z][A-Za-z .'\-]{0,30}\.?$/i.test(d)) return true;
  if (/^(his|her|their)\s+(?:nametag|name\s*tag|nameplate|badge)\s+reads\b/i.test(d)) return true;
  if (/^Close on\b/i.test(d)) return true;
  if (/delivering dialogue\.?$/i.test(d)) return true;
  if (/\bmatching\s+(?:haircut|hair|look|appearance|style|uniform|outfit|jacket)\b/i.test(d)) return true;
  if (/\bidentical(?:ly)?\s+(?:groomed|dressed|clothed|styled|matching)\b/i.test(d)) return true;
  if (/\bwell[- ]groomed\s+man\b/i.test(d) && !/\b(\d{2}s|mid-?\d|late-?\d|early-?\d|military|nametag|silver|scar|beard|stubble)\b/i.test(d)) return true;
  if (/\b(?:a|the)\s+man\s+(?:with|in|wearing)\b/i.test(d) && !/\b(\d{2}s|nametag|silver|scar|military|ex-?military)\b/i.test(d)) return true;
  return false;
}

function validateCharacterEnrich(data) {
  return !!(data && typeof data === 'object' && data.characters && typeof data.characters === 'object');
}

function filterEnrichedCharacters(data, trustedNames, sanitizeField) {
  const trusted = new Set((trustedNames || []).map(function (n) {
    return String(n || '').toUpperCase().trim();
  }).filter(Boolean));
  const out = {};
  const sanitize = typeof sanitizeField === 'function'
    ? sanitizeField
    : function (v, max) { return String(v || '').slice(0, max || 400); };

  Object.entries(data.characters || {}).forEach(function (entry) {
    const rawName = entry[0];
    const rawVal = entry[1];
    const name = String(rawName || '').toUpperCase().trim();
    if (!name || !trusted.has(name)) return;

    const val = rawVal && typeof rawVal === 'object' ? rawVal : { description: String(rawVal || '') };
    const description = sanitize(val.description || '', 420).trim();
    if (isJunkDescription(description)) return;

    const wardrobe = sanitize(val.wardrobe || '', 120).trim();
    const bodyType = BODY_TYPES.has(val.bodyType) ? val.bodyType : '';
    const role = ROLES.has(val.role) ? val.role : '';
    const confidence = CONFIDENCE.has(val.confidence) ? val.confidence : 'medium';

    out[name] = { description, wardrobe, bodyType, role, confidence };
  });

  return { characters: out };
}

module.exports = {
  isJunkDescription,
  validateCharacterEnrich,
  filterEnrichedCharacters,
};