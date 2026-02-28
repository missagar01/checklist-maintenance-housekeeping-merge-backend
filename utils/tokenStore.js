import fs from 'fs';
import path from 'path';

const STORE_PATH = path.join(__dirname, '..', '..', '.revoked-tokens.json');

const loadStore = () => {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch (_e) {
    // ignore read errors; start empty
  }
  return [];
};

const persistStore = (items) => {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ items }, null, 2), 'utf8');
  } catch (_e) {
    // ignore write errors (best-effort)
  }
};

let store = loadStore(); // [{ token, exp }]

const cleanup = () => {
  const now = Math.floor(Date.now() / 1000);
  const before = store.length;
  store = store.filter((item) => !item.exp || item.exp > now);
  if (store.length !== before) persistStore(store);
};

const isRevoked = (token) => {
  cleanup();
  return store.some((item) => item.token === token);
};

const revoke = (token, expSeconds) => {
  if (!token) return;
  cleanup();
  if (!store.some((item) => item.token === token)) {
    store.push({ token, exp: expSeconds || null });
    persistStore(store);
  }
};

export default {
  isRevoked,
  revoke,
};
