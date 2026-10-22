// Saves the price book to the viewer's own Claude account (private to them),
// so it survives the phone clearing browser storage and appears on every device.
// Works only when the app is opened inside the Claude app / claude.ai.
// The whole book is stored as a few text chunks under data/users/<id>/.

import * as store from './store.js';

const CHUNK = 60000;          // characters per document (stays under the 256 KiB limit)
const listeners = new Set();
export const sync = { status: 'local', detail: '' }; // local | loading | saving | saved | error

let dbns = null, base = '', ready = false, dirtyBeforeReady = false;
let timer = null, writing = false, again = false, lastChunks = [], lastRev = 0;
let onRemoteChange = () => {};

function set(status, detail = '') { sync.status = status; sync.detail = detail; listeners.forEach(fn => fn(sync)); }
export function onSyncChange(fn) { listeners.add(fn); fn(sync); return () => listeners.delete(fn); }

const head = () => dbns.doc(`${base}/head`);
const chunk = i => dbns.doc(`${base}/chunk-${i}`);

async function readRemote() {
  const h = await head().get();
  if (!h.exists) return null;
  const meta = h.data();
  const parts = await Promise.all(Array.from({ length: meta.n }, (_, i) => chunk(i).get()));
  const text = parts.map(p => (p.exists ? p.data().s : '')).join('');
  if (text.length !== meta.len) throw { code: 'unavailable', message: 'Copy changed while reading' };
  lastRev = meta.rev || 0;
  lastChunks = parts.map(p => (p.exists ? p.data().s : ''));
  return JSON.parse(text);
}

async function push() {
  if (writing) { again = true; return; }
  writing = true;
  set('saving');
  try {
    do {
      again = false;
      const text = JSON.stringify(store.getState());
      const pieces = [];
      for (let i = 0; i < text.length; i += CHUNK) pieces.push(text.slice(i, i + CHUNK));
      if (!pieces.length) pieces.push('');
      // Write changed chunks first, then the head that points at them
      for (let i = 0; i < pieces.length; i++) if (pieces[i] !== lastChunks[i]) await chunk(i).set({ s: pieces[i] });
      lastRev = Date.now();
      await head().set({ n: pieces.length, len: text.length, rev: lastRev, savedAt: new Date().toISOString() });
      for (let i = pieces.length; i < lastChunks.length; i++) await chunk(i).delete().catch(() => {});
      lastChunks = pieces;
    } while (again);
    set('saved');
  } catch (e) {
    console.warn('Cloud save failed', e);
    set('error', e?.code === 'quota_exceeded' ? 'Your Claude-account storage for this app is full. Download a backup from Settings.' : 'Could not save to your Claude account — will retry.');
    if (e?.code !== 'quota_exceeded' && e?.code !== 'revoked') setTimeout(schedule, 15000);
  } finally {
    writing = false;
  }
}

function schedule() {
  if (!dbns) return;
  if (!ready) { dirtyBeforeReady = true; return; }
  set('saving');
  clearTimeout(timer);
  timer = setTimeout(push, 800);
}

/** Load from the Claude account once at start. `onChange` re-renders the page when data arrives. */
export async function initSync(onChange) {
  onRemoteChange = onChange;
  store.setAfterSave(schedule);
  if (!window.claude || typeof window.claude.use !== 'function') return set('local');
  const [d, user] = await Promise.all([
    window.claude.use('db').catch(() => null),
    window.claude.use('user').catch(() => null),
  ]);
  const uid = user ? await user.id() : null;
  if (!d || !uid) return set('local');
  dbns = d;
  base = `data/users/${uid}`;
  await firstLoad();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}

async function firstLoad(attempt = 0) {
  set('loading');
  try {
    const remote = await readRemote();
    const local = store.getState();
    if (remote && dirtyBeforeReady) {
      // Something was added before the cloud copy arrived: keep both
      store.replaceState(store.mergeStates(remote, local));
      ready = true; onRemoteChange('merged'); await push();
    } else if (remote && (!store.hasData(local) || (remote.updatedAt || 0) >= (local.updatedAt || 0))) {
      store.replaceState(remote);
      ready = true; onRemoteChange('loaded'); set('saved');
    } else if (store.hasData(local)) {
      // First time on the Claude account (or this device is newer): upload
      ready = true; await push();
      if (!remote) onRemoteChange('uploaded');
    } else {
      ready = true; set('saved');
    }
  } catch (e) {
    console.warn('Cloud load failed', e);
    // Never upload before we know what the account holds — retry the load instead
    set('error', 'Could not reach your Claude account — retrying…');
    if (e?.code !== 'revoked' && e?.code !== 'not_granted' && attempt < 6) setTimeout(() => firstLoad(attempt + 1), 4000 * (attempt + 1));
    else set('local', 'Saving only on this device.');
  }
}

/** When the app comes back to the front, pick up changes made on another device. */
async function refresh() {
  if (!ready || writing || timer && sync.status === 'saving') return;
  try {
    const h = await head().get();
    if (!h.exists || (h.data().rev || 0) === lastRev) return;
    const remote = await readRemote();
    store.replaceState(remote);
    onRemoteChange('refreshed');
  } catch { /* try again next time */ }
}
