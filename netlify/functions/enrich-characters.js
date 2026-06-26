'use strict';

const { requireAuth } = require('./lib/verify-token');
const { corsHeaders } = require('./lib/http');
const { wrapUserContent, sanitizeField, UNTRUSTED_RULE } = require('./lib/sanitize-prompt');
const { validateCharacterEnrich, filterEnrichedCharacters } = require('./lib/validate-characters');
const { callGrok } = require('./lib/grok-chat');

const SYSTEM_PROMPT =
  'You are a casting director and continuity supervisor preparing a character bible for AI image/video generation.\n\n' +
  'RULES:\n' +
  '- Output ONLY valid JSON. No markdown.\n' +
  '- "description" = VISIBLE APPEARANCE ONLY (age, build, face, hair, skin, distinguishing marks, clothing visible on body).\n' +
  '- NEVER use spoken dialogue, translations, exclamations, or stage directions as description.\n' +
  '- NEVER output: "Dialogue in clip", "to NAME", "His nametag reads \\"\\"", empty quotes, or parenthetical translations like (Ready!).\n' +
  '- Wardrobe = clothing/uniform/accessories only.\n' +
  '- Only include characters from the trusted cast list. Do NOT invent new names.\n' +
  '- If evidence is thin, return a shorter description or empty string with confidence "low".\n' +
  '- Background roles (FLIGHT ATTENDANT, CUSTOMS AGENT) are valid if in trusted list.\n\n' +
  'JSON shape:\n' +
  '{"characters":{"NAME":{"description":"...","wardrobe":"...","bodyType":"Athletic","role":"lead","confidence":"high"}}}';

function parseJsonFromModel(raw) {
  const t = String(raw || '').trim();
  const cleaned = t.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

function fallbackResponse(headers, trustedNames, detail) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      characters: {},
      enriched: 0,
      total: trustedNames.length,
      provider: 'grok-3-mini',
      fallback: true,
      detail: detail || 'Character enrich unavailable',
    }),
  };
}

exports.handler = async function handler(event) {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    await requireAuth(event);
  } catch (e) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized', fallback: true }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const trustedNames = Array.isArray(body.trustedNames) ? body.trustedNames : [];
  if (!trustedNames.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'trustedNames required' }) };
  }

  const evidence = body.evidence && typeof body.evidence === 'object' ? body.evidence : {};
  const scriptExcerpt = sanitizeField(body.scriptExcerpt || '', 7000);

  const userPrompt =
    UNTRUSTED_RULE + '\n\n' +
    'Trusted cast (ONLY these names may appear in output):\n' +
    trustedNames.map(function (n) { return '- ' + String(n).toUpperCase().trim(); }).join('\n') + '\n\n' +
    'Per-character evidence packs:\n' +
    wrapUserContent('evidence', JSON.stringify(evidence, null, 0), 12000) + '\n' +
    wrapUserContent('script_excerpt', scriptExcerpt, 7000) + '\n' +
    'Return the JSON character bible for every trusted name that has appearance evidence. Use confidence "low" and empty description if no reliable appearance info exists.';

  try {
    const grok = await callGrok(SYSTEM_PROMPT, userPrompt, { temperature: 0.25, max_tokens: 3500 });
    if (grok.fallback) {
      return fallbackResponse(headers, trustedNames, grok.error || 'XAI_API_KEY not configured');
    }

    const parsed = parseJsonFromModel(grok.output);
    if (!validateCharacterEnrich(parsed)) {
      return fallbackResponse(headers, trustedNames, 'Invalid character enrich structure');
    }

    const filtered = filterEnrichedCharacters(parsed, trustedNames, sanitizeField);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        characters: filtered.characters,
        enriched: Object.keys(filtered.characters).length,
        total: trustedNames.length,
        provider: 'grok-3-mini',
      }),
    };
  } catch (e) {
    console.error('[enrich-characters] Grok failed:', e);
    return fallbackResponse(headers, trustedNames, e.message || 'Character enrich failed');
  }
};