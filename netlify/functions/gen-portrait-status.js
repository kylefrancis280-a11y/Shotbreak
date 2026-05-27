exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const key = process.env.WAVESPEED_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'WAVESPEED_API_KEY not set' }) };

  const requestId = event.queryStringParameters && event.queryStringParameters.id;
  if (!requestId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) };

  try {
    const resultUrl = `https://api.wavespeed.ai/api/v3/predictions/${requestId}`;
    const ctrl = new AbortController();
    const tmo  = setTimeout(() => ctrl.abort(), 20000);
    let pollRes;
    try {
      pollRes = await fetch(resultUrl, { headers: { 'Authorization': `Bearer ${key}` }, signal: ctrl.signal });
    } finally { clearTimeout(tmo); }
    const pollData = await pollRes.json();
    console.log('gen-portrait-status poll:', JSON.stringify(pollData).slice(0, 300));
    const data = pollData.data || {};
    const rawStatus = data.status || pollData.status || 'processing';
    const STATUS_MAP = { succeed: 'completed', succeeded: 'completed', complete: 'completed', fail: 'failed', failure: 'failed' };
    const status = STATUS_MAP[rawStatus] || rawStatus;
    const outputs = data.outputs || pollData.outputs || [];
    const firstOutput = outputs[0];
    const imageUrl = (firstOutput && typeof firstOutput === 'object' ? firstOutput.url : firstOutput) || null;
    const error = data.error || pollData.error || null;
    return { statusCode: 200, headers, body: JSON.stringify({ status, imageUrl, error }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
