// Saves the price book to Claude (only when the app is opened inside the Claude app / claude.ai).
//  • Private mode (default): data/users/<your id>/…  — only you can see it, on all your devices.
//  • Team mode (owner switches it on): team/… — everyone the owner shares the page with
//    (as Contributor or Editor) uses the same price book.
// The book is stored as a few text chunks plus a "head" document written last.
// Before every save the latest copy is read and merged, so two phones saving at once don't lose data.

import * as store from './store.js';

const CHUNK = 60000; // characters per document (stays under the 256 KiB limit)
const listeners = new Set();
export const sync = { status: 'local', detail: '', team: false, isOwner: false, canWrite: true, available: false };

let dbns = null, uid = null, base = '', ready = false, dirtyBeforeReady = false;
let timer = null, writing = false, again = false, lastChunks = [], lastRev = 0;
let onRemoteChange = () => {};

function set(status, detail = '') { sync.status = status; sync.detail = detail; listeners.forEach(fn => fn(sync)); }
export function onSyncChange(fn) { listeners.add(fn); fn(sync); return () => listeners.delete(fn); }

const head = (b = base) => dbns.doc(`${b}/head`);
const chunk = (i, b = base) => dbns.doc(`${b}/chunk-${i}`);
const modeDoc = () => dbns.doc('settings/mode');

async function readRemote(b = base) {
  const h = await head(b).get();
  if (!h.exists) return null;
  const meta = h.data();
  const parts = await Promise.all(Array.from({ length: meta.n }, (_, i) => chunk(i, b).get()));
  const strs = parts.map(p => (p.exists ? p.data().s : ''));
  const text = strs.join('');
  if (text.length !== meta.len) throw { code: 'unavailable', message: 'Copy changed while reading' };
  if (b === base) { lastRev = meta.rev || 0; lastChunks = strs; }
  return JSON.parse(text);
}

async function writeRemote(state, b = base) {
  const text = JSON.stringify(state);
  const pieces = [];
  for (let i = 0; i < text.length; i += CHUNK) pieces.push(text.slice(i, i + CHUNK));
  if (!pieces.length) pieces.push('');
  const prev = b === base ? lastChunks : [];
  for (let i = 0; i < pieces.length; i++) if (pieces[i] !== prev[i]) await chunk(i, b).set({ s: pieces[i] });
  const rev = Date.now();
  await head(b).set({ n: pieces.length, len: text.length, rev, savedAt: new Date().toISOString(), by: uid });
  for (let i = pieces.length; i < prev.length; i++) await chunk(i, b).delete().catch(() => {});
  if (b === base) { lastChunks = pieces; lastRev = rev; }
}

const READ_ONLY = 'You can view this team price book, but not change it. Ask the owner for Contributor access.';

async function push() {
  if (writing) { again = true; return; }
  if (!sync.canWrite) { set('error', READ_ONLY); return; }
  writing = true;
  set('saving');
  try {
    do {
      again = false;
      // Someone else (another phone, a teammate) saved since we last looked? Merge first.
      const h = await head().get();
      if (h.exists && (h.data().rev || 0) !== lastRev) {
        const remote = await readRemote();
        store.replaceState(store.mergeStates(remote, store.getState()));
        onRemoteChange('synced');
      }
      await writeRemote(store.getState());
    } while (again);
    set('saved');
  } catch (e) {
    console.warn('Cloud save failed', e);
    if (e?.code === 'invalid_argument' && sync.team) { sync.canWrite = false; set('error', READ_ONLY); }
    else set('error', e?.code === 'quota_exceeded' ? 'Storage for this app is full. Download a backup from Settings.' : 'Could not save to Claude — will retry.');
    if (!['quota_exceeded', 'revoked', 'invalid_argument'].includes(e?.code)) setTimeout(schedule, 15000);
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

/** Load once at start. `onChange(reason)` re-renders the page when data arrives. */
export async function initSync(onChange) {
  onRemoteChange = onChange;
  store.setAfterSave(schedule);
  if (!window.claude || typeof window.claude.use !== 'function') return set('local');
  const [d, user] = await Promise.all([
    window.claude.use('db').catch(() => null),
    window.claude.use('user').catch(() => null),
  ]);
  uid = user ? await user.id() : null;
  if (!d || !uid) return set('local');
  dbns = d;
  sync.available = true;
  sync.isOwner = user?.isOwner ? !!(await user.isOwner()) : false;
  const canW = user?.can ? await user.can('data.write') : null;
  await chooseBase(canW);
  await firstLoad();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}

async function chooseBase(canWriteShared) {
  let team = false;
  try { const m = await modeDoc().get(); team = !!(m.exists && m.data().team); } catch { /* private */ }
  sync.team = team;
  sync.canWrite = team ? canWriteShared !== false : true;
  base = team ? 'team' : `data/users/${uid}`;
  lastChunks = []; lastRev = 0;
}

async function firstLoad(attempt = 0) {
  set('loading');
  try {
    const remote = await readRemote();
    const local = store.getState();
    if (remote && dirtyBeforeReady) {
      store.replaceState(store.mergeStates(remote, local));
      ready = true; onRemoteChange('merged'); await push();
    } else if (remote && (sync.team || !store.hasData(local) || (remote.updatedAt || 0) >= (local.updatedAt || 0))) {
      store.replaceState(remote);
      ready = true; onRemoteChange('loaded'); set('saved');
    } else if (store.hasData(local) && !sync.team) {
      ready = true; await push();
      if (!remote) onRemoteChange('uploaded');
    } else {
      ready = true; set('saved');
    }
  } catch (e) {
    console.warn('Cloud load failed', e);
    // Never upload before we know what the account holds — retry the load instead
    set('error', 'Could not reach Claude — retrying…');
    if (e?.code !== 'revoked' && e?.code !== 'not_granted' && attempt < 6) setTimeout(() => firstLoad(attempt + 1), 4000 * (attempt + 1));
    else set('local', 'Saving only on this device.');
  }
}

/** When the app comes back to the front, pick up changes made on another device or by teammates. */
async function refresh() {
  if (!ready || writing || (timer && sync.status === 'saving')) return;
  try {
    const h = await head().get();
    if (!h.exists || (h.data().rev || 0) === lastRev) return;
    const remote = await readRemote();
    store.replaceState(remote);
    onRemoteChange('refreshed');
  } catch { /* try again next time */ }
}

/** Owner only: switch between a private book and one shared with the team. */
export async function setTeamMode(on) {
  if (!dbns || !sync.isOwner) throw new Error('Only the owner can change this.');
  set('saving');
  try {
    const mine = store.getState();
    if (on) {
      const teamBook = await readRemote('team').catch(() => null);
      const merged = teamBook ? store.mergeStates(teamBook, mine) : mine;
      await writeRemote(merged, 'team');
      await modeDoc().set({ team: true, since: new Date().toISOString() });
      base = 'team';
    } else {
      // Keep a private copy of everything the team had
      const privateBase = `data/users/${uid}`;
      await writeRemote(mine, privateBase);
      await modeDoc().set({ team: false, since: new Date().toISOString() });
      base = privateBase;
    }
    lastChunks = []; lastRev = 0; sync.team = on; sync.canWrite = true;
    store.replaceState(await readRemote());
    set('saved');
    onRemoteChange('mode');
  } catch (e) {
    set('error', 'Could not switch: ' + (e?.message || 'please try again'));
    throw e;
  }
}
