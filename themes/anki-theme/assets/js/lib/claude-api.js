import { API_URL } from './config.js';

const KEY_STORAGE_NAME = 'anthropic_api_key';

export function getKey() {
  return localStorage.getItem(KEY_STORAGE_NAME) || '';
}

export function setKey(k) {
  localStorage.setItem(KEY_STORAGE_NAME, k.trim());
}

export function missingKeyError() {
  const err = new Error('No API key — enter one above');
  err.code = 'missing_api_key';
  return err;
}

export async function callClaude(messages, maxTokens, model) {
  const key = getKey();
  if (!key) throw missingKeyError();

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  return (await res.json()).content[0].text;
}

export function parseJsonLoose(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Could not parse JSON response');
    return JSON.parse(m[0]);
  }
}
