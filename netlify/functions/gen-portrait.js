exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.WAVESPEED_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'WAVESPEED_API_KEY not set' }) };

  const { verifyToken } = require('./lib/verify-token');
  let prompt, modelKey;
  try {
    const body = JSON.parse(event.body);
    prompt   = body.prompt;
    modelKey = body.model || 'wan';
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) };
  }
  if (!prompt) return { statusCode: 400, headers, body: JSON.stringify({ error: 'prompt required' }) };

  // Enforce login; only owners get unlimited (tier checks client side)
  const authH = event.headers.authorization || event.headers.Authorization || '';
  const ar = await verifyToken(authH).catch(() => ({ok:false}));
  if (!ar.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const MODELS = {
    wan:     'wavespeed-ai/wan-2.2/text-to-image-realism',
    wan21:   'wavespeed-ai/wan-2.1/text-to-image',
    banana:  'wavespeed-ai/wan-2.2/text-to-image-realism',
    realism: 'wavespeed-ai/wan-2.2/text-to-image-realism',
    fast:    'wavespeed-ai/wan-2.1/text-to-image'
  };
  const MODEL     = MODELS[modelKey] || MODELS.wan;
  const submitUrl = `https://api.wavespeed.ai/api/v3/${MODEL}`;

  const isWan21 = MODEL.includes('wan-2.1');
  const reqBody = isWan21
    ? { prompt, size: '768*1024', seed: -1, enable_safety_checker: false }
    : { prompt, width: 768, height: 1024, seed: -1, output_format: 'jpeg' };

  // Submit only -- return requestId immediately for frontend polling
  const ctrl = new AbortController();
  const tmo  = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res  = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: ctrl.signal
    });
    const data = await res.json();
    console.log('gen-portrait submit:', MODEL, JSON.stringify(data).slice(0, 300));
    const requestId = (data.data && data.data.id) || data.id;
    if (!requestId) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No requestId from Wavespeed', detail: data }) };
    return { statusCode: 202, headers, body: JSON.stringify({ requestId, model: MODEL, status: 'processing' }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Wavespeed submit failed: ' + e.message }) };
  } finally {
    clearTimeout(tmo);
  }
};