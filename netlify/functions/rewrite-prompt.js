exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.GROK_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GROK_API_KEY not set' }) };

  let currentPrompt, fields, changedField, changedValue, agentName;
  try {
    const body = JSON.parse(event.body);
    currentPrompt = body.currentPrompt || '';
    fields = body.fields || {};
    changedField = body.changedField || '';
    changedValue = body.changedValue || '';
    agentName = body.agentName || 'Agent';
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  // Build a context summary of all current fields
  const fieldSummary = Object.entries(fields)
    .filter(([k, v]) => v && String(v).trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `You are a professional screenplay and production prompt writer.

A shot's production data has just been updated by the ${agentName}.

CURRENT ACTION LINE (Script):
${currentPrompt || '(empty)'}

ALL CURRENT SHOT FIELDS:
${fieldSummary || '(none)'}

CHANGE JUST APPLIED:
Field: ${changedField}
New value: ${changedValue}

Your task: Rewrite the action line (Script field) to naturally incorporate this change while keeping all the other production details accurate and coherent. The action line should read like a professional screenplay action line — present tense, vivid, specific, production-ready. It should reflect the character, location, atmosphere, and any other relevant fields.

Return ONLY valid JSON, no markdown:
{ "prompt": "The rewritten action line here" }

Keep it to 1-3 sentences. Make it cinematic and specific.`;

  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 400
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Grok API error: ' + err }) };
    }

    const data = await resp.json();
    const raw = data.choices[0].message.content.trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return { statusCode: 200, headers, body: JSON.stringify({ prompt: parsed.prompt || '' }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
