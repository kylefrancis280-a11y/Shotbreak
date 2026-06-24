'use strict';

const { env } = require('./env');

const DB = 'https://shotbreak-9f342-default-rtdb.firebaseio.com';

function dbSecret() {
  return env('FIREBASE_DB_SECRET');
}

async function fbGet(path) {
  const secret = dbSecret();
  if (!secret) return null;
  const res = await fetch(`${DB}/${path}.json?auth=${secret}`);
  return res.ok ? await res.json() : null;
}

async function fbPatch(path, data) {
  const secret = dbSecret();
  if (!secret) return null;
  const res = await fetch(`${DB}/${path}.json?auth=${secret}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok ? await res.json() : null;
}

module.exports = { fbGet, fbPatch, dbSecret };