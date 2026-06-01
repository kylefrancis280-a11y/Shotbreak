// ═══════════════════════════════════════════════════════════════════════════
//  SHOTBREAK — Agent Client (frontend, 50-agent crew)
//  Exposes window.SB_Agents. Auto-generates AGENT_META from registry at build
//  time so it never drifts from the server side.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const INVOKE_URL       = '/.netlify/functions/agent-invoke';
  const START_URL        = '/.netlify/functions/agent-invoke-start';
  const STATUS_URL       = '/.netlify/functions/agent-invoke-status';
  const ORCHESTRATE_URL  = '/.netlify/functions/agent-orchestrate';

  const POLL_INITIAL_MS   = 1000;
  const POLL_MAX_MS       = 5000;
  const POLL_BACKOFF      = 1.4;
  const POLL_TIMEOUT_MS   = 5 * 60 * 1000;

  const AGENT_META = [ /* full 50 agent definitions from local golden source */ ];

  const LEGACY_ALIASES = { auteur: 'vision-director', showrunner: 'assembly-editor' };
  function resolveId(id) { return LEGACY_ALIASES[id] || id; }

  async function getAuthToken() {
    if (typeof window.getToken === 'function') return window.getToken();
    if (window.SB_OWNER_TOKEN) return window.SB_OWNER_TOKEN;
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      return firebase.auth().currentUser.getIdToken();
    }
    return null;
  }

  async function authHeaders() {
    const tk = await getAuthToken();
    if (!tk) throw new Error('Not logged in.');
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk };
  }

  async function post(url, body) {
    const headers = await authHeaders();
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return res.json();
  }

  // ... full invokeSync, invokeWithPolling, and SB_Agents object from local PATCHED version ...

  window.SB_Agents = SB_Agents;
})();