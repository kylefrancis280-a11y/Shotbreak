const {
  downloadOpenAIVideoContent,
  verifyOpenAIStreamSig,
  getOpenAIApiKey,
} = require('./lib/openai-video');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!getOpenAIApiKey()) {
    return { statusCode: 503, body: 'OPENAI_API_KEY not configured' };
  }

  const params = event.queryStringParameters || {};
  const vid = params.vid;
  const exp = params.exp;
  const sig = params.sig;

  if (!verifyOpenAIStreamSig(vid, exp, sig)) {
    return { statusCode: 403, body: 'Invalid or expired video token' };
  }

  try {
    const buf = await downloadOpenAIVideoContent(vid);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 502, body: err.message || 'Failed to fetch OpenAI video' };
  }
};