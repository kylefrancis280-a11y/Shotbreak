'use strict';

const { resolveAIVideoApiKey } = require('./server-secrets');

const HOST = 'api.aivideoapi.ai';

async function callAIVideoAPI(path, payload, method = 'POST') {
  const key = await resolveAIVideoApiKey();
  if (!key) throw new Error('AIVIDEOAPI_API_KEY not configured');

  const url = 'https://' + HOST + (path.startsWith('/') ? path : '/' + path);
  const options = {
    method,
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
  };
  if (method.toUpperCase() !== 'GET' && payload !== undefined && payload !== null) {
    options.body = JSON.stringify(payload);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }

  if (!res.ok) {
    const err = (json && json.error) || {};
    const msg = err.message || (json && json.msg) || text || ('HTTP ' + res.status);
    const code = err.code || res.status;
    throw new Error('AI Video API ' + res.status + ' (' + code + '): ' + msg);
  }
  if (json && json.code && json.code !== 200) {
    throw new Error('AI Video API error: ' + (json.msg || JSON.stringify(json)));
  }
  return json;
}

function normalizeAIVideoAPIStatus(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'completed' || s === 'complete' || s === 'success' || s === 'succeeded') return 'COMPLETED';
  if (s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled') return 'FAILED';
  if (s === 'pending' || s === 'processing' || s === 'queued' || s === 'in_progress') return 'PROCESSING';
  return 'PROCESSING';
}

function isAIVideoAPIJob(request_id, provider) {
  if (provider === 'aivideoapi') return true;
  if (request_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(request_id))) {
    return true;
  }
  return false;
}

function clampAIVideoDuration(d) {
  const allowed = [4, 8, 12];
  const n = Number(d) || 4;
  if (allowed.includes(n)) return n;
  return allowed.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), 4);
}

function extractAIVideoAPIUrl(res) {
  if (!res) return null;
  const out = res.output || res.data && res.data.output;
  if (out && Array.isArray(out.urls) && out.urls[0]) return out.urls[0];
  if (out && out.url) return out.url;
  if (res.video_url) return res.video_url;
  if (res.url) return res.url;
  return null;
}

function parseAIVideoAPIError(err) {
  const msg = String(err && err.message ? err.message : err || '');
  const m = msg.match(/AI Video API (\d{3}) \(([^)]+)\):\s*(.*)$/i);
  return {
    message: msg,
    httpStatus: m ? Number(m[1]) : null,
    code: m ? String(m[2]).toLowerCase() : '',
    detail: m ? m[3] : msg,
  };
}

function humanizeAIVideoAPIError(err) {
  const parsed = parseAIVideoAPIError(err);
  const code = parsed.code;
  const status = parsed.httpStatus;

  if (code === 'insufficient_credits' || status === 402) {
    return 'AI Video API credits exhausted. Top up at https://aivideoapi.ai/dashboard/billing';
  }
  if (code === 'spend_limit_exceeded') {
    return 'AI Video API key spend limit reached (hourly/daily/total). Raise limits in https://aivideoapi.ai/api-keys';
  }
  if (code === 'invalid_api_key' || status === 401) {
    return 'AI Video API key invalid. Check key at https://aivideoapi.ai/api-keys';
  }
  if (code === 'ip_not_allowed' || status === 403) {
    return 'AI Video API IP blocked — clear IP allowlist on your key or add Netlify egress IPs in https://aivideoapi.ai/api-keys';
  }
  if (code === 'invalid_request' || status === 400) {
    return parsed.detail || 'AI Video API rejected the request (check prompt, duration 4/8/12, aspect 16:9 or 9:16, and HTTPS image refs only).';
  }
  if (code === 'upstream_error' || status === 503) {
    return parsed.detail || 'AI Video API upstream error — prompt may be blocked or provider temporarily unavailable.';
  }
  return parsed.message || 'AI Video API request failed';
}

async function submitAIVideoAPISora({ prompt, duration, aspect_ratio, character_image_url, location_image_url }) {
  const input = {
    prompt,
    duration: clampAIVideoDuration(duration),
    aspect_ratio: aspect_ratio === '9:16' ? '9:16' : '16:9',
  };
  const refUrl = (character_image_url && String(character_image_url).startsWith('https://'))
    ? character_image_url
    : ((location_image_url && String(location_image_url).startsWith('https://')) ? location_image_url : null);
  if (refUrl) {
    input.image_urls = [refUrl];
  }

  const res = await callAIVideoAPI('/v1/videos/generations', {
    model: 'sora-2',
    input,
  });

  const taskId = (res.data && res.data.taskId) || res.taskId || res.id;
  if (!taskId) throw new Error('AI Video API returned no taskId');

  return {
    request_id: taskId,
    status: 'PROCESSING',
    provider: 'aivideoapi',
    raw: res,
  };
}

async function getAIVideoAPITaskStatus(request_id) {
  const res = await callAIVideoAPI('/v1/tasks/' + encodeURIComponent(request_id), null, 'GET');
  const st = normalizeAIVideoAPIStatus(res.status);
  const video_url = st === 'COMPLETED' ? extractAIVideoAPIUrl(res) : null;

  if (st === 'FAILED') {
    const errObj = res.error || {};
    return {
      request_id,
      status: st,
      error: errObj.message || errObj.code || 'AI Video API task failed',
      provider: 'aivideoapi',
      raw: res,
    };
  }

  return {
    request_id,
    status: st,
    video_url,
    progress: res.progress,
    provider: 'aivideoapi',
    raw: res,
  };
}

async function getAIVideoAPITaskResult(request_id) {
  return getAIVideoAPITaskStatus(request_id);
}

module.exports = {
  callAIVideoAPI,
  normalizeAIVideoAPIStatus,
  isAIVideoAPIJob,
  clampAIVideoDuration,
  extractAIVideoAPIUrl,
  parseAIVideoAPIError,
  humanizeAIVideoAPIError,
  submitAIVideoAPISora,
  getAIVideoAPITaskStatus,
  getAIVideoAPITaskResult,
};