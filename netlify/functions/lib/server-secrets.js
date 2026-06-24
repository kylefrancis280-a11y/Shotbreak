'use strict';

const { firstEnv } = require('./env');
const { fbGet, fbPatch } = require('./firebase-db');

const OPENAI_ENV_NAMES = ['OPENAI_API_KEY', 'SORA_API_KEY', 'OPENAI_KEY'];
const FB_OPENAI_KEY = 'openai_api_key';
const cache = {};

async function resolveOpenAIApiKey() {
  const fromEnv = firstEnv(OPENAI_ENV_NAMES);
  if (fromEnv) return fromEnv;
  if (cache[FB_OPENAI_KEY]) return cache[FB_OPENAI_KEY];
  const row = await fbGet('server_secrets');
  const fromDb = row && row[FB_OPENAI_KEY];
  if (fromDb && typeof fromDb === 'string' && fromDb.trim()) {
    cache[FB_OPENAI_KEY] = fromDb.trim();
    return cache[FB_OPENAI_KEY];
  }
  return '';
}

async function storeOpenAIApiKey(value) {
  const key = String(value || '').trim();
  if (!key) throw new Error('api_key required');
  await fbPatch('server_secrets', {
    [FB_OPENAI_KEY]: key,
    openai_updated_at: new Date().toISOString(),
  });
  cache[FB_OPENAI_KEY] = key;
  return true;
}

async function openAIKeyDiagnostics() {
  const fromEnv = firstEnv(OPENAI_ENV_NAMES);
  let fromDb = '';
  try {
    const row = await fbGet('server_secrets');
    fromDb = row && row[FB_OPENAI_KEY] ? String(row[FB_OPENAI_KEY]).trim() : '';
  } catch (e) { /* ignore */ }
  const resolved = fromEnv || fromDb || '';
  return {
    openai: !!resolved,
    openai_key_len: resolved ? resolved.length : 0,
    openai_env: !!fromEnv,
    openai_firebase: !!fromDb,
    firebase_db_configured: !!require('./firebase-db').dbSecret(),
  };
}

module.exports = {
  resolveOpenAIApiKey,
  storeOpenAIApiKey,
  openAIKeyDiagnostics,
};