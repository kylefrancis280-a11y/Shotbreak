'use strict';

const https = require('https');

/**
 * Shared xAI chat completions client (same stack as agent-invoke / generate-video).
 * userPayload: string, or { text, images: [{ url }] } for vision.
 */
function callGrok(systemPrompt, userPayload, options) {
  options = options || {};
  const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!apiKey) {
    const sim = (typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload)).slice(0, 600);
    return Promise.resolve({
      output: sim,
      fallback: true,
      error: 'XAI_API_KEY not configured',
    });
  }

  return new Promise((resolve, reject) => {
    let userContent;
    if (typeof userPayload === 'string') {
      userContent = userPayload;
    } else if (userPayload && (userPayload.text || userPayload.images)) {
      const parts = [];
      if (userPayload.text) parts.push({ type: 'text', text: userPayload.text });
      if (Array.isArray(userPayload.images)) {
        for (const img of userPayload.images.slice(0, 4)) {
          if (img && img.url) {
            parts.push({
              type: 'image_url',
              image_url: { url: img.url, detail: 'high' },
            });
          }
        }
      }
      userContent = parts.length > 1 ? parts : (parts[0] ? parts[0].text : '');
    } else {
      userContent = JSON.stringify(userPayload || {});
    }

    const body = JSON.stringify({
      model: options.model || 'grok-3-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: options.temperature != null ? options.temperature : 0.65,
      max_tokens: options.max_tokens != null ? options.max_tokens : 900,
    });
    const data = Buffer.from(body, 'utf8');

    const req = https.request({
      hostname: 'api.x.ai',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        'Content-Length': data.length,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error('Grok API HTTP ' + res.statusCode + ': ' + raw.slice(0, 600)));
          return;
        }
        try {
          const json = JSON.parse(raw);
          const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
          const out = (content && String(content).trim()) ? content : '';
          if (out) {
            resolve({ output: out });
            return;
          }
          const errMsg = json.error && (json.error.message || json.error);
          reject(new Error(errMsg ? String(errMsg) : ('Grok returned empty content: ' + raw.slice(0, 400))));
        } catch (e) {
          reject(new Error('Failed to parse Grok response: ' + raw.slice(0, 400)));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = { callGrok };