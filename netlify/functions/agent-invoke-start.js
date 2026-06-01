// netlify/functions/agent-invoke-start.js
// Async job starter for long-running agent calls.
// Returns immediately with a jobId. Client polls agent-invoke-status.

'use strict';

const { getAgent } = require('../../agents/registry');
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

// Simple in-memory job store (resets on cold start — fine for MVP).
// In production you would persist to Firestore or similar.
const jobs = new Map();

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

  const { agent_id, input, context } = payload;
  if (!agent_id) return respond(400, { error: 'agent_id required' });

  let agent;
  try {
    agent = getAgent(agent_id);
  } catch (e) {
    return respond(404, { error: e.message });
  }

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

  // For MVP: we store the request and mark as 'pending'.
  // A real implementation would use a queue or background processing.
  jobs.set(jobId, {
    status: 'pending',
    agent_id,
    input,
    context,
    createdAt: Date.now(),
    uid: auth.uid,
    isOwner: auth.isOwner,
    result: null,
    error: null,
  });

  // In a more advanced version you would kick off the actual work here
  // (e.g. via another function or a queue). For now the status endpoint
  // can run the work on first poll if still pending.

  return respond(200, {
    jobId,
    status: 'pending',
  });
};

exports.getJob = (jobId) => jobs.get(jobId);
exports.updateJob = (jobId, data) => {
  const existing = jobs.get(jobId);
  if (existing) jobs.set(jobId, { ...existing, ...data });
};