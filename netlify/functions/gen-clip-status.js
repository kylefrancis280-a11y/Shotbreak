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
    const resultUrl = `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`;
    const pollRes = await fetch(resultUrl, { headers: { 'Authorization': `Bearer ${key}` } });
    const pollData = await pollRes.json();
    const status = (pollData.data && pollData.data.status) || pollData.status;
    const outputs = (pollData.data && pollData.data.outputs) || pollData.outputs || [];
    const videoUrl = outputs[0] || null;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status, videoUrl, error: (pollData.data && pollData.data.error) || pollData.error || null })
    };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
