import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'WatchDog';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'watchdog',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'watchdog',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

// HOST_DATA_DIR: when watchdog runs inside Docker and spawns agent containers
// via the host Docker daemon (Docker-in-Docker), bind mount paths must be real
// host filesystem paths, not container-internal paths. Set this env var to the
// host path that maps to the container's /data volume mount.
const _HOST_DATA_DIR = process.env.HOST_DATA_DIR ?? null;

/**
 * Convert a watchdog-internal path to the corresponding host filesystem path
 * for use in Docker bind mounts. Identity function in native (non-DinD) mode.
 *
 * In DinD mode the /data volume is mounted at both /data (container) and
 * HOST_DATA_DIR (host). Symlinks /app/groups, /app/store, /app/data all point
 * into /data, so we map them to HOST_DATA_DIR/groups, HOST_DATA_DIR/store, etc.
 */
export function toHostMountPath(p: string): string {
  if (!_HOST_DATA_DIR) return p;
  if (p === '/app/data' || p === '/data') return _HOST_DATA_DIR;
  if (p.startsWith('/app/data/'))
    return path.join(_HOST_DATA_DIR, p.slice('/app/data/'.length));
  if (p.startsWith('/data/'))
    return path.join(_HOST_DATA_DIR, p.slice('/data/'.length));
  if (p.startsWith('/app/groups/'))
    return path.join(_HOST_DATA_DIR, 'groups', p.slice('/app/groups/'.length));
  if (p.startsWith('/app/store/'))
    return path.join(_HOST_DATA_DIR, 'store', p.slice('/app/store/'.length));
  return p;
}

/** True when running inside Docker with HOST_DATA_DIR configured. */
export const IN_DOCKER_MODE = !!_HOST_DATA_DIR;

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'watchdog-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
