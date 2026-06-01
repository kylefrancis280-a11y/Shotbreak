// netlify/functions/batch-generate.js
// Minimal batch video generation endpoint (MVP).
// For now it just queues individual jobs. Can be expanded later.

'use strict';

const { verifyToken } = require('./lib/verify-token');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return respond(204, {});
  if (event.httpMethod !== 'POST') return respond(405, { error: 'POST only' });

  let auth;
  try {
    auth = await verifyToken(event);
  } catch (e) {
    return respond(401, { error: e.message || 'AUTH_FAIL' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON' });
  }

  const { prompts = [], model = 'flux-schnell' } = payload;

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return respond(400, { error: 'prompts[] required' });
  }

  // MVP: Just acknowledge the batch. In a real system you would
  // create jobs and return job IDs.
  return respond(200, {
    batchId: 'batch_' + Date.now(),
    count: prompts.length,
    model,
    status: 'queued',
    message: 'Batch accepted. Polling not yet implemented in MVP.',
  });
};