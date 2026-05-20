import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(runnerDir, '..');
const defaultStatePath = path.join(appDir, '.data', 'runner-progress.json');
const portals = ['ejobs', 'bestjobs', 'hipo', 'linkedin'];

export function createRunState({
  persist = true,
  statePath = process.env.PORTAL_DISCOVERY_RUN_STATE || defaultStatePath,
  now = () => new Date(),
} = {}) {
  const emitter = new EventEmitter();
  let state = persist ? readState(statePath) : initialState(now);

  function mutate(fn, event = 'state') {
    state = mergeState(persist ? readState(statePath) : state, now);
    fn(state);
    state.global.updatedAt = now().toISOString();
    if (persist) writeState(statePath, state);
    emitter.emit(event, snapshot());
    emitter.emit('state', snapshot());
    return snapshot();
  }

  function portalState(portal) {
    if (!state.perPortal[portal]) state.perPortal[portal] = initialPortalState(now);
    return state.perPortal[portal];
  }

  return {
    events: emitter,
    pauseGlobal: () => mutate(current => {
      current.global.paused = true;
      for (const portal of Object.keys(current.perPortal)) {
        current.perPortal[portal].status = current.perPortal[portal].status === 'running' ? 'paused' : current.perPortal[portal].status;
      }
    }),
    resumeGlobal: () => mutate(current => {
      current.global.paused = false;
      for (const portal of Object.keys(current.perPortal)) {
        if (current.perPortal[portal].status === 'paused') current.perPortal[portal].status = 'running';
      }
    }),
    stopGlobal: () => mutate(current => {
      current.global.cancelled = true;
      for (const portal of Object.keys(current.perPortal)) current.perPortal[portal].cancelled = true;
    }),
    pausePortal: portal => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item.paused = true;
      item.status = 'paused';
      item.updatedAt = now().toISOString();
    }),
    resumePortal: portal => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item.paused = false;
      if (item.status === 'paused') {
        const hasActivity = item.discovered || item.matched || item.imported || item.errors || item.lastUrl;
        item.status = hasActivity ? 'running' : 'idle';
      }
      item.updatedAt = now().toISOString();
    }),
    stopPortal: portal => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item.cancelled = true;
      item.status = 'stopping';
      item.updatedAt = now().toISOString();
    }),
    incr: (portal, field, by = 1) => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item[field] = Number(item[field] || 0) + by;
      item.updatedAt = now().toISOString();
    }, 'progress'),
    setStatus: (portal, status) => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item.status = status;
      item.updatedAt = now().toISOString();
    }),
    setLastUrl: (portal, lastUrl) => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item.lastUrl = String(lastUrl || '');
      item.updatedAt = now().toISOString();
    }, 'progress'),
    setLastError: (portal, lastError) => mutate(current => {
      const item = portalStateFor(current, portal, now);
      item.lastError = String(lastError || '');
      item.updatedAt = now().toISOString();
    }, 'progress'),
    snapshot,
    reset: () => mutate(current => {
      Object.assign(current, initialState(now));
    }),
    isPaused(portal) {
      state = persist ? readState(statePath) : state;
      return Boolean(state.global.paused || state.perPortal?.[portal]?.paused);
    },
    isCancelled(portal) {
      state = persist ? readState(statePath) : state;
      return Boolean(state.global.cancelled || state.perPortal?.[portal]?.cancelled);
    },
  };

  function snapshot() {
    state = persist ? readState(statePath) : state;
    return structuredCloneCompat(mergeState(state, now));
  }
}

export const runState = createRunState();

function initialState(now) {
  return {
    global: {
      paused: false,
      cancelled: false,
      startedAt: now().toISOString(),
      updatedAt: now().toISOString(),
    },
    perPortal: Object.fromEntries(portals.map(portal => [portal, initialPortalState(now)])),
  };
}

function initialPortalState(now) {
  return {
    paused: false,
    cancelled: false,
    status: 'idle',
    discovered: 0,
    matched: 0,
    imported: 0,
    errors: 0,
    lastUrl: '',
    lastError: '',
    updatedAt: now().toISOString(),
  };
}

function portalStateFor(state, portal, now) {
  if (!state.perPortal[portal]) state.perPortal[portal] = initialPortalState(now);
  return state.perPortal[portal];
}

function mergeState(value, now) {
  const current = value || initialState(now);
  current.global ||= initialState(now).global;
  current.perPortal ||= {};
  for (const portal of portals) current.perPortal[portal] ||= initialPortalState(now);
  return current;
}

function readState(filePath) {
  if (!existsSync(filePath)) return initialState(() => new Date());
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return initialState(() => new Date());
  }
}

function writeState(filePath, state) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}
