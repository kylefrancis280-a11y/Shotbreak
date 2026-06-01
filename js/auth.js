// js/auth.js
// ═════════════════════════════════════════════════════════════════════════
// SHOTBREAK — Client Auth / Token Helpers (Single Source of Truth)
// ═════════════════════════════════════════════════════════════════════════
//
// This file centralizes all client-side token and auth helpers.
//
// Usage:
//   <script src="js/auth.js"></script>
//   const token = await window.getToken();
//   const headers = await window.hdrs();
//
// Supports both:
//   - Firebase Auth idTokens (normal users + owners via email whitelist)
//   - Legacy/Convenience owner tokens (owner:kyle:123...:hmac) stored in localStorage
//
// Owner tokens are still fully supported for the workflow + editor shells.

(function () {
  'use strict';

  const OWNER_TOKEN_KEY = 'SB_OWNER_TOKEN';
  const OWNER_NAME_KEY  = 'SB_OWNER_NAME';
  const OWNER_EXPIRES_KEY = 'SB_OWNER_EXPIRES';

  function rehydrateOwnerToken() {
    try {
      const tk = localStorage.getItem(OWNER_TOKEN_KEY);
      const nm = localStorage.getItem(OWNER_NAME_KEY);
      const exp = parseInt(localStorage.getItem(OWNER_EXPIRES_KEY) || '0', 10);

      if (tk && nm && exp > Date.now()) {
        window.SB_OWNER_TOKEN = tk;
        window.SB_OWNER_NAME = nm;
        window.SB_OWNER_EXPIRES = exp;
      } else {
        clearOwnerToken();
      }
    } catch (e) {}
  }

  function clearOwnerToken() {
    try {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      localStorage.removeItem(OWNER_NAME_KEY);
      localStorage.removeItem(OWNER_EXPIRES_KEY);
    } catch (e) {}
    window.SB_OWNER_TOKEN = null;
    window.SB_OWNER_NAME = null;
    window.SB_OWNER_EXPIRES = null;
  }

  rehydrateOwnerToken();

  async function getToken() {
    if (window.SB_OWNER_TOKEN) {
      return window.SB_OWNER_TOKEN;
    }
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      try {
        return await firebase.auth().currentUser.getIdToken();
      } catch (e) {
        console.warn('[SB Auth] Failed to get Firebase ID token:', e);
        return null;
      }
    }
    return null;
  }

  async function hdrs() {
    const t = await getToken();
    if (!t) throw new Error('Not signed in. Please sign in first.');
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t };
  }

  async function logout() {
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        await firebase.auth().signOut();
      }
    } catch (e) { console.warn('[SB Auth] Firebase signOut error:', e); }
    clearOwnerToken();
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('sb:logout'));
    }
  }

  window.getToken = getToken;
  window.hdrs = hdrs;
  window.sbLogout = logout;
  window.clearOwnerToken = clearOwnerToken;
  window.SB_AUTH_KEYS = { OWNER_TOKEN: OWNER_TOKEN_KEY, OWNER_NAME: OWNER_NAME_KEY, OWNER_EXPIRES: OWNER_EXPIRES_KEY };

  console.log('[SB Auth] Client auth helpers loaded (js/auth.js)');
})();