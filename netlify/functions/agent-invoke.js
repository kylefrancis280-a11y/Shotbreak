// ═══════════════════════════════════════════════════════════════════════════
//  SHOTBREAK — Agent Invocation (single-agent)
//  Mirrors generate-video.js auth + credit logic exactly. No Admin SDK.
//
//  POST /.netlify/functions/agent-invoke
//  Headers:  Authorization: Bearer <HMAC-owner-token | firebase-idToken>
//  Body:     { agent_id, input, context? }
//
//  ENV VARS (all already configured for SHOTBREAK):
//    FIREBASE_API_KEY
//    FIREBASE_PROJECT_ID
//    OWNER_TOKEN_SECRET     (used by verify-owner.js)
//    SYSTEM_EMAIL           (system account for server-authorised Firestore writes)
//    SYSTEM_PASSWORD
//    GROK_API_KEY or XAI_API_KEY   (required now — Anthropic key no longer needed)
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const { getAgent } = require('../../agents/registry');
const { callLLM } = require('./lib/llm');

const FIREBASE_PROJECT_ID = () => process.env.FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY    = () => process.env.FIREBASE_API_KEY;
const FIRESTORE_BASE      = () =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID()}/databases/(default)/documents`;

// Shared auth/token verification (single source of truth)
const { verifyToken, getSystemToken, rawTokenFromEvent } = require('./lib/verify-token');

const VALID_DEDUCTIONS = new Set([5, 15, 20, 50, 75, 150, 250]);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}



// ── Firestore read/write via SYSTEM token ───────────────────────────────
async function readUser(uid) {
  const token = await getSystemToken();
  if (token === 'bypass_system_token_for_owners') {
    return { tier: 'owner', credits: 999999 };
  }
  const r = await fetch(
    `${FIRESTORE_BASE()}/users/${uid}`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('READ_FAIL_' + r.status);
  const d = await r.json();
  const f = d.fields || {};
  return {
    tier:    f.tier?.stringValue || 'free',
    credits: parseInt(f.credits?.integerValue || '0', 10),
  };
}

async function setCredits(uid, newCredits) {
  const token = await getSystemToken();
  if (token === 'bypass_system_token_for_owners') {
    return; // no-op during bypass
  }
  const url = `${FIRESTORE_BASE()}/users/${uid}?updateMask.fieldPaths=credits`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization:  'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: { credits: { integerValue: String(newCredits) } },
    }),
  });
  if (!r.ok) throw new Error('WRITE_FAIL_' + r.status);
}

// Telemetry helper (optional – safe if it fails)
function logTelemetry(fields) {
  // You can later wire this to Firestore or a logging service
  console.log('[AGENT-TELEMETRY]', JSON.stringify(fields));
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return respond(204, {});
  if (event.httpMethod !== 'POST') return respond(405, { error: 'POST only' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }

  const { agent_id, input, context } = payload;
  if (!agent_id) return respond(400, { error: 'agent_id required' });

  let agent;
  try { agent = getAgent(agent_id); }
  catch (e) { return respond(404, { error: e.message }); }

  // Auth
  let auth;
  try { auth = await verifyToken(event); }
  catch (e) { logTelemetry({ agent_id, agent_tier: agent.tier, status: 'rejected', http_status: 401, error_code: 'AUTH_FAIL', error_msg: e.message }); return respond(401, { error: e.message || 'AUTH_FAIL' }); }

  // Credit pre-check (customers only; owners skip)
  let userCredits = 0;
  const bypassActive = (process.env.SYSTEM_TOKEN_BYPASS === 'true' || process.env.SYSTEM_TOKEN_BYPASS === '1');

  if (!auth.isOwner) {
    if (bypassActive) {
      return respond(403, {
        error: 'Temporarily restricted to owners only. The system user is being reconfigured.'
      });
    }

    let user;
    try { user = await readUser(auth.uid); }
    catch (e) { logTelemetry({ agent_id, agent_tier: agent.tier, uid: auth.uid, email: auth.email, status: 'error', http_status: 500, error_code: 'CREDIT_LOOKUP_FAIL', error_msg: e.message }); return respond(500, { error: 'Credit lookup failed: ' + e.message }); }
    userCredits = user?.credits || 0;
    if (userCredits < agent.credits) {
      logTelemetry({ agent_id, agent_tier: agent.tier, uid: auth.uid, email: auth.email, status: 'rejected', http_status: 402, error_code: 'INSUFFICIENT_CREDITS', credits: agent.credits });
      return respond(402, {
        error:             'Insufficient credits',
        required:          agent.credits,
        available:         userCredits,
        credits_remaining: userCredits,
      });
    }
    // Deduct BEFORE the call (mirrors generate-video.js); refund on failure.
    try { await setCredits(auth.uid, userCredits - agent.credits); }
    catch (e) { logTelemetry({ agent_id, agent_tier: agent.tier, uid: auth.uid, email: auth.email, status: 'error', http_status: 500, error_code: 'CREDIT_DEDUCT_FAIL', error_msg: e.message }); return respond(500, { error: 'Credit deduction failed: ' + e.message }); }
  }

  // Run the agent (provider chosen by LLM_PROVIDER env or default; supports grok)
  let result;
  try {
    result = await callLLM(agent, input, context);
  } catch (e) {
    logTelemetry({ agent_id, agent_tier: agent.tier, uid: auth.uid, email: auth.email, status: 'error', http_status: 500, error_code: 'LLM_ERROR', error_msg: e.message });
    // Refund on failure for non-owners
    if (!auth.isOwner) {
      try { await setCredits(auth.uid, userCredits); } catch (_) {}
    }
    return respond(502, { error: 'Agent failed', detail: e.message });
  }

  logTelemetry({
    agent_id,
    agent_tier: agent.tier,
    uid: auth.uid,
    email: auth.email,
    is_owner: auth.isOwner,
    status: 'success',
    credits_charged: auth.isOwner ? 0 : agent.credits
  });

  return respond(200, {
    ok:                true,
    agent_id,
    output:            result.structured || result.raw || result.text,
    raw:               result,
    credits_charged:   auth.isOwner ? 0 : agent.credits,
    credits_remaining: auth.isOwner ? 999999 : userCredits - agent.credits,
    is_owner:          auth.isOwner,
  });
};