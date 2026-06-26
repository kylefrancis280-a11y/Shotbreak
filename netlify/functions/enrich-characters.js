'use strict';

const { requireAuth } = require('./lib/verify-token');
const { corsHeaders } = require('./lib/http');
const { wrapUserContent, sanitizeField, UNTRUSTED_RULE } = require('./lib/sanitize-prompt');
const { validateCharacterEnrich, filterEnrichedCharacters } = require('./lib/validate-characters');

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

  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'XAI_API_KEY not configured', fallback: true }),
    };
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
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.25,
        max_tokens: 3500,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Grok API error', detail: errText.slice(0, 400), fallback: true }),
      };
    }

    const data = await resp.json();
    const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Empty model response', fallback: true }) };
    }

    const parsed = parseJsonFromModel(raw);
    if (!validateCharacterEnrich(parsed)) {
      return { statusCode: 422, headers, body: JSON.stringify({ error: 'Invalid character enrich structure', fallback: true }) };
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Character enrich failed', detail: e.message, fallback: true }),
    };
  }
};