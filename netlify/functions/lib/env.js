'use strict';

/** Runtime env lookup — bracket access so esbuild does not inline at bundle time. */
function env(name) {
  if (!name) return '';
  return process.env[name] || '';
}

function hasEnv(name) {
  const v = env(name);
  return typeof v === 'string' && v.trim().length > 0;
}

function firstEnv(names) {
  if (!Array.isArray(names)) return '';
  for (let i = 0; i < names.length; i++) {
    const v = env(names[i]);
    if (v && v.trim()) return v.trim();
  }
  return '';
}

module.exports = { env, hasEnv, firstEnv };